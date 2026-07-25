import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createGeoGrid } from '@/lib/geo-grid';
import { createAdminClient } from '@/lib/supabase-admin';

const Input = z.object({ campaignId: z.string().uuid(), keyword: z.string().trim().min(2).max(150), centerLatitude: z.number().min(-90).max(90), centerLongitude: z.number().min(-180).max(180), gridSize: z.number().int().min(3).max(15).refine(v => v % 2 === 1), spacingKm: z.number().positive().max(25), targetName: z.string().trim().min(2).max(200), targetPlaceId: z.string().trim().max(300).optional() });

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createAdminClient();
  const token = authorization.slice(7);
  const { data: auth, error: authError } = await supabase.auth.getUser(token);
  if (authError || !auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  const input = parsed.data;
  const { data: campaign } = await supabase.from('campaigns').select('id,organization_id').eq('id', input.campaignId).single();
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  const { data: member } = await supabase.from('organization_members').select('role').eq('organization_id', campaign.organization_id).eq('user_id', auth.user.id).maybeSingle();
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const points = createGeoGrid(input.centerLatitude, input.centerLongitude, input.gridSize, input.spacingKm);
  const idempotencyKey = request.headers.get('idempotency-key') ?? crypto.randomUUID();
  const { data, error } = await supabase.rpc('create_scan_with_points', { p_organization_id: campaign.organization_id, p_campaign_id: input.campaignId, p_keyword: input.keyword, p_target_name: input.targetName, p_target_place_id: input.targetPlaceId ?? null, p_center_latitude: input.centerLatitude, p_center_longitude: input.centerLongitude, p_grid_size: input.gridSize, p_spacing_km: input.spacingKm, p_idempotency_key: idempotencyKey, p_points: points });
  if (error) return NextResponse.json({ error: error.message }, { status: error.message.includes('credits') ? 402 : 500 });
  return NextResponse.json(data, { status: 202 });
}
