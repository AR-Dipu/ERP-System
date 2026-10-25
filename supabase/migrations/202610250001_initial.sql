-- Atlas Stock ERP: one business, private membership, append-only inventory ledger.
create extension if not exists pgcrypto;
create table public.members (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null, role text not null check (role in ('admin','viewer')), active boolean not null default true
);
create function public.is_member() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.members where id=auth.uid() and active); $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.members where id=auth.uid() and active and role='admin'); $$;
create table public.companies (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 160), country text not null check(length(trim(country)) between 1 and 80), manufacturer boolean not null default false, supplier boolean not null default false, contact text not null default '' check(length(contact)<=500), notes text not null default '' check(length(notes)<=4000), archived boolean not null default false, check(manufacturer or supplier)
);
create table public.categories(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 80));
create unique index categories_name_unique on public.categories(lower(name));
create table public.products (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 160), code text not null check(length(trim(code)) between 1 and 80), category_id uuid references public.categories(id), manufacturer_id uuid references public.companies(id), origin text not null check(length(trim(origin)) between 1 and 80), unit text not null check(length(trim(unit)) between 1 and 30), notes text not null default '' check(length(notes)<=4000), purchase_price numeric(14,2) check(purchase_price>=0 and purchase_price<=999999999), selling_price numeric(14,2) check(selling_price>=0 and selling_price<=999999999), low_stock numeric(15,3) not null default 0 check(low_stock>=0 and low_stock<=999999999), quantity numeric(18,3) not null default 0 check(quantity>=0), photo_path text, archived boolean not null default false
);
create unique index products_code_unique on public.products(lower(code));
create index products_origin_idx on public.products(origin);
create index companies_country_idx on public.companies(country);
create table public.product_suppliers(product_id uuid not null references public.products(id),company_id uuid not null references public.companies(id),primary key(product_id,company_id));
create index product_suppliers_company_idx on public.product_suppliers(company_id);
create table public.movements (
 id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id), request_id uuid not null unique, kind text not null check(kind in ('opening','receipt','issue','adjustment')), quantity numeric(15,3) not null check(quantity<>0), balance_after numeric(18,3) not null check(balance_after>=0), reason text not null check(length(trim(reason)) between 1 and 500), actor uuid not null, actor_email text not null, created_at timestamptz not null default now()
);
create index movements_product_date_idx on public.movements(product_id,created_at desc);
create unique index one_opening_per_product on public.movements(product_id) where kind='opening';

revoke all on public.members,public.companies,public.categories,public.products,public.product_suppliers,public.movements from anon,authenticated;
grant select on public.members,public.companies,public.categories,public.products,public.product_suppliers,public.movements to anon;
alter table public.members enable row level security;
create policy members_read on public.members for select to authenticated using(public.is_admin() or (id=auth.uid() and active));
-- Membership changes are only available through change_member or the server-only invitation API.
grant select on public.members to authenticated;
revoke insert,update,delete on public.members from anon,authenticated;
alter table public.companies enable row level security;
create policy companies_read on public.companies for select to authenticated using(public.is_member());
create policy companies_insert on public.companies for insert to authenticated with check(public.is_admin());
create policy companies_update on public.companies for update to authenticated using(public.is_admin()) with check(public.is_admin());
grant select,insert,update on public.companies to authenticated;
revoke delete on public.companies from anon,authenticated;

alter table public.products enable row level security;
alter table public.categories enable row level security;
alter table public.product_suppliers enable row level security;
alter table public.movements enable row level security;
create policy products_read on public.products for select to authenticated using(public.is_member());
create policy categories_read on public.categories for select to authenticated using(public.is_member());
create policy suppliers_read on public.product_suppliers for select to authenticated using(public.is_member());
create policy movements_read on public.movements for select to authenticated using(public.is_member());
grant select on public.products,public.categories,public.product_suppliers,public.movements to authenticated;
revoke insert,update,delete on public.products,public.categories,public.product_suppliers,public.movements from anon,authenticated;

