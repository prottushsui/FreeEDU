import fs from 'node:fs';import { loadCatalog } from '../src/lib/catalog.js';
fs.writeFileSync('dist/_headers','/r2/files/*\n  Cache-Control: public, max-age=31536000, immutable\n/*\n  Cache-Control: public, max-age=300, must-revalidate\n/r2/archive/*\n  X-Robots-Tag: noindex\n');
const redirects=loadCatalog().redirects.map(r=>`${r.from} ${r.to} ${r.status}`).join('\n')+'\n'; fs.writeFileSync('dist/_redirects',redirects); console.log('Cloudflare headers/redirects generated');
