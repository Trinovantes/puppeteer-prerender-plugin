import express from 'express'
import proxy from 'express-http-proxy'
import http from 'http'
import fs from 'fs'
import { PrerenderServer } from './PrerenderServer'
import type { SSRContext } from '@vue/server-renderer'
import type { App, createSSRApp } from 'vue'
import type { Router } from 'vue-router'
import { getMatchedComponents } from '../utils/getMatchedComponents'
import { createAsyncHandler } from '../utils/createAsyncHandler'
import { VueSsrRenderer } from '../utils/VueSsrRenderer'

export interface SsgApp {
    app: ReturnType<typeof createSSRApp>
    router: Router
}

export interface SsgOptions<AppContext extends SSRContext> {
    staticDir: string
    publicPath?: string
    clientEntryJs: string
    clientEntryCss?: string
    manifestFile: string

    proxy?: Record<string, string>
    handlers?: Record<string, express.Handler>

    createSsrContext?: (req: express.Request, res: express.Response) => Promise<AppContext>
    createApp: (ssrContext: AppContext) => Promise<SsgApp>
    onPostRender?: (app: App, ssrContext: AppContext) => Promise<void>
}

export class VueSsgServer<AppContext extends SSRContext> extends PrerenderServer {
    private _ssgOptions: SsgOptions<AppContext>

    private _app: express.Express
    private _server: http.Server
    private _isReady: Promise<void>

    constructor(ssgOptions: SsgOptions<AppContext>) {
        super()

        if (!fs.existsSync(ssgOptions.staticDir)) {
            throw new Error(`staticDir:"${ssgOptions.staticDir}" does not exist`)
        }

        if (!fs.existsSync(ssgOptions.manifestFile)) {
            throw new Error(`manifestFile:"${ssgOptions.manifestFile}" does not exist`)
        }

        this._ssgOptions = ssgOptions

        // Create Express server
        this._app = express()

        // Proxy reqests
        for (const [route, proxyDest] of Object.entries(ssgOptions.proxy ?? {})) {
            this._app.use(route, proxy(proxyDest))
        }

        // Handle static files first (i.e. js, css, images)
        this._app.use(this.publicPath, express.static(this.staticDir, {
            dotfiles: 'allow',
        }))

        // Handle any custom routes (e.g. API handlers)
        for (const [route, handler] of Object.entries(ssgOptions.handlers ?? {})) {
            this._app.use(route, handler)
        }

        // Redirect all requests to Vue SSR server
        this._app.use('*', this.createVueHandler())

        this._server = http.createServer(this._app)
        this._isReady = new Promise((resolve) => {
            this._server.listen(0, 'localhost', () => {
                resolve()
            })
        })
    }

    async isServerReady(): Promise<void> {
        return this._isReady
    }

    destroy(): void {
        this._server.close()
    }

    get baseUrl(): string {
        const address = this._server.address()
        if (address === null) {
            throw new Error('Invalid server address')
        }

        if (typeof address === 'object') {
            return `http://${address?.address}:${address?.port}`
        } else {
            return `http://${address}`
        }
    }

    get staticDir(): string {
        return this._ssgOptions.staticDir
    }

    get publicPath(): string {
        return this._ssgOptions.publicPath ?? '/'
    }

    private createVueHandler() {
        const renderer = new VueSsrRenderer(this._ssgOptions.manifestFile)

        return createAsyncHandler(async(req, res) => {
            const appContext = (await this._ssgOptions.createSsrContext?.(req, res) ?? {}) as AppContext
            const { app, router } = await this._ssgOptions.createApp(appContext)
            const routeComponents = getMatchedComponents(router.currentRoute.value)

            // Render the app on the server
            const html = await renderer.render(app, appContext, routeComponents, async() => {
                await this._ssgOptions.onPostRender?.(app, appContext)
            })

            res.setHeader('Content-Type', 'text/html')
            res.status(200)
            res.send(html)
        })
    }
}
