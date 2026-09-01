#!/usr/bin/env tsx
/**
 * Garbage collection CLI
 * Archives assets that are no longer referenced by any published material
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadMaterials, loadAssets, saveAssets } from '../src/lib/catalog';

const STORAGE_DIR = process.env.STORAGE_DIR || join(process.cwd(), 'storage');
const FILES_PREFIX = 'files/';

// Find all referenced asset IDs (only from non-deleted materials)
function getReferencedAssetIds(): Set<string> {
  const materials = loadMaterials();
  return new Set(
    materials
      .filter(m => m.state !== 'deleted' && m.assetId)
      .map(m => m.assetId!)
  );
}

// Garbage collection
export function garbageCollect(): void {
  console.log('Running garbage collection...');
  
  const materials = loadMaterials();
  const assets = loadAssets();
  
  // Find all referenced asset IDs (only from non-deleted materials)
  const referencedAssetIds = getReferencedAssetIds();
  
  let archivedCount = 0;
  
  const updatedAssets = assets.map(asset => {
    if (asset.status === 'active' && !referencedAssetIds.has(asset.id)) {
      // Archive unreferenced active assets
      const archiveKey = 'archive/' + asset.storageKey.replace(FILES_PREFIX, '');
      
      // Move file to archive
      const srcPath = join(STORAGE_DIR, asset.storageKey);
      const destPath = join(STORAGE_DIR, archiveKey);
      
      if (existsSync(srcPath)) {
        mkdirSync(join(STORAGE_DIR, 'archive'), { recursive: true });
        writeFileSync(destPath, readFileSync(srcPath));
        rmSync(srcPath);
        
        asset.status = 'archived';
        asset.storageKey = archiveKey;
        archivedCount++;
        console.log('✓ Archived:', asset.id);
      }
    }
    return asset;
  });
  
  saveAssets(updatedAssets);
  
  console.log(`\n✓ GC complete: ${archivedCount} assets archived`);
}

// Main CLI handler
function main(): void {
  garbageCollect();
}

main();
