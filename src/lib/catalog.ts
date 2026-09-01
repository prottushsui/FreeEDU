import fs from 'node:fs';
import path from 'node:path';
export type Status='draft'|'published'|'deleted';
export type AssetStatus='available'|'archived'|'pending';
export type Subject={id:string;slug:string;name:string;description:string};
export type Topic={id:string;slug:string;subjectId:string;title:string;description:string};
export type Asset={id:string;sha256:string;originalFilename:string;sizeBytes:number;mimeType:string;status:AssetStatus;storageKey:string;checksum:string;createdAt:string;updatedAt:string;archivedAt?:string};
export type Material={id:string;slug:string;title:string;description:string;subjectId:string;topicIds:string[];tags:string[];status:Status;assetId:string;fileType:'pdf';createdAt:string;updatedAt:string;deletedAt?:string};
export type Redirect={from:string;to:string;status:301|302|307|308};
const slug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/; const sha=/^[a-f0-9]{64}$/;
function lines(f:string){return fs.existsSync(f)?fs.readFileSync(f,'utf8').split(/\r?\n/).filter(Boolean):[]}
function jsonl<T>(f:string):T[]{return lines(f).map((l,i)=>{try{return JSON.parse(l)}catch(e){throw new Error(`${f}:${i+1} invalid JSON`)}})}
function assert(c:any,m:string):asserts c{if(!c)throw new Error(m)}
export function loadCatalog(root=process.cwd()){return {subjects:JSON.parse(fs.readFileSync(path.join(root,'content/subjects.json'),'utf8')) as Subject[],topics:jsonl<Topic>(path.join(root,'content/topics.jsonl')),materials:jsonl<Material>(path.join(root,'content/materials.jsonl')),assets:jsonl<Asset>(path.join(root,'content/assets.jsonl')),redirects:jsonl<Redirect>(path.join(root,'content/redirects.jsonl'))}}
export function validateCatalog(root=process.cwd(), opts={checkStorage:true, storageRoot:'.storage/r2'}){const c=loadCatalog(root); const errors:string[]=[]; const seen=new Map<string,string>(); const assetIds=new Set<string>(); const checksums=new Set<string>();
 const chkSlug=(kind:string,id:string,s:string)=>{if(!slug.test(s))errors.push(`${kind} ${id} invalid slug ${s}`); const k=`${kind}:${s}`; if(seen.has(k))errors.push(`duplicate ${kind} slug ${s}`); seen.set(k,id)};
 for(const s of c.subjects){if(!s.id||!s.name)errors.push('invalid subject'); chkSlug('subject',s.id,s.slug)}
 const subj=new Set(c.subjects.map(s=>s.id)); const topicIds=new Set<string>(); for(const t of c.topics){chkSlug('topic',t.id,t.slug); if(!subj.has(t.subjectId))errors.push(`topic ${t.id} missing subject`); topicIds.add(t.id)}
 for(const a of c.assets){if(!sha.test(a.id)||a.id!==a.sha256)errors.push(`asset ${a.id} invalid sha id`); if(!['available','archived','pending'].includes(a.status))errors.push(`asset ${a.id} invalid status`); if(a.mimeType!=='application/pdf')errors.push(`asset ${a.id} invalid mime`); if(a.storageKey!==`${a.status==='archived'?'archive':'files'}/${a.sha256}.pdf`)errors.push(`asset ${a.id} invalid storageKey`); if(assetIds.has(a.id))errors.push(`duplicate asset id ${a.id}`); assetIds.add(a.id); if(checksums.has(a.checksum))errors.push(`duplicate asset checksum ${a.checksum}`); checksums.add(a.checksum); if(opts.checkStorage&&a.status==='available'&&!fs.existsSync(path.join(root,opts.storageRoot,a.storageKey)))errors.push(`asset ${a.id} missing from storage`)}
 const matSlugs=new Set<string>(); for(const m of c.materials){chkSlug('material',m.id,m.slug); if(matSlugs.has(m.slug))errors.push(`material slug reserved/collides ${m.slug}`); matSlugs.add(m.slug); if(!['draft','published','deleted'].includes(m.status))errors.push(`material ${m.id} invalid status`); if(!subj.has(m.subjectId))errors.push(`material ${m.id} missing subject`); for(const t of m.topicIds)if(!topicIds.has(t))errors.push(`material ${m.id} missing topic ${t}`); const a=c.assets.find(a=>a.id===m.assetId); if(m.status==='published'){if(!a)errors.push(`published material ${m.id} missing asset`); else if(a.status!=='available')errors.push(`published material ${m.id} references ${a.status} asset`)}}
 const from=new Set<string>(); for(const r of c.redirects){if(!r.from.startsWith('/')||!r.to.startsWith('/')||r.to.startsWith('//')||r.from.includes('..')||r.to.includes('..'))errors.push(`unsafe redirect ${r.from}->${r.to}`); if(from.has(r.from))errors.push(`redirect collision ${r.from}`); from.add(r.from)} for(const r of c.redirects){let cur=r.to,hops=0; while(from.has(cur)){if(++hops>10||cur===r.from){errors.push(`redirect loop at ${r.from}`); break} cur=c.redirects.find(x=>x.from===cur)!.to}}
 if(errors.length)throw new Error(errors.join('\n')); return c}
export const publishedMaterials=(root=process.cwd())=>validateCatalog(root).materials.filter(m=>m.status==='published');
export function assetUrl(a:Asset){return `/r2/${a.storageKey}`}
