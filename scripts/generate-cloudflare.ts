import fs from 'node:fs';
import { loadCatalog } from '../src/lib/catalog.ts';
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/_headers', `/r2/files/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n/*\n  Cache-Control: public, max-age=300, must-revalidate\n  X-Content-Type-Options: nosniff\n`);
fs.writeFileSync('dist/_redirects', `${loadCatalog().redirects.map((r) => `${r.from} ${r.to} ${r.status}`).join('\n')}\n`);
console.log('Cloudflare Pages headers and static redirects generated');
