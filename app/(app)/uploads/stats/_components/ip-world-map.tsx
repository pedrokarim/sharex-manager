"use client";

import { useState, memo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
  Marker,
} from "react-simple-maps";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/lib/i18n";
import type { GeoMarker } from "@/lib/types/geo";

const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

interface IPWorldMapProps {
  markers: GeoMarker[];
}

function IPWorldMapInner({ markers }: IPWorldMapProps) {
  const { t } = useTranslation();
  const [tooltip, setTooltip] = useState<{
    content: string;
    x: number;
    y: number;
  } | null>(null);

  // Scale marker size proportionally
  const maxCount = Math.max(...markers.map((m) => m.count), 1);
  const getMarkerSize = (count: number) => {
    const minSize = 4;
    const maxSize = 18;
    return minSize + (count / maxCount) * (maxSize - minSize);
  };

  return (
    <Card>
      <CardHeader className="pb-2 px-4 pt-4 sm:px-5">
        <CardTitle className="text-sm sm:text-base font-semibold">
          {t("uploads.stats.network.world_map")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 pt-0 relative">
        <div className="w-full aspect-[2/1] rounded-lg overflow-hidden border bg-muted/20">
          <ComposableMap
            projectionConfig={{
              rotate: [-10, 0, 0],
              scale: 147,
            }}
            style={{ width: "100%", height: "100%" }}
          >
            <ZoomableGroup>
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill="var(--muted)"
                      stroke="var(--border)"
                      strokeWidth={0.5}
                      style={{
                        default: { outline: "none" },
                        hover: { outline: "none", fill: "var(--accent)" },
                        pressed: { outline: "none" },
                      }}
                    />
                  ))
                }
              </Geographies>
              {markers.map((marker, index) => (
                <Marker
                  key={`${marker.lat}-${marker.lon}-${index}`}
                  coordinates={[marker.lon, marker.lat]}
                  onMouseEnter={(e) => {
                    const rect = (
                      e.target as SVGElement
                    ).closest("svg")?.getBoundingClientRect();
                    if (rect) {
                      setTooltip({
                        content: `${marker.city}, ${marker.country} — ${marker.count} uploads`,
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top - 10,
                      });
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  <circle
                    r={getMarkerSize(marker.count)}
                    fill="var(--chart-1)"
                    fillOpacity={0.6}
                    stroke="var(--chart-1)"
                    strokeWidth={1.5}
                    strokeOpacity={0.8}
                    className="cursor-pointer transition-all hover:fill-opacity-80"
                  />
                </Marker>
              ))}
            </ZoomableGroup>
          </ComposableMap>

          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute pointer-events-none bg-popover text-popover-foreground border rounded-md px-3 py-1.5 text-xs shadow-md z-50 whitespace-nowrap"
              style={{
                left: tooltip.x,
                top: tooltip.y,
                transform: "translate(-50%, -100%)",
              }}
            >
              {tooltip.content}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export const IPWorldMap = memo(IPWorldMapInner);
