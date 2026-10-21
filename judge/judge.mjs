// The AI judge (ADR 0020), of the order receipt only. For each distinct evidence.json and the
// receipt's page 1 kept beside it as receipt.png, code decides the computed items: a difference
// from the expected value, after formatting tolerance, is the anomaly, and Jev only rates its
// severity. TypeSafe's Jev, through OpenRouter's Decisions API, told nothing of the user, the
// known issues or the test's own failures, decides the judged items from the image, the text
// and whose order it was: an order identifier, the layout, the seller and what was bought. Code
// flags them at the threshold or above and matches every anomaly to a known issue by the issue's
// signature; anything else is new.
//
// node judge/judge.mjs <results dir>   judge a run
// node judge/judge.mjs --golden        judge the golden set (judge/golden) and compare
// Exit codes: 0 as known; 1 a new anomaly (golden: a case came out wrong); 2 no key, the
// evidence, its image, Jev, OpenRouter or the judge itself failed; 3 a known issue was missed;
// 4 a test ended before its receipt, so there was less to judge.

// Any crash of the judge itself is an infrastructure error, never a finding: exit 2, not node's 1.
for (const event of [`uncaughtException`, `unhandledRejection`])
    process.on(event, (error) => {
        console.error(`[judge] infrastructure error: ${error?.stack ?? error}`);
        process.exit(2);
    });

// Loaded after the handlers, so a module that fails to load is an infrastructure error too.
let modules;
try {
    modules = await Promise.all([
        import(`crypto`),
        import(`fs`),
        import(`path`),
        import(`./signatures.mjs`),
        import(`./checklist.mjs`),
    ]);
} catch (error) {
    console.error(
        `[judge] infrastructure error: cannot load the judge's modules: ${error?.message ?? error}`,
    );
    process.exit(2);
}
const [
    { createHash },
    { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync },
    { dirname, join },
    { SIGNATURES },
    { ITEMS, itemsToJudge, missingKeys, orderOf, requirementText },
] = modules;

// A version, never the alias ~typesafe/jev-latest: a new release must not change verdicts unseen.
const MODEL = process.env.JUDGE_MODEL || `typesafe/jev-1.14`;
// The Decisions API, the one that takes images; an early feature whose format may change.
const API = `${process.env.OPENROUTER_URL || `https://openrouter.ai`}/api/alpha/decisions`;
const KEY = process.env.OPENROUTER_API_KEY;
// Jev answers a probability of yes per item; an item at or above it is an anomaly (ADR 0020).
const THRESHOLD = Number(process.env.JUDGE_THRESHOLD) || 0.5;
const OUT = process.env.JUDGE_OUT || `judge-results`;
const GOLDEN_DIR = process.env.JUDGE_GOLDEN_DIR || `judge/golden`;
const SEVERITIES = [`minor`, `major`, `critical`];
const golden = process.argv.includes(`--golden`);
// A golden probability nearer the threshold than this is a thin margin, reported (ADR 0020).
const MARGIN = 0.2;
const resultsDir = process.argv.slice(2).find((arg) => !arg.startsWith(`--`)) ?? `test-results`;

const sha = (text) => createHash(`sha256`).update(text).digest(`hex`).slice(0, 16);
const seconds = (since) => (Date.now() - since) / 1000;
const log = (line) => console.log(`[judge] ${line}`);
const reason = (error) => error.message || error.code || String(error);

const itemOf = (key) => ITEMS.find((item) => item.key === key);
// For the report only, never the request: each item's requirements with their text.
const quoted = (key) =>
    itemOf(key).requirements.map((id) => ({ id, text: requirementText.get(id) }));
// A requirement's text cut at a word near 280 characters, for a table cell.
const short = (text) =>
    text.length <= 280 ? text : `${text.slice(0, 280).replace(/\s+\S*$/, ``)} …`;
/** The Expected cell: a computed item's value with its R-ids, a judged item's requirements quoted. */
const expectedText = ({ expected, requirements }) =>
    expected === undefined
        ? requirements.map(({ id, text }) => `${id}: ${short(text)}`).join(`; `)
        : `${JSON.stringify(expected)} (${requirements.map(({ id }) => id).join(`, `)})`;

