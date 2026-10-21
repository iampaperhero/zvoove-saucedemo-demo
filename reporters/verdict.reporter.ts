import { appendFileSync, rmSync, writeFileSync } from 'fs';
import { stripVTControlCharacters } from 'util';
import type { FullResult, Reporter, Suite, TestError } from '@playwright/test/reporter';
import { KNOWN } from '../fixtures/issues';
import { userOf } from '../utils/users';

// Says whether every failure is a known one of the test's user (ADR 0018).
// Outside test-results/, so Playwright's clean-up never removes it.
const VERDICT_FILE = `verdict.json`;

// An expect's own message: the first line, without colours and "Error: ".
const firstLine = (error: TestError): string =>
    stripVTControlCharacters(error.message ?? error.value ?? `an error without a message`)
        .split(`\n`)[0]
        .replace(/^Error: /, ``);

export default class VerdictReporter implements Reporter {
    private root?: Suite;
    private unexpected: string[] = [];

    onBegin(_config: unknown, suite: Suite) {
        this.root = suite;
        // A run that dies before onEnd must leave no verdict, not the last run's.
        rmSync(VERDICT_FILE, { force: true });
    }

    // Errors of no test: a crashed worker, a broken config, no test found.
    onError(error: TestError) {
        this.unexpected.push(firstLine(error));
    }

    onEnd(result: FullResult) {
        if (result.status === `timedout` || result.status === `interrupted`)
            this.unexpected.push(`The run ${result.status}`);

        // A test with no result never ran (an interrupted run); the run's own error says why.
        const tests = (this.root?.allTests() ?? []).filter((test) => {
            const last = test.results.at(-1);
            return last && last.status !== `skipped`;
        });
        if (!tests.length) this.unexpected.push(`No test ran`);

        let failed = 0;
        for (const test of tests) {
            const last = test.results.at(-1)!;
            const user = userOf(test);
            const known = Object.values(KNOWN[user]).flat();
            if (last.status !== `passed`) failed++;
            for (const message of last.errors.map(firstLine))
                if (!known.includes(message)) this.unexpected.push(`${user}: ${message}`);
            if (last.status === `timedOut` || last.status === `interrupted`)
                this.unexpected.push(`${user}: the test ${last.status}`);
        }

        const ok = !this.unexpected.length;
        writeFileSync(
            VERDICT_FILE,
            `${JSON.stringify({ ok, unexpected: this.unexpected }, null, 2)}\n`,
        );

        const summaryFile = process.env.GITHUB_STEP_SUMMARY;
        if (!summaryFile) return;
        const lines = [
            `### Verdict: ${ok ? `no new failure` : `❌ new failure`}`,
            ...this.unexpected.map((message) => `- ${message}`),
            ...(failed
                ? [
                      `The job is red: the tests failed, on known issues only when no new failure is listed.`,
                  ]
                : []),
        ];
        appendFileSync(summaryFile, `${lines.join(`\n\n`)}\n`);
    }
}
