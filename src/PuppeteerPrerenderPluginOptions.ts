import Ajv from 'ajv'
import puppeteer from 'puppeteer'

export interface PageInjection {
    key: string
    value: unknown
}

export interface RenderResult {
    originalRoute: string
    route: string
    html: string
}

export interface PuppeteerPrerenderPluginOptions {
    routes: Array<string>
    entryDir: string
    entryFile?: string
    publicPath?: string
    outputDir?: string

    enabled?: boolean
    keepAlive?: boolean
    maxConcurrent?: number
    injections?: Array<PageInjection>
    renderAfterEvent?: string
    renderAfterTime?: number

    postProcess?: (result: RenderResult) => void
    puppeteerOptions?: Parameters<typeof puppeteer.launch>[0]
}

/* eslint-disable quote-props */
const schema = {
    type: 'object',
    properties: {
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
        'maxConcurrent': {
            type: 'integer',
            minimum: 1,
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
        'renderAfterEvent': {
            type: 'string',
        },
        'renderAfterTime': {
            type: 'integer',
            minimum: 0,
        },
        'postProcess': {},
        'puppeteerOptions': {
            type: 'object',
        },
    },
    required: ['routes', 'entryDir'],
    additionalProperties: false,
}

const ajv = new Ajv()
const validator = ajv.compile(schema)

export function isValidOptions(options: unknown): options is PuppeteerPrerenderPluginOptions {
    const isValid = validator(options)
    if (!isValid) {
        console.warn('Invalid PuppeteerPrerenderPluginOptions', validator.errors)
        throw new Error('Invalid PuppeteerPrerenderPluginOptions')
    }

    return isValid
}