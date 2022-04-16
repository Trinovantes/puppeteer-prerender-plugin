import express from 'express'
import proxy from 'express-http-proxy'
import http from 'http'
import path from 'path'
import fs from 'fs'
import type { PrerenderServer } from './PrerenderServer'

// ----------------------------------------------------------------------------
// SpaServer
// ----------------------------------------------------------------------------

export interface SpaServerOptions {
    entryFile: string
    staticDir: string
    publicPath?: string
    proxy?: Record<string, string>
    handlers?: Record<string, express.RequestHandler>
}

export class SpaServer implements PrerenderServer {
    private _staticDir: string
    private _publicPath: string

    private _app: express.Express
    private _server: http.Server
    private _isReady: Promise<void>

    constructor(options: SpaServerOptions) {
        this._staticDir = options.staticDir
        this._publicPath = options.publicPath ?? '/'

        if (!fs.existsSync(this._staticDir)) {
            throw new Error(`staticDir:"${this._staticDir}" does not exist`)
        }

        const indexFile = path.join(this._staticDir, options.entryFile)
        if (!fs.existsSync(indexFile)) {
            throw new Error(`entryFile:"${indexFile}" does not exist`)
        }

        // Create Express server
        this._app = express()

        // Handle static files first (e.g. js, css, images)
        this._app.use(this._publicPath, express.static(this._staticDir, {
            dotfiles: 'allow',
        }))

        // Proxy reqests to different process/url
        for (const [route, proxyDest] of Object.entries(options.proxy ?? {})) {
            this._app.use(route, proxy(proxyDest))
        }

        // Handle custom routes in this process (e.g. API handlers)
        for (const [route, handler] of Object.entries(options.handlers ?? {})) {
            this._app.use(route, handler)
        }

        // Redirect all leftover requests to SPA in index.html
        this._app.use('*', (req, res) => {
            res.sendFile(indexFile)
        })

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

        if (typeof address === 'string') {
            return `http://${address}`
        } else if (typeof address === 'object' && address.family === 'IPv4') {
            return `http://${address.address}:${address.port}`
        } else if (typeof address === 'object' && address.family === 'IPv6') {
            return `http://[${address.address}]:${address.port}`
        } else {
            throw new Error(`Unknown server address family: ${address.family}`)
        }
    }

    get staticDir(): string {
        return this._staticDir
    }

    get publicPath(): string {
        return this._publicPath
    }
}
