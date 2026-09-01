import { localObjectReader, validateCatalog } from '../src/lib/catalog.ts';
validateCatalog(process.cwd(), localObjectReader());
console.log('catalog and local fixture integrity validation passed');
