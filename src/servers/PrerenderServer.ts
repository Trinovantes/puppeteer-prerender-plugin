export abstract class PrerenderServer {
    abstract isServerReady(): Promise<void>
    abstract destroy(): void
    abstract get baseUrl(): string
    abstract get staticDir(): string
    abstract get publicPath(): string
}
