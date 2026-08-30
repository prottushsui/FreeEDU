#!/usr/bin/env tsx
/**
 * Storage reconciliation script
 * Compares catalog state with actual storage
 */

import { loadAssets } from '../src/lib/catalog';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

interface ReconciliationIssue {
  type: 'catalog_missing_storage' | 'storage_missing_catalog' | 'unexpected_prefix' | 'inconsistent_status' | 'duplicate_record';
  assetId?: string;
  storageKey?: string;
  message: string;
}

const issues: ReconciliationIssue[] = [];

const STORAGE_DIR = process.env.STORAGE_DIR || join(process.cwd(), 'storage');
const FILES_PREFIX = 'files/';
const ARCHIVE_PREFIX = 'archive/';

function issue(type: ReconciliationIssue['type'], message: string, assetId?: string, storageKey?: string): void {
  console.warn(`[RECONCILE] ${message}`);
  issues.push({ type, message, assetId, storageKey });
}

function info(message: string): void {
  console.log(`[RECONCILE] ${message}`);
}

// Get all files in storage directory
function getStorageFiles(): Set<string> {
  const files = new Set<string>();
  
  if (!existsSync(STORAGE_DIR)) {
    return files;
  }
  
  // Check files/ prefix
  const filesDir = join(STORAGE_DIR, FILES_PREFIX);
  if (existsSync(filesDir)) {
    for (const file of readdirSync(filesDir)) {
      files.add(FILES_PREFIX + file);
    }
  }
  
  // Check archive/ prefix
  const archiveDir = join(STORAGE_DIR, ARCHIVE_PREFIX);
  if (existsSync(archiveDir)) {
    for (const file of readdirSync(archiveDir)) {
      files.add(ARCHIVE_PREFIX + file);
    }
  }
  
  return files;
}

async function main(): Promise<void> {
  console.log('Starting storage reconciliation...\n');
  
  try {
    const assets = loadAssets();
    const storageFiles = getStorageFiles();
    
    const catalogKeys = new Set<string>();
    const checksumMap = new Map<string, string[]>();
    
    // Check catalog entries
    for (const asset of assets) {
      catalogKeys.add(asset.storageKey);
      
      // Track checksums for duplicate detection
      const existing = checksumMap.get(asset.checksum) || [];
      existing.push(asset.id);
      checksumMap.set(asset.checksum, existing);
      
      // Check if catalog asset exists in storage
      if (!storageFiles.has(asset.storageKey)) {
        issue(
          'catalog_missing_storage',
          `Catalog asset ${asset.id} references storage key ${asset.storageKey} but file not found`,
          asset.id,
          asset.storageKey
        );
      }
      
      // Check status consistency
      if (asset.status === 'archived' && asset.storageKey.startsWith(FILES_PREFIX)) {
        issue(
          'inconsistent_status',
          `Archived asset ${asset.id} has storage key in files/ prefix: ${asset.storageKey}`,
          asset.id,
          asset.storageKey
        );
      }
      
      if (asset.status === 'active' && asset.storageKey.startsWith(ARCHIVE_PREFIX)) {
        issue(
          'inconsistent_status',
          `Active asset ${asset.id} has storage key in archive/ prefix: ${asset.storageKey}`,
          asset.id,
          asset.storageKey
        );
      }
    }
    
    // Check for duplicate checksums (I3 violation)
    for (const [checksum, ids] of checksumMap.entries()) {
      if (ids.length > 1) {
        issue(
          'duplicate_record',
          `Duplicate checksum ${checksum} found for assets: ${ids.join(', ')}`,
          ids[0]
        );
      }
    }
    
    // Check for storage objects missing from catalog
    for (const storageKey of storageFiles) {
      if (!catalogKeys.has(storageKey)) {
        issue(
          'storage_missing_catalog',
          `Storage object ${storageKey} exists but is not in catalog (orphaned)`,
          undefined,
          storageKey
        );
      }
    }
    
    // Check for objects in unexpected prefixes
    for (const storageKey of storageFiles) {
      if (!storageKey.startsWith(FILES_PREFIX) && !storageKey.startsWith(ARCHIVE_PREFIX)) {
        issue(
          'unexpected_prefix',
          `Storage object ${storageKey} is in unexpected location`,
          undefined,
          storageKey
        );
      }
    }
    
    // Report results
    const criticalIssues = issues.filter(i => 
      i.type === 'catalog_missing_storage' || 
      i.type === 'duplicate_record'
    );
    
    if (criticalIssues.length > 0) {
      console.error(`\n❌ Reconciliation failed with ${criticalIssues.length} critical issue(s)`);
      process.exit(1);
    }
    
    const warnings = issues.filter(i => 
      i.type === 'storage_missing_catalog' ||
      i.type === 'unexpected_prefix' ||
      i.type === 'inconsistent_status'
    );
    
    if (warnings.length > 0) {
      console.warn(`\n⚠️  Reconciliation completed with ${warnings.length} warning(s)`);
      console.warn('Review orphaned storage objects and status inconsistencies');
    } else {
      console.log('\n✅ Reconciliation passed - catalog and storage are consistent');
    }
    
    process.exit(0);
  } catch (e) {
    console.error(`\n❌ Reconciliation error: ${(e as Error).message}`);
    process.exit(1);
  }
}

main();
