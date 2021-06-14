import { Compiler, WebpackPluginInstance } from 'webpack'
import puppeteer from 'puppeteer'
import path from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { batchRequests } from './utils/batchRequests'
import { isValidOptions, PuppeteerPrerenderPluginOptions, RenderResult } from './PuppeteerPrerenderPluginOptions'
import assert from 'assert'
import { SpaServer } from './servers/SpaServer'
import { PrerenderServer } from './servers/PrerenderServer'
import fs from 'fs'

type WebpackLogger = ReturnType<Compiler['getInfrastructureLogger']>

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

export const PLUGIN_NAME = 'PuppeteerPrerenderPlugin'
export const PRERENDER_READY_EVENT_LISTENER = '__PRERENDER_STATUS__'

// ----------------------------------------------------------------------------
// PuppeteerPrerenderPlugin
// ----------------------------------------------------------------------------

export class PuppeteerPrerenderPlugin implements WebpackPluginInstance {
    private _options: PuppeteerPrerenderPluginOptions
    private _logger?: WebpackLogger

    constructor(options: PuppeteerPrerenderPluginOptions) {
        assert(isValidOptions(options))
        this._options = options
    }

    apply(compiler: Compiler): void {
        this._logger = compiler.getInfrastructureLogger(PLUGIN_NAME)

        compiler.hooks.afterEmit.tapPromise(PLUGIN_NAME, async() => {
            if (!this._options.enabled) {
                this.logger.info('Skipping prerender because PuppeteerPrerenderPluginOptions.enabled is set to false')
                return
            }

            await this.renderRoutes()
        })
    }

    get logger(): WebpackLogger | Console {
        return this._logger ?? console
    }

    private async renderRoutes(): Promise<void> {
        const server = await this.initServer()
        const totalRoutes = this._options.routes.length
        const maxConcurrent = this._options.maxConcurrent ?? totalRoutes

        this.logger.info('Initializing Puppeteer')
        const browser = await puppeteer.launch(this._options.puppeteerOptions)

        await batchRequests(totalRoutes, maxConcurrent, async(routeIdx) => {
            const address = server.baseUrl + this._options.routes[routeIdx]
            const renderResult = await this.renderRoute(browser, address)
            this._options.postProcess?.(renderResult)

            const outputDir = this._options.outputDir ?? this._options.entryDir
            const outputPath = path.join(outputDir, renderResult.route, 'index.html')
            await mkdir(path.dirname(outputPath), { recursive: true })
            await writeFile(outputPath, renderResult.html.trim())
        })

        this.logger.info(`Rendered ${totalRoutes} route(s)`)
        await browser.close()

        if (!this._options.keepAlive) {
            server.destroy()
        }
    }

    private async initServer(): Promise<PrerenderServer> {
        const entryFile = this._options.entryFile ?? 'index.html'
        this.logger.info('Initializing PrerenderServer', entryFile)

        let server: PrerenderServer
        if (entryFile.endsWith('.html')) {
            server = new SpaServer(this._options.entryDir, entryFile, this._options.publicPath)
        } else if (entryFile.endsWith('.js')) {
            const entryPath = path.resolve(entryFile)
            if (!fs.existsSync(entryPath)) {
                throw new Error(`entryFile:${entryPath} does not exist`)
            }

            // eslint-disable-next-line @typescript-eslint/no-var-requires
            server = (require(entryPath) as { default: PrerenderServer }).default
        } else {
            throw new Error('Unrecognized entryFile type')
        }

        this.logger.info(`Serving static content from ${server.staticDir} to ${server.publicPath}`)
        await server.isServerReady()

        return server
    }

    private async renderRoute(browser: puppeteer.Browser, route: string): Promise<RenderResult> {
        this.logger.info('Rendering', route)
        const page = await browser.newPage()

        page.on('pageerror', (err) => {
            this.logger.warn('Puppeteer encountered error while rendering', err)
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
            const eventName = this._options.renderAfterEvent ?? 'Undefined Event for renderAfterEvent'
            const script = `() => {
                window['${PRERENDER_READY_EVENT_LISTENER}'] = new Promise((resolve) => {
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
                return window['${PRERENDER_READY_EVENT_LISTENER}']
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
