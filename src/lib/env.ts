import {z} from 'zod'
const schema=z.object({NEXT_PUBLIC_SUPABASE_URL:z.string().url(),SUPABASE_SERVICE_ROLE_KEY:z.string().min(20),DUOPLUS_API_BASE:z.string().url(),DUOPLUS_API_KEY:z.string().min(8),DUOPLUS_RPA_TEMPLATE_ID:z.string().min(1),PROXY_SELLER_API_KEY:z.string().min(8),STRIPE_SECRET_KEY:z.string().optional(),STRIPE_PRICE_ID:z.string().optional(),APP_URL:z.string().url().default('http://localhost:3000'),CRON_SECRET:z.string().min(16)})
export function env(){return schema.parse(process.env)}
