import fs from 'node:fs';
import { publicMaterials, type Catalog } from './catalog.ts';

export type DeploymentManifest = { version: 1; generatedAt: string; assetIds: string[]; storageKeys: string[] };
export function createDeploymentManifest(catalog: Catalog): DeploymentManifest {
  const ids = [...new Set(publicMaterials(catalog).map((material) => material.assetId))].sort();
  const assets = ids.map((id) => { const asset = catalog.assets.find((entry) => entry.id === id); if (!asset || asset.status !== 'available') throw new Error(`manifest cannot include unavailable asset ${id}`); return asset; });
  const generatedAt = [...publicMaterials(catalog).map((material) => material.updatedAt), ...assets.map((asset) => asset.updatedAt)].sort().at(-1);
  if (!generatedAt) throw new Error('manifest requires at least one published material');
  return { version: 1, generatedAt, assetIds: ids, storageKeys: assets.map((asset) => asset.storageKey) };
}
export function writeDeploymentManifest(file: string, manifest: DeploymentManifest) { fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`); }
export function readDeploymentManifest(file: string): DeploymentManifest { const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as DeploymentManifest; if (parsed.version !== 1 || !Array.isArray(parsed.assetIds) || !Array.isArray(parsed.storageKeys)) throw new Error(`invalid deployment manifest ${file}`); return parsed; }
