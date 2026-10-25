import { type NextRequest,NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import type { EmailOtpType } from '@supabase/supabase-js';
export async function GET(request:NextRequest) {
 const url=new URL(request.url); const client=await db();
 const code=url.searchParams.get('code'); const hash=url.searchParams.get('token_hash');const type=url.searchParams.get('type');
 let error:unknown='Missing authentication token.';
 if(code)({error}=await client.auth.exchangeCodeForSession(code));
 else if(hash&&type&&['invite','recovery','email','magiclink','signup','email_change'].includes(type))({error}=await client.auth.verifyOtp({token_hash:hash,type:type as EmailOtpType}));
 if(error)return NextResponse.redirect(new URL('/login?message=This%20link%20has%20expired%20or%20is%20invalid.%20Please%20request%20a%20new%20one.',url.origin));
 const next=url.searchParams.get('next')==='/password'?'/password':'/dashboard';
 return NextResponse.redirect(new URL(next,url.origin));
}
