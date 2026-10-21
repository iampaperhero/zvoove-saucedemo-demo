// Checks the judge end to end against a fake OpenRouter Decisions API: the request with its
// image, the plumbing, the threshold, the signatures, the golden comparison and the exit codes.
// Jev's answers to the Decisions API are not documented; the fake answers in System One's
// documented shape (docs.typesafe.ai/api) and, in one check, in the other shape the judge reads.
// The fakes stand in for Jev's judgement; they prove what the golden set rejects, never that
// Jev passes it (ADR 0020).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { SIGNATURES } from './signatures.mjs';
import { ITEMS } from './checklist.mjs';

const GOLDEN = `judge/golden`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Fake judgements, each `(item, values) => yes?`, values as the request's text gives them.
const judgements = {
    // What code alone can do: flag whatever differs from the expected value.
    differs: (item, { observed, expected }) => !same(observed, expected),
    yes: () => true,
    no: () => false,
    // The obvious heuristic, reading the text and never the image: an order keyword with a
    // digit, a seller with an e-mail address. The golden set is built so that it fails.
    reads: (item, { observed }) => {
        if (item === `receiptOrderNumber`)
            return !observed.otherLines.some(
                (line) => /order|ref|id|#/i.test(line) && /\d/.test(line),
            );
        if (item === `receiptDocument`) return !observed.some((line) => line.includes(`@`));
        return false;
    },
};
let judgement = judgements.reads;
// How the fake wraps its answers: System One's `answers`, or a list under `decisions`.
let shape = `answers`;
let paymentRequired = false;
let lastRequest;

const answer = (name, question, values) => {
    // A Score answers severity; a Noul the item it names.
    if (question.type === `score`) return { type: `score`, score: 1.6, confidence: 0.6 };
    const yes = judgement(name, values[name]) ? 0.93 : 0.04;
    return shape === `answers` ? { type: `noul`, noul: yes } : { name, probability: yes };
};

