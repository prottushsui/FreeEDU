import fs from 'node:fs';import path from 'node:path';
const limit=512*1024; let ok=true;
function walk(d:string){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name); if(e.isDirectory())walk(p); else if(/\.(html|css|js)$/.test(e.name)){const s=fs.statSync(p).size; if(s>limit){console.error(`${p} exceeds ${limit}`); ok=false}}}}
walk('dist'); if(!fs.existsSync('dist/pagefind/pagefind.js')){console.error('missing Pagefind output');ok=false} if(!ok)process.exit(1); console.log('budget checks passed');
