export interface PrerenderServer {
    isServerReady(): Promise<void>
    destroy(): void
    get baseUrl(): string
    get staticDir(): string
    get publicPath(): string
}
