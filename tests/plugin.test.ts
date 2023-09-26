import { mkdir, writeFile } from 'node:fs/promises'
import { PuppeteerPrerenderPlugin } from '@/PuppeteerPrerenderPlugin'
import { RenderResult } from '@/PuppeteerPrerenderPluginOptions'
import { PrerenderServer } from '@/servers/PrerenderServer'
import { describe, test, expect, vi, SpyInstance, beforeEach } from 'vitest'

let initServerSpy: SpyInstance
let renderRouteWithPuppeteerSpy: SpyInstance

vi.mock('node:fs/promises', () => {
    return {
        mkdir: vi.fn(),
        writeFile: vi.fn(),
    }
})

beforeEach(() => {
    initServerSpy = vi.spyOn(PuppeteerPrerenderPlugin.prototype, 'initServer').mockImplementation(() => {
        return new Promise<PrerenderServer>((resolve) => {
            resolve({
                destroy: () => {},
                isServerReady: () => new Promise<void>((resolve) => { resolve() }),
                baseUrl: '',
                publicPath: '',
                publicDir: '',
            })
        })
    })

    renderRouteWithPuppeteerSpy = vi.spyOn(PuppeteerPrerenderPlugin.prototype, 'renderRouteWithPuppeteer').mockImplementation(() => {
        return new Promise<RenderResult>((resolve) => {
            resolve({
                originalRoute: '',
                route: '',
                html: '',
            })
        })
    })
})

describe('PuppeteerPrerenderPlugin', () => {
    test('single route', async() => {
        const plugin = new PuppeteerPrerenderPlugin({
            enabled: true,
            routes: ['/'],
            entryDir: '/dist',
        })

        await plugin.renderRoutes()

        expect(initServerSpy).toBeCalled()
        expect(mkdir).toBeCalledWith('/dist', { recursive: true })
        expect(writeFile).toBeCalledWith('/dist/index.html', '')

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
            expect(mkdir).toBeCalledTimes(3)
            expect(writeFile).toBeCalledTimes(3)

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

        renderRouteWithPuppeteerSpy.mockImplementation(() => {
            return new Promise<RenderResult>((resolve) => {
                resolve({
                    originalRoute: '',
                    route: '',
                    html: '<a href="/test">Link</a>',
                })
            })
        })

        await plugin.renderRoutes()

        expect(plugin.queuedRoutes.length).toBe(0)
        expect(plugin.processedRoutes.length).toBe(2)
        expect(renderRouteWithPuppeteerSpy).toBeCalledTimes(2)
        expect(renderRouteWithPuppeteerSpy).toHaveBeenNthCalledWith(1, expect.anything(), '/')
        expect(renderRouteWithPuppeteerSpy).toHaveBeenNthCalledWith(2, expect.anything(), '/test')
    })

    test('discoverNewRoutes=true renderFirstRouteAlone=true', async() => {
        renderRouteWithPuppeteerSpy.mockImplementation(() => {
            return new Promise<RenderResult>((resolve) => {
                resolve({
                    originalRoute: '',
                    route: '',
                    html: '<a href="/test">Link</a>',
                })
            })
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

        renderRouteWithPuppeteerSpy.mockImplementation(() => {
            return new Promise<RenderResult>((resolve) => {
                resolve({
                    originalRoute: '',
                    route: '',
                    html: `
                        <a href="/">1</a>
                        <a href="/test">2</a>
                        <a href="/test">2</a>
                        <a href="/foo">3</a>
                        <a href="/bar">4</a>
                    `,
                })
            })
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
