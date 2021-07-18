import express from 'express'
import proxy from 'express-http-proxy'
import http from 'http'
import fs, { readFileSync } from 'fs'
import { PrerenderServer } from './PrerenderServer'
import { renderToString, SSRContext } from '@vue/server-renderer'
import { App, createSSRApp } from 'vue'
import { Router } from 'vue-router'
import { getMatchedComponents, MatchedComponent } from '../utils/getMatchedComponents'

export interface SsgApp {
    app: ReturnType<typeof createSSRApp>
    router: Router
}

export interface SsgOptions<S extends SSRContext> {
    staticDir: string
    publicPath?: string
    clientEntryJs: string
    clientEntryCss?: string
    manifestFile: string

    proxy?: Record<string, string>

    createSsrContext?: (req: express.Request, res: express.Response) => Promise<S> | S
    createApp: (ssrContext: S) => Promise<SsgApp>
    onPostRender?: (app: App, ssrContext: S) => Promise<void>
}

export class VueSsgServer<S extends SSRContext> extends PrerenderServer {
    private _ssgOptions: SsgOptions<S>
    private _manifest: Record<string, string>

    private _app: express.Express
    private _server: http.Server
    private _isReady: Promise<void>

    constructor(ssgOptions: SsgOptions<S>) {
        super()

        if (!fs.existsSync(ssgOptions.staticDir)) {
            throw new Error(`staticDir:"${ssgOptions.staticDir}" does not exist`)
        }

        if (!fs.existsSync(ssgOptions.manifestFile)) {
            throw new Error(`manifestFile:"${ssgOptions.manifestFile}" does not exist`)
        }

        this._ssgOptions = ssgOptions
        this._manifest = JSON.parse(readFileSync(this._ssgOptions.manifestFile).toString('utf-8')) as Record<string, string>

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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const vueHandler: express.RequestHandler = async(req: express.Request, res: express.Response, next) => {
            try {
                const ssrContext = (await this._ssgOptions.createSsrContext?.(req, res) ?? {}) as S
                const { app, router } = await this._ssgOptions.createApp(ssrContext)
                const routeComponents = getMatchedComponents(router.currentRoute.value)

                // Render the app on the server
                const html = await this.render(app, ssrContext, routeComponents)

                res.status(200)
                res.send(html)
            } catch (err) {
                const error = err as Error
                console.warn('Failed to render Vue App', error)
                res.status(500)
                res.send(`<pre>${error.stack}</pre>`)
            }
        }

        return vueHandler
    }

    private async render(vueApp: App, ssrContext: S, routeComponents: Array<MatchedComponent>): Promise<string> {
        const appHtml = await renderToString(vueApp, ssrContext)
        await this._ssgOptions.onPostRender?.(vueApp, ssrContext)

        const mainJs = this._manifest[this._ssgOptions.clientEntryJs]

        return `
            <!DOCTYPE html ${ssrContext.teleports?.htmlAttrs ?? ''}>
            <html lang="en">
            <head ${ssrContext.teleports?.headAttrs ?? ''}>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                ${renderPreloadLink(mainJs)}
                ${this.renderHeadLinks(routeComponents)}
                ${ssrContext.teleports?.head ?? ''}
            </head>
            <body ${ssrContext.teleports?.bodyAttrs ?? ''}>
                <noscript>This website requires JavaScript</noscript>
                <div id="app">${appHtml}</div>
                ${ssrContext.teleports?.body ?? ''}
                ${renderScript(mainJs)}
            </body>
            </html>
        `
    }

    private renderHeadLinks(routeComponents: Array<MatchedComponent>): string {
        let head = ''

        const clientEntryCss = this._ssgOptions.clientEntryCss
        if (clientEntryCss) {
            head += renderCss(this._manifest[clientEntryCss])
        }

        // Try to see if any of the matched components in our route exists in the manifest
        // If it exists, then insert a preload script for performance
        for (const c of routeComponents) {
            const componentName = c.name
            if (!componentName) {
                continue
            }

            const js = `${componentName}.js`
            if (js in this._manifest) {
                head += renderPreloadLink(this._manifest[js])
            }

            const css = `${componentName}.css`
            if (css in this._manifest) {
                head += renderCss(this._manifest[css])
            }
        }

        return head
    }
}

// -----------------------------------------------------------------------------
// Render Helpers
// -----------------------------------------------------------------------------

function renderPreloadLink(file?: string): string {
    if (!file) {
        return ''
    }

    if (file.endsWith('.js')) {
        return `<link rel="preload" href="${file}" as="script">\n`
    } else if (file.endsWith('.css')) {
        return `<link rel="preload" href="${file}" as="style">\n`
    } else {
        return ''
    }
}

function renderCss(file?: string): string {
    if (!file) {
        return ''
    }

    return `<link rel="stylesheet" href="${file}">\n`
}

function renderScript(file?: string): string {
    if (!file) {
        return ''
    }

    return `<script src="${file}" defer></script>\n`
}
