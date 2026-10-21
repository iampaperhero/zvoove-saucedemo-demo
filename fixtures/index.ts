import { mergeTests } from '@playwright/test';
import { test as lastNameWorkaroundTest } from './last-name-workaround.fixture';
import { test as receiptEvidenceTest } from './receipt-evidence.fixture';
import { test as seedTest } from './seed.fixture';
import { test as userTest } from './user.fixture';
import { test as webkitTest } from './webkit.fixture';

// The specs' one entry point: a fixture per file, composed here.
export const test = mergeTests(
    seedTest,
    webkitTest,
    userTest,
    lastNameWorkaroundTest,
    receiptEvidenceTest,
);
