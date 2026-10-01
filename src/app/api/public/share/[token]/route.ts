import { readTempShare } from "@/lib/temp-share";

/**
 * Sert une image prêtée par un lien temporaire (voir `lib/temp-share.ts`).
 * Publique par conception : c'est un service tiers qui vient la lire. Le jeton
 * est imprévisible et s'éteint tout seul.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = /^[A-Za-z0-9_-]{20,64}$/.test(token) ? readTempShare(token) : null;
  if (!share) return new Response("Lien expiré", { status: 404 });

  return new Response(new Uint8Array(share.buffer), {
    headers: {
      "Content-Type": share.mimeType,
      "Content-Length": String(share.buffer.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, noimageindex",
      "Content-Disposition": "inline",
    },
  });
}
