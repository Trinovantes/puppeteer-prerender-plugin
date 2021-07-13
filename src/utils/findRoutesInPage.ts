import { JSDOM } from 'jsdom'

export function findRoutesInPage(html: string): Array<string> {
    const newRoutes: Array<string> = []
    const dom = new JSDOM(html)
    const links = dom.window.document.querySelectorAll('a')

    for (const link of links) {
        if (!link.href.startsWith('/')) {
            continue
        }

        newRoutes.push(link.href)
    }

    return newRoutes
}
