import type { TestCase } from '@playwright/test/reporter';

// From the environment: .env locally, repository variables and a secret on CI (.env.example).
const required = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set: copy .env.example to .env`);
    return value;
};

/** The reference user, `standard_user` on saucedemo.com (ADR 0016). */
export const STANDARD_USER = required(`SAUCE_STANDARD_USER`);
/** The assignment's user, broken on purpose: `problem_user` (ADR 0016). */
export const PROBLEM_USER = required(`SAUCE_PROBLEM_USER`);
/** The one password of both users. */
export const PASSWORD = required(`SAUCE_PASSWORD`);

/** The users the suite runs as, the reference first. */
export const USERNAMES = [STANDARD_USER, PROBLEM_USER];

export type Username = string;

const isUsername = (name: string): boolean => USERNAMES.includes(name);

/** SAUCE_USERS, comma-separated, or both; an unknown name fails the run at once. */
export function usersToRun(value = USERNAMES.join(`,`)): Username[] {
    return value
        .split(`,`)
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => {
            if (!isUsername(name))
                throw new Error(
                    `SAUCE_USERS: unknown user "${name}", expected ${USERNAMES.join(` or `)}`,
                );
            return name;
        });
}

/** The user a test runs as, for the reporters: the describe named after it (ADR 0016), else the reference. */
export const userOf = (test: TestCase): Username =>
    test.parent.titlePath().find(isUsername) ?? STANDARD_USER;
