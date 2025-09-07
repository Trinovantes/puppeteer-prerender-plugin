import fs from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { launch, Browser } from 'puppeteer'
import { validateOptions, PuppeteerPrerenderPluginOptions, RenderResult } from './PuppeteerPrerenderPluginOptions'
import { SpaServer } from './servers/SpaServer'
import { batchRequests } from './utils/batchRequests'
import { findRoutesInPage } from './utils/findRoutesInPage'
import { PrerenderServer } from './servers/PrerenderServer'
import { Compiler, WebpackPluginInstance } from 'webpack'

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
        validateOptions(options)
        this._options = options

        this._processedRoutes = new Set()
        this._queuedRoutes = [...options.routes] // Create copy so we don't mutate the input
    }

    apply(compiler: Compiler): void {
        this._logger = compiler.getInfrastructureLogger(PLUGIN_NAME)

        compiler.hooks.done.tapPromise(PLUGIN_NAME, async(stats) => {
            if (stats.compilation.needAdditionalPass) {
                this._logger?.info('Skipping prerender because compilation needs an additional pass')
                return
            }

            await this.renderRoutes()
        })
    }

    get logger(): WebpackLogger | Console {
        return this._logger ?? console
    }

    get processedRoutes(): Array<string> {
        return [...this._processedRoutes]
    }

    get queuedRoutes(): Array<string> {
        return [...this._queuedRoutes]
    }

    async renderRoutes(): Promise<void> {
        if (!this._options.enabled) {
            this.logger.info('Skipping prerender because PuppeteerPrerenderPluginOptions.enabled is set to false')
            return
        }

        if (this._queuedRoutes.length < 1) {
            this.logger.info('Skipping prerender because routes array is empty')
            return
        }

        const server = await this.initServer()
        const browser = await this.initPuppeteer()

        // Separate home route ('/') from the rest if it exists so that it can be rendered last
        const homeRoutes = this.dequeueHomeRoutes()

        if (this._options.renderFirstRouteAlone) {
            await this.renderNextRoute(browser, server)
        }

        await this.renderAllQueuedRoutes(browser, server)
        homeRoutes.forEach((route) => this._queuedRoutes.push(route))
        await this.renderAllQueuedRoutes(browser, server)

        this.logger.info(`Rendered ${this._processedRoutes.size} route(s)`)
        await browser.close()

        if (!this._options.keepAlive) {
            server.destroy()
        }
    }

    async initServer(): Promise<PrerenderServer> {
        const entryFile = this._options.entryFile ?? 'index.html'
        const entryFilePath = path.join(this._options.entryDir, entryFile)
        if (!fs.existsSync(entryFilePath)) {
            throw new Error(`entryFile:${entryFilePath} does not exist`)
        }

        this.logger.info('Initializing PrerenderServer', entryFilePath)

        let server: PrerenderServer
        if (entryFile.endsWith('.html')) {
            server = new SpaServer({
                entryFilePath,
                publicDir: this._options.entryDir,
                publicPath: this._options.publicPath,
            })
        } else if (entryFile.endsWith('.js') || entryFile.endsWith('.cjs')) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            server = (require(entryFilePath) as { default: PrerenderServer }).default
        } else {
            throw new Error('Unrecognized entryFile type')
        }

        this.logger.info(`Serving static content from ${server.publicDir} to ${server.publicPath}`)
        await server.isServerReady()

        return server
    }

    async initPuppeteer(): Promise<Browser> {
        this.logger.info('Initializing Puppeteer', this._options.puppeteerOptions)
        return await launch({
            headless: true,
            ...this._options.puppeteerOptions,
        })
    }

    dequeueHomeRoutes(): Array<string> {
        const homeIdx = this._queuedRoutes.findIndex((route) => route === '/')
        if (homeIdx < 0) {
            return []
        }

        return this._queuedRoutes.splice(homeIdx, 1)
    }

    async renderAllQueuedRoutes(browser: Browser, server: PrerenderServer): Promise<void> {
        while (this._queuedRoutes.length > 0) {
            const totalRoutes = this._queuedRoutes.length
            const maxConcurrent = this._options.maxConcurrent ?? totalRoutes

            await batchRequests(totalRoutes, maxConcurrent, async() => {
                await this.renderNextRoute(browser, server)
            })
        }
    }

    async renderNextRoute(browser: Browser, server: PrerenderServer): Promise<void> {
        const currentRoute = this._queuedRoutes.shift()
        if (!currentRoute) {
            return
        }

        if (this._processedRoutes.has(currentRoute)) {
            return
        }

        this._processedRoutes.add(currentRoute)

        // Visit the route with puppeteer
        const address = server.baseUrl + currentRoute
        const renderResult = await this.renderRouteWithPuppeteer(browser, address)
        await this._options.postProcess?.(renderResult)

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

    async renderRouteWithPuppeteer(browser: Browser, route: string): Promise<RenderResult> {
        this.logger.info('Rendering', route)
        const page = await browser.newPage()
        await page.setJavaScriptEnabled(this._options.enablePageJs ?? true)

        page.on('pageerror', (err) => {
            this.logger.warn(`Puppeteer encountered error while rendering ${route}`)
            this.logger.warn(err)
        })

        // Inject data into the page context
        if (this._options.injections) {
            const injections = this._options.injections.map(({ key, value }) => `window['${key}'] = ${JSON.stringify(value)}`)
            const script = `() => {
                ${injections.join(';')}
            }`

            await page.evaluateOnNewDocument(`(${script})()`)
        }

        // Add the event listener before we navigate to the route so that we don't miss the event
        if (this._options.renderAfterEvent) {
            const eventName = this._options.renderAfterEvent ?? '__RENDERED__'

            // If no event is specified, then this promise will never resolve
            // However we still want this Promise object in the window scope so that our apps can detect when it's being prerendered
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
        let isReadyScript: string
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
        } else {
            isReadyScript = '() => {}'
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
