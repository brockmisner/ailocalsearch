import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { DuoPlusClient } from '@/lib/duoplus';
import { ProxySellerClient } from '@/lib/proxy-seller';

export async function POST(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createAdminClient();
  const { data: jobs, error } = await supabase.rpc('claim_scan_jobs', { p_limit: 5 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const duo = new DuoPlusClient();
  const proxies = new ProxySellerClient();
  const results = [];
  for (const job of jobs ?? []) {
    try {
      const { data: device } = await supabase.rpc('claim_android_device', { p_job_id: job.id });
      if (!device?.phone_id) throw new Error('No Android device available');
      const proxy = await proxies.allocate({ country: job.country_code ?? 'US', city: job.city ?? undefined, postalCode: job.postal_code ?? undefined, sessionId: job.id });
      await duo.configureDevice({ phoneId: device.phone_id, latitude: Number(job.latitude), longitude: Number(job.longitude), proxy });
      const task = await duo.startMapsTask({ phoneId: device.phone_id, keyword: job.keyword, scanPointId: job.point_id, latitude: Number(job.latitude), longitude: Number(job.longitude), callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/duoplus` });
      await supabase.from('scan_jobs').update({ status: 'dispatched', provider_task_id: task.taskId, phone_id: device.phone_id, proxy_session_id: proxy.id, dispatched_at: new Date().toISOString() }).eq('id', job.id);
      results.push({ id: job.id, dispatched: true });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unknown dispatch error';
      await supabase.rpc('fail_or_retry_scan_job', { p_job_id: job.id, p_error: message });
      results.push({ id: job.id, dispatched: false, error: message });
    }
  }
  return NextResponse.json({ claimed: jobs?.length ?? 0, results });
}
