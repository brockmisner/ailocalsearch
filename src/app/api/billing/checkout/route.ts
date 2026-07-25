import {NextResponse} from 'next/server'
import Stripe from 'stripe'
import {env} from '@/lib/env'
let stripe:Stripe|null=null
function client(){const e=env();if(!e.STRIPE_SECRET_KEY)throw new Error('Stripe is not configured');return stripe??=(new Stripe(e.STRIPE_SECRET_KEY))}
export async function POST(req:Request){try{const e=env();if(!e.STRIPE_PRICE_ID)throw new Error('STRIPE_PRICE_ID is missing');const {customerEmail}=await req.json();const session=await client().checkout.sessions.create({mode:'subscription',customer_email:customerEmail,line_items:[{price:e.STRIPE_PRICE_ID,quantity:1}],success_url:`${e.APP_URL}/?checkout=success`,cancel_url:`${e.APP_URL}/?checkout=cancelled`,allow_promotion_codes:true});return NextResponse.json({url:session.url})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Checkout failed'},{status:400})}}
