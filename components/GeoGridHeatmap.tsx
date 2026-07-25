'use client';
import { useMemo } from 'react';

type Point = { id: string; row_number: number; column_number: number; target_rank: number | null; status: string; screenshot_path?: string | null };
function background(rank: number | null, status: string) { if (status === 'failed') return '#64748b'; if (rank === null) return '#dc2626'; if (rank <= 3) return '#059669'; if (rank <= 10) return '#d97706'; if (rank <= 20) return '#ea580c'; return '#dc2626'; }
export function GeoGridHeatmap({ points, onInspect }: { points: Point[]; onInspect?: (point: Point) => void }) {
  const size = useMemo(() => Math.max(0, ...points.map(p => p.column_number)) + 1, [points]);
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${size}, minmax(48px, 1fr))`, gap: 8 }} aria-label="Local ranking grid">{points.map(point => <button key={point.id} type="button" onClick={() => onInspect?.(point)} title={`Row ${point.row_number + 1}, column ${point.column_number + 1}: ${point.target_rank ? `rank ${point.target_rank}` : 'not found'}`} style={{ aspectRatio: '1', border: 0, borderRadius: 10, background: background(point.target_rank, point.status), color: 'white', fontWeight: 700, cursor: 'pointer' }}>{point.target_rank ?? '20+'}</button>)}</div>;
}
