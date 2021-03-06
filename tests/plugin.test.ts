import fs from 'fs/promises'
import type { RenderResult } from 'src/PuppeteerPrerenderPluginOptions'
import type { PrerenderServer } from 'src/servers/PrerenderServer'
import { PuppeteerPrerenderPlugin } from 'src/PuppeteerPrerenderPlugin'

let mkdirSpy: jest.SpyInstance
let writeFileSpy: jest.SpyInstance
let initServerSpy: jest.SpyInstance
let renderRouteWithPuppeteerSpy: jest.SpyInstance

beforeEach(() => {
    mkdirSpy = jest.spyOn(fs, 'mkdir').mockImplementation()
    writeFileSpy = jest.spyOn(fs, 'writeFile').mockImplementation()

    initServerSpy = jest.spyOn(PuppeteerPrerenderPlugin.prototype, 'initServer').mockImplementation(() => {
        const server: PrerenderServer = {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            destroy: () => {},
            isServerReady: () => new Promise<void>((resolve) => resolve()),
            baseUrl: '',
            publicPath: '',
            staticDir: '',
        }

        return new Promise((resolve) => resolve(server))
    })

    renderRouteWithPuppeteerSpy = jest.spyOn(PuppeteerPrerenderPlugin.prototype, 'renderRouteWithPuppeteer').mockImplementation(() => {
        const result: RenderResult = {
            originalRoute: '',
            route: '',
            html: '',
        }

        return new Promise((resolve) => resolve(result))
    })
})

afterEach(() => {
    jest.restoreAllMocks()
})

describe('PuppeteerPrerenderPlugin', () => {
    test('smoke', () => {
        expect(true).toBe(true)
    })

    test('single route', async() => {
        const plugin = new PuppeteerPrerenderPlugin({
            enabled: true,
            routes: ['/'],
            entryDir: '/dist',
        })

        await plugin.renderRoutes()

        expect(initServerSpy).toBeCalled()
        expect(mkdirSpy).toBeCalledWith('/dist', { recursive: true })
        expect(writeFileSpy).toBeCalledWith('/dist/index.html', '')

        expect(plugin.queuedRoutes.length).toBe(0)
        expect(plugin.processedRoutes.length).toBe(1)
        expect(renderRouteWithPuppeteerSpy).toBeCalled()
    })

    for (let i = 0; i < 3; i++) {
        test(`home page route at idx:${i} always rendered last`, async() => {
            const routes = [
                '/pricing',
                '/faq',
                '/',
            ]

            routes.splice(i, 0, '/')

            const plugin = new PuppeteerPrerenderPlugin({
                enabled: true,
                routes,
                entryDir: '/dist',
            })

            await plugin.renderRoutes()

            expect(initServerSpy).toBeCalled()
            expect(mkdirSpy).toBeCalledTimes(3)
            expect(writeFileSpy).toBeCalledTimes(3)

            expect(plugin.queuedRoutes.length).toBe(0)
            expect(plugin.processedRoutes.length).toBe(3)
            expect(renderRouteWithPuppeteerSpy).toBeCalledTimes(3)
            expect(renderRouteWithPuppeteerSpy).toHaveBeenNthCalledWith(1, expect.anything(), '/pricing')
            expect(renderRouteWithPuppeteerSpy).toHaveBeenNthCalledWith(2, expect.anything(), '/faq')
            expect(renderRouteWithPuppeteerSpy).toHaveBeenNthCalledWith(3, expect.anything(), '/')
        })
    }

    test('discoverNewRoutes=true renderFirstRouteAlone=false', async() => {
        const plugin = new PuppeteerPrerenderPlugin({
            enabled: true,
            routes: ['/'],
            entryDir: '/dist',
            discoverNewRoutes: true,
            renderFirstRouteAlone: false,
        })

        renderRouteWithPuppeteerSpy = jest.spyOn(PuppeteerPrerenderPlugin.prototype, 'renderRouteWithPuppeteer').mockImplementation(() => {
            const result: RenderResult = {
                originalRoute: '',
                route: '',
                html: '<a href="/test">Link</a>',
            }

            return new Promise((resolve) => resolve(result))
        })

        await plugin.renderRoutes()

        expect(plugin.queuedRoutes.length).toBe(0)
        expect(plugin.processedRoutes.length).toBe(2)
        expect(renderRouteWithPuppeteerSpy).toBeCalledTimes(2)
        expect(renderRouteWithPuppeteerSpy).toHaveBeenNthCalledWith(1, expect.anything(), '/')
        expect(renderRouteWithPuppeteerSpy).toHaveBeenNthCalledWith(2, expect.anything(), '/test')
    })

    test('discoverNewRoutes=true renderFirstRouteAlone=true', async() => {
        renderRouteWithPuppeteerSpy = jest.spyOn(PuppeteerPrerenderPlugin.prototype, 'renderRouteWithPuppeteer').mockImplementation(() => {
            const result: RenderResult = {
                originalRoute: '',
                route: '',
                html: '<a href="/test">Link</a>',
            }

            return new Promise((resolve) => resolve(result))
        })

        const plugin = new PuppeteerPrerenderPlugin({
            enabled: true,
            routes: ['/'],
            entryDir: '/dist',
            discoverNewRoutes: true,
            renderFirstRouteAlone: true,
        })

        await plugin.renderRoutes()

        expect(plugin.queuedRoutes.length).toBe(0)
        expect(plugin.processedRoutes.length).toBe(2)
        expect(renderRouteWithPuppeteerSpy).toBeCalledTimes(2)
        expect(renderRouteWithPuppeteerSpy).toHaveBeenNthCalledWith(1, expect.anything(), '/')
        expect(renderRouteWithPuppeteerSpy).toHaveBeenNthCalledWith(2, expect.anything(), '/test')
    })

    test('discoverNewRoutes=true multiple routes', async() => {
        const plugin = new PuppeteerPrerenderPlugin({
            enabled: true,
            routes: ['/'],
            entryDir: '/dist',
            discoverNewRoutes: true,
        })

        renderRouteWithPuppeteerSpy = jest.spyOn(PuppeteerPrerenderPlugin.prototype, 'renderRouteWithPuppeteer').mockImplementation(() => {
            const result: RenderResult = {
                originalRoute: '',
                route: '',
                html: `
                    <a href="/">1</a>
                    <a href="/test">2</a>
                    <a href="/test">2</a>
                    <a href="/foo">3</a>
                    <a href="/bar">4</a>
                `,
            }

            return new Promise((resolve) => resolve(result))
        })

        await plugin.renderRoutes()

        expect(plugin.queuedRoutes.length).toBe(0)
        expect(plugin.processedRoutes.length).toBe(4)
        expect(renderRouteWithPuppeteerSpy).toBeCalledTimes(4)
        expect(renderRouteWithPuppeteerSpy).toHaveBeenNthCalledWith(1, expect.anything(), '/')
        expect(renderRouteWithPuppeteerSpy).toHaveBeenNthCalledWith(2, expect.anything(), '/test')
        expect(renderRouteWithPuppeteerSpy).toHaveBeenNthCalledWith(3, expect.anything(), '/foo')
        expect(renderRouteWithPuppeteerSpy).toHaveBeenNthCalledWith(4, expect.anything(), '/bar')
    })
})
