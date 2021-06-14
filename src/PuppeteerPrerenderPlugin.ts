import { Compiler, WebpackPluginInstance } from 'webpack'
import puppeteer from 'puppeteer'
import path from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { SpaServer } from './SpaServer'
import { batchRequests } from './utils'
import { isValidOptions, PuppeteerPrerenderPluginOptions, RenderResult } from './PuppeteerPrerenderPluginOptions'
import assert from 'assert'

type WebpackLogger = ReturnType<Compiler['getInfrastructureLogger']>

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

export const PLUGIN_NAME = 'PuppeteerPrerenderPlugin'
export const PRERENDER_STATUS_KEY = '__PRERENDER_STATUS__'

// ----------------------------------------------------------------------------
// PuppeteerPrerenderPlugin
// ----------------------------------------------------------------------------

export class PuppeteerPrerenderPlugin implements WebpackPluginInstance {
    private _options: PuppeteerPrerenderPluginOptions

    constructor(options: PuppeteerPrerenderPluginOptions) {
        assert(isValidOptions(options))
        this._options = options
    }

    apply(compiler: Compiler): void {
        const logger = compiler.getInfrastructureLogger(PLUGIN_NAME)

        compiler.hooks.afterEmit.tapPromise(PLUGIN_NAME, async() => {
            if (!this._options.enabled) {
                logger.info('Skipping prerender because PuppeteerPrerenderPluginOptions.enabled is set to false')
                return
            }

            await this.renderRoutes(logger)
        })
    }

    private async renderRoutes(logger: WebpackLogger): Promise<void> {
        const outputDir = this._options.outputDir ?? this._options.entryDir
        const totalRoutes = this._options.routes.length
        const maxConcurrent = this._options.maxConcurrent ?? totalRoutes

        logger.info('PuppeteerPrerenderPluginOption', 'Initializing SpaServer')
        const server = new SpaServer(this._options.entryDir, this._options.entryFile)
        await server.isServerReady()

        logger.info('PuppeteerPrerenderPluginOption', 'Initializing Puppeteer')
        const browser = await puppeteer.launch(this._options.puppeteerOptions)

        await batchRequests(totalRoutes, maxConcurrent, async(routeIdx) => {
            const address = server.baseUrl + this._options.routes[routeIdx]
            const renderResult = await this.renderRoute(logger, browser, address)
            this._options.postProcess?.(renderResult)

            const outputPath = path.join(outputDir, renderResult.route, 'index.html')
            await mkdir(path.dirname(outputPath), { recursive: true })
            await writeFile(outputPath, renderResult.html.trim())
        })

        logger.info(`Rendered ${totalRoutes} route(s)`)
        await browser.close()

        if (!this._options.keepAlive) {
            server.destroy()
        }
    }

    private async renderRoute(logger: WebpackLogger, browser: puppeteer.Browser, route: string): Promise<RenderResult> {
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
        {
            // If no event is specified, then this promise will never resolve
            // However we still want this Promise object in the window scope so that our apps can detect when it's being prerendered
            const eventName = this._options.renderAfterEvent ?? `Undefined Event for ${PRERENDER_STATUS_KEY}`
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
            route: await page.evaluate('window.location.pathname') as string,
            html: await page.content(),
        }

        await page.close()
        return result
    }
}
