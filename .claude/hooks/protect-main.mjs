// Blocks an agent's push to main and `gh pr merge` (ADR 0009); exit code 2 tells Claude why.
import { execSync } from 'node:child_process';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const command = JSON.parse(input).tool_input?.command ?? '';

const block = (reason) => {
    process.stderr.write(
        `${reason} Push a branch and open a PR instead; a human merges (ADR 0009).\n`,
    );
    process.exit(2);
};

const currentBranch = () => {
    try {
        return execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
            encoding: 'utf8',
        }).trim();
    } catch {
        return '';
    }
};

for (const segment of command.split(/&&|\|\||;|\|/)) {
    const words = segment.trim().split(/\s+/);

    if (words[0] === 'gh' && words[1] === 'pr' && words[2] === 'merge') {
        block('Merging a pull request is left to a human.');
    }

    if (words[0] !== 'git') continue;

    // The subcommand, after git's own options: -C <dir> and -c <key=value>
    // take a value. A commit message that mentions a push is not a push.
    let push = 1;
    while (words[push]?.startsWith('-')) push += ['-C', '-c'].includes(words[push]) ? 2 : 1;
    if (words[push] !== 'push') continue;

    const options = words.slice(push + 1).filter((word) => word.startsWith('-'));
    if (options.some((option) => ['--all', '--mirror'].includes(option))) {
        block('Pushing every branch at once would push main too.');
    }

    const [, ...refspecs] = words.slice(push + 1).filter((word) => !word.startsWith('-'));
    const targets = refspecs.length
        ? refspecs.map((refspec) =>
              refspec
                  .split(':')
                  .pop()
                  .replace(/^\+/, '')
                  .replace(/^refs\/heads\//, ''),
          )
        : [currentBranch()];

    if (
        targets.some(
            (target) => target === 'main' || (target === 'HEAD' && currentBranch() === 'main'),
        )
    ) {
        block('Pushing to main is not allowed for agents.');
    }
}