const PREAMBLE = [
    `What an automated test observed of the order receipt PDF of the Swag Labs web shop, item by item, with page 1 of the receipt rendered as the image attached last.`,
    `An item with "expected" is computed: "expected" is what the requirements make of what the test read. An item without "expected" is judged against its requirement's text, from the image and the receipt's text together. Formatting never counts: 3.2 and 3.20 are the same number.`,
].join(`\n`);

// Jev's image limits (ADR 0020): each side, the whole image and the request; the receipt is a PNG.
const SIDE = [256, 1568];
const PIXELS = [78_400, 2_458_624];
const MAX_BODY = 32 * 1024 * 1024;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Reads a receipt image, a PNG within Jev's limits, as its size and a data URL; throws otherwise. */
function readImage(path) {
    const bytes = readFileSync(path);
    if (!bytes.subarray(0, 8).equals(PNG)) throw new Error(`${path} is not a PNG`);
    const [width, height] = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
    const within = (value, [min, max]) => value >= min && value <= max;
    if (!within(width, SIDE) || !within(height, SIDE) || !within(width * height, PIXELS))
        throw new Error(
            `${path} is ${width}×${height} px; Jev takes ${SIDE.join(` to `)} px a side and ${PIXELS.join(` to `)} px in all`,
        );
    return { width, height, url: `data:image/png;base64,${bytes.toString(`base64`)}` };
}

/** The request for one evidence: its text and its image as `state`, a Noul and a Score question per item. */
function jevRequest(evidence, items) {
    const requirements = [...new Set(items.flatMap(({ item }) => itemOf(item).requirements))];
    const text = [
        PREAMBLE,
        `Requirements (docs/requirements.md):\n${requirements.map((id) => `- ${id}: ${requirementText.get(id)}`).join(`\n`)}`,
        `The order the receipt is for, as the test placed it: ${JSON.stringify(orderOf(evidence))}`,
        `Observed:\n${items
            .map(
                ({ item, ...values }) =>
                    `- ${item}, ${itemOf(item).about} (${itemOf(item).requirements.join(`, `)}): ${JSON.stringify(values)}`,
            )
            .join(`\n`)}`,
    ].join(`\n\n`);
    const state = [text, { type: `image_url`, image_url: { url: evidence.image.url } }];
    const criteria = {
        true: `The observed value breaks what the requirement asks.`,
        false: `The observed value meets what the requirement asks.`,
    };
    const questions = Object.fromEntries(
        items.flatMap(({ item, expected }) => [
            // A computed item is decided by code: Jev only rates its severity (ADR 0020).
            ...(expected !== undefined
                ? []
                : [
                      [
                          item,
                          {
                              type: `noul`,
                              instructions: `Does the observed value of ${item} break its requirement (${itemOf(item).requirements.join(`, `)})?`,
                              criteria,
                          },
                      ],
                  ]),
            [
                `${item}_severity`,
                {
                    type: `score`,
                    instructions: `If the observed value of ${item} broke its requirement, how bad would that be for the shop's customer?`,
                    criteria: [
                        `Minor: cosmetic, the order and the money stay right.`,
                        `Major: a customer would notice and be confused.`,
                        `Critical: the order or the money is wrong, or the order cannot be placed.`,
                    ],
                },
            ],
        ]),
    );
    // Explicit and small: OpenRouter reserves credit for max_tokens, 16384 when unset, and
    // refuses a request the balance cannot cover (402). Jev answered about 20 tokens a question.
    return { model: MODEL, state, questions, max_tokens: 64 * Object.keys(questions).length };
}

