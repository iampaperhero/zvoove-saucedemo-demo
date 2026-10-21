// Files one issue per checklist item with a new anomaly in an AI judge verdict (ADR 0020), for
// every user whose receipt shows it, labelled AI, unless an open issue already names the item,
// whatever its user. Run by the workflow's own job, never on PRs.
//
// node judge/file-issues.mjs <verdict.json>
import { execFileSync } from 'child_process';
import { appendFileSync, readFileSync } from 'fs';

const REPO = process.env.GITHUB_REPOSITORY || `iampaperhero/zvoove-saucedemo-demo`;
const [file = `judge-results/verdict.json`] = process.argv.slice(2);
const { model, verdicts } = JSON.parse(readFileSync(file, `utf8`));
const run = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : `a local run`;
const gh = (...args) => execFileSync(`gh`, [...args, `-R`, REPO], { encoding: `utf8` });

// Every filing carries the label AI, made on the first filing if the repository lacks it.
let labelled = false;
const label = () => {
    if (!labelled)
        gh(
            `label`,
            `create`,
            `AI`,
            `--force`,
            `--color`,
            `8250df`,
            `--description`,
            `Filed by the AI judge (ADR 0020)`,
        );
    labelled = true;
};

// The new anomalies by item, each with the user and browsers whose receipt shows it.
const byItem = new Map();
for (const verdict of verdicts)
    for (const anomaly of (verdict.anomalies ?? []).filter(({ issues }) => !issues.length))
        byItem.set(anomaly.item, [...(byItem.get(anomaly.item) ?? []), { verdict, anomaly }]);

const lines = [];
for (const [item, seen] of byItem) {
    const users = seen.map(({ verdict }) => verdict.user).join(`, `);
    // One filing failing leaves the others to go on; the verdict is already written.
    try {
        const open = JSON.parse(
            gh(`issue`, `list`, `--state`, `open`, `--search`, `"${item}"`, `--json`, `number`),
        );
        if (open.length) {
            lines.push(
                `- ${item} (${users}): already open as #${open.map(({ number }) => number).join(`, #`)}`,
            );
            continue;
        }
        const { requirements } = seen[0].anomaly;
        const body = [
            `**Checklist item:** \`${item}\` · **Requirements:** ${requirements.map(({ id, text }) => `${id} (${text})`).join(`; `)}`,
            ...seen.flatMap(({ verdict, anomaly }) => [
                ``,
                `### \`${verdict.user}\` · ${verdict.browsers.join(`, `)}`,
                ``,
                `**Probability:** ${anomaly.probability ?? `decided by code`} · **Severity:** ${anomaly.severity}`,
                ``,
                `**Observed:** \`${JSON.stringify(anomaly.observed)}\``,
                ``,
                `**Expected:** ${anomaly.expected === undefined ? `as the requirements above say` : `\`${JSON.stringify(anomaly.expected)}\``}`,
            ]),
            ``,
            `Filed by the AI judge (${model}, ADR 0020) from ${run}, test "${seen[0].verdict.test}". A model's reading: confirm it in the evidence.json, the receipt.png beside it and the report before working on it.`,
        ].join(`\n`);
        label();
        const url = gh(
            `issue`,
            `create`,
            `--label`,
            `bug`,
            `--label`,
            `AI`,
            `--title`,
            `${item}: the order receipt is not as the requirements expect`,
            `--body`,
            body,
        ).trim();
        lines.push(`- ${item} (${users}): filed ${url}`);
    } catch (error) {
        lines.push(`- ${item} (${users}): not filed, ${error.message.split(`\n`)[0]}`);
    }
}

const report = `### AI judge · filed issues\n\n${lines.join(`\n`) || `No new anomaly to file.`}\n`;
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
console.log(report);
