type R2Object = { body: ReadableStream; httpEtag: string };
type Env = { PDF_BUCKET: { get(key: string): Promise<R2Object | null> } };
const hash = /^[a-f0-9]{64}$/;
export const onRequestGet = async ({ env, params }: { env: Env; params: Record<string, string | string[]> }) => {
  const value = Array.isArray(params.hash) ? params.hash[0] : params.hash;
  if (!value || !hash.test(value)) return new Response('Not found', { status: 404 });
  const object = await env.PDF_BUCKET.get(`files/${value}.pdf`);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', ETag: object.httpEtag } });
};
