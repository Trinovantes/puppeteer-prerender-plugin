/* eslint-disable quote-props */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path')

module.exports = {
    // https://eslint.org/docs/user-guide/configuring#configuration-cascading-and-hierarchy
    // This option interrupts the configuration hierarchy at this file
    // Remove this if you have an higher level ESLint config file (it usually happens into a monorepos)
    root: true,

    parserOptions: {
        parser: '@typescript-eslint/parser',
        project: path.resolve(__dirname, './tsconfig.json'),
        tsconfigRootDir: __dirname,
        ecmaVersion: 2017, // Allows for the parsing of modern ECMAScript features
        sourceType: 'module', // Allows for the use of imports
    },

    // Predefines global variables (e.g. browser env predefines 'window' variable)
    env: {
        browser: true,
        node: true,
    },

    // Disable warnings for variables that are accessed but not defined in same file
    globals: {
        DEFINE: 'readonly',
    },

    // Rules order is important, please avoid shuffling them
    extends: [
        'standard',
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
    ],

    plugins: [
        '@typescript-eslint',
    ],

    rules: {
        'generator-star-spacing': ['error', 'before'],
        'arrow-parens': ['error', 'always'],
        'one-var': ['error', 'never'],
        'no-void': ['error', {
            allowAsStatement: true,
        }],
        'space-before-blocks': ['error', 'always'],

        'import/first': 'off',
        'import/named': 'error',
        'import/namespace': 'error',
        'import/default': 'error',
        'import/export': 'error',
        'import/extensions': 'off',
        'import/no-unresolved': 'off',
        'import/no-extraneous-dependencies': 'off',

        'comma-dangle': 'off',
        '@typescript-eslint/comma-dangle': ['error', 'always-multiline'],

        'space-before-function-paren': ['error', 'never'],
        'indent': ['error', 4, {
            'SwitchCase': 1,
        }],

        '@typescript-eslint/type-annotation-spacing': 'error',
        '@typescript-eslint/restrict-template-expressions': ['error', {
            allowNumber: true,
            allowBoolean: true,
            allowAny: false,
            allowNullish: true,
        }],
        '@typescript-eslint/no-inferrable-types': ['error', {
            ignoreParameters: false,
            ignoreProperties: true,
        }],
        '@typescript-eslint/consistent-type-assertions': ['error', {
            assertionStyle: 'as',
            objectLiteralTypeAssertions: 'never',
        }],
        '@typescript-eslint/array-type': ['error', {
            default: 'generic',
        }],

        '@typescript-eslint/member-delimiter-style': ['error', {
            multiline: {
                delimiter: 'none',
                requireLast: true,
            },
            singleline: {
                delimiter: 'semi',
                requireLast: false,
            },
        }],

        'semi': 'off',
        '@typescript-eslint/semi': ['error', 'never'],

        'no-debugger': 'error',

        '@typescript-eslint/naming-convention': [
            'error',
            {
                'selector': 'default',
                'format': null,
                'modifiers': ['requiresQuotes'],
            },
            {
                'selector': 'typeLike',
                'format': ['PascalCase'],
            },
            {
                'selector': 'parameter',
                'format': ['strictCamelCase'],
                'leadingUnderscore': 'allow',
            },
            {
                'selector': 'memberLike',
                'modifiers': ['private'],
                'format': ['strictCamelCase'],
                'leadingUnderscore': 'require',
            },
            {
                'selector': [
                    'variableLike',
                    'method',
                ],
                'format': ['strictCamelCase', 'UPPER_CASE'],
            },
        ],

        '@typescript-eslint/strict-boolean-expressions': ['error', {
            allowNullableBoolean: true,
            allowNullableString: true,
        }],
    },
}
