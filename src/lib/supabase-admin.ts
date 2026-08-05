import {createClient} from '@supabase/supabase-js'
import {env} from './env'
let client:ReturnType<typeof createClient>|null=null
export function supabaseAdmin(){if(!client){const e=env();client=createClient(e.NEXT_PUBLIC_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})}return client}
