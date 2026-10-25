import type { Data } from './types';
export const demo: Data = {
 demo:true,email:'preview@example.com',role:'admin',members:[],
 companies:[
 {id:'c1',name:'Nordic Components',country:'Sweden',manufacturer:true,supplier:false,contact:'sales@nordic.example',notes:'Industrial components',archived:false},
 {id:'c2',name:'Hikari Industries',country:'Japan',manufacturer:true,supplier:true,contact:'Tokyo office',notes:'Precision parts',archived:false},
 {id:'c3',name:'Global Trade Co.',country:'United States',manufacturer:false,supplier:true,contact:'New York office',notes:'International distribution',archived:false},
 {id:'c4',name:'Rhein Technik',country:'Germany',manufacturer:true,supplier:true,contact:'Berlin office',notes:'Workshop equipment',archived:false}],
 categories:[{id:'cat1',name:'Components'},{id:'cat2',name:'Tools'},{id:'cat3',name:'Electronics'}],
 products:[
 {id:'p1',name:'Precision ball bearing',code:'BRG-2040',category_id:'cat1',manufacturer_id:'c2',origin:'Japan',unit:'pcs',notes:'Sealed steel bearing, 20 mm',purchase_price:12.50,selling_price:18,low_stock:20,quantity:148,photo_path:null,deleted_at:null,archived:false},
 {id:'p2',name:'Digital torque wrench',code:'TLS-1080',category_id:'cat2',manufacturer_id:'c4',origin:'Germany',unit:'pcs',notes:'Professional workshop series',purchase_price:85,selling_price:120,low_stock:10,quantity:6,photo_path:null,deleted_at:null,archived:false},
 {id:'p3',name:'Copper conductor wire',code:'ELC-3050',category_id:'cat3',manufacturer_id:'c1',origin:'Sweden',unit:'m',notes:'Flexible insulated conductor',purchase_price:2.75,selling_price:4.5,low_stock:100,quantity:425.5,photo_path:null,deleted_at:null,archived:false},
 {id:'p4',name:'Industrial pressure sensor',code:'SNS-4020',category_id:'cat3',manufacturer_id:'c2',origin:'Japan',unit:'pcs',notes:'0–10 bar measurement range',purchase_price:45,selling_price:68,low_stock:5,quantity:0,photo_path:null,deleted_at:null,archived:false},
 {id:'p5',name:'Stainless hex bolt M12',code:'FST-5012',category_id:'cat1',manufacturer_id:'c4',origin:'Germany',unit:'kg',notes:'Corrosion resistant fasteners',purchase_price:8,selling_price:12,low_stock:15,quantity:86.75,photo_path:null,deleted_at:null,archived:false},
 {id:'p6',name:'Modular terminal block',code:'ELC-6024',category_id:'cat3',manufacturer_id:'c1',origin:'Sweden',unit:'pcs',notes:'DIN rail mounting',purchase_price:3.2,selling_price:5.25,low_stock:30,quantity:24,photo_path:null,deleted_at:null,archived:false}],
 suppliers:[{product_id:'p1',company_id:'c3'},{product_id:'p2',company_id:'c4'},{product_id:'p3',company_id:'c3'},{product_id:'p4',company_id:'c2'},{product_id:'p5',company_id:'c3'},{product_id:'p6',company_id:'c3'}],
 movements:[{id:'m1',product_id:'p1',kind:'receipt',quantity:50,balance_after:148,reason:'Supplier delivery',actor:'demo',actor_email:'admin@example.com',created_at:'2026-10-25T04:30:00Z'},{id:'m2',product_id:'p2',kind:'issue',quantity:-4,balance_after:6,reason:'Workshop allocation',actor:'demo',actor_email:'admin@example.com',created_at:'2026-10-24T09:15:00Z'},{id:'m3',product_id:'p3',kind:'receipt',quantity:125.5,balance_after:425.5,reason:'New shipment received',actor:'demo',actor_email:'admin@example.com',created_at:'2026-10-24T03:00:00Z'}]
};
