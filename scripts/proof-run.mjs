import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const port = process.env.PROOF_PORT || '4100';
const repoDir = path.resolve(process.cwd(), '.cache/proof-sdk');

if (!existsSync(repoDir)) {
  console.error('Proof SDK is not set up yet. Run `npm run proof:setup` first.');
  process.exit(1);
}

const child = spawn('npm', ['run', 'serve'], {
  cwd: repoDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: port,
    PROOF_PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
    PROOF_CORS_ALLOW_ORIGINS: 'http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:3001,http://localhost:3001,null',
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
