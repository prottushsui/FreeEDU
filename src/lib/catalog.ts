import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Subject, Topic, Material, Asset, Redirect } from './schemas';
import { subjectSchema, topicSchema, materialSchema, assetSchema, redirectSchema } from './schemas';

const CONTENT_DIR = join(process.cwd(), 'content');

// JSONL file operations with atomic writes
function readJsonlFile<T>(filename: string, schema: import('zod').ZodSchema<T>): T[] {
  const filepath = join(CONTENT_DIR, filename);
  if (!existsSync(filepath)) return [];
  
  const content = readFileSync(filepath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  const results: T[] = [];
  
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const validated = schema.parse(parsed);
      results.push(validated as T);
    } catch (e) {
      throw new Error(`Invalid record in ${filename}: ${(e as Error).message}`);
    }
  }
  
  return results;
}

function writeJsonlFile<T>(filename: string, records: T[]): void {
  const filepath = join(CONTENT_DIR, filename);
  const lines = records.map(r => JSON.stringify(r)).join('\n');
  
  // Atomic write using temp file + rename pattern
  // This ensures the original file remains intact if the write fails
  const tempPath = filepath + '.tmp.' + process.pid;
  const backupPath = filepath + '.bak';
  
  try {
    // Write to temporary file first
    writeFileSync(tempPath, lines + '\n', 'utf-8');
    
    // Create backup of original if it exists
    if (existsSync(filepath)) {
      renameSync(filepath, backupPath);
    }
    
    // Atomically rename temp to final path
    renameSync(tempPath, filepath);
    
    // Clean up backup on success
    if (existsSync(backupPath)) {
      rmSync(backupPath);
    }
  } catch (e) {
    // On failure, restore from backup if available
    if (existsSync(backupPath) && !existsSync(filepath)) {
      renameSync(backupPath, filepath);
    }
    // Clean up temp file
    rmSync(tempPath, { force: true });
    // Clean up backup if restore succeeded
    rmSync(backupPath, { force: true });
    throw e;
  }
}

// Catalog accessors
export function loadSubjects(): Subject[] {
  return readJsonlFile('subjects.jsonl', subjectSchema);
}

export function loadTopics(): Topic[] {
  return readJsonlFile('topics.jsonl', topicSchema);
}

export function loadMaterials(): Material[] {
  return readJsonlFile('materials.jsonl', materialSchema);
}

export function loadAssets(): Asset[] {
  return readJsonlFile('assets.jsonl', assetSchema);
}

export function loadRedirects(): Redirect[] {
  return readJsonlFile('redirects.jsonl', redirectSchema);
}

export function saveSubjects(subjects: Subject[]): void {
  writeJsonlFile('subjects.jsonl', subjects);
}

export function saveTopics(topics: Topic[]): void {
  writeJsonlFile('topics.jsonl', topics);
}

export function saveMaterials(materials: Material[]): void {
  writeJsonlFile('materials.jsonl', materials);
}

export function saveAssets(assets: Asset[]): void {
  writeJsonlFile('assets.jsonl', assets);
}

export function saveRedirects(redirects: Redirect[]): void {
  writeJsonlFile('redirects.jsonl', redirects);
}

// Get published materials only
export function getPublishedMaterials(): Material[] {
  return loadMaterials().filter(m => m.state === 'published');
}

// Get materials by topic
export function getMaterialsByTopic(topicId: string): Material[] {
  return getPublishedMaterials().filter(m => m.topicId === topicId);
}

// Get materials by subject
export function getMaterialsBySubject(subjectId: string, topics: Topic[]): Material[] {
  const topicIds = topics.filter(t => t.subjectId === subjectId).map(t => t.id);
  return getPublishedMaterials().filter(m => topicIds.includes(m.topicId));
}

// Get asset by ID
export function getAssetById(assetId: string): Asset | undefined {
  return loadAssets().find(a => a.id === assetId);
}

// Get subject by slug
export function getSubjectBySlug(slug: string): Subject | undefined {
  return loadSubjects().find(s => s.slug === slug);
}

// Get topic by slug
export function getTopicBySlug(slug: string): Topic | undefined {
  return loadTopics().find(t => t.slug === slug);
}

// Get material by slug
export function getMaterialBySlug(slug: string): Material | undefined {
  return loadMaterials().find(m => m.slug === slug);
}

// Ensure content directory exists
export function ensureContentDir(): void {
  if (!existsSync(CONTENT_DIR)) {
    mkdirSync(CONTENT_DIR, { recursive: true });
  }
}

// Initialize empty catalogs if they don't exist
export function initializeCatalogs(): void {
  ensureContentDir();
  
  if (!existsSync(join(CONTENT_DIR, 'subjects.jsonl'))) {
    writeFileSync(join(CONTENT_DIR, 'subjects.jsonl'), '', 'utf-8');
  }
  if (!existsSync(join(CONTENT_DIR, 'topics.jsonl'))) {
    writeFileSync(join(CONTENT_DIR, 'topics.jsonl'), '', 'utf-8');
  }
  if (!existsSync(join(CONTENT_DIR, 'materials.jsonl'))) {
    writeFileSync(join(CONTENT_DIR, 'materials.jsonl'), '', 'utf-8');
  }
  if (!existsSync(join(CONTENT_DIR, 'assets.jsonl'))) {
    writeFileSync(join(CONTENT_DIR, 'assets.jsonl'), '', 'utf-8');
  }
  if (!existsSync(join(CONTENT_DIR, 'redirects.jsonl'))) {
    writeFileSync(join(CONTENT_DIR, 'redirects.jsonl'), '', 'utf-8');
  }
}
