const SKIN_API_BASE =
  process.env.MINECRAFT_SKIN_API_URL || "http://localhost:3089";

/**
 * Build a full URL to the minecraft-skin-api microservice.
 */
export function getSkinApiUrl(
  path: string,
  params?: Record<string, string>
): string {
  const url = new URL(path, SKIN_API_BASE);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }
  return url.toString();
}

/**
 * Proxy a PNG image from the minecraft-skin-api microservice.
 * Returns a Response ready to be sent to the client.
 */
export async function proxySkinApiImage(
  path: string,
  params: Record<string, string>
): Promise<Response> {
  const url = getSkinApiUrl(path, params);
  const upstream = await fetch(url);

  if (!upstream.ok) {
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const contentType = upstream.headers.get("content-type") || "image/png";
  const buffer = await upstream.arrayBuffer();

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=300",
    },
  });
}

/**
 * Proxy a JSON response from the minecraft-skin-api microservice.
 */
export async function proxySkinApiJson(
  path: string,
  params?: Record<string, string>
): Promise<Response> {
  const url = getSkinApiUrl(path, params);
  const upstream = await fetch(url);
  const body = await upstream.text();

  return new Response(body, {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
    },
  });
}
