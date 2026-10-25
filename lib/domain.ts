import { z } from 'zod';
const amount = z.coerce.number().finite().min(0).max(999999999).refine(n => Math.abs(n * 1000 - Math.round(n * 1000)) < 0.0001, 'Use up to 3 decimal places.');
const money = z.preprocess(v => v === '' || v === null ? null : v, z.coerce.number().finite().min(0).max(999999999).refine(n => Math.abs(n*100-Math.round(n*100))<0.0001, 'Use up to 2 decimal places.').nullable());
const optionalId = z.preprocess(v => v === '' ? null : v, z.uuid().nullable());
export const productSchema = z.object({ id: optionalId, name: z.string().trim().min(1).max(160), code: z.string().trim().min(1).max(80), category: z.string().trim().max(80), manufacturer_id: optionalId, origin: z.string().trim().min(1).max(80), unit: z.string().trim().min(1).max(30), notes: z.string().trim().max(4000), purchase_price: money, selling_price: money, low_stock: amount, suppliers: z.array(z.uuid()).max(100) });
export const companySchema = z.object({ id: optionalId, name: z.string().trim().min(1).max(160), country: z.string().trim().min(1).max(80), contact: z.string().trim().max(500), notes: z.string().trim().max(4000), manufacturer: z.boolean(), supplier: z.boolean() }).refine(c => c.manufacturer || c.supplier, { message: 'Choose manufacturer, supplier, or both.' });
export const stockSchema = z.object({product_id: z.uuid(), request_id:z.uuid(), kind:z.enum(['opening','receipt','issue','adjustment']), quantity: z.coerce.number().finite().min(-999999999).max(999999999).refine(n => n !== 0 && Math.abs(n*1000-Math.round(n*1000))<0.0001, 'Enter a nonzero quantity with up to 3 decimal places.'), reason:z.string().trim().min(1).max(500)}).refine(m => m.kind === 'adjustment' || m.quantity > 0, {message:'Opening, receipt, and issue quantities must be positive.'});
export type ProductView = 'active' | 'archived' | 'trash';
export type Filters = {q:string;company:string;origin:string;category:string;stock:string;view:ProductView};
import type { Data, Product } from './types';
export const productState = (p:Product):ProductView => p.deleted_at ? 'trash' : p.archived ? 'archived' : 'active';
export const activeProducts = (data:Data) => data.products.filter(p=>productState(p)==='active');
export function relatedCompanies(data:Data,p:Product){
 const supplierIds=new Set(data.suppliers.filter(s=>s.product_id===p.id).map(s=>s.company_id));
 return data.companies.filter(c=>c.id===p.manufacturer_id||supplierIds.has(c.id));
}
export function originOptions(data:Data):string[]{
 return [...new Set(data.products.flatMap(p=>[p.origin,...relatedCompanies(data,p).map(c=>c.country)]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}
export function filterProducts(data: Data, filters: Filters): Product[] {
 return data.products.filter(p => {
  const companies=relatedCompanies(data,p);
  const category=data.categories.find(c=>c.id===p.category_id)?.name??'';
  const haystack=[p.name,p.code,p.notes,category,...companies.map(c=>c.name)].join(' ').toLocaleLowerCase();
  return productState(p)===filters.view
   && (!filters.q||haystack.includes(filters.q.trim().toLocaleLowerCase()))
   && (!filters.origin||p.origin===filters.origin||companies.some(c=>c.country===filters.origin))
   && (!filters.company||companies.some(c=>c.id===filters.company))
   && (!filters.category||p.category_id===filters.category)
   && (!filters.stock||(filters.stock==='out'?Number(p.quantity)===0:filters.stock==='low'?Number(p.quantity)<=Number(p.low_stock):Number(p.quantity)>Number(p.low_stock)));
 });
}
// This shared export function uses exactly the same filter as the visible directory.
export function productExportRows(data:Data,filters:Filters):unknown[][]{
 const company=(id:string|null)=>data.companies.find(c=>c.id===id);
 return [['Code','Product','Category','Manufacturer','Manufacturer country','Suppliers','Supplier countries','Manufacturing country','Unit','Quantity','Low-stock threshold','Purchase price USD','Selling price USD','Notes','Status','Trashed at'],...filterProducts(data,filters).map(p=>{
  const suppliers=data.suppliers.filter(s=>s.product_id===p.id).map(s=>company(s.company_id)).filter(Boolean);
  return [p.code,p.name,data.categories.find(c=>c.id===p.category_id)?.name??'Uncategorized',company(p.manufacturer_id)?.name??'',company(p.manufacturer_id)?.country??'',suppliers.map(c=>c!.name).join('; '),suppliers.map(c=>c!.country).join('; '),p.origin,p.unit,p.quantity,p.low_stock,p.purchase_price,p.selling_price,p.notes,productState(p),p.deleted_at??''];
 })];
}
export function csv(rows: unknown[][]): string {
 return '\uFEFF' + rows.map(row=>row.map(value=>{let s=String(value??''); if (/^[\s]*[=+\-@\t\r]/.test(s)) s="'"+s; return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
}
export const formatQuantity = (n: number) => new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(Number(n));
export const formatMoney = (n: number | null) => n === null ? '—' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n));
export const formatDate = (s:string) => new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',dateStyle:'medium',timeStyle:'short'}).format(new Date(s));
