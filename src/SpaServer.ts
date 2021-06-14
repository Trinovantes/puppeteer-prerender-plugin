import express from 'express'
import http from 'http'
import path from 'path'
import fs from 'fs'

// ----------------------------------------------------------------------------
// SpaServer
// ----------------------------------------------------------------------------

export class SpaServer {
    private _app: express.Express
    private _server: http.Server
    private _isReady: Promise<void>

    constructor(staticDir: string, entryFile?: string) {
        this._app = express()

        if (!fs.existsSync(staticDir)) {
            throw new Error(`staticDir:"${staticDir}" does not exist`)
        }

        const indexFile = path.join(staticDir, entryFile ?? 'index.html')
        if (!fs.existsSync(indexFile)) {
            throw new Error(`indexFile:"${indexFile}" does not exist`)
        }

        // Handle static files first (i.e. js, css, images)
        this._app.get('*', express.static(staticDir, {
            dotfiles: 'allow',
        }))

        // Redirect all requests to SPA in index.html
        this._app.get('*', (req, res) => {
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

        if (typeof address === 'object') {
            return `http://${address?.address}:${address?.port}`
        } else {
            return `http://${address}`
        }
    }
}
