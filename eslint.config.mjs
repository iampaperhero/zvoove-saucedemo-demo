import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';

export default defineConfig(
    {
        ignores: [
            'node_modules/',
            'playwright-report/',
            'blob-report/',
            'test-results/',
            'allure-results/',
            'allure-report/',
            'allure-history/',
        ],
    },
    tseslint.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
        },
        rules: {
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/no-require-imports': ['error', { allow: ['/package\\.json$'] }],
        },
    },
    {
        ...playwright.configs['flat/recommended'],
        files: ['tests/**/*.ts', 'pages/**/*.ts', 'utils/**/*.ts', 'fixtures/**/*.ts'],
        rules: {
            ...playwright.configs['flat/recommended'].rules,
            'playwright/no-raw-locators': 'error',
            'playwright/no-skipped-test': ['error', { allowConditional: true }],
            // `softly` is the spec's soft expect, and `check` wraps it.
            'playwright/expect-expect': ['warn', { assertFunctionNames: ['softly', 'check'] }],
        },
    },
    {
        files: ['pages/**/*.ts', 'utils/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: '@playwright/test',
                            importNames: ['expect', 'test'],
                            message:
                                'Page objects and utils act, read and compute; return a value and assert in the test (docs/adr/0002). Steps come from @step in utils/step.ts (docs/adr/0002).',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['utils/step.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: '@playwright/test',
                            importNames: ['expect'],
                            message:
                                'Page objects and utils act, read and compute; return a value and assert in the test (docs/adr/0002).',
                        },
                    ],
                },
            ],
        },
    },
);
