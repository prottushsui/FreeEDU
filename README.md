# FreeEDU

FreeEDU is a static-first public study-material library built with Astro, TypeScript catalogs, JSON/JSONL source data, content-addressed PDF assets, Pagefind metadata search, and Cloudflare Pages/R2 deployment plumbing.

## Catalogs

Canonical data lives in:

- `content/subjects.json`
- `content/topics.jsonl`
- `content/materials.jsonl`
- `content/assets.jsonl`
- `content/redirects.jsonl`

Deleted material records remain in `materials.jsonl` so IDs and slugs stay reserved. Public pages and Pagefind-visible content are generated only for `status: "published"` records.

## Asset model

PDF assets are addressed by SHA-256. Public objects use `files/<sha256>.pdf`; archived objects use `archive/<sha256>.pdf`. The ingestion CLI validates PDF magic bytes, size, hashes, upload verification, lock-protected catalog updates, replacement safety, reconciliation, and post-deployment garbage collection.

## Commands

```bash
npm run validate
npm test
npm run build
npm run budget
npm run headers
npm run reconcile
npm run ingest -- add --file ./guide.pdf --id mat-new --slug new-guide --title "New Guide" --description "..." --subject subj-math --topics topic-algebra
```

## Verification note

Cloudflare Pages, Cloudflare R2, CDN cache headers, and GitHub Actions behavior require external platform verification. Local tests use filesystem-backed R2 mocks and catalog fixtures.
