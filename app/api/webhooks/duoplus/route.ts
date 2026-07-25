import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-admin';

const Listing = z.object({ rank: z.number().int().positive().max(100), name: z.string().min(1), placeId: z.string().optional(), address: z.string().optional(), rating: z.number().optional(), reviewCount: z.number().int().nonnegative().optional() });
const Payload = z.object({ eventId: z.string().min(1), taskId: z.string().min(1), scanPointId: z.string().uuid(), status: z.enum(['completed','failed']), observedLatitude: z.number().optional(), observedLongitude: z.number().optional(), screenshotPath: z.string().optional(), uiDumpPath: z.string().optional(), screenshotSha256: z.string().optional(), listings: z.array(Listing).max(100).default([]), error: z.string().optional() });

function validSignature(raw: string, signature: string | null) {
  const secret = process.env.DUOPLUS_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected); const b = Buffer.from(signature.replace(/^sha256=/, ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get('x-duoplus-signature'))) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  const parsed = Payload.safeParse(JSON.parse(raw));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.rpc('complete_scan_point', { p_event_id: parsed.data.eventId, p_provider_task_id: parsed.data.taskId, p_point_id: parsed.data.scanPointId, p_status: parsed.data.status, p_observed_latitude: parsed.data.observedLatitude ?? null, p_observed_longitude: parsed.data.observedLongitude ?? null, p_screenshot_path: parsed.data.screenshotPath ?? null, p_ui_dump_path: parsed.data.uiDumpPath ?? null, p_screenshot_sha256: parsed.data.screenshotSha256 ?? null, p_listings: parsed.data.listings, p_error: parsed.data.error ?? null });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ received: true });
}
