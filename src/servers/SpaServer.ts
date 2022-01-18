import express from 'express'
import http from 'http'
import path from 'path'
import fs from 'fs'
import type { PrerenderServer } from './PrerenderServer'

// ----------------------------------------------------------------------------
// SpaServer
// ----------------------------------------------------------------------------

export class SpaServer implements PrerenderServer {
    private _staticDir: string
    private _publicPath: string

    private _app: express.Express
    private _server: http.Server
    private _isReady: Promise<void>

    constructor(staticDir: string, entryFile: string, publicPath = '/') {
        this._staticDir = staticDir
        this._publicPath = publicPath

        if (!fs.existsSync(staticDir)) {
            throw new Error(`staticDir:"${staticDir}" does not exist`)
        }

        const indexFile = path.join(staticDir, entryFile)
        if (!fs.existsSync(indexFile)) {
            throw new Error(`indexFile:"${indexFile}" does not exist`)
        }

        // Create Express server
        this._app = express()

        // Handle static files first (i.e. js, css, images)
        this._app.use(this.publicPath, express.static(this.staticDir, {
            dotfiles: 'allow',
        }))

        // Redirect all requests to SPA in index.html
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
            return `http://${address?.address}:${address?.port}`
        } else if (typeof address === 'object' && address.family === 'IPv6') {
            return `http://[${address?.address}]:${address?.port}`
        } else {
            throw new Error(`Unknown server address format: ${address.family}`)
        }
    }

    get staticDir(): string {
        return this._staticDir
    }

    get publicPath(): string {
        return this._publicPath
    }
}
