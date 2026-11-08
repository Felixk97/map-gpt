// Netlify Functions v2 adapter around the existing Lapan Worker.
// Keeps one routing/asset implementation rather than rewriting each API.
import worker from '../../dist/server/index.mjs';

export default async function handler(request) {
  try {
    // The Worker expects env bindings as its second argument.
    // Secrets are supplied through Netlify's Environment variables UI.
    // Cloudflare D1 / RATE_LIMITER bindings do not exist on Netlify.
    return await worker.fetch(request, process.env);
  } catch (error) {
    console.error('Lapan Netlify adapter failure:', error?.message || error);
    return Response.json({ error: 'Application service unavailable' }, { status: 503 });
  }
}
