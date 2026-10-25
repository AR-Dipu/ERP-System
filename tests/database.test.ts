import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const admin='00000000-0000-4000-8000-000000000001';
const viewer='00000000-0000-4000-8000-000000000002';
const outsider='00000000-0000-4000-8000-000000000003';
const productId='10000000-0000-4000-8000-000000000001';
test('PostgreSQL migration, inventory transactions, and role policies',async t=>{
 const pg=new PGlite();
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 grant select,insert,update,delete on storage.objects to anon,authenticated;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 `);
 const sql=readFileSync(new URL('../supabase/migrations/202610250001_initial.sql',import.meta.url),'utf8').replace('create extension if not exists pgcrypto;','');
 await pg.exec(sql);
 const legacyId='20000000-0000-4000-8000-000000000001';
 await pg.query("insert into public.products(id,name,code,origin,unit,quantity,archived,photo_path) values($1,'Legacy product','LEGACY','Japan','pcs',12.5,true,$2)",[legacyId,legacyId+'/photo.png']);
 for(const file of readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')&&f!=='202610250001_initial.sql').sort())await pg.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await t.test('Trash migration preserves existing data and archive state',async()=>{
  const {rows}=await pg.query<{quantity:string;archived:boolean;deleted_at:string|null;photo_path:string}>('select quantity,archived,deleted_at,photo_path from public.products where id=$1',[legacyId]);
  assert.equal(Number(rows[0].quantity),12.5);assert.equal(rows[0].archived,true);assert.equal(rows[0].deleted_at,null);assert.equal(rows[0].photo_path,legacyId+'/photo.png');
 });
 await pg.query('delete from public.products where id=$1',[legacyId]);
 await pg.query('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)',[admin,'admin@example.com',viewer,'viewer@example.com',outsider,'outsider@example.com']);
 await pg.query("insert into public.members values($1,'admin@example.com','admin',true),($2,'viewer@example.com','viewer',true)",[admin,viewer]);
 async function asUser(id:string,role='authenticated'){await pg.exec('reset role');await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await pg.exec('set role '+role);}
 async function count(table:string){return Number((await pg.query<{n:number}>('select count(*) as n from '+table)).rows[0].n);}
 const product={id:productId,name:'Precision bearing',code:'BRG-1',origin:'Japan',unit:'kg',notes:'',category:'Components',manufacturer_id:null,purchase_price:1.5,selling_price:2,low_stock:2,photo_path:productId+'/photo.png',suppliers:[]};
 async function stock(kind:string,quantity:number,request=crypto.randomUUID()){return pg.query('select public.record_stock($1,$2,$3,$4,$5) as id',[productId,request,kind,quantity,'Test stock']);}
 await t.test('admin can create and edit products with categories and suppliers',async()=>{
  await asUser(admin);
  const {rows}=await pg.query<{id:string}>("insert into public.companies(name,country,manufacturer,supplier) values('Supplier','USA',false,true) returning id");
  await pg.query('select public.save_product($1::jsonb)',[JSON.stringify({...product,suppliers:[rows[0].id]})]);
  assert.equal(await count('public.products'),1);assert.equal(await count('public.product_suppliers'),1);
  await pg.query('select public.save_product($1::jsonb)',[JSON.stringify({...product,name:'Edited bearing',suppliers:[rows[0].id]})]);
  assert.equal(await count('public.categories'),1);
 });
 await t.test('database rejects subcent prices and overprecise stock thresholds',async()=>{
  await assert.rejects(pg.query('select public.save_product($1::jsonb)',[JSON.stringify({...product,purchase_price:1.001})]),/2 decimal places/);
  await assert.rejects(pg.query('select public.save_product($1::jsonb)',[JSON.stringify({...product,low_stock:0.0001})]),/3 decimal places/);
 });
 await t.test('case-insensitive product codes are unique',async()=>{
  await assert.rejects(pg.query('select public.save_product($1::jsonb)',[JSON.stringify({...product,id:crypto.randomUUID(),code:'brg-1',photo_path:null})]),/products_code_unique/);
  assert.equal(await count('public.products'),1);
 });
 await t.test('opening stock, fractional issues, receipts, and adjustments preserve balances',async()=>{
  await stock('opening',10.5);await stock('issue',2.125);await stock('receipt',1);await stock('adjustment',-0.375);
  const {rows}=await pg.query<{quantity:string}>('select quantity from public.products where id=$1',[productId]);assert.equal(Number(rows[0].quantity),9);
  assert.equal(await count('public.movements'),4);
 });
 await t.test('stock unit cannot change after quantities have been recorded',async()=>{
  await assert.rejects(pg.query('select public.save_product($1::jsonb)',[JSON.stringify({...product,unit:'pcs'})]),/stock unit cannot change/);
 });
 await t.test('insufficient stock and repeated opening fail without changing ledger',async()=>{
  await assert.rejects(stock('issue',10),/Insufficient stock/);await assert.rejects(stock('opening',1),/first movement/);assert.equal(await count('public.movements'),4);
 });
 await t.test('duplicate request is idempotent; changed payload is rejected',async()=>{
  const request=crypto.randomUUID();await stock('receipt',2,request);await stock('receipt',2,request);assert.equal(await count('public.movements'),5);await assert.rejects(stock('receipt',3,request),/already been used/);
 });
 await t.test('overlapping issue submissions cannot create negative stock',async()=>{
  const results=await Promise.allSettled([stock('issue',8),stock('issue',8)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const {rows}=await pg.query<{quantity:string}>('select quantity from public.products where id=$1',[productId]);assert.equal(Number(rows[0].quantity),3);
 });
 await t.test('direct balance editing and ledger mutation are denied, including for admins',async()=>{
  await assert.rejects(pg.exec('update public.products set quantity=999'),/permission denied/);await assert.rejects(pg.exec('delete from public.movements'),/permission denied/);await assert.rejects(pg.exec('truncate public.movements'),/permission denied/);
 });
 await t.test('archiving preserves ledger and blocks new stock until restored',async()=>{
  await pg.query('select public.archive_product($1,true)',[productId]);await assert.rejects(stock('receipt',1),/active product/);assert.equal(await count('public.movements'),6);await pg.query('select public.archive_product($1,false)',[productId]);
 });
 await t.test('Trash preserves quantity, photo, company links, and history; retries are idempotent',async()=>{
  const {rows:before}=await pg.query<Record<string,unknown>>('select * from public.products where id=$1',[productId]);
  const suppliers=await count('public.product_suppliers');const ledger=await count('public.movements');
  await pg.query('select public.trash_product($1,true)',[productId]);
  const {rows:first}=await pg.query<{deleted_at:Date}>('select deleted_at from public.products where id=$1',[productId]);
  await pg.query('select public.trash_product($1,true)',[productId]);
  const {rows:after}=await pg.query<Record<string,unknown>>('select * from public.products where id=$1',[productId]);
  assert.ok(after[0].deleted_at);assert.equal(String(after[0].deleted_at),String(first[0].deleted_at));
  for(const field of ['quantity','photo_path','archived','code','manufacturer_id','category_id'])assert.equal(after[0][field],before[0][field]);
  assert.equal(await count('public.product_suppliers'),suppliers);assert.equal(await count('public.movements'),ledger);
 });
 await t.test('trashed products cannot be edited, archived, or receive new stock',async()=>{
  await assert.rejects(pg.query('select public.save_product($1::jsonb)',[JSON.stringify(product)]),/from Trash/);
  await assert.rejects(pg.query('select public.archive_product($1,true)',[productId]),/from Trash/);
  await assert.rejects(stock('receipt',1),/active product/);
  await assert.rejects(stock('issue',1),/active product/);
  await assert.rejects(stock('adjustment',1),/active product/);
  assert.equal(await count('public.movements'),6);
 });
 await t.test('Trash restore returns active products to Active and archived products to Archived',async()=>{
  await pg.query('select public.trash_product($1,false)',[productId]);
  let row=(await pg.query<{archived:boolean;deleted_at:string|null}>('select archived,deleted_at from public.products where id=$1',[productId])).rows[0];assert.equal(row.archived,false);assert.equal(row.deleted_at,null);
  await pg.query('select public.archive_product($1,true)',[productId]);await pg.query('select public.trash_product($1,true)',[productId]);await pg.query('select public.trash_product($1,false)',[productId]);
  row=(await pg.query<{archived:boolean;deleted_at:string|null}>('select archived,deleted_at from public.products where id=$1',[productId])).rows[0];assert.equal(row.archived,true);assert.equal(row.deleted_at,null);
  await assert.rejects(stock('receipt',1),/active product/);await pg.query('select public.archive_product($1,false)',[productId]);
 });
 await t.test('Trash RPC rejects missing products and missing status',async()=>{
  await assert.rejects(pg.query('select public.trash_product($1,true)',[crypto.randomUUID()]),/not found/);
  await assert.rejects(pg.query('select public.trash_product($1,null)',[productId]),/Choose a Trash status/);
 });
 await t.test('last administrator cannot be removed',async()=>{await assert.rejects(pg.query("select public.change_member($1,'viewer',true)",[admin]),/at least one active administrator/);});
 await t.test('viewer reads shared data and photos but cannot write through tables or RPCs',async()=>{
  await asUser(admin);await pg.exec("insert into storage.objects(bucket_id,name) values('product-photos','test.png')");
  await asUser(viewer);await assert.rejects(pg.query('select public.trash_product($1,true)',[productId]),/Administrator/);await assert.rejects(pg.query('select public.trash_product($1,false)',[productId]),/Administrator/);assert.equal(await count('public.products'),1);assert.equal(await count('storage.objects'),1);assert.equal(await count('public.members'),1);
  await assert.rejects(stock('receipt',1),/Administrator/);await assert.rejects(pg.query('select public.save_product($1::jsonb)',[JSON.stringify(product)]),/Administrator/);await assert.rejects(pg.exec("insert into public.companies(name,country,supplier) values('Bad','JP',true)"),/row-level security/);await assert.rejects(pg.exec("insert into storage.objects(bucket_id,name) values('product-photos','bad.png')"),/row-level security/);
 });
 await t.test('uninvited and deactivated users cannot read business data or photos',async()=>{
  await asUser(outsider);assert.equal(await count('public.products'),0);assert.equal(await count('storage.objects'),0);
  await asUser(admin);await pg.query("select public.change_member($1,'viewer',false)",[viewer]);await asUser(viewer);await assert.rejects(pg.query('select public.trash_product($1,true)',[productId]),/Administrator/);assert.equal(await count('public.products'),0);assert.equal(await count('storage.objects'),0);await assert.rejects(stock('receipt',1),/Administrator/);
 });
 await t.test('anonymous access cannot read records or invoke stock RPC',async()=>{
  await asUser('','anon');await assert.rejects(pg.query('select public.trash_product($1,true)',[productId]),/permission denied/);assert.equal(await count('public.products'),0);assert.equal(await count('storage.objects'),0);await assert.rejects(stock('receipt',1),/permission denied/);
 });
 await pg.close();
});


