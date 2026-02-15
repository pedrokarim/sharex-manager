export interface GeoIPResult {
  ip: string;
  country: string;
  countryCode: string;
  city: string;
  lat: number;
  lon: number;
  isp: string;
  isPrivate?: boolean;
}

export interface TopIPEntry {
  ip: string;
  count: number;
  totalSize: number;
  lastSeen: string;
  geo: GeoIPResult | null;
}

export interface GeoMarker {
  lat: number;
  lon: number;
  city: string;
  country: string;
  countryCode: string;
  count: number;
}

export interface GeoStatsResponse {
  topIps: TopIPEntry[];
  geoMarkers: GeoMarker[];
  rateLimited: boolean;
}
