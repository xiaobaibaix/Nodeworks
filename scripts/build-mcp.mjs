import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const candidates = [];
const direct = join('node_modules', '.bin', 'esbuild');
if (existsSync(direct)) candidates.push(direct);
const store = join('node_modules', '.pnpm');
if (existsSync(store)) {
  for (const dir of readdirSync(store)) {
    if (!dir.startsWith('esbuild@')) continue;
    candidates.push(join(store, dir, 'node_modules', 'esbuild', 'bin', 'esbuild'));
  }
}
const bin = candidates.find((p) => existsSync(p));
if (!bin) {
  console.error('找不到 esbuild 可执行文件；先运行 pnpm install');
  process.exit(1);
}

const result = spawnSync(
  bin,
  [
    'mcp/server.ts',
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--target=node20',
    '--outfile=mcp/server.mjs',
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
