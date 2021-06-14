import express from 'express'
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

export interface SsgOptions {
    staticDir: string
    publicPath?: string
    clientEntryJs: string
    clientEntryCss?: string
    manifestFile: string

    createSsrContext?: (req: express.Request, res: express.Response) => SSRContext
    createApp: (ssrContext: SSRContext) => Promise<SsgApp>
    onPostRender?: (app: App, ssrContext: SSRContext) => Promise<void>
}

export class VueSsgServer extends PrerenderServer {
    private _staticDir: string
    private _publicPath: string

    private _app: express.Express
    private _server: http.Server
    private _isReady: Promise<void>

    constructor(ssgOptions: SsgOptions) {
        super()
        this._staticDir = ssgOptions.staticDir
        this._publicPath = ssgOptions.publicPath ?? '/'

        if (!fs.existsSync(ssgOptions.staticDir)) {
            throw new Error(`staticDir:"${ssgOptions.staticDir}" does not exist`)
        }

        if (!fs.existsSync(ssgOptions.manifestFile)) {
            throw new Error(`manifestFile:"${ssgOptions.manifestFile}" does not exist`)
        }

        // Create Express server
        this._app = express()

        // Handle static files first (i.e. js, css, images)
        this._app.use(this.publicPath, express.static(this.staticDir, {
            dotfiles: 'allow',
        }))

        // Redirect all requests to Vue SSR server
        const manifest = JSON.parse(readFileSync(ssgOptions.manifestFile).toString('utf-8')) as Record<string, string>
        this._app.use('*', createVueHandler(ssgOptions, manifest))

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
        return this._staticDir
    }

    get publicPath(): string {
        return this._publicPath
    }
}

// -----------------------------------------------------------------------------
// Vue Render
// -----------------------------------------------------------------------------

function createVueHandler(ssgOptions: SsgOptions, manifest: Record<string, string>) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const vueHandler: express.RequestHandler = async(req: express.Request, res: express.Response, next) => {
        try {
            const ssrContext: SSRContext = ssgOptions.createSsrContext?.(req, res) ?? {}
            const { app, router } = await ssgOptions.createApp(ssrContext)
            const routeComponents = getMatchedComponents(router.currentRoute.value)

            // Render the app on the server
            const html = await render({
                app,
                ssrContext,
                ssgOptions,
                routeComponents,
                manifest,
            })

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

interface RenderContext {
    app: App
    ssrContext: SSRContext
    ssgOptions: SsgOptions
    manifest: Record<string, string>
    routeComponents: Array<MatchedComponent>
}

async function render(renderContext: RenderContext): Promise<string> {
    const appHtml = await renderToString(renderContext.app, renderContext.ssrContext)
    await renderContext.ssgOptions.onPostRender?.(renderContext.app, renderContext.ssrContext)

    const mainjs = renderContext.manifest[renderContext.ssgOptions.clientEntryJs]

    return `
        <!DOCTYPE html ${renderContext.ssrContext.teleports?.htmlAttrs ?? ''}>
        <html lang="en">
        <head ${renderContext.ssrContext.teleports?.headAttrs ?? ''}>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link rel="icon" type="image/ico" href="/favicon.ico">
            ${renderPreloadLink(mainjs)}
            ${renderHeadLinks(renderContext)}
            ${renderContext.ssrContext.teleports?.head ?? ''}
        </head>
        <body ${renderContext.ssrContext.teleports?.bodyAttrs ?? ''}>
            <noscript>This website requires JavaScript</noscript>
            <div id="app">${appHtml}</div>
            ${renderContext.ssrContext.teleports?.body ?? ''}
            ${renderScript(mainjs)}
        </body>
        </html>
    `
}

function renderHeadLinks(renderContext: RenderContext): string {
    let head = ''

    const clientEntryCss = renderContext.ssgOptions.clientEntryCss
    if (clientEntryCss) {
        head += renderCss(renderContext.manifest[clientEntryCss])
    }

    // Try to see if any of the matched components in our route exists in the manifest
    // If it exists, then insert a preload script for performance
    for (const c of renderContext.routeComponents) {
        const componentName = c.name
        if (!componentName) {
            continue
        }

        const js = `${componentName}.js`
        if (js in renderContext.manifest) {
            head += renderPreloadLink(renderContext.manifest[js])
        }

        const css = `${componentName}.css`
        if (css in renderContext.manifest) {
            head += renderCss(renderContext.manifest[css])
        }
    }

    return head
}

function renderPreloadLink(file: string): string {
    if (file.endsWith('.js')) {
        return `<link rel="preload" href="${file}" as="script">\n`
    } else if (file.endsWith('.css')) {
        return `<link rel="preload" href="${file}" as="style">\n`
    } else {
        return ''
    }
}

function renderCss(file: string): string {
    return `<link rel="stylesheet" href="${file}">\n`
}

function renderScript(file: string): string {
    return `<script src="${file}" defer></script>\n`
}
