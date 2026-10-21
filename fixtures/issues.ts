import { PROBLEM_USER, STANDARD_USER, Username } from '../utils/users';

/** The GitHub issue `id` of this repository. */
export const issueUrl = (id: number) =>
    `https://github.com/iampaperhero/zvoove-saucedemo-demo/issues/${id}`;

/** Each user's open issues with the exact messages they fail (ADR 0018). */
export const KNOWN: Record<Username, Record<number, string[]>> = {
    [STANDARD_USER]: {},
    [PROBLEM_USER]: {
        1: [`Each field should hold what was typed`],
        2: [`The overview should match the cart`],
        3: [`The cart should be empty`],
    },
};

/** Each user's open issues no test fails on, which the AI judge sees on the receipt; their signatures are in judge/signatures.mjs (ADR 0020). */
export const SEEN_ONLY: Record<Username, number[]> = {
    [STANDARD_USER]: [13, 15],
    [PROBLEM_USER]: [13, 15],
};

/** `issue` annotations for the GitHub issues a test runs into; Allure shows them as links. */
export const issues = (...ids: number[]) =>
    ids.map((id) => ({ type: `issue`, description: issueUrl(id) }));