const server = createServer((req, res) => {
    let body = ``;
    req.on(`data`, (chunk) => (body += chunk));
    req.on(`end`, () => {
        res.setHeader(`content-type`, `application/json`);
        if (paymentRequired) {
            res.statusCode = 402;
            res.end(
                JSON.stringify({
                    error: {
                        code: 402,
                        message: `This request requires more credits`,
                        metadata: {
                            remedy_hint: `Add credits at https://openrouter.ai/settings/keys/abc123`,
                        },
                    },
                }),
            );
            return;
        }
        lastRequest = { headers: req.headers, url: req.url, body: JSON.parse(body) };
        const values = Object.fromEntries(
            lastRequest.body.state[0]
                .split(`\n`)
                .map((line) => line.match(/^- (\w+), .*?: (\{.*\})$/))
                .filter(Boolean)
                .map(([, item, json]) => [item, JSON.parse(json)]),
        );
        const answers = Object.entries(lastRequest.body.questions).map(([name, question]) => [
            name,
            answer(name, question, values),
        ]);
        res.end(
            JSON.stringify({
                model: `typesafe/jev-1.14-20261014`,
                ...(shape === `answers`
                    ? { answers: Object.fromEntries(answers) }
                    : shape === `decisions`
                      ? { decisions: answers.map(([name, a]) => ({ name, ...a })) }
                      : { output: answers }),
                usage: { input_tokens: 2400, output_tokens: 20, cost: 0.0001 },
            }),
        );
    });
});
let url;
before(async () => {
    await new Promise((resolve) => server.listen(0, `127.0.0.1`, resolve));
    url = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const out = mkdtempSync(join(tmpdir(), `judge-test-`));
// Asynchronous, so the fake server in this process can answer.
const run = (args, env = {}) =>
    new Promise((resolve) => {
        const proc = spawn(process.execPath, [`judge/judge.mjs`, ...args], {
            env: {
                ...process.env,
                OPENROUTER_URL: url,
                OPENROUTER_API_KEY: `test-key`,
                JUDGE_OUT: out,
                GITHUB_STEP_SUMMARY: ``,
                GITHUB_OUTPUT: ``,
                GITHUB_ACTIONS: ``,
                ...env,
            },
        });
        let output = ``;
        proc.stdout.on(`data`, (d) => (output += d));
        proc.stderr.on(`data`, (d) => (output += d));
        proc.on(`close`, (status) => resolve({ status, output }));
    });
const verdicts = () => JSON.parse(readFileSync(join(out, `verdict.json`), `utf8`)).verdicts;
const found = (verdict) => verdict.anomalies.map(({ item, issues }) => [item, issues]);

/**
 * A results directory as a test run leaves it: per golden case a folder with its evidence.json,
 * changed by `change`, and its image as receipt.png beside it when the evidence has a receipt.
 */
function results(...cases) {
    const dir = mkdtempSync(join(tmpdir(), `judge-results-`));
    for (const [name, change = () => {}, folder = name] of cases) {
        mkdirSync(join(dir, folder));
        const evidence = JSON.parse(readFileSync(join(GOLDEN, `${name}.json`), `utf8`));
        change(evidence);
        writeFileSync(join(dir, folder, `evidence.json`), JSON.stringify(evidence));
        const { image } = JSON.parse(readFileSync(join(GOLDEN, `cases.json`), `utf8`)).find(
            ({ file }) => file === `${name}.json`,
        );
        if (evidence.receipt) copyFileSync(join(GOLDEN, image), join(dir, folder, `receipt.png`));
    }
    return dir;
}

test(`every item a signature names is an item of the checklist`, () => {
    const keys = ITEMS.map(({ key }) => key);
    for (const [issue, { items }] of Object.entries(SIGNATURES))
        for (const item of items)
            assert.ok(keys.includes(item), `#${issue}: ${item} is not in ITEMS`);
});

test(`the golden set fails a judge that only flags what differs`, async () => {
    judgement = judgements.differs;
    const { status, output } = await run([`--golden`]);
    assert.equal(status, 1, output);
    assert.match(output, /clean\.json \(tuning\): expected nothing, got /);
});

test(`the golden set fails a judge that flags everything sent`, async () => {
    judgement = judgements.yes;
    const { status, output } = await run([`--golden`]);
    assert.equal(status, 1, output);
});

test(`the golden set fails a judge that reads the text and not the image`, async () => {
    judgement = judgements.reads;
    const { status, output } = await run([`--golden`]);
    assert.equal(status, 1, output);
    assert.match(output, /text-cut-off\.json \(tuning\): expected receiptLayout NEW, got nothing/);
    assert.match(output, /no-logo\.json \(tuning\): expected receiptLayout NEW, got nothing/);
    assert.match(
        output,
        /confirmation-code\.json \(held-out\): expected nothing, got receiptOrderNumber #13/,
    );
});

// A golden set of the cases the heuristic gets right, for the passing path.
function miniGolden() {
    const dir = mkdtempSync(join(tmpdir(), `judge-golden-`));
    const cases = [
        [`clean`, `tuning`, []],
        [`no-order-number`, `tuning`, [`receiptOrderNumber #13`]],
        [`totals-doubled`, `held-out`, [`receiptTotals #2`]],
    ];
    for (const [name] of cases)
        for (const ext of [`json`, `png`])
            copyFileSync(join(GOLDEN, `${name}.${ext}`), join(dir, `${name}.${ext}`));
    writeFileSync(
        join(dir, `cases.json`),
        JSON.stringify(
            cases.map(([name, set, expect]) => ({
                file: `${name}.json`,
                image: `${name}.png`,
                set,
                expect,
            })),
        ),
    );
    return dir;
}

test(`a golden set that passes reports a probability near the threshold as thin`, async () => {
    judgement = judgements.reads;
    // The fake answers 0.93 or 0.04: at 0.8, a 0.93 is flagged and within 0.2 of the threshold.
    const { status, output } = await run([`--golden`], {
        JUDGE_GOLDEN_DIR: miniGolden(),
        JUDGE_THRESHOLD: `0.8`,
    });
    assert.equal(status, 0, output);
    assert.match(output, /Golden set passed \(tuning 2\/2, held-out 1\/1\)/);
    assert.match(
        output,
        /Within 0\.2 of the threshold: no-order-number\.json receiptOrderNumber\./,
    );
    const golden = JSON.parse(readFileSync(join(out, `golden-verdict.json`), `utf8`));
    assert.equal(golden.result, `passed`);
    assert.deepEqual(
        golden.goldenCases.map(({ name, thin }) => [name, thin]),
        [
            [`clean.json`, []],
            [`no-order-number.json`, [`receiptOrderNumber`]],
            [`totals-doubled.json`, []],
        ],
    );
});

test(`the request: Decisions API, the receipt image in state, blind`, async () => {
    judgement = judgements.reads;
    const failures = [`The receipt should carry an order number (R-DONE-9)`];
    const dir = results([
        `live-problem`,
        (evidence) => {
            evidence.failures = failures;
        },
    ]);
    await run([dir]);
    const { headers, url: path, body } = lastRequest;
    assert.equal(path, `/api/alpha/decisions`);
    assert.equal(headers.authorization, `Bearer test-key`);
    assert.equal(body.model, `typesafe/jev-1.14`);
    assert.equal(body.state.length, 2);
    assert.equal(typeof body.state[0], `string`);
    assert.deepEqual(body.state[1], {
        type: `image_url`,
        image_url: {
            url: `data:image/png;base64,${readFileSync(join(dir, `live-problem`, `receipt.png`)).toString(`base64`)}`,
        },
    });
    assert.match(
        body.state[0],
        /The order the receipt is for, as the test placed it: \{"customer"/,
    );
    const text = JSON.stringify(body);
    for (const leak of [
        `test-key`,
        ...failures,
        `should`,
        `failures`,
        `"issues"`,
        `issues/2`,
        `#2`,
        `problem`,
        `standard_user`,
    ])
        assert.ok(!text.includes(leak), `the request contains "${leak}"`);
    assert.deepEqual(
        Object.keys(body.questions).filter((name) => !name.endsWith(`_severity`)),
        [`receiptOrderNumber`, `receiptLayout`, `receiptDocument`],
        `the judged items are always asked, a computed one never`,
    );
    assert.ok(`receiptTotals_severity` in body.questions, `a computed anomaly gets its severity`);
    assert.equal(body.max_tokens, 64 * Object.keys(body.questions).length);
});

test(`every user's evidence is judged on its own, against its own known issues`, async () => {
    judgement = judgements.reads;
    const { status, output } = await run([results([`live-standard`], [`live-problem`])]);
    assert.equal(status, 0, output);
    const [standard, problem] = [`standard_user`, `problem_user`].map((user) =>
        verdicts().find((v) => v.user === user),
    );
    assert.deepEqual(found(standard), [
        [`receiptOrderNumber`, [13]],
        [`receiptDocument`, [15]],
    ]);
    assert.deepEqual(found(problem), [
        [`receiptTotals`, [2]],
        [`receiptOrderNumber`, [13]],
        [`receiptDocument`, [15]],
    ]);
});

test(`signatures: #2 needs all three totals doubled, #13 no attempted id`, async () => {
    judgement = judgements.reads;
    await run([
        results([
            `live-problem`,
            (evidence) => {
                const { lines } = evidence.receipt;
                lines[lines.indexOf(`Tax $6.40`)] = `Tax $3.20`;
            },
        ]),
    ]);
    assert.deepEqual(found(verdicts()[0])[0], [`receiptTotals`, []]);
    await run([results([`order-number-undefined`])]);
    assert.deepEqual(found(verdicts()[0]), [[`receiptOrderNumber`, []]]);
});

test(`a known issue Jev does not flag is a miss: exit 3`, async () => {
    judgement = judgements.no;
    const { status, output } = await run([results([`live-problem`])]);
    assert.equal(status, 3, output);
    const [verdict] = verdicts();
    assert.deepEqual(found(verdict), [[`receiptTotals`, [2]]]);
    assert.deepEqual(verdict.misses, [
        {
            issue: 13,
            items: [{ item: `receiptOrderNumber`, why: `sent, under the threshold (0.04)` }],
        },
        {
            issue: 15,
            items: [{ item: `receiptDocument`, why: `sent, under the threshold (0.04)` }],
        },
    ]);
});

test(`the receipt dated another day than its download is new, by code`, async () => {
    judgement = judgements.reads;
    await run([results([`date-other-day`])]);
    const [anomaly] = verdicts()[0].anomalies;
    assert.equal(anomaly.item, `receiptDate`);
    assert.equal(anomaly.probability, null);
    assert.deepEqual(anomaly.issues, []);
    assert.match(anomaly.observed, /^\d{4}-\d{2}-\d{2}$/);
});

test(`an answer under decisions, as a list with probabilities, reads the same`, async () => {
    judgement = judgements.reads;
    shape = `decisions`;
    const { status, output } = await run([results([`live-standard`])]);
    shape = `answers`;
    assert.equal(status, 0, output);
    assert.deepEqual(found(verdicts()[0]), [
        [`receiptOrderNumber`, [13]],
        [`receiptDocument`, [15]],
    ]);
});

test(`an answer the judge cannot read: exit 2, with what came back`, async () => {
    shape = `unknown`;
    const { status, output } = await run([results([`clean`])]);
    shape = `answers`;
    assert.equal(status, 2, output);
    assert.match(output, /Jev's answer lacks the question receiptOrderNumber: \{"model"/);
});

test(`the report quotes a judged item's requirement and a computed item's R-ids`, async () => {
    judgement = judgements.reads;
    const { output } = await run([results([`live-problem`])]);
    assert.match(output, /\| receiptDocument \| 0\.93 \| .* \| R-DONE-11: From the order receipt/);
    assert.match(output, /\| receiptTotals \| code \| .* \(R-DONE-9, R-CO2-6/);
    assert.ok(
        !JSON.stringify(lastRequest.body).includes(`"requirements"`),
        `the request carries no report field`,
    );
});

test(`no key: exit 2, said as such`, async () => {
    const { status, output } = await run([`--golden`], { OPENROUTER_API_KEY: `` });
    assert.equal(status, 2);
    assert.match(output, /no OPENROUTER_API_KEY/);
});

test(`evidence without receipt.png beside it: exit 2`, async () => {
    const dir = results([`clean`]);
    const { rmSync } = await import(`node:fs`);
    rmSync(join(dir, `clean`, `receipt.png`));
    const { status, output } = await run([dir]);
    assert.equal(status, 2);
    assert.match(output, /receipt\.png/);
});

test(`an image over Jev's limits: exit 2, before any request`, async () => {
    const dir = results([`clean`]);
    const png = readFileSync(join(dir, `clean`, `receipt.png`));
    png.writeUInt32BE(2000, 16);
    writeFileSync(join(dir, `clean`, `receipt.png`), png);
    lastRequest = undefined;
    const { status, output } = await run([dir]);
    assert.equal(status, 2);
    assert.match(output, /is 2000×1568 px; Jev takes 256 to 1568 px a side/);
    assert.equal(lastRequest, undefined);
});

test(`evidence without the download day: exit 2`, async () => {
    const dir = results([
        `clean`,
        (evidence) => {
            delete evidence.receipt.downloadedOn;
        },
    ]);
    const { status, output } = await run([dir]);
    assert.equal(status, 2);
    assert.match(output, /lacks what the checklist reads: receiptDate: receipt\.downloadedOn/);
});

test(`a 402 of OpenRouter: exit 2 with its message and remedy hint, no URL`, async () => {
    paymentRequired = true;
    const { status, output } = await run([`--golden`]);
    paymentRequired = false;
    assert.equal(status, 2);
    assert.match(
        output,
        /402, the OpenRouter balance cannot cover the request: This request requires more credits \(Add credits at <url>\)/,
    );
    assert.ok(!output.includes(`keys/abc123`));
});

test(`no answer from OpenRouter: exit 2`, async () => {
    const { status, output } = await run([`--golden`], { OPENROUTER_URL: `http://127.0.0.1:9` });
    assert.equal(status, 2);
    assert.match(output, /Jev or OpenRouter error/);
});

test(`a run of one user, problem_user alone, is judged as known`, async () => {
    judgement = judgements.reads;
    const { status, output } = await run([results([`live-problem`])]);
    assert.equal(status, 0, output);
    assert.deepEqual(
        verdicts().map(({ user }) => user),
        [`problem_user`],
    );
});

test(`a test that ended before its receipt: said per user, exit 4, not an error`, async () => {
    judgement = judgements.reads;
    lastRequest = undefined;
    const ended = (evidence) => {
        evidence.receipt = null;
    };
    const alone = await run([results([`live-problem`, ended])]);
    assert.equal(alone.status, 4, alone.output);
    assert.equal(lastRequest, undefined, `nothing to send without a receipt`);
    assert.match(alone.output, /problem_user · chromium: no receipt/);
    assert.match(alone.output, /\*\*No receipt\*\* for problem_user · chromium/);
    const { infraError, result } = JSON.parse(readFileSync(join(out, `verdict.json`), `utf8`));
    assert.equal(infraError, null);
    assert.equal(result, `incomplete`);
    assert.deepEqual(verdicts()[0].misses, undefined, `no receipt, no miss`);

    const mixed = await run([results([`live-standard`], [`live-problem`, ended])]);
    assert.equal(mixed.status, 4, mixed.output);
    assert.deepEqual(found(verdicts().find(({ user }) => user === `standard_user`)), [
        [`receiptOrderNumber`, [13]],
        [`receiptDocument`, [15]],
    ]);
});

/** Runs file-issues on `verdicts` with a fake gh that logs its calls; `open` lists the open issues by item. */
async function fileIssues(verdictsToFile, open = {}) {
    const dir = mkdtempSync(join(tmpdir(), `file-issues-`));
    const gh = join(dir, `gh`);
    writeFileSync(
        gh,
        `#!${process.execPath}
const { appendFileSync } = require('fs');
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(join(dir, `calls`))}, JSON.stringify(args) + '\\n');
const open = ${JSON.stringify(open)};
if (args[0] === 'issue' && args[1] === 'list') {
    const item = args[args.indexOf('--search') + 1].replace(/"/g, '');
    console.log(JSON.stringify((open[item] ?? []).map((number) => ({ number }))));
} else if (args[0] === 'issue' && args[1] === 'create') console.log('https://github.com/x/y/issues/99');
`,
        { mode: 0o755 },
    );
    const file = join(dir, `verdict.json`);
    writeFileSync(file, JSON.stringify({ model: `typesafe/jev-1.14`, verdicts: verdictsToFile }));
    const output = await new Promise((resolve) => {
        const proc = spawn(process.execPath, [`judge/file-issues.mjs`, file], {
            env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_STEP_SUMMARY: `` },
        });
        let text = ``;
        proc.stdout.on(`data`, (d) => (text += d));
        proc.stderr.on(`data`, (d) => (text += d));
        proc.on(`close`, () => resolve(text));
    });
    const calls = readFileSync(join(dir, `calls`), `utf8`).trim().split(`\n`).map(JSON.parse);
    return { output, calls };
}

const anomaly = (item, probability, issues = []) => ({
    item,
    probability,
    severity: `major`,
    observed: `the attached image, 1108×1568 px`,
    expected: undefined,
    requirements: [{ id: `R-DONE-10`, text: `Page 1 reads as a document.` }],
    issues,
});

test(`file-issues: one issue per item for every user, deduplicated by the item alone`, async () => {
    const { output, calls } = await fileIssues(
        [
            {
                user: `standard_user`,
                test: `buys`,
                browsers: [`chromium`, `firefox`],
                anomalies: [anomaly(`receiptLayout`, 0.91), anomaly(`receiptDocument`, 0.9, [15])],
            },
            {
                user: `problem_user`,
                test: `buys`,
                browsers: [`chromium`],
                anomalies: [anomaly(`receiptLayout`, 0.88), anomaly(`receiptOrderNumber`, 0.7)],
            },
            { user: `problem_user`, test: `buys`, browsers: [`webkit`], missing: `no receipt` },
        ],
        { receiptOrderNumber: [13] },
    );
    const searches = calls.filter(([noun, verb]) => noun === `issue` && verb === `list`);
    assert.deepEqual(
        searches.map((args) => args[args.indexOf(`--search`) + 1]),
        [`"receiptLayout"`, `"receiptOrderNumber"`],
        `searched by the item alone, a known anomaly never`,
    );
    const created = calls.filter(([noun, verb]) => noun === `issue` && verb === `create`);
    assert.ok(
        calls.some(([noun]) => noun === `label`),
        `the label AI is made before filing`,
    );
    assert.equal(created.length, 1, output);
    const title = created[0][created[0].indexOf(`--title`) + 1];
    const body = created[0][created[0].indexOf(`--body`) + 1];
    assert.equal(title, `receiptLayout: the order receipt is not as the requirements expect`);
    assert.match(body, /### `standard_user` · chromium, firefox\n\n\*\*Probability:\*\* 0\.91/);
    assert.match(body, /### `problem_user` · chromium\n\n\*\*Probability:\*\* 0\.88/);
    assert.match(output, /receiptLayout \(standard_user, problem_user\): filed/);
    assert.match(output, /receiptOrderNumber \(problem_user\): already open as #13/);
});
