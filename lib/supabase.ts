import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
export function configured() { return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY); }
export async function db() {
 const jar = await cookies();
 return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{cookies:{getAll:()=>jar.getAll(),setAll:entries=>{try { entries.forEach(({name,value,options})=>jar.set(name,value,options)); } catch { /* Server component cookies are refreshed by proxy. */ }}}});
}
export function serviceDb() { if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Team invitations require SUPABASE_SERVICE_ROLE_KEY on the server.'); return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}); }
export function appUrl() { const url = process.env.APP_URL; if(!url) throw new Error('Set APP_URL before sending account emails.'); return new URL(url).origin; }

