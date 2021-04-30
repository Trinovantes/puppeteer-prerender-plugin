import express from 'express'
import http from 'http'
import path from 'path'
import fs from 'fs'

// ----------------------------------------------------------------------------
// LocalServer
// ----------------------------------------------------------------------------

export class LocalServer {
    private _app: express.Express
    private _server: http.Server
    private _isReady: Promise<void>

    constructor(staticDir: string) {
        this._app = express()

        if (!fs.existsSync(staticDir)) {
            throw new Error(`staticDir:"${staticDir}" does not exist`)
        }

        // Handle static files first (i.e. js, css, images)
        this._app.get('*', express.static(staticDir, {
            dotfiles: 'allow',
        }))

        // Redirect all requests to SPA in index.html
        this._app.get('*', (req, res) => {
            res.sendFile(path.join(staticDir, 'index.html'))
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
