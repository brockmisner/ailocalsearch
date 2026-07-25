export type GridPoint = { row: number; column: number; latitude: number; longitude: number };

const EARTH_RADIUS_KM = 6371.0088;

export function createGeoGrid(centerLat: number, centerLng: number, size: number, spacingKm: number): GridPoint[] {
  if (!Number.isInteger(size) || size < 3 || size > 15 || size % 2 === 0) throw new Error('Grid size must be an odd integer from 3 to 15');
  if (!Number.isFinite(spacingKm) || spacingKm <= 0 || spacingKm > 25) throw new Error('Spacing must be greater than 0 and at most 25 km');
  const middle = (size - 1) / 2;
  const latRadians = centerLat * Math.PI / 180;
  const latitudeDelta = spacingKm / 110.574;
  const longitudeDelta = spacingKm / (111.320 * Math.max(Math.cos(latRadians), 0.01));
  const points: GridPoint[] = [];
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) points.push({
    row,
    column,
    latitude: Number((centerLat + (row - middle) * latitudeDelta).toFixed(7)),
    longitude: Number((centerLng + (column - middle) * longitudeDelta).toFixed(7)),
  });
  return points;
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(x));
}

export function calculateMetrics(ranks: Array<number | null>, maxRank = 20) {
  const ranked = ranks.filter((rank): rank is number => Number.isInteger(rank) && rank > 0);
  const averageRank = ranked.length ? ranked.reduce((sum, rank) => sum + rank, 0) / ranked.length : null;
  const solv = ranks.length ? ranks.reduce((sum, rank) => sum + (rank ? Math.max(0, (maxRank + 1 - rank) / maxRank) : 0), 0) / ranks.length * 100 : 0;
  return { averageRank: averageRank === null ? null : Number(averageRank.toFixed(2)), shareOfLocalVoice: Number(solv.toFixed(2)), foundRate: ranks.length ? Number((ranked.length / ranks.length * 100).toFixed(2)) : 0 };
}