create function public.save_product(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare pid uuid; cid uuid; mid uuid; supplier_id uuid; existing public.products; photo text;
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 pid := (p->>'id')::uuid;
 select * into existing from public.products where id=pid for update;
 if exists(select 1 from public.products where id=pid) and existing.archived then raise exception 'Restore this product before editing.'; end if;
 if length(trim(p->>'name')) not between 1 and 160 or length(trim(p->>'code')) not between 1 and 80 then raise exception 'Product name and code are required.'; end if;
 if existing.id is not null and existing.unit<>trim(p->>'unit') and exists(select 1 from public.movements where product_id=pid) then raise exception 'The stock unit cannot change after movements exist. Create a new product for a different unit.'; end if;
 if (p->>'low_stock')::numeric <> round((p->>'low_stock')::numeric,3) then raise exception 'Use up to 3 decimal places for the stock threshold.'; end if;
 if (p->>'purchase_price')::numeric <> round((p->>'purchase_price')::numeric,2) or (p->>'selling_price')::numeric <> round((p->>'selling_price')::numeric,2) then raise exception 'Prices support up to 2 decimal places.'; end if;
 if coalesce(p->>'purchase_price','') in ('NaN','Infinity','-Infinity') or coalesce(p->>'selling_price','') in ('NaN','Infinity','-Infinity') or coalesce(p->>'low_stock','') in ('NaN','Infinity','-Infinity') then raise exception 'Numeric values must be finite.'; end if;
 mid := nullif(p->>'manufacturer_id','')::uuid;
 if mid is not null and not exists(select 1 from public.companies where id=mid and manufacturer and (not archived or id=existing.manufacturer_id)) then raise exception 'Select an active manufacturer.'; end if;
 if length(trim(coalesce(p->>'category',''))) > 0 then
  insert into public.categories(name) values(trim(p->>'category')) on conflict(lower(name)) do update set name=public.categories.name returning id into cid;
 end if;
 photo := nullif(p->>'photo_path','');
 if photo is not null and photo not like pid::text || '/%' then raise exception 'Invalid product photo path.'; end if;
 insert into public.products(id,name,code,category_id,manufacturer_id,origin,unit,notes,purchase_price,selling_price,low_stock,photo_path)
 values(pid,trim(p->>'name'),trim(p->>'code'),cid,mid,trim(p->>'origin'),trim(p->>'unit'),coalesce(p->>'notes',''),(p->>'purchase_price')::numeric,(p->>'selling_price')::numeric,(p->>'low_stock')::numeric,photo)
 on conflict(id) do update set name=excluded.name,code=excluded.code,category_id=excluded.category_id,manufacturer_id=excluded.manufacturer_id,origin=excluded.origin,unit=excluded.unit,notes=excluded.notes,purchase_price=excluded.purchase_price,selling_price=excluded.selling_price,low_stock=excluded.low_stock,photo_path=excluded.photo_path;
 for supplier_id in select value::uuid from jsonb_array_elements_text(coalesce(p->'suppliers','[]'::jsonb)) loop
  if not exists(select 1 from public.companies c where c.id=supplier_id and c.supplier and (not c.archived or exists(select 1 from public.product_suppliers s where s.product_id=pid and s.company_id=c.id))) then raise exception 'Select active suppliers.'; end if;
 end loop;
 delete from public.product_suppliers where product_id=pid;
 insert into public.product_suppliers(product_id,company_id) select pid,value::uuid from jsonb_array_elements_text(coalesce(p->'suppliers','[]'::jsonb)) on conflict do nothing;
 return pid;
end; $$;

create function public.record_stock(p_product uuid,p_request uuid,p_kind text,p_quantity numeric,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.products; prior public.movements; delta numeric; result uuid; new_balance numeric;
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 -- Request lock makes retries atomic, including requests targeting different products.
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into prior from public.movements where request_id=p_request;
 if found then
  if prior.product_id=p_product and prior.actor=auth.uid() and prior.kind=p_kind and prior.quantity=(case when p_kind='issue' then -p_quantity else p_quantity end) and prior.reason=trim(p_reason) then return prior.id; end if;
  raise exception 'This submission identifier has already been used.';
 end if;
 if p_request is null or p_kind not in ('opening','receipt','issue','adjustment') or p_quantity is null or p_quantity=0 or abs(p_quantity)>999999999 or p_quantity<>round(p_quantity,3) or p_quantity::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a valid nonzero quantity with up to 3 decimal places.'; end if;
 if p_kind<>'adjustment' and p_quantity<=0 then raise exception 'Quantity must be positive.'; end if;
 if p_reason is null or length(trim(p_reason)) not between 1 and 500 then raise exception 'A reason is required (maximum 500 characters).'; end if;
 select * into item from public.products where id=p_product for update;
 if not found or item.archived then raise exception 'Select an active product.'; end if;
 if p_kind='opening' and exists(select 1 from public.movements where product_id=p_product) then raise exception 'Opening stock must be the first movement. Use an adjustment.'; end if;
 delta := case when p_kind='issue' then -p_quantity else p_quantity end;
 new_balance := item.quantity+delta;
 if new_balance<0 then raise exception 'Insufficient stock. Available: % %.',item.quantity,item.unit; end if;
 update public.products set quantity=new_balance where id=p_product;
 insert into public.movements(product_id,request_id,kind,quantity,balance_after,reason,actor,actor_email) values(p_product,p_request,p_kind,delta,new_balance,trim(p_reason),auth.uid(),(select email from public.members where id=auth.uid())) returning id into result;
 return result;
end; $$;

create function public.archive_product(p_id uuid,p_archived boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 update public.products set archived=p_archived where id=p_id;
 if not found then raise exception 'Product not found.'; end if;
end; $$;
create function public.change_member(p_id uuid,p_role text,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(119991);
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if p_role not in ('admin','viewer') or p_active is null then raise exception 'Invalid membership.'; end if;
 if exists(select 1 from public.members where id=p_id and active and role='admin') and (not p_active or p_role<>'admin') and (select count(*) from public.members where active and role='admin')<=1 then raise exception 'Keep at least one active administrator.'; end if;
 update public.members set role=p_role,active=p_active where id=p_id;
 if not found then raise exception 'Member not found.'; end if;
end; $$;
revoke all on function public.is_member(),public.is_admin(),public.save_product(jsonb),public.record_stock(uuid,uuid,text,numeric,text),public.archive_product(uuid,boolean),public.change_member(uuid,text,boolean) from public,anon;
grant execute on function public.is_member(),public.is_admin(),public.save_product(jsonb),public.record_stock(uuid,uuid,text,numeric,text),public.archive_product(uuid,boolean),public.change_member(uuid,text,boolean) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('product-photos','product-photos',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy photo_read on storage.objects for select to authenticated using(bucket_id='product-photos' and public.is_member());
create policy photo_insert on storage.objects for insert to authenticated with check(bucket_id='product-photos' and public.is_admin());
create policy photo_delete on storage.objects for delete to authenticated using(bucket_id='product-photos' and public.is_admin());

