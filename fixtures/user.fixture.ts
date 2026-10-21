import { test as base } from '@playwright/test';
import { STANDARD_USER, Username } from '../utils/users';

type UserOptions = {
    /** The user a test runs as, set by `test.use` in the spec's describe of that user (ADR 0016). */
    user: Username;
};

export const test = base.extend<UserOptions>({
    user: [STANDARD_USER, { option: true }],
});
