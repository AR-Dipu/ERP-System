import 'server-only';
import { redirect } from 'next/navigation';
import { db, configured } from './supabase';
import { demo } from './demo';
import type { Data, Member } from './types';
export async function session() {
 const client=await db();
 const {data:{user},error}=await client.auth.getUser();
 if(error || !user) redirect('/login');
 const {data:member}=await client.from('members').select('*').eq('id',user.id).eq('active',true).single();
 if(!member) redirect('/login?message=Your%20account%20has%20no%20active%20team%20membership.%20Contact%20your%20administrator.');
 return {client,user,member:member as Member};
}
export async function loadData():Promise<Data> {
 if(!configured()) return demo;
 const {client,user,member}=await session();
 async function all(table:string) {
  const result:Record<string,unknown>[]=[];
  // Explicit pagination avoids silently truncating Supabase's default 1,000 rows.
  for(let start=0;;start+=1000){let query=client.from(table).select('*').order(table==='product_suppliers'?'product_id':'id');if(table==='product_suppliers')query=query.order('company_id');const {data,error}=await query.range(start,start+999);if(error)throw new Error('Could not load '+table+'. Check the database migration and connection.');result.push(...data);if(data.length<1000)break;}
  return result;
 }
 const [products,companies,categories,suppliers,movements,members]=await Promise.all(['products','companies','categories','product_suppliers','movements','members'].map(all));
 const result={products,companies,categories,suppliers,movements,members,email:user.email??'',role:member.role,demo:false} as unknown as Data;
 result.movements.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
 await Promise.all(result.products.filter(p=>p.photo_path).map(async p=>{const {data}=await client.storage.from('product-photos').createSignedUrl(p.photo_path!,3600);p.photo_url=data?.signedUrl;}));
 return result;
}

