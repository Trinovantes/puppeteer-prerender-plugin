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
import { findRoutesInPage } from './utils/findRoutesInPage'

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

    private _processedRoutes: Set<string>
    private _queuedRoutes: Array<string>

    constructor(options: PuppeteerPrerenderPluginOptions) {
        assert(isValidOptions(options))
        this._options = options

        this._processedRoutes = new Set()
        this._queuedRoutes = [...options.routes] // Create copy so we don't mutate the input
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
        if (this._queuedRoutes.length < 1) {
            this.logger.info('Skipping prerender because routes array is empty.')
            return
        }

        this.logger.info('Initializing PrerenderServer')
        const server = await this.initServer()

        this.logger.info('Initializing Puppeteer')
        const browser = await puppeteer.launch(this._options.puppeteerOptions)

        if (this._options.renderFirstRouteAlone) {
            const firstRoute = this._queuedRoutes.shift()
            assert(firstRoute)
            await this.renderRoute(browser, server, firstRoute)
        }

        while (this._queuedRoutes.length > 0) {
            const totalRoutes = this._queuedRoutes.length
            const maxConcurrent = this._options.maxConcurrent ?? totalRoutes

            await batchRequests(totalRoutes, maxConcurrent, async() => {
                const currentRoute = this._queuedRoutes.shift()
                assert(currentRoute)
                await this.renderRoute(browser, server, currentRoute)
            })
        }

        this.logger.info(`Rendered ${this._processedRoutes.size} route(s)`)
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
            const entryPath = path.resolve(this._options.entryDir, entryFile)
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

    private async renderRoute(browser: puppeteer.Browser, server: PrerenderServer, route: string): Promise<void> {
        if (this._processedRoutes.has(route)) {
            return
        }

        this._processedRoutes.add(route)

        // Visit the route with puppeteer
        const address = server.baseUrl + route
        const renderResult = await this.renderRouteWithPuppeteer(browser, address)
        this._options.postProcess?.(renderResult)

        // Write result to disk
        const outputDir = this._options.outputDir ?? this._options.entryDir
        const outputPath = path.join(outputDir, renderResult.route, 'index.html')
        await mkdir(path.dirname(outputPath), { recursive: true })
        await writeFile(outputPath, renderResult.html.trim())

        // Find new routes for future runs
        if (this._options.discoverNewRoutes) {
            const newRoutes = findRoutesInPage(renderResult.html)
            newRoutes.forEach((route) => this._queuedRoutes.push(route))
        }
    }

    private async renderRouteWithPuppeteer(browser: puppeteer.Browser, route: string): Promise<RenderResult> {
        this.logger.info('Rendering', route)
        const page = await browser.newPage()
        await page.setJavaScriptEnabled(this._options.enablePageJs ?? true)

        page.on('pageerror', (err) => {
            this.logger.warn(`Puppeteer encountered error while rendering ${route}`)
            this.logger.warn(err)
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
