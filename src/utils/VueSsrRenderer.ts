import { renderToString, SSRContext } from '@vue/server-renderer'
import { readFileSync } from 'fs'
import { App } from 'vue'
import { getFileName } from './getFileName'
import { MatchedComponent } from './getMatchedComponents'

// -----------------------------------------------------------------------------
// VueSsrServer
// -----------------------------------------------------------------------------

type OnPostRenderFn = () => Promise<void>

export class VueSsrRenderer<AppContext extends SSRContext> {
    private _manifest: Map<string, string>

    constructor(manifestPath: string) {
        const rawManifest = JSON.parse(readFileSync(manifestPath).toString('utf-8')) as Record<string, string>
        this._manifest = new Map(Object.entries(rawManifest))
    }

    async render(app: App, appContext: AppContext, routeComponents: Array<MatchedComponent>, onPostRender?: OnPostRenderFn): Promise<string> {
        const headLinks = this.renderHeadLinks(routeComponents)
        const appHtml = await renderToString(app, appContext)
        await onPostRender?.()

        return `
            <!DOCTYPE html ${appContext.teleports?.htmlAttrs ?? ''}>
            <html lang="en">
            <head ${appContext.teleports?.headAttrs ?? ''}>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                ${headLinks}
                ${appContext.teleports?.head ?? ''}
            </head>
            <body ${appContext.teleports?.bodyAttrs ?? ''}>
                ${appContext.teleports?.noScript ?? ''}
                <div id="app">${appHtml}</div>
                ${appContext.teleports?.body ?? ''}
                ${this.renderScript('vendors.js')}
                ${this.renderScript('main.js')}
            </body>
            </html>
        `
    }

    private renderHeadLinks(routeComponents: Array<MatchedComponent>): string {
        let head = ''

        head += this.renderCss('vendors.css')
        head += this.renderPreloadLink('vendors.js')

        head += this.renderCss('main.css')
        head += this.renderPreloadLink('main.js')

        // Try to see if any of the matched components in our route exists in the manifest
        // If it exists, then insert a preload script for performance and avoid FOUC
        for (const c of routeComponents) {
            const componentName = c.__file
                ? getFileName(c.__file)
                : c.name

            if (!componentName) {
                continue
            }

            head += this.renderPreloadLink(`${componentName}.js`)
            head += this.renderCss(`${componentName}.css`)
        }

        return head
    }

    private renderPreloadLink(fileName: string): string {
        const filePath = this._manifest.get(fileName)

        if (filePath?.endsWith('.js')) {
            return `<link rel="preload" href="${filePath}" as="script">\n`
        } else if (filePath?.endsWith('.css')) {
            return `<link rel="preload" href="${filePath}" as="style">\n`
        }

        return ''
    }

    private renderCss(fileName: string): string {
        const filePath = this._manifest.get(fileName)
        if (!filePath) {
            return ''
        }

        return `<link rel="stylesheet" href="${filePath}">\n`
    }

    private renderScript(fileName: string): string {
        const filePath = this._manifest.get(fileName)
        if (!filePath) {
            return ''
        }

        return `<script src="${filePath}" defer></script>\n`
    }
}
