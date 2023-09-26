import { Type, Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import puppeteer from 'puppeteer'

const tbPageInjection = Type.Object({
    key: Type.String(),
    value: Type.Unknown(),
}, {
    additionalProperties: false,
})

const tbRenderResult = Type.Object({
    originalRoute: Type.String(),
    route: Type.String(),
    html: Type.String(),
}, {
    additionalProperties: false,
})

const tbPuppeteerPrerenderPluginOptions = Type.Object({
    routes: Type.Array(Type.String()),
    entryDir: Type.String(),
    entryFile: Type.Optional(Type.String()),
    publicPath: Type.Optional(Type.String()),
    outputDir: Type.Optional(Type.String()),

    enabled: Type.Optional(Type.Boolean()),
    keepAlive: Type.Optional(Type.Boolean()),
    enablePageJs: Type.Optional(Type.Boolean()),
    maxConcurrent: Type.Optional(Type.Number({ minimum: 1 })),
    discoverNewRoutes: Type.Optional(Type.Boolean()),
    renderFirstRouteAlone: Type.Optional(Type.Boolean()),
    injections: Type.Optional(Type.Array(tbPageInjection)),

    renderAfterEvent: Type.Optional(Type.String()),
    renderAfterTime: Type.Optional(Type.Number({ minimum: 0 })),

    postProcess: Type.Optional(
        Type.Function([
            tbRenderResult,
        ], Type.Union([
            Type.Void(),
            Type.Promise(Type.Void()),
        ])),
    ),
    puppeteerOptions: Type.Optional(Type.Unsafe<Parameters<typeof puppeteer.launch>[0]>()),
}, {
    additionalProperties: false,
})

export type PageInjection = Static<typeof tbPageInjection>

export type RenderResult = Static<typeof tbRenderResult>

export type PuppeteerPrerenderPluginOptions = Static<typeof tbPuppeteerPrerenderPluginOptions>

export function validateOptions(options: unknown): options is PuppeteerPrerenderPluginOptions {
    if (!Value.Check(tbPuppeteerPrerenderPluginOptions, options)) {
        throw new Error('Invalid PuppeteerPrerenderPluginOptions')
    }

    // It's probably possible to encode this logic into typebox but it would make the schema too complicated
    // Thus it's simplier to just check here
    if (options.renderAfterEvent !== undefined && options.renderAfterTime !== undefined) {
        throw new Error('Canont set both renderAfterEvent and renderAfterTime')
    }

    return true
}
