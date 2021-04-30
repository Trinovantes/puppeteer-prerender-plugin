import { Compiler, WebpackPluginInstance } from 'webpack'
import puppeteer from 'puppeteer'
import path from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { LocalServer } from './LocalServer'

type WebpackLogger = ReturnType<Compiler['getInfrastructureLogger']>

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

export const PLUGIN_NAME = 'PuppeteerPrerenderPlugin'
export const PRERENDER_STATUS_KEY = '__PRERENDER__'

// ----------------------------------------------------------------------------
// PuppeteerPrerenderPlugin
// ----------------------------------------------------------------------------

export interface PageInjection {
    key: string
    value: unknown
}

export interface RenderResult {
    originalRoute: string
    route: string
    html: string
}

export interface PuppeteerPrerenderPluginOptions {
    outputDir: string
    routes: Array<string>

    enabled?: boolean
    keepAlive?: boolean
    injections?: Array<PageInjection>
    renderAfterEvent?: string
    renderAfterTime?: number
    postProcess?: (result: RenderResult) => void
}

export class PuppeteerPrerenderPlugin implements WebpackPluginInstance {
    private _options: PuppeteerPrerenderPluginOptions

    constructor(option: PuppeteerPrerenderPluginOptions) {
        this._options = option
    }

    apply(compiler: Compiler): void {
        const logger = compiler.getInfrastructureLogger(PLUGIN_NAME)

        compiler.hooks.afterEmit.tapPromise(PLUGIN_NAME, async() => {
            if (!this._options.enabled) {
                logger.info('Skipping prerender because PuppeteerPrerenderPluginOptions.enabled is set to false')
                return
            }

            const renderResults = await this.renderRoutes(logger)
            await this.saveResults(renderResults)
        })
    }

    private async renderRoutes(logger: WebpackLogger) {
        logger.info('PuppeteerPrerenderPluginOption', 'Initializing LocalServer')
        const localServer = new LocalServer(this._options.outputDir)
        await localServer.isServerReady()

        logger.info('PuppeteerPrerenderPluginOption', 'Initializing Puppeteer')
        const browser = await puppeteer.launch()

        const renderResults = await Promise.all(this._options.routes.map((route) => {
            const address = localServer.baseUrl + route
            return this.renderRoute(logger, browser, address)
        }))

        logger.info(`Rendered ${renderResults.length} route(s)`)

        await browser.close()
        if (!this._options.keepAlive) {
            localServer.destroy()
        }

        return renderResults
    }

    async renderRoute(logger: WebpackLogger, browser: puppeteer.Browser, route: string): Promise<RenderResult> {
        logger.info('Rendering', route)
        const page = await browser.newPage()

        page.on('pageerror', (err) => {
            logger.warn('Puppeteer encountered error while rendering', err)
        })

        // Inject data into the page context
        {
            const injections = (this._options.injections ?? []).map((injection) => {
                return `window['${injection.key}'] = ${JSON.stringify(injection.value)}`
            })
            const script = `() => {
                ${injections.join(';')}
            }`

            await page.evaluateOnNewDocument(`(${script})()`)
        }

        // Add the event listener before we navigate to the route so that we don't miss the event
        const eventName = this._options.renderAfterEvent
        if (eventName) {
            const script = `() => {
                window['${PRERENDER_STATUS_KEY}'] = new Promise((resolve) => {
                    document.addEventListener('${eventName}', () => {
                        resolve()
                    })
                })
            }`

            await page.evaluateOnNewDocument(`(${script})()`)
        }

        // Navigate to route
        await page.goto(route, { waitUntil: 'networkidle0' })

        // Wait until route is ready
        let isReadyScript = '() => {}'
        if (this._options.renderAfterEvent !== undefined) {
            isReadyScript = `() => {
                return window['${PRERENDER_STATUS_KEY}']
            }`
        } else if (this._options.renderAfterTime !== undefined) {
            isReadyScript = `() => {
                return new Promise((resolve) => {
                    setTimeout(resolve, ${this._options.renderAfterTime})
                })
            }`
        }
        await page.evaluate(`(${isReadyScript})()`)

        const result: RenderResult = {
            originalRoute: route,
            route: await page.evaluate(() => window.location.pathname),
            html: await page.content(),
        }

        await page.close()
        return result
    }

    private async saveResults(renderResults: Array<RenderResult>) {
        const promises: Array<Promise<void>> = []

        for (const renderResult of renderResults) {
            this._options.postProcess?.(renderResult)

            const outputPath = path.join(this._options.outputDir, renderResult.route, 'index.html')
            promises.push((async() => {
                await mkdir(path.dirname(outputPath), { recursive: true })
                await writeFile(outputPath, renderResult.html.trim())
            })())
        }

        await Promise.all(promises)
    }
}
