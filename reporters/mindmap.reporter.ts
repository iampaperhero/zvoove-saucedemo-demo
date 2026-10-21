import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { USERNAMES, userOf } from '../utils/users';

// This job's branch of the run's mind map, a leaf per test; a later job joins the branches.
const MINDMAP_DIR = `test-results/mindmap`;

const STATUS_ICONS: Record<TestResult[`status`], string> = {
    passed: `✅`,
    failed: `❌`,
    timedOut: `⏱️`,
    skipped: `⏭️`,
    interrupted: `⛔`,
};

// Strips what Mermaid reads as syntax in a mind map node.
const label = (text: string): string =>
    text
        .replace(/[:;#"()[\]{}]/g, ` `)
        .replace(/\s+/g, ` `)
        .trim();

// Flaky, not passed, as in the HTML report.
const outcomeIcon = (test: TestCase): string =>
    test.outcome() === `flaky` ? `🔁` : STATUS_ICONS[test.results.at(-1)?.status ?? `skipped`];

export default class MindmapReporter implements Reporter {
    private root?: Suite;

    onBegin(_config: unknown, suite: Suite) {
        this.root = suite;
    }

    onEnd() {
        if (!this.root) return;
        mkdirSync(MINDMAP_DIR, { recursive: true });
        // Per browser and user, not per project: two jobs of one browser (ADR 0016) must not share a file.
        for (const project of this.root.suites) {
            for (const user of USERNAMES) {
                const tests = project.allTests().filter((test) => userOf(test) === user);
                if (!tests.length) continue;
                const name = `${project.title} · ${user}`;
                // Ids carry the name, so text is never read as a shape and branches never share a node.
                const prefix = name.replace(/\W/g, `_`);
                const lines = [`    ${prefix}[${label(name)}]`];
                for (const [index, test] of tests.entries()) {
                    const attempts =
                        test.results.length > 1 ? `, ${test.results.length} attempts` : ``;
                    lines.push(
                        `      ${prefix}_${index}[${outcomeIcon(test)} ${label(test.title)}${attempts}]`,
                    );
                }
                writeFileSync(join(MINDMAP_DIR, `${name}.mmd`), `${lines.join(`\n`)}\n`);
            }
        }
    }
}
