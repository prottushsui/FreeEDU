#!/usr/bin/env tsx
/**
 * Ingestion CLI for adding/replacing/deleting materials
 * 
 * Commands:
 *   ingest add <file.pdf> --title "Title" --topic-id <uuid> [--description "Desc"] [--tags "tag1,tag2"]
 *   ingest replace <material-id> <file.pdf>
 *   ingest delete <material-id>
 *   ingest gc (garbage collection)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { loadMaterials, loadAssets, saveMaterials, saveAssets, getAssetById, loadTopics } from '../src/lib/catalog';
import type { Material, Asset, Topic } from '../src/lib/schemas';
import { materialSchema, assetSchema } from '../src/lib/schemas';
import { validateSlug } from '../src/lib/schemas';

// Configuration
const MAX_PDF_SIZE = 100 * 1024 * 1024; // 100MB
const PDF_MAGIC = Buffer.from('%PDF');
const STORAGE_DIR = process.env.STORAGE_DIR || join(process.cwd(), 'storage');
const FILES_PREFIX = 'files/';
const LOCK_FILE = join(STORAGE_DIR, '.ingest.lock');

// Lock management for concurrent ingestion safety
function acquireLock(): boolean {
  try {
    if (existsSync(LOCK_FILE)) {
      const lockContent = readFileSync(LOCK_FILE, 'utf-8');
      const lockPid = parseInt(lockContent);
      // Check if process is still running
      try {
        process.kill(lockPid, 0);
        console.error('Another ingestion process is running (PID:', lockPid + ')');
        return false;
      } catch {
        // Stale lock, remove it
        rmSync(LOCK_FILE, { force: true });
      }
    }
    mkdirSync(STORAGE_DIR, { recursive: true });
    writeFileSync(LOCK_FILE, process.pid.toString());
    return true;
  } catch (e) {
    console.error('Failed to acquire lock:', (e as Error).message);
    return false;
  }
}

function releaseLock(): void {
  rmSync(LOCK_FILE, { force: true });
}

// PDF validation using magic bytes
function validatePDF(filePath: string): { valid: boolean; error?: string; size?: number } {
  try {
    const stats = statSync(filePath);
    
    if (stats.size > MAX_PDF_SIZE) {
      return { valid: false, error: `File exceeds maximum size of ${MAX_PDF_SIZE / 1024 / 1024}MB` };
    }
    
    if (stats.size < 4) {
      return { valid: false, error: 'File too small to be a valid PDF' };
    }
    
    const fd = openSync(filePath, 'r');
    const buffer = Buffer.alloc(4);
    readSync(fd, buffer, 0, 4, 0);
    closeSync(fd);
    
    if (!buffer.equals(PDF_MAGIC)) {
      return { valid: false, error: 'File does not have valid PDF magic bytes' };
    }
    
    return { valid: true, size: stats.size };
  } catch (e) {
    return { valid: false, error: (e as Error).message };
  }
}

// Calculate SHA-256 hash
function calculateSHA256(filePath: string): string {
  const content = readFileSync(filePath);
  const hash = createHash('sha256');
  hash.update(content);
  return hash.digest('hex');
}

// Generate storage key from hash (content-addressed)
function getStorageKey(hash: string): string {
  return FILES_PREFIX + hash;
}

// Upload file to storage (local simulation for now, R2 in production)
function uploadToStorage(filePath: string, storageKey: string): boolean {
  try {
    const destPath = join(STORAGE_DIR, storageKey);
    // Ensure the destination directory exists (including parent directories)
    mkdirSync(dirname(destPath), { recursive: true });
    const content = readFileSync(filePath);
    writeFileSync(destPath, content);
    
    // Verify upload
    const uploadedHash = calculateSHA256(destPath);
    const originalHash = calculateSHA256(filePath);
    
    if (uploadedHash !== originalHash) {
      rmSync(destPath, { force: true });
      return false;
    }
    
    return true;
  } catch (e) {
    console.error('Upload failed:', (e as Error).message);
    return false;
  }
}

// Find existing asset by checksum
function findAssetByChecksum(checksum: string): Asset | undefined {
  const assets = loadAssets();
  return assets.find(a => a.checksum === checksum);
}

// Add a new material
async function addMaterial(filePath: string, title: string, topicId: string, description?: string, tags?: string[]): Promise<void> {
  console.log('Adding new material...');
  
  // Step 1: Validate command arguments
  if (!topicId) {
    console.error('Missing topic ID');
    process.exit(1);
  }
  
  // Step 2: Validate topic exists
  const topics = loadTopics();
  const topic = topics.find(t => t.id === topicId);
  if (!topic) {
    console.error('Topic not found:', topicId);
    process.exit(1);
  }
  
  // Step 3: Validate file
  const validation = validatePDF(filePath);
  if (!validation.valid) {
    console.error('Validation failed:', validation.error);
    process.exit(1);
  }
  
  console.log('✓ File validated as PDF');
  
  // Step 4: Calculate SHA-256
  const checksum = calculateSHA256(filePath);
  console.log('✓ SHA-256 calculated:', checksum);
  
  // Step 5: Generate and validate slug
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (!validateSlug(slug)) {
    console.error('Invalid generated slug:', slug);
    process.exit(1);
  }
  
  // Step 6: Check for duplicate slug
  const existingMaterials = loadMaterials();
  const existingWithSlug = existingMaterials.find(m => m.slug === slug && m.state !== 'deleted');
  if (existingWithSlug) {
    console.error('Duplicate slug detected:', slug);
    process.exit(1);
  }
  
  // Step 7: Check for existing asset with same content
  let asset = findAssetByChecksum(checksum);
  const storageKey = getStorageKey(checksum);
  
  // Handle archived asset reuse - must reactivate archived assets
  if (asset && asset.status === 'archived') {
    console.log('Found archived asset with matching checksum:', asset.id);
    // Reactivate the archived asset
    asset.status = 'active';
    // Move file from archive back to active location if needed
    const archivePath = join(STORAGE_DIR, asset.storageKey);
    const activePath = join(STORAGE_DIR, storageKey);
    
    if (existsSync(archivePath)) {
      mkdirSync(dirname(activePath), { recursive: true });
      writeFileSync(activePath, readFileSync(archivePath));
      rmSync(archivePath);
      asset.storageKey = storageKey;
    }
    
    // Save reactivated asset
    const assets = loadAssets();
    const idx = assets.findIndex(a => a.id === asset!.id);
    if (idx >= 0) {
      assets[idx] = asset!;
      saveAssets(assets);
    }
    console.log('✓ Archived asset reactivated:', asset.id);
  }
  
  if (asset && asset.status === 'active') {
    console.log('✓ Reusing existing asset:', asset.id);
  } else if (!asset) {
    // Step 8: Upload new asset
    console.log('Uploading new asset...');
    if (!uploadToStorage(filePath, storageKey)) {
      console.error('Upload failed');
      process.exit(1);
    }
    console.log('✓ Asset uploaded to', storageKey);
    
    // Step 9: Create asset record
    const now = new Date().toISOString();
    asset = {
      id: checksum,
      originalFilename: filePath.split('/').pop() || 'unknown.pdf',
      size: validation.size!,
      mimeType: 'application/pdf',
      status: 'active',
      storageKey,
      checksum,
      createdAt: now,
      uploadedAt: now,
      materialIds: []
    };
    
    // Atomic catalog update
    const assets = loadAssets();
    assets.push(asset!);
    saveAssets(assets);
    console.log('✓ Asset record created in catalog');
  }
  
  // Step 10: Create material record
  const materials = loadMaterials();
  const now = new Date().toISOString();
  
  const material: Material = {
    id: uuidv4(),
    slug,
    topicId,
    title,
    description,
    tags: tags || [],
    state: 'published',
    assetId: asset!.id,
    version: 1,
    createdAt: now,
    updatedAt: now,
    publishedAt: now
  };
  
  // Validate material schema
  try {
    materialSchema.parse(material);
  } catch (e) {
    console.error('Invalid material schema:', (e as Error).message);
    // Clean up orphaned asset if material validation fails
    if (asset && asset.materialIds.length === 0) {
      console.log('Cleaning up orphaned asset due to material validation failure');
      const assets = loadAssets();
      const filtered = assets.filter(a => a.id !== asset!.id);
      saveAssets(filtered);
      const assetPath = join(STORAGE_DIR, asset.storageKey);
      if (existsSync(assetPath)) {
        rmSync(assetPath);
      }
    }
    process.exit(1);
  }
  
  materials.push(material);
  saveMaterials(materials);
  
  // Update asset's materialIds
  const assets = loadAssets();
  const assetIdx = assets.findIndex(a => a.id === asset!.id);
  if (assetIdx >= 0) {
    if (!assets[assetIdx].materialIds.includes(material.id)) {
      assets[assetIdx].materialIds.push(material.id);
      saveAssets(assets);
    }
  }
  
  console.log('✓ Material created:', material.id);
  console.log('  Slug:', material.slug);
  console.log('  Title:', material.title);
}

// Replace material's asset
async function replaceMaterial(materialId: string, filePath: string): Promise<void> {
  console.log('Replacing material asset...');
  
  const materials = loadMaterials();
  const material = materials.find(m => m.id === materialId);
  
  if (!material) {
    console.error('Material not found:', materialId);
    process.exit(1);
  }
  
  if (material.state === 'deleted') {
    console.error('Cannot replace deleted material');
    process.exit(1);
  }
  
  // Validate new file
  const validation = validatePDF(filePath);
  if (!validation.valid) {
    console.error('Validation failed:', validation.error);
    process.exit(1);
  }
  
  // Calculate new checksum
  const newChecksum = calculateSHA256(filePath);
  const newStorageKey = getStorageKey(newChecksum);
  
  // Check if same content
  if (newChecksum === material.assetId) {
    console.log('New file has identical content, no replacement needed');
    process.exit(0);
  }
  
  // Preserve old asset ID for potential rollback
  const oldAssetId = material.assetId;
  
  // Upload new asset if not exists
  let asset = findAssetByChecksum(newChecksum);
  
  // Handle archived asset reuse - must reactivate archived assets
  if (asset && asset.status === 'archived') {
    console.log('Found archived asset with matching checksum:', asset.id);
    // Reactivate the archived asset
    asset.status = 'active';
    // Move file from archive back to active location if needed
    const archivePath = join(STORAGE_DIR, asset.storageKey);
    const activePath = join(STORAGE_DIR, newStorageKey);
    
    if (existsSync(archivePath)) {
      mkdirSync(dirname(activePath), { recursive: true });
      writeFileSync(activePath, readFileSync(archivePath));
      rmSync(archivePath);
      asset.storageKey = newStorageKey;
    }
    
    // Save reactivated asset
    const assets = loadAssets();
    const idx = assets.findIndex(a => a.id === asset!.id);
    if (idx >= 0) {
      assets[idx] = asset!;
      saveAssets(assets);
    }
    console.log('✓ Archived asset reactivated:', asset.id);
  }
  
  if (!asset || asset.status !== 'active') {
    console.log('Uploading new asset...');
    if (!uploadToStorage(filePath, newStorageKey)) {
      console.error('Upload failed');
      process.exit(1);
    }
    
    const now = new Date().toISOString();
    asset = {
      id: newChecksum,
      originalFilename: filePath.split('/').pop() || 'unknown.pdf',
      size: validation.size!,
      mimeType: 'application/pdf',
      status: 'active',
      storageKey: newStorageKey,
      checksum: newChecksum,
      createdAt: now,
      uploadedAt: now,
      materialIds: [materialId]
    };
    
    const assets = loadAssets();
    assets.push(asset);
    saveAssets(assets);
  }
  
  // Update material to reference new asset
  material.assetId = newChecksum;
  material.version += 1;
  material.updatedAt = new Date().toISOString();
  
  saveMaterials(materials);
  console.log('✓ Material updated to use new asset');
  
  // Update asset's materialIds - remove old asset reference, add new
  const assets = loadAssets();
  
  // Remove material from old asset's materialIds
  const oldAssetIdx = assets.findIndex(a => a.id === oldAssetId);
  if (oldAssetIdx >= 0) {
    assets[oldAssetIdx].materialIds = assets[oldAssetIdx].materialIds.filter(id => id !== materialId);
  }
  
  // Add material to new asset's materialIds
  const newAssetIdx = assets.findIndex(a => a.id === newChecksum);
  if (newAssetIdx >= 0 && !assets[newAssetIdx].materialIds.includes(materialId)) {
    assets[newAssetIdx].materialIds.push(materialId);
  }
  
  saveAssets(assets);
  
  // Note: Old asset is preserved until GC after successful deployment
  console.log('ℹ️  Old asset', oldAssetId, 'preserved for safe GC after deployment');
}

// Delete material (soft delete)
function deleteMaterial(materialId: string): void {
  console.log('Deleting material...');
  
  const materials = loadMaterials();
  const material = materials.find(m => m.id === materialId);
  
  if (!material) {
    console.error('Material not found:', materialId);
    process.exit(1);
  }
  
  // Mark as deleted
  material.state = 'deleted';
  material.updatedAt = new Date().toISOString();
  
  saveMaterials(materials);
  
  // Update asset's materialIds - remove this material
  if (material.assetId) {
    const assets = loadAssets();
    const assetIdx = assets.findIndex(a => a.id === material.assetId);
    if (assetIdx >= 0) {
      assets[assetIdx].materialIds = assets[assetIdx].materialIds.filter(id => id !== materialId);
      saveAssets(assets);
    }
  }
  
  console.log('✓ Material marked as deleted:', materialId);
  console.log('ℹ️  Asset preserved - run GC after confirming no other materials reference it');
}

// Garbage collection
function garbageCollect(): void {
  console.log('Running garbage collection...');
  
  const materials = loadMaterials();
  const assets = loadAssets();
  
  // Find all referenced asset IDs (only from non-deleted materials)
  const referencedAssetIds = new Set(
    materials
      .filter(m => m.state !== 'deleted' && m.assetId)
      .map(m => m.assetId!)
  );
  
  // Also include assets referenced by deleted materials that might still be deployed
  // In production, this should check against the currently deployed version
  
  let archivedCount = 0;
  let deletedCount = 0;
  
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
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command) {
    console.log(`Usage:
  ingest add <file.pdf> --title "Title" --topic-id <uuid> [--description "Desc"] [--tags "tag1,tag2"]
  ingest replace <material-id> <file.pdf>
  ingest delete <material-id>
  ingest gc
`);
    process.exit(1);
  }
  
  // Acquire lock for write operations
  if (['add', 'replace', 'delete', 'gc'].includes(command)) {
    if (!acquireLock()) {
      process.exit(1);
    }
    
    // Ensure cleanup on exit
    process.on('exit', releaseLock);
    process.on('SIGINT', () => { releaseLock(); process.exit(130); });
    process.on('SIGTERM', () => { releaseLock(); process.exit(143); });
  }
  
  try {
    switch (command) {
      case 'add': {
        const file = args[1];
        const titleIdx = args.indexOf('--title');
        const topicIdx = args.indexOf('--topic-id');
        const descIdx = args.indexOf('--description');
        const tagsIdx = args.indexOf('--tags');
        
        if (!file || titleIdx === -1 || topicIdx === -1) {
          console.error('Missing required arguments');
          process.exit(1);
        }
        
        const title = args[titleIdx + 1];
        const topicId = args[topicIdx + 1];
        const description = descIdx !== -1 ? args[descIdx + 1] : undefined;
        const tags = tagsIdx !== -1 ? args[tagsIdx + 1].split(',') : undefined;
        
        await addMaterial(file, title, topicId, description, tags);
        break;
      }
      
      case 'replace': {
        const materialId = args[1];
        const file = args[2];
        
        if (!materialId || !file) {
          console.error('Missing required arguments');
          process.exit(1);
        }
        
        await replaceMaterial(materialId, file);
        break;
      }
      
      case 'delete': {
        const materialId = args[1];
        
        if (!materialId) {
          console.error('Missing material ID');
          process.exit(1);
        }
        
        deleteMaterial(materialId);
        break;
      }
      
      case 'gc': {
        garbageCollect();
        break;
      }
      
      default:
        console.error('Unknown command:', command);
        process.exit(1);
    }
  } catch (e) {
    console.error('Error:', (e as Error).message);
    releaseLock();
    process.exit(1);
  }
  
  releaseLock();
}

main();
