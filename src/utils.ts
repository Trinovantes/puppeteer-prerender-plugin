export async function batchRequests<T>(totalRequests: number, maxConcurrent: number, makeRequest: (idx: number) => Promise<T>): Promise<Array<T>> {
    let i = 0
    let results: Array<T> = []

    while (i < totalRequests) {
        const start = i
        const end = Math.min(totalRequests, i + maxConcurrent)
        const promises = []

        for (let requestIdx = start; requestIdx < end; requestIdx++, i++) {
            promises.push(makeRequest(requestIdx))
        }

        results = results.concat(await Promise.all(promises))
    }

    return results
}