// URLs are cut from what is shown: an OpenRouter link can carry the key's id.
const scrub = (text) => text.replace(/https?:\/\/[^\s"')]+/g, `<url>`);

/**
 * Jev's answers by question name, from an answer of the Decisions API: `answers` as System One
 * gave them, or `decisions`, an object or a list of named answers; a Noul's probability as
 * `noul` or `probability`. The format is an early feature's and may change (ADR 0020).
 */
function answersOf(data) {
    const raw = data.answers ?? data.decisions;
    const named = Array.isArray(raw)
        ? Object.fromEntries(raw.map((answer) => [answer.name ?? answer.question, answer]))
        : (raw ?? {});
    return Object.fromEntries(
        Object.entries(named).map(([name, answer]) => [
            name,
            { ...answer, noul: answer.noul ?? answer.probability },
        ]),
    );
}

/** Posts one request to OpenRouter's Decisions API; returns its answers or throws with what went wrong. */
async function ask(body) {
    const payload = JSON.stringify(body);
    if (payload.length > MAX_BODY)
        throw new Error(`the request is ${payload.length} bytes, over Jev's 32 MiB`);
    const response = await fetch(API, {
        method: `POST`,
        headers: { authorization: `Bearer ${KEY}`, 'content-type': `application/json` },
        body: payload,
        signal: AbortSignal.timeout(120_000),
    });
    const text = await response.text();
    if (!response.ok) {
        const { error } = JSON.parse(text.startsWith(`{`) ? text : `{}`);
        const hint = error?.metadata?.remedy_hint ?? error?.remedy_hint;
        const meaning =
            {
                401: `the key is wrong or revoked`,
                402: `the OpenRouter balance cannot cover the request`,
                413: `the image or the request is over Jev's limits`,
                429: `rate limited`,
            }[response.status] ??
            (response.status >= 500 ? `OpenRouter or TypeSafe failed` : `the request was refused`);
        throw new Error(
            scrub(
                `OpenRouter answered ${response.status}, ${meaning}: ${error?.message ?? text.slice(0, 200)}${hint ? ` (${hint})` : ``}`,
            ),
        );
    }
    const data = JSON.parse(text);
    const answers = answersOf(data);
    for (const [name, { type }] of Object.entries(body.questions))
        if (typeof answers[name]?.[type] !== `number`)
            throw new Error(
                scrub(`Jev's answer lacks the question ${name}: ${text.slice(0, 300)}`),
            );
    return { ...data, answers };
}

/** An evidence.json with its receipt image, as `image`: in a run receipt.png beside it; none without a receipt. */
function readEvidence(dir, file, image = join(dirname(file), `receipt.png`)) {
    const evidence = { file, ...JSON.parse(readFileSync(join(dir, file), `utf8`)) };
    return evidence.receipt
        ? { ...evidence, image: { file: image, ...readImage(join(dir, image)) } }
        : evidence;
}

/** The user's open issues the receipt shows, as the evidence lists them, with their signatures. */
const knownIssues = (evidence) =>
    evidence.issues
        .filter((issue) => SIGNATURES[issue])
        .map((issue) => ({ issue, ...SIGNATURES[issue] }));

// A test that ended before the confirmation offered the PDF left no receipt: said, not an error.
const NO_RECEIPT = `no receipt: the test ended before the confirmation offered "Generate PDF order"`;

/** Judges one distinct evidence: asks Jev, flags by probability, matches signatures. */
async function judge(evidence) {
    const items = itemsToJudge(evidence);
    const request = jevRequest(evidence, items);
    const verdict = {
        user: evidence.user,
        test: evidence.test,
        image: evidence.image.file,
        evidenceHash: sha(JSON.stringify(request.state)),
        requestHash: sha(JSON.stringify(request)),
        items: items.map((sent) => ({ ...sent, requirements: quoted(sent.item) })),
    };
    const started = Date.now();
    const data = await ask(request);
    verdict.timing = { seconds: seconds(started) };
    verdict.answeredBy = data.model;
    verdict.usage = data.usage;
    // Jev's probabilities, for the judged items; a computed item sent is an anomaly by code.
    const judged = ({ expected }) => expected === undefined;
    verdict.probabilities = Object.fromEntries(
        items.filter(judged).map(({ item }) => [item, data.answers[item].noul]),
    );
    const issues = knownIssues(evidence);
    verdict.anomalies = items
        .filter((sent) => !judged(sent) || verdict.probabilities[sent.item] >= THRESHOLD)
        .map(({ item, observed, expected }) => {
            const anomaly = { item, observed, expected };
            const level = Math.round(data.answers[`${item}_severity`].score);
            return {
                item,
                // Null for a computed item: code decided it.
                probability: verdict.probabilities[item] ?? null,
                // Informational: no golden case checks it.
                severity: SEVERITIES[Math.min(Math.max(level, 0), SEVERITIES.length - 1)],
                observed,
                expected,
                requirements: quoted(item),
                issues: issues
                    .filter(
                        ({ items: broken, matches }) => broken.includes(item) && matches(anomaly),
                    )
                    .map(({ issue }) => issue),
            };
        });
    // A golden case seeds one defect, not the user's issues: nothing to miss there.
    verdict.misses = golden
        ? []
        : issues
              .filter(({ issue }) => !verdict.anomalies.some((a) => a.issues.includes(issue)))
              .map(({ issue, items: broken }) => ({
                  issue,
                  items: broken.map((item) =>
                      !items.some((sent) => sent.item === item)
                          ? {
                                item,
                                why: `not reported: equals the expected value, or Jev was not asked`,
                            }
                          : verdict.probabilities[item] < THRESHOLD
                            ? {
                                  item,
                                  why: `sent, under the threshold (${verdict.probabilities[item].toFixed(2)})`,
                              }
                            : { item, why: `flagged, but not as this issue shows (NEW)` },
                  ),
              }));
    verdict.unflagged = items
        .map(({ item }) => item)
        .filter((key) => !verdict.anomalies.some((a) => a.item === key));
    return verdict;
}

const cell = (value) =>
    (typeof value === `string` ? value : JSON.stringify(value ?? ``))
        .replace(/\|/g, `/`)
        .replace(/\n/g, ` `);
const cost = (usage) =>
    usage?.cost ?? ((usage?.input_tokens ?? usage?.prompt_tokens ?? 0) * 0.042) / 1e6;
// A judged anomaly's probability, or "code" where code decided.
const chance = (a) => (a.probability === null ? `code` : a.probability.toFixed(2));
const gotOf = (verdict) => verdict.anomalies.map((a) => `${a.item} ${label(a)}`).sort();
const label = (anomaly) =>
    anomaly.issues.length ? anomaly.issues.map((id) => `#${id}`).join(`, `) : `NEW`;

function markdown(verdicts, outcome, total) {
    const lines = [
        `### AI judge${golden ? `, golden set` : ``} · ${MODEL}`,
        ``,
        `**Advisory**: this verdict changes neither the run's result nor the probe gate (ADR 0020).`,
        ``,
        outcome,
        ``,
    ];
    // The golden set's summary is its one line and its problem cases; the rest is in its JSON.
    for (const v of golden ? [] : verdicts) {
        const state = v.missing
            ? `no receipt`
            : v.error
              ? `not judged`
              : v.anomalies.length
                ? `suspicious`
                : `as expected`;
        lines.push(`#### ${v.user} · ${v.browsers.join(`, `)}: ${state}`, ``);
        if (v.missing) {
            lines.push(`Not judged: ${cell(v.missing)}.`, ``);
            continue;
        }
        if (v.error) {
            lines.push(`> [!CAUTION]\n> Not judged: ${cell(v.error)}`, ``);
            continue;
        }
        if (v.anomalies.length) {
            lines.push(
                `| Item | Probability | Observed | Expected | Severity | Known issue |`,
                `| --- | --- | --- | --- | --- | --- |`,
            );
            for (const a of v.anomalies) {
                const issue = a.issues.length ? label(a) : `**NEW**`;
                lines.push(
                    `| ${a.item} | ${chance(a)} | ${cell(a.observed)} | ${cell(expectedText(a))} | ${a.severity} | ${issue} |`,
                );
            }
            lines.push(``);
        } else lines.push(`No anomaly.`, ``);
        for (const miss of v.misses)
            lines.push(
                `- **Missed #${miss.issue}**: ${miss.items.map(({ item, why }) => `${item} ${why}`).join(`; `)}.`,
            );
        if (v.misses.length) lines.push(``);
    }
    const spent = verdicts.reduce((sum, v) => sum + cost(v.usage), 0);
    const calls = verdicts.filter((v) => v.timing);
    lines.push(
        `${calls.length} call(s): ${calls.map((v) => `${v.timing.seconds.toFixed(1)} s`).join(`, `) || `none`}; ${total.toFixed(1)} s in total; about $${spent.toFixed(5)}.`,
    );
    return `${lines.join(`\n`)}\n`;
}

const started = Date.now();
let infraError = KEY
    ? null
    : `no OPENROUTER_API_KEY: set it in the environment or .env, or as the repository secret on CI`;

// What to judge: golden cases, or every evidence of the run, each against its own user's issues.
let toJudge = [];
try {
    if (golden) {
        const cases = JSON.parse(readFileSync(join(GOLDEN_DIR, `cases.json`), `utf8`));
        toJudge = cases.map(({ file, image, set, spent, expect }) => ({
            name: file,
            set,
            spent,
            expect,
            evidence: readEvidence(GOLDEN_DIR, file, image),
        }));
    } else {
        toJudge = readdirSync(resultsDir, { recursive: true })
            .map(String)
            .filter((file) => file.endsWith(`evidence.json`))
            .map((file) => {
                const evidence = readEvidence(resultsDir, file);
                return { name: evidence.browser, evidence };
            });
        if (!toJudge.length) throw new Error(`no evidence.json in ${resultsDir}`);
    }
    for (const { evidence } of toJudge.filter(({ evidence }) => evidence.receipt)) {
        const missing = missingKeys(evidence);
        if (missing.length)
            throw new Error(
                `${evidence.file} lacks what the checklist reads: ${missing.join(`; `)}`,
            );
    }
} catch (error) {
    infraError ??= `cannot judge ${golden ? GOLDEN_DIR : resultsDir}: ${reason(error)}`;
}

// One call per distinct user and request: browsers alike share a verdict.
const verdicts = [];
for (const { name, evidence } of infraError ? [] : toJudge) {
    if (!evidence.receipt) {
        verdicts.push({
            user: evidence.user,
            test: evidence.test,
            browsers: [name],
            missing: NO_RECEIPT,
        });
        continue;
    }
    const key = sha(
        evidence.user +
            evidence.test +
            JSON.stringify(jevRequest(evidence, itemsToJudge(evidence))),
    );
    const alike = golden ? undefined : verdicts.find((v) => v.key === key);
    if (alike) {
        alike.browsers.push(name);
        continue;
    }
    const verdict = { key, browsers: [name] };
    try {
        Object.assign(verdict, await judge(evidence));
    } catch (error) {
        verdict.user = evidence.user;
        verdict.error = reason(error);
        infraError ??= `${evidence.user} · ${name}: ${verdict.error}`;
        log(`${evidence.user} · ${name}: Jev or OpenRouter error: ${verdict.error}`);
    }
    verdicts.push(verdict);
}

// Golden: each case's flagged items, with their issue or NEW, must be exactly the expected
// ones. Tuning and held-out cases are reported apart (ADR 0020).
const goldenCases = golden
    ? toJudge.map(({ name, set, spent, expect }) => {
          const verdict = verdicts.find((v) => v.browsers[0] === name);
          const got = verdict?.anomalies ? gotOf(verdict) : [];
          const probabilities = verdict?.probabilities ?? {};
          return {
              name,
              set,
              spent,
              expect,
              passed:
                  !!verdict?.anomalies &&
                  JSON.stringify(got) === JSON.stringify([...expect].sort()),
              got: got.join(`, `) || `nothing`,
              probabilities,
              thin: Object.keys(probabilities).filter(
                  (item) => Math.abs(probabilities[item] - THRESHOLD) < MARGIN,
              ),
          };
      })
    : [];
const goldenFailures = goldenCases
    .filter(({ passed }) => !passed)
    .map(
        ({ name, set, expect, got }) =>
            `${name} (${set}): expected ${expect.join(`, `) || `nothing`}, got ${got}`,
    );
const fresh = verdicts.flatMap((v) => (v.anomalies ?? []).filter(({ issues }) => !issues.length));
const missed = verdicts.flatMap((v) => v.misses ?? []);
const unjudged = verdicts.filter((v) => v.missing);
let outcome;
let result;
if (infraError) {
    result = `error`;
    outcome = `> [!CAUTION]\n> **Key, evidence, Jev or OpenRouter error**, not a finding about the app: ${cell(infraError)}`;
} else if (golden) {
    result = goldenFailures.length ? `failed` : `passed`;
    const sets = [`tuning`, `held-out`]
        .map((set) => {
            const ofSet = goldenCases.filter((c) => c.set === set);
            return `${set} ${ofSet.filter((c) => c.passed).length}/${ofSet.length}`;
        })
        .join(`, `);
    const thin = goldenCases.flatMap(({ name, thin: items }) =>
        items.map((item) => `${name} ${item}`),
    );
    outcome = `${
        goldenFailures.length
            ? `> [!WARNING]\n> **Golden set failed** (${sets}). Do not trust this run's verdicts: ${goldenFailures.join(`; `)}`
            : `> [!NOTE]\n> Golden set passed (${sets}): every case flagged exactly what it should, with its issue or NEW.`
    }${thin.length ? `\n>\n> Within ${MARGIN} of the threshold: ${thin.join(`, `)}.` : ``}`;
} else if (fresh.length) {
    result = `new`;
    outcome = `> [!WARNING]\n> **${fresh.length} new anomal${fresh.length === 1 ? `y` : `ies`}**: no known issue's signature matches. Read the evidence.json before trusting the judge.`;
} else if (missed.length) {
    result = `missed`;
    outcome = `> [!WARNING]\n> **Known issue${missed.length === 1 ? `` : `s`} missed**: ${missed.map(({ issue }) => `#${issue}`).join(`, `)}. Nothing new.`;
} else if (unjudged.length) {
    result = `incomplete`;
    outcome = `> [!WARNING]\n> **No receipt** for ${unjudged.map((v) => `${v.user} · ${v.browsers.join(`, `)}`).join(`; `)}: the test ended before the confirmation, read its failure. ${unjudged.length < verdicts.length ? `Every receipt judged is as known.` : `No receipt was judged.`}`;
} else {
    result = `known`;
    outcome = `> [!NOTE]\n> Every anomaly matches a known issue's signature, and no known issue was missed.`;
}

const report = markdown(verdicts, outcome, seconds(started));
// The artifact: verdict.json and golden-verdict.json, nothing else.
mkdirSync(OUT, { recursive: true });
writeFileSync(
    join(OUT, golden ? `golden-verdict.json` : `verdict.json`),
    `${JSON.stringify({ model: MODEL, threshold: THRESHOLD, golden, result, goldenCases, goldenFailures, infraError, verdicts }, null, 2)}\n`,
);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
// For the workflow: the filing job runs only on a passed golden set and a run without error.
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `result=${result}\n`);
// One line per set in the log; the whole verdict locally, where there is no job summary.
const spent = verdicts.reduce((sum, v) => sum + cost(v.usage), 0);
log(
    `${golden ? `golden set` : `run`}: ${result}${golden ? ` (${goldenCases.filter((c) => c.passed).length}/${goldenCases.length} cases)` : ``}, ${toJudge.length} evidence(s), about $${spent.toFixed(4)}, ${seconds(started).toFixed(1)} s${infraError ? `: ${infraError}` : ``}`,
);
if (!process.env.GITHUB_ACTIONS) console.log(`\n${report}`);
process.exit({ error: 2, failed: 1, new: 1, missed: 3, incomplete: 4 }[result] ?? 0);
