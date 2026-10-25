export type Role = 'admin' | 'viewer';
export type Company = { id: string; name: string; country: string; manufacturer: boolean; supplier: boolean; contact: string; notes: string; archived: boolean };
export type Product = { id: string; name: string; code: string; category_id: string | null; manufacturer_id: string | null; origin: string; unit: string; notes: string; purchase_price: number | null; selling_price: number | null; low_stock: number; quantity: number; photo_path: string | null; archived: boolean; deleted_at: string | null; photo_url?: string };
export type Movement = { id: string; product_id: string; kind: 'opening'|'receipt'|'issue'|'adjustment'; quantity: number; balance_after: number; reason: string; actor: string; actor_email: string; created_at: string };
export type Member = { id: string; email: string; role: Role; active: boolean };
export type Data = { products: Product[]; companies: Company[]; categories: {id:string;name:string}[]; suppliers: {product_id:string;company_id:string}[]; movements: Movement[]; members: Member[]; email: string; role: Role; demo: boolean };
export type ActionState = { error?: string; success?: string };
