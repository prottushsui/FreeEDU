import { defineConfig } from 'astro/config';
const site = process.env.PUBLIC_SITE_URL;
if (site && !/^https:\/\/[^/]+$/.test(site)) throw new Error('PUBLIC_SITE_URL must be an HTTPS origin without a path');
export default defineConfig({ output: 'static', ...(site ? { site } : {}) });
