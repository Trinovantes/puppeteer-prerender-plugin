# Puppeteer Prerender Plugin

This is a Webpack 5 plugin for prerendering Single Page Applications (SPA) with Puppeteer. After Webpack emits all of your files, this plugin starts an Express static server in your `dist` directory. It then runs Puppeteer on all of your specified routes (e.g. `/about`) and saves the pages' rendered HTML as separate files (e.g. `/dist/about/index.html`).

## Why?

The main benefit of prerendering your pages is for SEO benefits. Normally for an SPA, you would redirect all of your page requests to a single `index.html` and let your frontend framework handle routing. However, this also means that search engines will always see the same `<meta>` tags. By prerendering each route in your SPA, each page will be able to serve their respective `<meta>` tags for search engines.

## Why You Shouldn't Use This

* You are building a SPA that literally has one page.

* Hydration errors are difficult to debug.

* This will greatly increase your build times if you have a lot of routes to prerender (over 100+). Consider using Server Side Rendering (SSR) instead.

## Options

Option | Type | Example | Notes
---    | ---     | ---     | ---
`routes` | `Array<string>` | `['/pricing', '/']` | **Required:** Array of routes to render.
`entryDir` | `string` | `dist` | **Required:** Directory to start the Express static server.
`entryFile` | `string` | `index.html` | Entry file for your SPA. This is useful if you do not want `dist/index.html` to be overwritten by the `/` route.
`publicPath` | `string` | `/public` | Public path to serve static files from `entryDir`.
`outputDir` | `string` | `dist` | Output directory for prerendered routes (defaults to `entryDir`).
`enabled` | `boolean` | `process.env.NODE_ENV !== 'development'` | Disabled by default for performance. This option is useful if you wish to only prerender production builds.
`keepAlive` | `boolean` | `false` | Keep the server alive after prerendering completes. You will need to manually terminate the shell command. This is useful if you wish to inspect the actual pages that Puppeteer has seen.
`maxConcurrent` | `number` | `10` | Maximum number of concurrent Puppeteer instances. This option is useful for keeping CPU/memory usage down when you have a lot of routes.
`discoverNewRoutes` | `boolean` | `true` | Try to find new routes by searching for `<a href="/">` tags in render results.
`injections` | `Array<{key: string, value: unknown}>` | `[{ key: 'isPrerender', value: true }]` | Data to inject into each page with `window[key] = value`. This is useful if you wish to provide data to your app that's only present during prerender.
`renderAfterEvent` | `string` | `__RENDERED__` | Event name Puppeteer should wait for before saving page contents. You will need to manually dispatch the event in your app via `document.dispatchEvent(new Event('__RENDERED__'))`.
`renderAfterTime` | `number` | `5000` | Time in ms for Puppeteer to wait before saving page contents.
`postProcess` | `Function` | See Example Usage | Function to post-process the saved page contents and route.
`puppeteerOptions` | `Object` | See Example Usage | Options to pass to `puppeteer.launch()`. See [Puppeteer documentation](https://github.com/puppeteer/puppeteer/blob/v9.1.1/docs/api.md#puppeteerlaunchoptions) for more information.

> **Important:** Your `/` route must be defined last. Otherwise, routes rendered after `/` will use `dist/index.html` with artifacts specific to your homepage instead of a blank SPA `index.html`.

## Example Usage (Vue 2)

### webpack.config.ts

```ts
import { PuppeteerPrerenderPlugin } from 'puppeteer-prerender-plugin'
import HtmlWebpackPlugin from 'html-webpack-plugin'

export default {
    target: 'web',
    entry: 'main.ts',

    plugins: [
        new HtmlWebpackPlugin({
            template: 'index.html', // Generates dist/index.html first
        }),
        new PuppeteerPrerenderPlugin({
            enabled: process.env.NODE_ENV !== 'development',
            renderAfterEvent: '__RENDERED__',
            outputDir: 'dist',
            postProcess: (result) => {
                result.html = result.html
                    .replace(/<script (.*?)>/g, '<script $1 defer>')
                    .replace('id="app"', 'id="app" data-server-rendered="true"')
            },
            routes: [
                '/pricing', // Renders to dist/pricing/index.html
                '/about',   // Renders to dist/about/index.html
                '/',        // Renders to dist/index.html
            ],
            puppeteerOptions: {
                // Needed to run inside Docker
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                ],
            },
        }),
    ],
}
```

### main.ts

```ts
import Vue from 'vue'
import App from 'App.vue'

const app = new Vue(App)
app.mount('#app')

// Tell Puppeteer the page is ready to be saved
document.dispatchEvent(new Event('__RENDERED__'))
```

## Vue 3 Usage

Vue 3 hydration assumes the markup has been rendered with `@vue/server-renderer::renderToString` function instead of the output markup of a normal SPA. This is due to the fact that `renderToString` outputs additional comment nodes. As a result, trying to hydrate non SSR markup will result in hydration errors.

If you wish to prerender Vue 3 apps, you will need to set your `postProcess` callback to empty the `<div id="app">` tag. Otherwise, you will see a "white flash" due to Vue removing the prerendered markup with its client-rendered markup.

```ts
export default {
    plugins: [
        new PuppeteerPrerenderPlugin({
            postProcess: (result) => {
                const dom = new JSDOM(result.html)
                const app = dom.window.document.querySelector('div#app')
                if (app) {
                    // Remove app HTML since Vue 3 cannot hydrate non-SSR markup
                    app.innerHTML = ''
                }

                result.html = dom.serialize()
            },
        }),
    ],
}
```
