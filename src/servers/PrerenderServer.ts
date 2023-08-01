export type PrerenderServer = {
    isServerReady(): Promise<void>
    destroy(): void
    get baseUrl(): string
    get publicDir(): string
    get publicPath(): string
}
