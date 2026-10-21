import { defineConfig } from 'allure';

// Built by the publish job from every browser's results. The history file
// carries the trends; the publish job fetches it from the latest report of main.
export default defineConfig({
    name: 'zvoove-saucedemo-demo',
    output: './allure-report',
    historyPath: './allure-history/history.jsonl',
    historyLimit: 30,
});
