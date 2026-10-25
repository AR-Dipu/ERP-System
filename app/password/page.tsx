export const dynamic='force-dynamic';
import {AuthForm} from '@/components/forms';
import {db,configured} from '@/lib/supabase';
import {redirect} from 'next/navigation';
export default async function Password(){if(!configured())redirect('/login');const client=await db();const {data:{user}}=await client.auth.getUser();if(!user)redirect('/login?message=Open%20your%20invitation%20or%20recovery%20link%20first.');return <main className="auth-page single"><section className="auth-card"><span className="section-label">ERP System</span><h1>Set your password</h1><p className="muted">Use at least 10 characters for {user.email}.</p><AuthForm mode="password"/></section></main>;}

