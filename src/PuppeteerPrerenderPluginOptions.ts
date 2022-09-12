import Ajv from 'ajv'
import type puppeteer from 'puppeteer'

export type PageInjection = {
    key: string
    value: unknown
}

export type RenderResult = {
    originalRoute: string
    route: string
    html: string
}

export type PuppeteerPrerenderPluginOptions = {
    routes: Array<string>
    entryDir: string
    entryFile?: string
    publicPath?: string
    outputDir?: string

    enabled?: boolean
    keepAlive?: boolean
    enablePageJs?: boolean
    maxConcurrent?: number
    discoverNewRoutes?: boolean
    renderFirstRouteAlone?: boolean
    injections?: Array<PageInjection>
    renderAfterEvent?: string
    renderAfterTime?: number

    postProcess?: (result: RenderResult) => void | Promise<void>
    puppeteerOptions?: Parameters<typeof puppeteer.launch>[0]
}

/* eslint-disable quote-props */
const baseProperties = {
    'routes': {
        type: 'array',
        items: {
            type: 'string',
        },
    },
    'entryDir': {
        type: 'string',
    },
    'entryFile': {
        type: 'string',
    },
    'publicPath': {
        type: 'string',
    },
    'outputDir': {
        type: 'string',
    },
    'enabled': {
        type: 'boolean',
    },
    'keepAlive': {
        type: 'boolean',
    },
    'enablePageJs': {
        type: 'boolean',
    },
    'maxConcurrent': {
        type: 'integer',
        minimum: 1,
    },
    'discoverNewRoutes': {
        type: 'boolean',
    },
    'renderFirstRouteAlone': {
        type: 'boolean',
    },
    'injections': {
        type: 'array',
        items: {
            type: 'object',
            properties: {
                'key': {
                    type: 'string',
                },
                'value': {
                    anyOf: [
                        { type: 'number' },
                        { type: 'string' },
                        { type: 'boolean' },
                        { type: 'array' },
                        { type: 'object' },
                    ],
                },
            },
            additionalProperties: false,
        },
    },
    'postProcess': {},
    'puppeteerOptions': {
        type: 'object',
    },
}

const baseSchema = {
    type: 'object',
    required: ['routes', 'entryDir'],
    additionalProperties: false,
}

const ajv = new Ajv()
const validator = ajv.compile({
    type: 'object',
    anyOf: [
        {
            ...baseSchema,
            properties: baseProperties,
        },
        {
            ...baseSchema,
            properties: {
                ...baseProperties,
                'renderAfterEvent': {
                    type: 'string',
                },
            },
        },
        {
            ...baseSchema,
            properties: {
                ...baseProperties,
                'renderAfterTime': {
                    type: 'integer',
                    minimum: 0,
                },
            },
        },
    ],
})

export function isValidOptions(options: unknown): options is PuppeteerPrerenderPluginOptions {
    const isValid = validator(options)
    if (!isValid) {
        console.warn('Invalid PuppeteerPrerenderPluginOptions', validator.errors)
        throw new Error('Invalid PuppeteerPrerenderPluginOptions')
    }

    return isValid
}
