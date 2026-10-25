'use client';
import { useActionState,useEffect,useRef,useId,type ReactNode } from 'react';
import { X,LoaderCircle } from 'lucide-react';
import { mutate,authenticate } from '@/lib/actions';
import type { ActionState } from '@/lib/types';
export function MutationForm({children,onDone,disabled=false,className='',submitLabel='Save changes',onCancel}:{children:ReactNode;onDone?:()=>void;disabled?:boolean;className?:string;submitLabel?:string;onCancel?:()=>void}) {
 const [state,action,pending]=useActionState<ActionState,FormData>(mutate,{});
 const doneRef=useRef(onDone);doneRef.current=onDone;
 useEffect(()=>{if(state.success)doneRef.current?.();},[state]);
 return <form action={action} className={'form-stack '+className}><fieldset disabled={pending||disabled}>{children}</fieldset>{state.error&&<p className="notice error" role="alert">{state.error}</p>}{state.success&&<p className="notice success" role="status">{state.success}</p>}{disabled&&<p className="muted small">Preview only. Connect the database to save changes.</p>}<div className="form-actions">{onCancel&&<button type="button" className="button" onClick={onCancel}>Cancel</button>}<button className="button primary" disabled={pending||disabled} type="submit">{pending?<><LoaderCircle size={16} className="spin"/> Saving…</>:submitLabel}</button></div></form>;
}
export function Modal({title,subtitle,children,onClose}:{title:string;subtitle?:string;children:ReactNode;onClose:()=>void}) {
 const titleId=useId();const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
 return <dialog ref={ref} aria-labelledby={titleId} className="modal" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal-header"><div><h2 id={titleId}>{title}</h2>{subtitle&&<p className="muted">{subtitle}</p>}</div><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}</dialog>;
}
export function AuthForm({mode}:{mode:'login'|'reset'|'password'}) {
 const [state,action,pending]=useActionState<ActionState,FormData>(authenticate,{});
 return <form action={action} className="form-stack"><input type="hidden" name="mode" value={mode}/>{mode!=='password'&&<label>Email address<input autoComplete="email" type="email" name="email" required placeholder="you@company.com"/></label>}{mode!=='reset'&&<label>{mode==='password'?'New password':'Password'}<input type="password" name="password" minLength={mode==='password'?10:1} required autoComplete={mode==='password'?'new-password':'current-password'} placeholder={mode==='password'?'At least 10 characters':'Enter your password'}/></label>}{mode==='password'&&<label>Confirm password<input type="password" name="confirm_password" required minLength={10} autoComplete="new-password"/></label>}{state.error&&<p className="notice error" role="alert">{state.error}</p>}{state.success&&<p className="notice success" role="status">{state.success}</p>}<button className="button primary" disabled={pending}>{pending?'Please wait…':mode==='login'?'Sign in to workspace':mode==='reset'?'Send recovery email':'Set password'}</button></form>;
}
