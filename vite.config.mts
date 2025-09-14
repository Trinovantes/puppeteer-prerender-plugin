import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        restoreMocks: true,
        silent: Boolean(process.env.CI),
        dir: './tests',
    },
})
