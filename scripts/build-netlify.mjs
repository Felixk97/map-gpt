import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
await copyFile('dist/server/index.js', 'dist/server/index.mjs');
await mkdir('dist/netlify-public', { recursive: true });
await writeFile('dist/netlify-public/.netlify-placeholder', 'Lapan content is served by the Netlify Function.\n');
console.log('Built Netlify Functions adapter + bundled Lapan app');
