import { validateOptions, PuppeteerPrerenderPluginOptions } from '@/PuppeteerPrerenderPluginOptions'
import { describe, test, expect } from 'vitest'

describe('PuppeteerPrerenderPluginOptions', () => {
    test('smoke', () => {
        expect(true).toBe(true)
    })

    test('missing required options should throw', () => {
        expect(() => validateOptions({})).toThrow()
    })

    test('minimal options', () => {
        const options: PuppeteerPrerenderPluginOptions = {
            routes: [],
            entryDir: '',
        }

        expect(validateOptions(options)).toBe(true)
    })

    test('non-string routes (number) should throw', () => {
        const options = {
            routes: [1],
            entryDir: '',
        }

        expect(() => validateOptions(options)).toThrow()
    })

    test('non-string routes (promises) should throw', () => {
        const options = {
            routes: [new Promise<string>((resolve) => { resolve('/') })],
            entryDir: '',
        }

        expect(() => validateOptions(options)).toThrow()
    })

    test('injections', () => {
        const options: PuppeteerPrerenderPluginOptions = {
            routes: [],
            entryDir: '',
            injections: [
                {
                    key: 'number',
                    value: 42,
                },
                {
                    key: 'string',
                    value: '',
                },
                {
                    key: 'boolean',
                    value: true,
                },
                {
                    key: 'array',
                    value: [
                        42,
                        'Hello World',
                        true,
                        {},
                        [],
                    ],
                },
                {
                    key: 'object',
                    value: {},
                },
            ],
        }

        expect(validateOptions(options)).toBe(true)
    })

    test('only renderAfterEvent', () => {
        const options: PuppeteerPrerenderPluginOptions = {
            routes: [],
            entryDir: '',
            renderAfterEvent: '__RENDERED__',
        }

        expect(validateOptions(options)).toBe(true)
    })

    test('only renderAfterTime', () => {
        const options: PuppeteerPrerenderPluginOptions = {
            routes: [],
            entryDir: '',
            renderAfterTime: 5000,
        }

        expect(validateOptions(options)).toBe(true)
    })

    test('both renderAfterEvent and renderAfterTime should throw', () => {
        const options: PuppeteerPrerenderPluginOptions = {
            routes: [],
            entryDir: '',
            renderAfterEvent: '__RENDERED__',
            renderAfterTime: 5000,
        }

        expect(() => validateOptions(options)).toThrow()
    })

    test('puppeteer options', () => {
        const options: PuppeteerPrerenderPluginOptions = {
            routes: [],
            entryDir: '',
            puppeteerOptions: {
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                ],
            },
        }

        expect(validateOptions(options)).toBe(true)
    })
})
