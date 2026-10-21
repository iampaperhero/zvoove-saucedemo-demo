// Formats and lints a file Claude wrote; exit code 2 feeds the errors back to fix in the same turn.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;

const { tool_input: toolInput = {}, tool_response: toolResponse = {} } = JSON.parse(input);
const file = toolResponse.filePath ?? toolInput.file_path ?? '';
if (!/\.(ts|mjs)$/.test(file)) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const bin = (name) => join(root, 'node_modules', '.bin', name);

spawnSync(bin('prettier'), ['--write', '--log-level', 'warn', file], {
    cwd: root,
    stdio: 'inherit',
});

const lint = spawnSync(bin('eslint'), [file], { cwd: root, encoding: 'utf8' });
if (lint.status !== 0) {
    process.stderr.write(lint.stdout + lint.stderr);
    process.exit(2);
}
