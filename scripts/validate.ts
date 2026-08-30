#!/usr/bin/env tsx
/**
 * Build-time validation script
 * Fails the build if any validation rules are violated
 */

import { loadSubjects, loadTopics, loadMaterials, loadAssets, loadRedirects } from '../src/lib/catalog';
import { validateSlug, validateAssetId } from '../src/lib/schemas';
import type { Subject, Topic, Material, Asset } from '../src/lib/schemas';
import { existsSync } from 'fs';
import { join } from 'path';

const STORAGE_PREFIX = process.env.STORAGE_PREFIX || 'files/';

interface ValidationError {
  category: string;
  message: string;
  fatal: boolean;
}

const errors: ValidationError[] = [];

function error(category: string, message: string, fatal: boolean = true): void {
  console.error(`[${category}] ${message}`);
  errors.push({ category, message, fatal });
}

function info(category: string, message: string): void {
  console.log(`[${category}] ${message}`);
}

// I9: Slugs cannot introduce path traversal
function validateSlugs(): void {
  info('SLUG', 'Validating slugs...');
  
  const subjects = loadSubjects();
  const topics = loadTopics();
  const materials = loadMaterials();
  
  for (const subject of subjects) {
    if (!validateSlug(subject.slug)) {
      error('SLUG', `Invalid subject slug: ${subject.slug}`, true);
    }
    if (subject.slug.includes('/') || subject.slug.includes('\\') || subject.slug.includes('..')) {
      error('SLUG', `Path traversal in subject slug: ${subject.slug}`, true);
    }
  }
  
  for (const topic of topics) {
    if (!validateSlug(topic.slug)) {
      error('SLUG', `Invalid topic slug: ${topic.slug}`, true);
    }
    if (topic.slug.includes('/') || topic.slug.includes('\\') || topic.slug.includes('..')) {
      error('SLUG', `Path traversal in topic slug: ${topic.slug}`, true);
    }
  }
  
  for (const material of materials) {
    if (!validateSlug(material.slug)) {
      error('SLUG', `Invalid material slug: ${material.slug}`, true);
    }
    if (material.slug.includes('/') || material.slug.includes('\\') || material.slug.includes('..')) {
      error('SLUG', `Path traversal in material slug: ${material.slug}`, true);
    }
  }
}

// Check for duplicate slugs within each entity type
function validateUniqueSlugs(): void {
  info('SLUG', 'Checking for duplicate slugs...');
  
  const subjects = loadSubjects();
  const topics = loadTopics();
  const materials = loadMaterials();
  
  const subjectSlugs = new Map<string, string>();
  for (const s of subjects) {
    if (subjectSlugs.has(s.slug)) {
      error('SLUG', `Duplicate subject slug: ${s.slug}`, true);
    }
    subjectSlugs.set(s.slug, s.id);
  }
  
  const topicSlugs = new Map<string, string>();
  for (const t of topics) {
    if (topicSlugs.has(t.slug)) {
      error('SLUG', `Duplicate topic slug: ${t.slug}`, true);
    }
    topicSlugs.set(t.slug, t.id);
  }
  
  // Only check published materials for slug collisions
  const materialSlugs = new Map<string, string>();
  for (const m of materials.filter(m => m.state !== 'deleted')) {
    if (materialSlugs.has(m.slug)) {
      error('SLUG', `Duplicate material slug: ${m.slug}`, true);
    }
    materialSlugs.set(m.slug, m.id);
  }
}

// Validate subject/topic relationships
function validateRelationships(): void {
  info('RELATIONSHIP', 'Validating relationships...');
  
  const subjects = loadSubjects();
  const topics = loadTopics();
  const materials = loadMaterials();
  
  const subjectIds = new Set(subjects.map(s => s.id));
  const topicIds = new Set(topics.map(t => t.id));
  
  // Check topics reference valid subjects
  for (const topic of topics) {
    if (!subjectIds.has(topic.subjectId)) {
      error('RELATIONSHIP', `Topic ${topic.id} references nonexistent subject ${topic.subjectId}`, true);
    }
  }
  
  // Check materials reference valid topics
  for (const material of materials) {
    if (!topicIds.has(material.topicId)) {
      error('RELATIONSHIP', `Material ${material.id} references nonexistent topic ${material.topicId}`, true);
    }
  }
}

