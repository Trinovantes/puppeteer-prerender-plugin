import type { RouteComponent, RouteLocationNormalizedLoaded } from 'vue-router'

export type MatchedComponent = RouteComponent & {
    components?: Record<string, MatchedComponent>
    __file?: string
}

export function getMatchedComponents(route: RouteLocationNormalizedLoaded): Array<MatchedComponent> {
    return route.matched.flatMap((record) => {
        const recordComponents = Object.values(record.components) as Array<MatchedComponent>
        const childComponents = recordComponents.flatMap((c) => c.components ? Object.values(c.components) : []) as Array<MatchedComponent>
        return [
            ...recordComponents,
            ...childComponents,
        ]
    })
}
