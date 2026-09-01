import { loadCatalog } from '../src/lib/catalog.ts';
import { createDeploymentManifest, writeDeploymentManifest } from '../src/lib/manifest.ts';
const manifest = createDeploymentManifest(loadCatalog());
writeDeploymentManifest('deployed-assets.json', manifest);
console.log(`generated deployment manifest for ${manifest.assetIds.length} public asset(s)`);
