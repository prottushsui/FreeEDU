# FreeEDU

FreeEDU is a static-first public study-material library. Astro generates the public HTML and Pagefind indexes only material-page metadata; PDF bodies are deliberately not indexed.

## Deterministic local setup

The committed lockfile is authoritative. Use Node `24.15.0` and npm `11.4.2` (also declared in `.nvmrc` and `package.json`).

```sh
npm ci
npm run typecheck
npm run validate
npm test
npm run build
npm run budget
```

The canonical catalog is `content/subjects.json`, `content/topics.jsonl`, `content/materials.jsonl`, `content/assets.jsonl`, and `content/redirects.jsonl`. Runtime Zod schemas and cross-catalog/integrity validation live in `src/lib/catalog.ts`; no duplicate JavaScript catalog implementation exists.

## Storage and public downloads

`.storage/r2` is a checked-in **local test fixture only**. It is never the production R2 implementation. In production, the Pages Function at `functions/r2/files/[hash].ts` handles `/r2/files/<sha256>.pdf`, fetches only a strict content-addressed `files/` key from the `PDF_BUCKET` R2 binding, and never exposes `archive/`.

Configure the following outside source control:

| Value | Location | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | GitHub secret | Wrangler Pages/R2 deployment credentials |
| `CLOUDFLARE_PAGES_PROJECT` | GitHub secret | Cloudflare Pages project name |
| `R2_BUCKET_NAME` | GitHub variable | Bucket selected by production upload/verification |
| `PUBLIC_SITE_URL` | GitHub variable and build environment | HTTPS public origin for Astro canonical URLs and smoke tests |
| `PDF_BUCKET` | Cloudflare Pages production binding | R2 bucket binding for the Pages Function |

`PUBLIC_SITE_URL` is intentionally not hard-coded: builds without it have no invented production canonical origin. Configure the same value in the Pages build environment and GitHub variable. The `PDF_BUCKET` binding must be configured in the Cloudflare Pages project; it is not a secret.

## Lifecycle commands

```sh
npm run ingest -- add --file guide.pdf --id material-id --slug guide --title Guide --description '...' --subject subject-id --topics topic-id
npm run ingest -- replace material-id replacement.pdf
npm run ingest -- delete material-id
npm run reconcile
npm run manifest
```

The ingestion CLI locks catalog writes, validates PDF magic bytes and size, derives SHA-256 identity, verifies local fixture writes, atomically writes catalogs, and restores a matching archived local-test asset before publishing it. Failed local catalog updates restore catalog bytes and remove a newly-created fixture object. Identical bytes reuse one asset record regardless of filename.

`npm run ingest -- gc` is deliberately conservative and local-fixture-only: it requires both a deployed manifest and `--confirm-deployment verified`, preserves published and deployed references, observes a 30-day default retention period, and archives rather than deletes. Production archival is intentionally not automatic CI because changing R2 object state without atomically committing the corresponding catalog transition would be unsafe. Perform it as a reviewed, post-deployment catalog transaction.

## Production pipeline

Pull requests run deterministic install, typecheck, tests, catalog/integrity validation, reconciliation, static build/Pagefind, and budget checks. Only a push to `main` can deploy production. The deployment job creates the manifest from published catalog references, uploads and byte-verifies every manifest R2 object through Wrangler, deploys Pages, smoke-tests HTML/redirect/deleted-route/PDF behavior, and re-verifies R2 bytes. A failed pre-deploy stage cannot reach deployment; no destructive GC occurs after a failed deploy or smoke test.

The local fixture validates real file bytes and the R2 upload script is implemented, but real Cloudflare Pages, R2 binding, upload, deployment, and public CDN behavior require configured external infrastructure and have not been asserted by this repository alone.
