import { z } from 'zod';

// Strict slug schema - prevents path traversal, control characters, unsafe encoding
const slugSchema = z.string()
  .min(1, "Slug cannot be empty")
  .max(200, "Slug too long")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens only")
  .refine(s => !s.includes('/') && !s.includes('\\') && !s.includes('..'), "Slug cannot contain path separators")
  .refine(s => !/[\x00-\x1f\x7f]/.test(s), "Slug cannot contain control characters");

// Asset ID must be strict SHA-256 hex
const assetIdSchema = z.string()
  .length(64, "Asset ID must be 64 character SHA-256 hash")
  .regex(/^[a-f0-9]{64}$/, "Asset ID must be lowercase hexadecimal SHA-256");

// Material lifecycle states
export const materialStateSchema = z.enum(['draft', 'published', 'deleted']);

// Subject schema
export const subjectSchema = z.object({
  id: z.string().uuid("Subject ID must be a valid UUID"),
  slug: slugSchema,
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

// Topic schema with subject relationship
export const topicSchema = z.object({
  id: z.string().uuid("Topic ID must be a valid UUID"),
  slug: slugSchema,
  subjectId: z.string().uuid("Subject ID must be a valid UUID"),
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

// Asset schema - content-addressed storage
export const assetSchema = z.object({
  id: assetIdSchema,
  originalFilename: z.string().min(1).max(500),
  size: z.number().int().positive(),
  mimeType: z.literal('application/pdf'),
  status: z.enum(['active', 'archived']),
  storageKey: z.string().min(1),
  checksum: assetIdSchema,
  createdAt: z.string().datetime(),
  uploadedAt: z.string().datetime().optional(),
  materialIds: z.array(z.string()).default([])
});

// Material schema
export const materialSchema = z.object({
  id: z.string().uuid("Material ID must be a valid UUID"),
  slug: slugSchema,
  topicId: z.string().uuid("Topic ID must be a valid UUID"),
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().max(100)).default([]),
  state: materialStateSchema,
  assetId: assetIdSchema.optional(),
  version: z.number().int().positive().default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  publishedAt: z.string().datetime().optional()
});

// Redirect schema
export const redirectSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  permanent: z.boolean().default(false)
});

// Validation helpers
export function validateSlug(slug: string): boolean {
  return slugSchema.safeParse(slug).success;
}

export function validateAssetId(id: string): boolean {
  return assetIdSchema.safeParse(id).success;
}

export type Subject = z.infer<typeof subjectSchema>;
export type Topic = z.infer<typeof topicSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Material = z.infer<typeof materialSchema>;
export type MaterialState = z.infer<typeof materialStateSchema>;
export type Redirect = z.infer<typeof redirectSchema>;
