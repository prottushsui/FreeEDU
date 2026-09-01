import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDeploymentManifest } from '../src/lib/manifest.ts';
import { localObjectReader, validateCatalog } from '../src/lib/catalog.ts';

const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const hash = createHash('sha256').update(pdf).digest('hex'); const time = '2026-09-01T00:00:00.000Z';
function write(file: string, value: unknown) { fs.writeFileSync(file, `${JSON.stringify(value)}\n`); }
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'freeedu-catalog-')); fs.mkdirSync(path.join(root, 'content')); fs.mkdirSync(path.join(root, '.storage/r2/files'), { recursive: true }); fs.writeFileSync(path.join(root, '.storage/r2/files', `${hash}.pdf`), pdf);
  fs.writeFileSync(path.join(root, 'content/subjects.json'), JSON.stringify([{ id: 'subject-math', slug: 'mathematics', name: 'Mathematics', description: 'Study mathematics.' }]));
  write(path.join(root, 'content/topics.jsonl'), { id: 'topic-algebra', slug: 'algebra', subjectId: 'subject-math', title: 'Algebra', description: 'Study algebra.' });
  write(path.join(root, 'content/assets.jsonl'), { id: hash, sha256: hash, originalFilename: 'source.pdf', sizeBytes: pdf.byteLength, mimeType: 'application/pdf', status: 'available', storageKey: `files/${hash}.pdf`, checksum: `sha256:${hash}`, createdAt: time, updatedAt: time });
  write(path.join(root, 'content/materials.jsonl'), { id: 'material-guide', slug: 'guide', title: '<script>alert(1)</script>', description: 'Safe text.', subjectId: 'subject-math', topicIds: ['topic-algebra'], tags: ['algebra'], status: 'published', assetId: hash, fileType: 'pdf', createdAt: time, updatedAt: time });
  fs.writeFileSync(path.join(root, 'content/redirects.jsonl'), ''); return root;
}
function fails(change: (root: string) => void, message: RegExp) { const root = fixture(); change(root); assert.throws(() => validateCatalog(root), message); }
test('catalog validates PDF bytes, checksum, size, and canonical storage key', () => assert.doesNotThrow(() => validateCatalog(fixture())));
test('missing public asset fails closed', () => fails((root) => fs.unlinkSync(path.join(root, '.storage/r2/files', `${hash}.pdf`)), /missing from storage/));
test('wrong size, hash, or non-PDF content fails integrity validation', () => fails((root) => fs.writeFileSync(path.join(root, '.storage/r2/files', `${hash}.pdf`), Buffer.from('not a pdf')), /integrity mismatch/));
test('duplicate checksums and path traversal slugs are rejected', () => { fails((root) => fs.appendFileSync(path.join(root, 'content/assets.jsonl'), fs.readFileSync(path.join(root, 'content/assets.jsonl'))), /duplicate asset id/); fails((root) => write(path.join(root, 'content/topics.jsonl'), { id: 'topic-algebra', slug: '../escape', subjectId: 'subject-math', title: 'Algebra', description: 'Study algebra.' }), /Invalid/); });
test('published material cannot use archived asset', () => fails((root) => { const asset = JSON.parse(fs.readFileSync(path.join(root, 'content/assets.jsonl'), 'utf8')); asset.status = 'archived'; asset.storageKey = `archive/${hash}.pdf`; fs.mkdirSync(path.join(root, '.storage/r2/archive'), { recursive: true }); fs.renameSync(path.join(root, '.storage/r2/files', `${hash}.pdf`), path.join(root, '.storage/r2/archive', `${hash}.pdf`)); write(path.join(root, 'content/assets.jsonl'), asset); }, /references unavailable asset/));
test('redirect loops and external/path-traversal redirects fail', () => { fails((root) => fs.writeFileSync(path.join(root, 'content/redirects.jsonl'), '{"from":"/a","to":"/b","status":301}\n{"from":"/b","to":"/a","status":301}\n'), /redirect loop/); fails((root) => fs.writeFileSync(path.join(root, 'content/redirects.jsonl'), '{"from":"/a","to":"//evil.example","status":301}\n'), /unsafe redirect/); });
test('deployment manifest is derived solely from published available references', () => { const catalog = validateCatalog(fixture()); catalog.materials.push({ ...catalog.materials[0], id: 'draft-guide', slug: 'draft-guide', status: 'draft' }); const manifest = createDeploymentManifest(catalog); assert.deepEqual(manifest.assetIds, [hash]); assert.deepEqual(manifest.storageKeys, [`files/${hash}.pdf`]); });
test('untrusted metadata remains text data, not an HTML execution API', () => { const catalog = validateCatalog(fixture()); assert.equal(catalog.materials[0].title, '<script>alert(1)</script>'); });
test('reader finds local fixture objects only beneath permitted content-addressed prefixes', () => { const root = fixture(); assert.deepEqual(localObjectReader(root).list('files/'), [`files/${hash}.pdf`]); });
