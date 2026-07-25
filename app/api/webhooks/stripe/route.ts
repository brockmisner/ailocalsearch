import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY; const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !webhookSecret) return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 });
  const stripe = new Stripe(secret);
  const raw = await request.text();
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(raw, request.headers.get('stripe-signature') ?? '', webhookSecret); }
  catch { return NextResponse.json({ error: 'Invalid signature' }, { status: 400 }); }
  const supabase = createAdminClient();
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const organizationId = session.metadata?.organization_id;
    const credits = Number(session.metadata?.credits ?? 0);
    if (organizationId && Number.isInteger(credits) && credits > 0) await supabase.rpc('grant_credits', { organization_id_input: organizationId, amount_input: credits, entry_type_input: 'top_up', operation_input: 'stripe_checkout', reference_id_input: session.id, stripe_event_id_input: event.id, metadata_input: { payment_intent: session.payment_intent } });
  }
  return NextResponse.json({ received: true });
}
