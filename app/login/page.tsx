import Link from 'next/link';
import { Package,LockKeyhole } from 'lucide-react';
import { AuthForm } from '@/components/forms';
import {configured} from '@/lib/supabase';
export default async function Login({searchParams}:{searchParams:Promise<{mode?:string;message?:string}>}){
 const params=await searchParams;const reset=params.mode==='reset';
 return <main className="auth-page"><Link href="/" className="brand auth-brand"><span className="brand-icon"><Package size={28}/></span><span className="brand-name">ERP System</span></Link><section className="auth-card"><div className="auth-symbol"><LockKeyhole size={25}/></div><h1>{reset?'Reset your password':'Welcome back'}</h1><p className="muted auth-description">{reset?'Enter your account email to receive a secure recovery link.':'Sign in to manage your products, partners, and inventory.'}</p>{params.message&&<p className="notice error" role="alert">{params.message}</p>}<AuthForm mode={reset?'reset':'login'}/><Link className="text-link auth-recovery" href={reset?'/login':'/login?mode=reset'}>{reset?'Back to sign in':'Forgot your password?'}</Link><div className="auth-account-note">Accounts are invitation only. Contact your administrator for access.</div>{!configured()&&<div className="notice"><strong>Database setup pending</strong><p>Explore the workspace with read-only sample records.</p><Link className="text-link" href="/dashboard">Open preview →</Link></div>}</section><p className="auth-footer"><LockKeyhole size={13}/> Private workspace · ERP System</p></main>;
}
