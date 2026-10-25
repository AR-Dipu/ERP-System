import test from 'node:test';
import assert from 'node:assert/strict';
import {filterProducts,csv,stockSchema,productSchema,formatDate,originOptions,activeProducts,productState,productExportRows,type Filters} from '../lib/domain';
import {demo} from '../lib/demo';
const base:Filters={q:'',company:'',origin:'',category:'',stock:'',view:'active'};
test('search matches product code, supplier, manufacturer, and notes',()=>{
 for(const [q,count] of [['brg-2040',1],['Global Trade',4],['Hikari',2],['corrosion',1]] as const)assert.equal(filterProducts(demo,{...base,q}).length,count);
});
test('Origin matches manufacturing, manufacturer, and supplier countries',()=>{
 assert.equal(filterProducts(demo,{...base,origin:'Japan'}).length,2);
 assert.equal(filterProducts(demo,{...base,origin:'United States'}).length,4);
 const data={...demo,products:demo.products.map(p=>({...p,origin:'Bangladesh'}))};
 assert.deepEqual(filterProducts(data,{...base,origin:'Sweden'}).map(p=>p.code),['ELC-3050','ELC-6024']);
 assert.equal(filterProducts(data,{...base,origin:'Bangladesh'}).length,6);
 assert.equal(filterProducts(data,{...base,origin:'France'}).length,0);
});
test('Origin options are unique, sorted, and exclude unrelated companies',()=>{
 const data={...demo,companies:[...demo.companies,{...demo.companies[0],id:'unlinked',country:'France'}]};
 assert.deepEqual(originOptions(data),['Germany','Japan','Sweden','United States']);
});
test('Origin and all other filters combine with AND',()=>{
 assert.deepEqual(filterProducts(demo,{...base,origin:'United States',company:'c2',category:'cat1',q:'bearing',stock:'in'}).map(p=>p.code),['BRG-2040']);
 assert.equal(filterProducts(demo,{...base,origin:'Sweden',company:'c4'}).length,0);
 assert.equal(filterProducts(demo,{...base,company:'c4',category:'cat2',stock:'low'}).length,1);
 assert.equal(filterProducts(demo,{...base,stock:'out'}).length,1);
 assert.equal(filterProducts(demo,{...base,stock:'in'}).length,3);
});
test('Active, Archived, and Trash views are disjoint, and Trash overrides archive state',()=>{
 const data={...demo,products:demo.products.map((p,i)=>({...p,archived:i===0||i===1,deleted_at:i===1||i===2?'2026-10-25T00:00:00Z':null}))};
 assert.deepEqual(filterProducts(data,base).map(p=>p.id),['p4','p5','p6']);
 assert.deepEqual(filterProducts(data,{...base,view:'archived'}).map(p=>p.id),['p1']);
 assert.deepEqual(filterProducts(data,{...base,view:'trash'}).map(p=>p.id),['p2','p3']);
 assert.equal(activeProducts(data).length,3);assert.equal(productState(data.products[1]),'trash');
 assert.equal(activeProducts(data).filter(p=>Number(p.quantity)<=Number(p.low_stock)).length,2);
});
test('CSV exports the exact visible view, filters, status, and original country fields',()=>{
 const data={...demo,products:demo.products.map((p,i)=>({...p,deleted_at:i===0?'2026-10-25T00:00:00Z':null}))};
 const filters:Filters={...base,origin:'United States',view:'trash'};
 const visible=filterProducts(data,filters);const rows=productExportRows(data,filters);
 assert.equal(rows.length,visible.length+1);assert.equal(rows[1][0],visible[0].code);
 assert.equal(rows[1][7],'Japan');assert.equal(rows[1][14],'trash');assert.equal(rows[1][15],'2026-10-25T00:00:00Z');
 assert.ok(!productExportRows(data,base).slice(1).some(row=>row[0]==='BRG-2040'));
});
test('CSV preserves quotes and lines while neutralizing spreadsheet formulas',()=>{
 const result=csv([['hello,"world"','line1\nline2','=HYPERLINK("bad")',' -1','@SUM(A1)',null]]);
 assert.ok(result.startsWith('\uFEFF'));assert.ok(result.includes('"hello,""world"""'));assert.ok(result.includes('"line1\nline2"'));assert.ok(result.includes('"\'=HYPERLINK'));assert.ok(result.includes('"\' -1"'));
});
test('stock validation rejects zero, nonfinite, precision loss, and negative receipts',()=>{
 const value={product_id:crypto.randomUUID(),request_id:crypto.randomUUID(),kind:'receipt',quantity:1.125,reason:'Delivery'};
 assert.ok(stockSchema.safeParse(value).success);
 for(const quantity of [0,-1,Infinity,NaN,1.0001])assert.equal(stockSchema.safeParse({...value,quantity}).success,false);
 assert.ok(stockSchema.safeParse({...value,kind:'adjustment',quantity:-1.125}).success);
});
test('product validation keeps prices optional and rejects subcent values',()=>{
 const value={id:'',name:'Product',code:'ABC',category:'',manufacturer_id:'',origin:'Japan',unit:'kg',notes:'',purchase_price:'',selling_price:'12.50',low_stock:'0.125',suppliers:[]};
 const parsed=productSchema.parse(value);assert.equal(parsed.purchase_price,null);assert.equal(parsed.selling_price,12.5);
 assert.equal(productSchema.safeParse({...value,selling_price:1.001}).success,false);
});
test('dates use Asia/Dhaka',()=>assert.match(formatDate('2026-10-25T00:00:00Z'),/06:00/));
