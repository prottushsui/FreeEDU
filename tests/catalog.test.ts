import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { saveSubjects, getPublishedMaterials } from '../src/lib/catalog';

const CONTENT_DIR = join(process.cwd(), 'content');

describe('Catalog Operations', () => {
  beforeEach(() => {
    if (existsSync(join(CONTENT_DIR, 'subjects.jsonl'))) {
      rmSync(join(CONTENT_DIR, 'subjects.jsonl'));
    }
    if (existsSync(join(CONTENT_DIR, 'materials.jsonl'))) {
      rmSync(join(CONTENT_DIR, 'materials.jsonl'));
    }
  });

  describe('I5: Deletion excludes material from generated content', () => {
    it('getPublishedMaterials excludes deleted materials', () => {
      const subjects = [
        { id: '550e8400-e29b-41d4-a716-446655440000', slug: 'math', title: 'Mathematics', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }
      ];
      saveSubjects(subjects);
      
      const materials = [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          slug: 'published-material',
          topicId: '550e8400-e29b-41d4-a716-446655440002',
          title: 'Published Material',
          state: 'published',
          assetId: 'a'.repeat(64),
          tags: [],
          version: 1,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          publishedAt: '2024-01-01T00:00:00Z'
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440003',
          slug: 'deleted-material',
          topicId: '550e8400-e29b-41d4-a716-446655440002',
          title: 'Deleted Material',
          state: 'deleted',
          tags: [],
          version: 1,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }
      ];
      
      writeFileSync(join(CONTENT_DIR, 'materials.jsonl'), 
        materials.map(m => JSON.stringify(m)).join('\n') + '\n'
      );
      
      const published = getPublishedMaterials();
      expect(published.length).toBe(1);
      expect(published[0].slug).toBe('published-material');
    });
  });
});
