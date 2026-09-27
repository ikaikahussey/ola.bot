// ZIP code centroids (public data bundled in the `zipcodes` package). Distances
// are straight-line between ZIP centroids, not driving distance.

import zipcodes, { type ZipInfo } from "zipcodes";

export function lookupZip(zip: string): ZipInfo | undefined {
  if (!/^\d{5}$/.test(zip)) return undefined;
  const z = zipcodes.lookup(zip);
  return z && z.country === "US" ? z : undefined;
}

export function haversineMiles(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

let usZips: ZipInfo[] | null = null;
function allUsZips(): ZipInfo[] {
  usZips ??= Object.values(zipcodes.codes).filter((z) => z.country === "US" && /^\d{5}$/.test(z.zip));
  return usZips;
}

/** Nearest ZIP centroid to a point (used for "use my location"; coordinates are not stored). */
export function nearestZip(lat: number, lon: number): ZipInfo | undefined {
  let best: ZipInfo | undefined;
  let bestD = Infinity;
  for (const z of allUsZips()) {
    const d = haversineMiles(lat, lon, z.latitude, z.longitude);
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return bestD < 50 ? best : undefined;
}

/** 3-digit ZIP prefixes that have any ZIP within the radius, nearest first. */
export function zipPrefixesWithin(center: ZipInfo, miles: number, max: number): string[] {
  const nearest = new Map<string, number>();
  for (const z of allUsZips()) {
    const d = haversineMiles(center.latitude, center.longitude, z.latitude, z.longitude);
    if (d > miles) continue;
    const p = z.zip.slice(0, 3);
    if (!nearest.has(p) || d < nearest.get(p)!) nearest.set(p, d);
  }
  if (!nearest.has(center.zip.slice(0, 3))) nearest.set(center.zip.slice(0, 3), 0);
  return [...nearest.entries()].sort((a, b) => a[1] - b[1]).slice(0, max).map(([p]) => p);
}