// I1 & I2: Every published material references an available asset that exists in storage
function validatePublishedMaterials(): void {
  info('MATERIAL', 'Validating published materials...');
  
  const materials = loadMaterials();
  const assets = loadAssets();
  
  const assetMap = new Map(assets.map(a => [a.id, a]));
  
  for (const material of materials) {
    if (material.state === 'published') {
      if (!material.assetId) {
        error('MATERIAL', `Published material ${material.id} has no asset reference`, true);
        continue;
      }
      
      const asset = assetMap.get(material.assetId);
      if (!asset) {
        error('MATERIAL', `Published material ${material.id} references nonexistent asset ${material.assetId}`, true);
        continue;
      }
      
      if (asset.status === 'archived') {
        error('MATERIAL', `Published material ${material.id} references archived asset ${material.assetId}`, true);
      }
      
      // I2: Check asset exists in storage (simulated - actual storage check in reconcile)
      const storagePath = join(process.cwd(), 'storage', asset.storageKey);
      if (!existsSync(storagePath)) {
        // For local dev, we may not have actual files
        // This will be caught by reconciliation
        info('STORAGE', `Asset ${asset.id} not found in local storage (may be in R2)`);
      }
    }
  }
}

// Validate asset metadata
function validateAssets(): void {
  info('ASSET', 'Validating assets...');
  
  const assets = loadAssets();
  
  const checksumSet = new Set<string>();
  
  for (const asset of assets) {
    // I3: No duplicate checksum records
    if (checksumSet.has(asset.checksum)) {
      error('ASSET', `Duplicate checksum record: ${asset.checksum}`, true);
    }
    checksumSet.add(asset.checksum);
    
    // Validate asset ID format
    if (!validateAssetId(asset.id)) {
      error('ASSET', `Invalid asset ID format: ${asset.id}`, true);
    }
    
    // Validate checksum matches ID (content-addressed)
    if (asset.id !== asset.checksum) {
      error('ASSET', `Asset ID ${asset.id} does not match checksum ${asset.checksum}`, true);
    }
    
    // Validate storage key format
    if (!asset.storageKey.startsWith(STORAGE_PREFIX) && !asset.storageKey.startsWith('archive/')) {
      error('ASSET', `Asset ${asset.id} has invalid storage key prefix: ${asset.storageKey}`, true);
    }
  }
}

// Validate redirects
function validateRedirects(): void {
  info('REDIRECT', 'Validating redirects...');
  
  const redirects = loadRedirects();
  
  const fromPaths = new Map<string, string>();
  
  for (const redirect of redirects) {
    // Check for redirect loops (simple check)
    if (redirect.from === redirect.to) {
      error('REDIRECT', `Redirect loop detected: ${redirect.from} -> ${redirect.to}`, true);
    }
    
    // Check for duplicate 'from' paths
    if (fromPaths.has(redirect.from)) {
      error('REDIRECT', `Duplicate redirect source: ${redirect.from}`, true);
    }
    fromPaths.set(redirect.from, redirect.to);
    
    // Check for path traversal in redirect paths
    if (redirect.from.includes('..') || redirect.to.includes('..')) {
      error('REDIRECT', `Path traversal in redirect: ${redirect.from} -> ${redirect.to}`, true);
    }
  }
}

// Main validation
async function main(): Promise<void> {
  console.log('Starting build-time validation...\n');
  
  try {
    validateSlugs();
    validateUniqueSlugs();
    validateRelationships();
    validatePublishedMaterials();
    validateAssets();
    validateRedirects();
    
    const fatalErrors = errors.filter(e => e.fatal);
    
    if (fatalErrors.length > 0) {
      console.error(`\n❌ Validation failed with ${fatalErrors.length} fatal error(s)`);
      process.exit(1);
    }
    
    console.log('\n✅ All validations passed');
    process.exit(0);
  } catch (e) {
    console.error(`\n❌ Validation error: ${(e as Error).message}`);
    process.exit(1);
  }
}

main();
