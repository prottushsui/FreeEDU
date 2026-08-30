import { createHash } from 'crypto';
import { readFileSync } from 'fs';

// Maximum PDF file size: 100MB
const MAX_PDF_SIZE = 100 * 1024 * 1024;

// PDF magic bytes
const PDF_MAGIC = Buffer.from('%PDF');

/**
 * Calculate SHA-256 hash of a file
 */
export function calculateSHA256(filePath: string): string {
  const content = readFileSync(filePath);
  const hash = createHash('sha256');
  hash.update(content);
  return hash.digest('hex');
}

/**
 * Calculate SHA-256 hash of a buffer
 */
export function calculateSHA256Buffer(buffer: Buffer): string {
  const hash = createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

/**
 * Validate that a file is actually a PDF using magic bytes
 * This is more reliable than checking extension alone
 */
export function validatePDF(filePath: string): { valid: boolean; error?: string } {
  try {
    const stats = require('fs').statSync(filePath);
    
    // Check file size
    if (stats.size > MAX_PDF_SIZE) {
      return { valid: false, error: `File exceeds maximum size of ${MAX_PDF_SIZE / 1024 / 1024}MB` };
    }
    
    if (stats.size < 4) {
      return { valid: false, error: 'File too small to be a valid PDF' };
    }
    
    // Read first 4 bytes for magic number check
    const fd = require('fs').openSync(filePath, 'r');
    const buffer = Buffer.alloc(4);
    require('fs').readSync(fd, buffer, 0, 4, 0);
    require('fs').closeSync(fd);
    
    // Check for PDF magic bytes
    if (!buffer.equals(PDF_MAGIC)) {
      return { valid: false, error: 'File does not have valid PDF magic bytes' };
    }
    
    return { valid: true };
  } catch (e) {
    return { valid: false, error: (e as Error).message };
  }
}

/**
 * Get file size in bytes
 */
export function getFileSize(filePath: string): number {
  const stats = require('fs').statSync(filePath);
  return stats.size;
}

/**
 * Get MIME type based on magic bytes (simplified for PDF)
 */
export function getMimeType(filePath: string): string {
  const validation = validatePDF(filePath);
  if (validation.valid) {
    return 'application/pdf';
  }
  throw new Error('Cannot determine MIME type for non-PDF file');
}
