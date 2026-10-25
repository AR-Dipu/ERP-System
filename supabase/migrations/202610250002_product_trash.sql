-- Reversible product removal. Existing records remain active or archived as before.
alter table public.products add column deleted_at timestamptz default null;

create or replace function public.save_product(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare pid uuid; cid uuid; mid uuid; supplier_id uuid; existing public.products; photo text;
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 pid := (p->>'id')::uuid;
 select * into existing from public.products where id=pid for update;
 if existing.deleted_at is not null then raise exception 'Restore this product from Trash before editing.'; end if;
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

create or replace function public.record_stock(p_product uuid,p_request uuid,p_kind text,p_quantity numeric,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
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
 if not found or item.archived or item.deleted_at is not null then raise exception 'Select an active product.'; end if;
 if p_kind='opening' and exists(select 1 from public.movements where product_id=p_product) then raise exception 'Opening stock must be the first movement. Use an adjustment.'; end if;
 delta := case when p_kind='issue' then -p_quantity else p_quantity end;
 new_balance := item.quantity+delta;
 if new_balance<0 then raise exception 'Insufficient stock. Available: % %.',item.quantity,item.unit; end if;
 update public.products set quantity=new_balance where id=p_product;
 insert into public.movements(product_id,request_id,kind,quantity,balance_after,reason,actor,actor_email) values(p_product,p_request,p_kind,delta,new_balance,trim(p_reason),auth.uid(),(select email from public.members where id=auth.uid())) returning id into result;
 return result;
end; $$;

create or replace function public.archive_product(p_id uuid,p_archived boolean) returns void language plpgsql security definer set search_path='' as $$
declare item public.products;
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if p_archived is null then raise exception 'Choose an archive status.'; end if;
 select * into item from public.products where id=p_id for update;
 if not found then raise exception 'Product not found.'; end if;
 if item.deleted_at is not null then raise exception 'Restore this product from Trash before changing its archive status.'; end if;
 update public.products set archived=p_archived where id=p_id;
end; $$;

create function public.trash_product(p_id uuid,p_trashed boolean) returns void language plpgsql security definer set search_path='' as $$
declare item public.products;
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 if p_trashed is null then raise exception 'Choose a Trash status.'; end if;
 -- Share the product-row lock with stock, edit, and archive functions.
 select * into item from public.products where id=p_id for update;
 if not found then raise exception 'Product not found.'; end if;
 update public.products set deleted_at=case when p_trashed then coalesce(item.deleted_at,now()) else null end where id=p_id;
 -- The archived flag, relationships, photos, quantity, and movements are unchanged.
end; $$;
revoke all on function public.trash_product(uuid,boolean) from public,anon;
grant execute on function public.trash_product(uuid,boolean) to authenticated;
