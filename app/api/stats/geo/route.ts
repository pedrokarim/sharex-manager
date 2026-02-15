import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAllHistory } from "@/lib/history";
import { batchResolveGeoIP, isPrivateIP } from "@/lib/geo-cache";
import type { GeoStatsResponse, TopIPEntry, GeoMarker } from "@/lib/types/geo";

export async function GET() {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const history = await getAllHistory();

    // Agréger par IP : count, totalSize, lastSeen
    const ipAggregation = new Map<
      string,
      { count: number; totalSize: number; lastSeen: string }
    >();

    for (const entry of history) {
      const ip = entry.ipAddress || "unknown";
      if (ip === "unknown") continue;

      const current = ipAggregation.get(ip) || {
        count: 0,
        totalSize: 0,
        lastSeen: "",
      };
      current.count++;
      current.totalSize += entry.fileSize;
      if (!current.lastSeen || entry.uploadDate > current.lastSeen) {
        current.lastSeen = entry.uploadDate;
      }
      ipAggregation.set(ip, current);
    }

    // Trier par count desc, prendre top 20
    const sortedIps = Array.from(ipAggregation.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20);

    const ipsToResolve = sortedIps.map(([ip]) => ip);

    // Résoudre la géoloc via le cache
    const { results: geoResults, rateLimited } =
      await batchResolveGeoIP(ipsToResolve);

    // Construire topIps
    const topIps: TopIPEntry[] = sortedIps.map(([ip, data]) => ({
      ip,
      count: data.count,
      totalSize: data.totalSize,
      lastSeen: data.lastSeen,
      geo: geoResults.get(ip) || null,
    }));

    // Construire les markers pour la carte (agrégés par coordonnées)
    const markerMap = new Map<string, GeoMarker>();

    for (const entry of topIps) {
      if (!entry.geo || entry.geo.isPrivate) continue;

      const key = `${entry.geo.lat.toFixed(2)},${entry.geo.lon.toFixed(2)}`;
      const existing = markerMap.get(key);

      if (existing) {
        existing.count += entry.count;
      } else {
        markerMap.set(key, {
          lat: entry.geo.lat,
          lon: entry.geo.lon,
          city: entry.geo.city,
          country: entry.geo.country,
          countryCode: entry.geo.countryCode,
          count: entry.count,
        });
      }
    }

    const geoMarkers = Array.from(markerMap.values());

    const response: GeoStatsResponse = {
      topIps,
      geoMarkers,
      rateLimited,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Erreur lors du calcul des stats géo:", error);
    return NextResponse.json(
      { error: "Erreur lors du calcul des statistiques géographiques" },
      { status: 500 }
    );
  }
}
