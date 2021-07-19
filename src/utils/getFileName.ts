export function getFileName(path: string): string {
    const matches = /([ _\-\w]+)\.(\w+)$/.exec(path)
    if (!matches) {
        return ''
    }

    return matches[1]
}
