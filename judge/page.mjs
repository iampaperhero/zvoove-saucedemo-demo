// Renders the AI judge's verdicts (golden set and run) as the report site's judge page, with
// the raw verdict.json files beside it, and prints a one-line status for the index page
// (ADR 0020). No verdict at all prints "not run" and writes nothing.
//
// node judge/page.mjs <judge-results dir> <site/judge dir>
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const [from = `judge-results`, to = `site/judge`] = process.argv.slice(2);
const read = (file) =>
    existsSync(join(from, file)) ? JSON.parse(readFileSync(join(from, file), `utf8`)) : null;
const run = read(`verdict.json`);
const golden = read(`golden-verdict.json`);

const html = (value) =>
    String(value ?? ``).replace(
        /[&<>"]/g,
        (c) => ({ '&': `&amp;`, '<': `&lt;`, '>': `&gt;`, '"': `&quot;` })[c],
    );
const json = (value) => (value === undefined ? `` : `<code>${html(JSON.stringify(value))}</code>`);
// A requirement's text cut at a word near 280 characters; the whole text in the tooltip.
const short = (text) =>
    text.length <= 280 ? text : `${text.slice(0, 280).replace(/\s+\S*$/, ``)} …`;
/** The Expected cell: a computed item's value with its R-ids, a judged item's requirements quoted. */
const expectedCell = ({ expected, requirements }) =>
    expected === undefined
        ? requirements
              .map(
                  ({ id, text }) =>
                      `<span title="${html(text)}"><strong>${html(id)}</strong>: ${html(short(text))}</span>`,
              )
              .join(`<br>`)
        : `${json(expected)} (${requirements.map(({ id }) => html(id)).join(`, `)})`;
const label = (anomaly) =>
    anomaly.issues.length
        ? anomaly.issues.map((id) => `#${id}`).join(`, `)
        : `<strong>NEW</strong>`;

/** One line for the index page: golden set, NEW count, or why there is no verdict. */
function status() {
    if (!run && !golden) return `not run`;
    if (golden?.infraError || run?.infraError)
        return `infrastructure error: ${(golden?.infraError ?? run?.infraError).slice(0, 160)}`;
    const fresh = (run?.verdicts ?? []).flatMap((v) =>
        (v.anomalies ?? []).filter((a) => !a.issues.length),
    ).length;
    const missed = (run?.verdicts ?? []).flatMap((v) => v.misses ?? []).length;
    const unjudged = (run?.verdicts ?? []).filter((v) => v.missing).length;
    const sets = [`tuning`, `held-out`]
        .map((set) => {
            const cases = (golden?.goldenCases ?? []).filter((c) => c.set === set);
            return cases.length
                ? ` ${set} ${cases.filter((c) => c.passed).length}/${cases.length}`
                : ``;
        })
        .join(``);
    const goldenPart = `golden set ${golden?.result ?? `not run`}${sets ? ` (${sets.trim()})` : ``}`;
    return run
        ? `${goldenPart}, ${fresh} new, ${missed} missed${unjudged ? `, ${unjudged} without a receipt` : ``}`
        : `${goldenPart}, the run's evidence was not judged`;
}

function section(title, verdict) {
    if (!verdict) return `<h2>${html(title)}</h2><p>Not run.</p>`;
    const parts = [
        `<h2>${html(title)}</h2>`,
        `<p>Result: <strong>${html(verdict.result)}</strong>. Model ${html(verdict.model)}, threshold ${html(verdict.threshold)}.</p>`,
    ];
    if (verdict.infraError)
        parts.push(
            `<p class="bad">Infrastructure error, not a finding about the app: ${html(verdict.infraError)}</p>`,
        );
    for (const failure of verdict.goldenFailures ?? [])
        parts.push(`<p class="bad">${html(failure)}</p>`);
    for (const v of verdict.verdicts ?? []) {
        parts.push(`<h3>${html(v.user)} · ${html(v.browsers.join(`, `))}</h3>`);
        if (v.missing) {
            parts.push(`<p class="bad">Not judged: ${html(v.missing)}.</p>`);
            continue;
        }
        if (v.error) {
            parts.push(`<p class="bad">Not judged: ${html(v.error)}</p>`);
            continue;
        }
        parts.push(
            `<p>Answered by ${html(v.answeredBy)} from ${html(v.image)} and the evidence; evidence ${html(v.evidenceHash)}, request ${html(v.requestHash)}; ${html(v.usage?.input_tokens)} input tokens.</p>`,
            `<table><tr><th>Item</th><th>Probability</th><th>Flagged</th><th>Observed</th><th>Expected</th><th>Known issue</th></tr>`,
            ...v.items.map((sent) => {
                const { item, observed } = sent;
                const anomaly = v.anomalies.find((a) => a.item === item);
                return `<tr><td>${html(item)}</td><td>${v.probabilities[item] === undefined ? `code` : html(v.probabilities[item].toFixed(2))}</td><td>${anomaly ? `yes, ${html(anomaly.severity)}` : `no`}</td><td>${json(observed)}</td><td>${expectedCell(sent)}</td><td>${anomaly ? label(anomaly) : ``}</td></tr>`;
            }),
            `</table>`,
        );
        for (const miss of v.misses ?? [])
            parts.push(
                `<p class="bad">Missed #${html(miss.issue)}: ${miss.items.map(({ item, why }) => `${html(item)} ${html(why)}`).join(`; `)}.</p>`,
            );
    }
    return parts.join(`\n`);
}

/** The golden set, collapsed: its line, and only its failed or thin-margin cases. */
function goldenSection() {
    if (!golden) return `<h2>Golden set</h2><p>Not run.</p>`;
    const sets = [`tuning`, `held-out`]
        .map((set) => {
            const cases = (golden.goldenCases ?? []).filter((c) => c.set === set);
            return `${set} ${cases.filter((c) => c.passed).length}/${cases.length}`;
        })
        .join(`, `);
    const problems = (golden.goldenCases ?? []).filter((c) => !c.passed || c.thin?.length);
    const rows = problems.map(
        (c) =>
            `<li${c.passed ? `` : ` class="bad"`}>${html(c.name)} (${html(c.set)}): ${c.passed ? `passed, thin margin on ${html(c.thin.join(`, `))}` : `expected ${html(c.expect.join(`, `) || `nothing`)}, got ${html(c.got)}`}; ${Object.entries(
                c.probabilities,
            )
                .map(([item, p]) => `${html(item)} ${p.toFixed(2)}`)
                .join(`, `)}</li>`,
    );
    return `<h2>Golden set</h2>
<details><summary>Golden set ${html(golden.result)}: ${html(sets)}${golden.infraError ? `; infrastructure error: ${html(golden.infraError)}` : ``}. ${problems.length ? `${problems.length} case(s) to look at.` : `No case to look at.`}</summary>
${rows.length ? `<ul>${rows.join(`\n`)}</ul>` : ``}
<p>Every case in detail: <a href="golden-verdict.json">golden-verdict.json</a>.</p>
</details>`;
}

if (run || golden) {
    mkdirSync(to, { recursive: true });
    if (run) copyFileSync(join(from, `verdict.json`), join(to, `verdict.json`));
    if (golden) copyFileSync(join(from, `golden-verdict.json`), join(to, `golden-verdict.json`));
    writeFileSync(
        join(to, `index.html`),
        `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI judge</title>
<style>
body { font: 16px system-ui, sans-serif; margin: 2rem 1rem; }
table { border-collapse: collapse; font-size: 14px; }
th, td { border: 1px solid #ccc; padding: .3rem .5rem; text-align: left; vertical-align: top; }
code { word-break: break-all; }
.bad { color: #b00020; }
</style>
<h1>AI judge</h1>
<p><a href="../">All reports</a>. ${html(status())}. Advisory: changes neither the run's result nor the probe gate. Why and how: ADR 0020. Raw: ${run ? `<a href="verdict.json">verdict.json</a>` : ``} ${golden ? `<a href="golden-verdict.json">golden-verdict.json</a>` : ``}</p>
${section(`The run's evidence`, run)}
${goldenSection()}
`,
    );
}
// Escaped: the index page puts it into its HTML as it is.
console.log(html(status()));
