import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoUrl = 'https://github.com/EveryInc/proof-sdk.git';
const repoDir = path.resolve(process.cwd(), '.cache/proof-sdk');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

mkdirSync(path.dirname(repoDir), { recursive: true });

if (!existsSync(repoDir)) {
  run('git', ['clone', '--depth', '1', repoUrl, repoDir]);
}

run('npm', ['install'], { cwd: repoDir });
run('npm', ['run', 'build'], { cwd: repoDir });

console.log(`\nProof SDK is ready at ${repoDir}`);
console.log('Next step: npm run proof:run');
