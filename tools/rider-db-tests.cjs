// Integration tests use real PostgreSQL via PGlite. Supabase Auth identity and Realtime transport are stubbed.
// Usage: node tools/rider-db-tests.cjs <PGlite module> <foundation SQL fixture directory>
const fs=require('fs'),path=require('path');const {PGlite}=require(path.resolve(process.argv[2]));const fixtures=path.resolve(process.argv[3]);const repo=path.resolve(__dirname,'..');
(async()=>{const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create schema realtime;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',phone text,email text);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',coalesce(nullif(current_setting('test.aal',true),''),'aal2'))$$;create table realtime.events(payload jsonb,event text,topic text,private boolean);create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$insert into realtime.events values(payload,event,topic,private)$$;`);
for(const name of fs.readdirSync(fixtures).filter(x=>/^000[1-8]\.sql$/.test(x))){let sql=fs.readFileSync(path.join(fixtures,name),'utf8').replace('create extension if not exists pgcrypto;','');await db.exec(sql);console.log('loaded '+name);}
for(const n of [13,14,15,16,17,18]){const dir=path.join(repo,'supabase')+path.sep;const f=fs.readdirSync(dir).find(x=>x.startsWith(n+'-'));await db.exec(fs.readFileSync(dir+f,'utf8'));console.log('loaded '+f);}
await db.exec(fs.readFileSync(path.join(repo,'supabase/20-sobers-rider-tracking.sql'),'utf8'));console.log('GPS migration compiled');
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const owner=randomUUID(),rider=randomUUID(),other=randomUUID(),ref=randomUUID();
const q=(sql,params=[])=>db.query(sql,params),val=async(sql,params)=>Object.values((await q(sql,params)).rows[0])[0];
await db.exec("grant select,update on platform_orders to authenticated;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;");
for(const id of [owner,rider,other])await q('insert into auth.users(id) values($1)',[id]);
const business=await val("select id from businesses where slug='sobers-pizza'");
await q("insert into business_memberships(business_id,profile_id,role_id,status) select $1,$2,id,'active' from roles where name='business_owner'",[business,owner]);
for(const id of [rider,other])await q("insert into business_memberships(business_id,profile_id,role_id,status) select $1,$2,id,'active' from roles where name='sobers_rider'",[business,id]);
async function identity(id,role='authenticated'){await db.exec('reset role');await q("select set_config('test.uid',$1,false)",[id||'']);await db.exec('set role '+role);}
async function denied(sql,params){await assert.rejects(q(sql,params));}
await q("insert into branches(business_id,name,code,is_active,accepting_orders) values($1,'Town','MAIN-BRANCH',true,true) on conflict(business_id,code) do update set is_active=true,accepting_orders=true",[business]);
await identity(null,'anon');
const created=(await q("select * from create_public_order_v3('sobers-pizza','GPS Synthetic','0000000000','delivery','Test address',null,$1,'MAIN-BRANCH',$2,4.9,-1.75)",[JSON.stringify([{product_key:'bottle-water-500ml',quantity:1,selected_options:{}}]),ref])).rows[0];const order=created.order_id;
assert.ok(order);console.log('PASS order created with pin');
await denied('select * from sobers_delivery_sessions');await denied('select sobers_assign_delivery($1,$2)',[order,rider]);
await identity(other);await denied('select sobers_assign_delivery($1,$2)',[order,other]);
await identity(owner);await q('select sobers_assign_delivery($1,$2)',[order,rider]);
await identity(other);assert.equal((await q('select * from sobers_delivery_sessions')).rows.length,0);assert.deepEqual(await val('select sobers_rider_deliveries()'),[]);await denied("select sobers_rider_action($1,'start')",[order]);console.log('PASS unassigned rider and anon denied');
await identity(rider);await denied("select sobers_rider_action($1,'start')",[order]);
await identity(owner);await q("update platform_orders set status='preparing' where id=$1",[order]);await q("update platform_orders set status='ready' where id=$1",[order]);
await identity(rider);await q("select sobers_rider_action($1,'start')",[order]);assert.equal(await val('select sobers_rider_location($1,4.91,-1.751,12,90,5)',[order]),true);assert.equal(await val('select sobers_rider_location($1,4.92,-1.752,12,null,null)',[order]),false);console.log('PASS start and server GPS throttling');
await identity(null,'anon');assert.equal(await val("select track_public_order('sobers-pizza',$1,'9999999999')",[ref]),null);assert.equal(await val("select track_public_order('sobers-pizza',$1,'0000000000')",[randomUUID()]),null);let tracked=await val("select track_public_order('sobers-pizza',$1,'0000000000')",[ref]);assert.equal(tracked.delivery.latitude,4.91);assert.equal(tracked.delivery.destination_latitude,4.9);console.log('PASS secure customer location read and wrong reference/phone denial');
await identity(rider);await denied('update sobers_delivery_sessions set latitude=1 where order_id=$1',[order]);await denied('select sobers_rider_location($1,100,0,1,null,null)',[order]);await q("select sobers_rider_action($1,'stop')",[order]);
await identity(null,'anon');tracked=await val("select track_public_order('sobers-pizza',$1,'0000000000')",[ref]);assert.equal(tracked.delivery.latitude,null);
await identity(rider);await q("select sobers_rider_action($1,'start')",[order]);await q('select sobers_rider_location($1,4.912,-1.754,10,null,null)',[order]);await q("select sobers_rider_action($1,'delivered')",[order]);await denied('select sobers_rider_location($1,4.9,-1.75,10,null,null)',[order]);
await identity(null,'anon');tracked=await val("select track_public_order('sobers-pizza',$1,'0000000000')",[ref]);assert.equal(tracked.status,'completed');assert.equal(tracked.delivery,undefined);console.log('PASS stop/restart/delivered clears and revokes GPS');
await identity(owner);await denied('select sobers_assign_delivery($1,$2)',[order,rider]);
await db.exec('reset role');const stored=(await q('select * from sobers_delivery_sessions where order_id=$1',[order])).rows[0];assert.equal(stored.latitude,null);assert.equal(stored.longitude,null);assert.equal(stored.state,'ended');const events=(await q('select * from realtime.events')).rows;assert.ok(events.length>0);assert.ok(events.every(e=>JSON.stringify(e.payload)==='{}'));console.log('PASS persisted location erased and broadcasts contain no GPS');

// A second delivery checks cancellation and administrative reassignment.
await db.exec('reset role');await q("select set_config('test.uid','',false)");const ref2=randomUUID();
await identity(null,'anon');const second=(await q("select * from create_public_order_v3('sobers-pizza','GPS Cancel','0000000001','delivery','Test cancellation',null,$1,'MAIN-BRANCH',$2,null,null)",[JSON.stringify([{product_key:'bottle-water-500ml',quantity:1,selected_options:{}}]),ref2])).rows[0].order_id;
await identity(owner);await q('select sobers_assign_delivery($1,$2)',[second,rider]);await q("update platform_orders set status='ready' where id=$1",[second]);
await identity(rider);await q("select sobers_rider_action($1,'start')",[second]);await q('select sobers_rider_location($1,4.9,-1.75,10,null,null)',[second]);
await identity(owner);await q('select sobers_assign_delivery($1,$2)',[second,other]);
await identity(rider);await denied('select sobers_rider_location($1,4.9,-1.75,10,null,null)',[second]);
await identity(other);await q("select sobers_rider_action($1,'start')",[second]);await q('select sobers_rider_location($1,4.9,-1.75,10,null,null)',[second]);
await identity(owner);await q("update platform_orders set status='cancelled' where id=$1",[second]);
await identity(other);await denied('select sobers_rider_location($1,4.9,-1.75,10,null,null)',[second]);
await identity(null,'anon');const cancelled=await val("select track_public_order('sobers-pizza',$1,'0000000001')",[ref2]);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.delivery,undefined);console.log('PASS reassignment revokes old rider; cancellation erases/excludes GPS');
await db.exec('reset role');await db.exec(fs.readFileSync(path.join(repo,'supabase/19-sobers-admin-mfa-enforcement.sql'),'utf8'));await identity(owner);await q("select set_config('test.aal','aal1',false)");await assert.rejects(q('select sobers_assign_delivery($1,$2)',[second,rider]),/Not authorized/);console.log('PASS staged admin MFA enforcement still rejects aal1 assignment');await db.close();})().catch(e=>{console.error(e.message);process.exit(1);});
