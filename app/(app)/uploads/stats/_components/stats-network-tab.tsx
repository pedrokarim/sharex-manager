"use client";

import { useEffect, useState, lazy, Suspense } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTranslation } from "@/lib/i18n";
import { TopIpsChart } from "./top-ips-chart";
import type { GeoStatsResponse } from "@/lib/types/geo";

const IPWorldMap = lazy(() =>
  import("./ip-world-map").then((mod) => ({ default: mod.IPWorldMap }))
);

export function StatsNetworkTab() {
  const { t } = useTranslation();
  const [data, setData] = useState<GeoStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchGeoStats() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch("/api/stats/geo");
        if (!response.ok) throw new Error("Erreur lors du chargement");
        const result: GeoStatsResponse = await response.json();
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Erreur inconnue"
          );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchGeoStats();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  return (
    <div className="grid gap-4 sm:gap-6">
      {data.rateLimited && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t("uploads.stats.network.rate_limited")}
          </AlertDescription>
        </Alert>
      )}

      <TopIpsChart topIps={data.topIps} />

      {data.geoMarkers.length > 0 && (
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <IPWorldMap markers={data.geoMarkers} />
        </Suspense>
      )}
    </div>
  );
}
