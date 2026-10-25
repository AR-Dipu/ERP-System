'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db, configured, serviceDb, appUrl } from './supabase';
import { session } from './data';
import { companySchema,productSchema,stockSchema } from './domain';
import type { ActionState } from './types';
function message(error:unknown) { if(error instanceof z.ZodError)return error.issues.map(i=>i.message).join(' '); const text=error instanceof Error?error.message: typeof error==='object'&&error&&'message' in error ? String(error.message):'Unable to save. Please try again.'; if(text.includes('products_code_unique'))return 'This product code is already in use.'; return text; }
function check(error: {message:string}|null) { if(error)throw new Error(error.message); }
export async function mutate(_:ActionState,form:FormData):Promise<ActionState> {
 if(!configured())return {error:'This is a read-only preview. Connect Supabase to save real records.'};
 const {client,member}=await session();
 if(member.role!=='admin')return {error:'Administrator access required.'};
 try {
  const op=String(form.get('op')); const raw=Object.fromEntries(form);
  if(op==='company') {
   const value=companySchema.parse({...raw,manufacturer:form.has('manufacturer'),supplier:form.has('supplier')});
   const {id,...fields}=value;
   const {error}=id?await client.from('companies').update(fields).eq('id',id):await client.from('companies').insert(fields);check(error);
  } else if(op==='product') {
   const value=productSchema.parse({...raw,suppliers:form.getAll('suppliers')});
   const id=value.id??crypto.randomUUID();
   let photo_path:string|null=null;
   if(value.id){const {data,error}=await client.from('products').select('photo_path').eq('id',id).single();check(error);photo_path=data?.photo_path??null;}
   const file=form.get('photo'); let uploaded:string|null=null;
   if(file instanceof File && file.size) {
    if(file.size>5*1024*1024)throw new Error('Photo must be smaller than 5 MB.');
    const bytes=new Uint8Array(await file.arrayBuffer());
    const type=file.type;
    const valid=(type==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||(type==='image/png'&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)||(type==='image/webp'&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP');
    if(!valid)throw new Error('Upload a valid JPEG, PNG, or WebP image.');
    uploaded=id+'/'+crypto.randomUUID()+'.'+(type==='image/jpeg'?'jpg':type==='image/png'?'png':'webp');
    const {error}=await client.storage.from('product-photos').upload(uploaded,bytes,{contentType:type});check(error);photo_path=uploaded;
   } else if(form.has('remove_photo'))photo_path=null;
   const {error}=await client.rpc('save_product',{p:{...value,id,photo_path}});
   if(error){if(uploaded)await client.storage.from('product-photos').remove([uploaded]);check(error);}
  } else if(op==='stock') {
   const value=stockSchema.parse(raw);
   const {error}=await client.rpc('record_stock',{p_product:value.product_id,p_request:value.request_id,p_kind:value.kind,p_quantity:value.quantity,p_reason:value.reason});check(error);
  } else if(op==='archive-product') {
   const id=z.uuid().parse(form.get('id'));const {error}=await client.rpc('archive_product',{p_id:id,p_archived:form.get('archived')==='true'});check(error);
  } else if(op==='trash-product') {
   const id=z.uuid().parse(form.get('id'));
   const trashed=z.enum(['true','false']).parse(form.get('trashed'))==='true';
   const {error}=await client.rpc('trash_product',{p_id:id,p_trashed:trashed});check(error);
  } else if(op==='archive-company') {
   const id=z.uuid().parse(form.get('id'));const {error}=await client.from('companies').update({archived:form.get('archived')==='true'}).eq('id',id);check(error);
  } else if(op==='member') {
   const id=z.uuid().parse(form.get('id')); const role=z.enum(['admin','viewer']).parse(form.get('role'));
   const {error}=await client.rpc('change_member',{p_id:id,p_role:role,p_active:form.get('active')==='true'});check(error);
  } else if(op==='invite') {
   const email=z.email().parse(String(form.get('email')).trim().toLowerCase());const role=z.enum(['admin','viewer']).parse(form.get('role'));
   const privileged=serviceDb();
   const {data:existing}=await privileged.from('members').select('id').ilike('email',email).maybeSingle();
   if(existing)throw new Error('This email already belongs to a team member. Manage their access below.');
   const {data,error}=await privileged.auth.admin.inviteUserByEmail(email,{redirectTo:appUrl()+'/auth/callback?next=/password'});check(error);
   if(!data.user)throw new Error('The invitation could not be created.');
   const {error:saveError}=await privileged.from('members').insert({id:data.user.id,email,role,active:true});
   if(saveError){await privileged.auth.admin.deleteUser(data.user.id);throw new Error('Membership could not be saved. Please send a new invitation.');}
  } else throw new Error('Unknown operation.');
 } catch(error) { return {error:message(error)}; }
 revalidatePath('/','layout');
 return {success:'Saved successfully.'};
}
export async function authenticate(_:ActionState,form:FormData):Promise<ActionState> {
 if(!configured())return {error:'Connect Supabase first. See the setup instructions in README.md.'};
 const client=await db(); const mode=String(form.get('mode'));
 try {
  if(mode==='reset') {
   const email=z.email().parse(String(form.get('email')).trim());
   const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:appUrl()+'/auth/callback?next=/password'});check(error);
   return {success:'If an account exists, you will receive a password reset email.'};
  }
  const password=z.string().min(mode==='password'?10:1,'Use at least 10 characters.').max(128).parse(form.get('password'));
  if(mode==='password') {
   const {data:{user}}=await client.auth.getUser();if(!user)return {error:'Open your invitation or password reset link again.'};
   if(password!==form.get('confirm_password'))return {error:'The passwords do not match.'};
   const {error}=await client.auth.updateUser({password});check(error);
  } else {
   const email=z.email().parse(String(form.get('email')).trim());
   const {error}=await client.auth.signInWithPassword({email,password});
   if(error)return {error:'Sign-in failed. Check your email and password.'};
  }
 } catch(error){return {error:message(error)};}
 redirect('/dashboard');
}
export async function signOut() {if(configured()){const client=await db();await client.auth.signOut();}redirect('/login');}


