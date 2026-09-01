import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sha256 = /^[a-f0-9]{64}$/;
const timestamp = z.string().datetime({ offset: true });
const id = z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9-]*[a-z0-9])?$/);

export const SubjectSchema = z.object({ id, slug: z.string().regex(slug), name: z.string().min(1), description: z.string().min(1) }).strict();
export const TopicSchema = z.object({ id, slug: z.string().regex(slug), subjectId: id, title: z.string().min(1), description: z.string().min(1) }).strict();
export const AssetSchema = z.object({
  id: z.string().regex(sha256), sha256: z.string().regex(sha256), originalFilename: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(), mimeType: z.literal('application/pdf'), status: z.enum(['available', 'archived']),
  storageKey: z.string(), checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/), createdAt: timestamp, updatedAt: timestamp,
  archivedAt: timestamp.optional(), restoredAt: timestamp.optional(),
}).strict();
export const MaterialSchema = z.object({
  id, slug: z.string().regex(slug), title: z.string().min(1), description: z.string().min(1), subjectId: id,
  topicIds: z.array(id).min(1), tags: z.array(z.string().min(1).max(80)), status: z.enum(['draft', 'published', 'deleted']),
  assetId: z.string().regex(sha256), fileType: z.literal('pdf'), createdAt: timestamp, updatedAt: timestamp, deletedAt: timestamp.optional(),
}).strict();
export const RedirectSchema = z.object({ from: z.string(), to: z.string(), status: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]) }).strict();
export type Subject = z.infer<typeof SubjectSchema>; export type Topic = z.infer<typeof TopicSchema>; export type Asset = z.infer<typeof AssetSchema>; export type Material = z.infer<typeof MaterialSchema>; export type Redirect = z.infer<typeof RedirectSchema>;
export type Catalog = { subjects: Subject[]; topics: Topic[]; materials: Material[]; assets: Asset[]; redirects: Redirect[] };
export type ObjectReader = { read(key: string): Buffer | undefined; list(prefix: 'files/' | 'archive/'): string[] };

function parseJsonl<T>(file: string, schema: z.ZodType<T>): T[] {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
    let value: unknown; try { value = JSON.parse(line); } catch { throw new Error(`${file}:${index + 1}: invalid JSON`); }
    const result = schema.safeParse(value); if (!result.success) throw new Error(`${file}:${index + 1}: ${result.error.issues.map((x) => x.message).join('; ')}`); return result.data;
  });
}
export function loadCatalog(root = process.cwd()): Catalog {
  const subjects = z.array(SubjectSchema).safeParse(JSON.parse(fs.readFileSync(path.join(root, 'content/subjects.json'), 'utf8')));
  if (!subjects.success) throw new Error(`content/subjects.json: ${subjects.error.message}`);
  return { subjects: subjects.data, topics: parseJsonl(path.join(root, 'content/topics.jsonl'), TopicSchema), materials: parseJsonl(path.join(root, 'content/materials.jsonl'), MaterialSchema), assets: parseJsonl(path.join(root, 'content/assets.jsonl'), AssetSchema), redirects: parseJsonl(path.join(root, 'content/redirects.jsonl'), RedirectSchema) };
}
export function localObjectReader(root = process.cwd(), storageRoot = '.storage/r2'): ObjectReader {
  const base = path.resolve(root, storageRoot);
  const safe = (key: string) => { if (!/^(files|archive)\/[a-f0-9]{64}\.pdf$/.test(key)) throw new Error(`unsafe storage key ${key}`); return path.join(base, key); };
  return { read: (key) => { const file = safe(key); return fs.existsSync(file) ? fs.readFileSync(file) : undefined; }, list: (prefix) => { const dir = path.join(base, prefix); return fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => /^[a-f0-9]{64}\.pdf$/.test(name)).map((name) => `${prefix}${name}`) : []; } };
}
function unique(values: string[], name: string, errors: string[]) { for (const value of values) if (values.indexOf(value) !== values.lastIndexOf(value)) errors.push(`duplicate ${name}: ${value}`); }
function safeRedirectPath(value: string) { return /^\/(?!\/)(?:[a-z0-9][a-z0-9/-]*)?$/.test(value) && !value.includes('//') && !value.includes('..'); }
export function validateCatalog(root = process.cwd(), reader: ObjectReader | undefined = localObjectReader(root)): Catalog {
  const c = loadCatalog(root); const errors: string[] = [];
  unique(c.subjects.map((x) => x.id), 'subject id', errors); unique(c.subjects.map((x) => x.slug), 'subject slug', errors);
  unique(c.topics.map((x) => x.id), 'topic id', errors); unique(c.topics.map((x) => x.slug), 'topic slug', errors);
  unique(c.materials.map((x) => x.id), 'material id', errors); unique(c.materials.map((x) => x.slug), 'material slug', errors);
  unique(c.assets.map((x) => x.id), 'asset id', errors); unique(c.assets.map((x) => x.checksum), 'asset checksum', errors);
  const subjects = new Set(c.subjects.map((x) => x.id)); const topics = new Set(c.topics.map((x) => x.id)); const assets = new Map(c.assets.map((x) => [x.id, x]));
  for (const topic of c.topics) if (!subjects.has(topic.subjectId)) errors.push(`topic ${topic.id} references missing subject ${topic.subjectId}`);
  for (const asset of c.assets) {
    const prefix = asset.status === 'available' ? 'files' : 'archive'; const expected = `${prefix}/${asset.sha256}.pdf`;
    if (asset.id !== asset.sha256 || asset.checksum !== `sha256:${asset.sha256}` || asset.storageKey !== expected) errors.push(`asset ${asset.id} has invalid identity or storage key`);
    const object = reader?.read(asset.storageKey);
    if (object) { const digest = createHash('sha256').update(object).digest('hex'); if (digest !== asset.sha256 || object.byteLength !== asset.sizeBytes || object.subarray(0, 5).toString() !== '%PDF-') errors.push(`asset ${asset.id} object integrity mismatch`); }
    else if (asset.status === 'available' && reader) errors.push(`available asset ${asset.id} missing from storage`);
  }
  for (const material of c.materials) {
    if (!subjects.has(material.subjectId)) errors.push(`material ${material.id} references missing subject ${material.subjectId}`);
    for (const topic of material.topicIds) if (!topics.has(topic)) errors.push(`material ${material.id} references missing topic ${topic}`);
    if (material.status === 'published') { const asset = assets.get(material.assetId); if (!asset) errors.push(`published material ${material.id} references missing asset`); else if (asset.status !== 'available') errors.push(`published material ${material.id} references unavailable asset`); }
  }
  const redirectMap = new Map<string, string>();
  for (const redirect of c.redirects) { if (!safeRedirectPath(redirect.from) || !safeRedirectPath(redirect.to)) errors.push(`unsafe redirect ${redirect.from} -> ${redirect.to}`); if (redirectMap.has(redirect.from)) errors.push(`duplicate redirect ${redirect.from}`); redirectMap.set(redirect.from, redirect.to); }
  for (const from of redirectMap.keys()) { const seen = new Set<string>(); let current: string | undefined = from; while (current && redirectMap.has(current)) { if (seen.has(current)) { errors.push(`redirect loop from ${from}`); break; } seen.add(current); current = redirectMap.get(current); } }
  if (errors.length) throw new Error(errors.join('\n')); return c;
}
export const publicMaterials = (catalog: Catalog) => catalog.materials.filter((material) => material.status === 'published');
export const assetUrl = (asset: Asset) => `/r2/${asset.storageKey}`;
