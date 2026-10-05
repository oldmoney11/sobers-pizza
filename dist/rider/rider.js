(() => {
 'use strict';
 const db=supabase.createClient('https://inthadecmxmbqexufzpe.supabase.co','sb_publishable_G6-TdmABB0bA93gzDZVElw_Q2VrwE80',{auth:{storageKey:'sobers-rider-auth'}});
 const $=s=>document.querySelector(s),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let active=null,poll=0,actionBusy=false,channel=null,topic=null,loadBusy=false,lastLoad=0;
 function subscribe(next){if(topic===next)return;if(channel)db.removeChannel(channel);topic=next;channel=null;if(next)channel=db.channel(next).on("broadcast",{event:"changed"},()=>{clearTimeout(poll);poll=setTimeout(load,Math.max(0,2000-(Date.now()-lastLoad)));}).subscribe();}
 const notify=text=>$('#riderMessage').textContent=text;
 const rpc=async(name,args)=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{const {data,error}=await db.rpc(name,args).abortSignal(controller.signal);if(error)throw Error(error.message);return data;}finally{clearTimeout(timer);}};
 const gps=SobersGPS.create({geo:navigator.geolocation,notify,send:async p=>{if(!active)throw Error('Delivery stopped');try{await rpc('sobers_rider_location',{p_order:active,p_lat:p.latitude,p_lng:p.longitude,p_accuracy:p.accuracy,p_heading:p.heading,p_speed:p.speed});}catch(error){if(error.message.includes('Delivery unavailable')){error.fatal=true;active=null;}throw error;}}});
 async function stop(){gps.stop();const id=active;active=null;if(id)await rpc('sobers_rider_action',{p_order:id,p_action:'stop'});}
 async function load(){if(loadBusy)return;if(Date.now()-lastLoad<2000){clearTimeout(poll);poll=setTimeout(load,2000-(Date.now()-lastLoad));return;}loadBusy=true;lastLoad=Date.now();clearTimeout(poll);try{const {data:{session}}=await db.auth.getSession();$('#riderLogin').hidden=!!session;$('#riderControls').hidden=!session;if(!session){gps.stop();active=null;subscribe(null);$('#deliveries').textContent='';return;}
 const rows=await rpc('sobers_rider_deliveries');if(active&&!rows.some(r=>r.order_id===active&&r.state==='out_for_delivery'&&r.status==='ready')){gps.stop();active=null;notify('Delivery ended or reassigned. GPS stopped.');}
 subscribe(rows.find(r=>r.order_id===active)?.topic||null);
 $('#deliveries').innerHTML=rows.length?rows.map(r=>`<article><h2>${esc(r.order_number)}</h2><p>${esc(r.customer_name)} · ${esc(r.address)}</p><p>${esc(r.state==='out_for_delivery'?'Out for Delivery':r.status)}</p><a href="tel:${esc(String(r.customer_phone).replace(/\D/g,''))}">Call customer</a>${r.latitude!=null?`<p>Delivery pin: ${Number(r.latitude).toFixed(5)}, ${Number(r.longitude).toFixed(5)}</p>`:'<p>No delivery pin supplied. Confirm the written address.</p>'}<div><button data-action="start" data-order="${r.order_id}" ${r.status!=='ready'?'disabled':''}>${active===r.order_id&&gps.isActive()?'Sharing location':'Start Delivery'}</button><button data-action="stop" data-order="${r.order_id}">Stop tracking</button><button data-action="delivered" data-order="${r.order_id}" ${!['out_for_delivery','stopped'].includes(r.state)?'disabled':''}>Mark Delivered</button></div></article>`).join(''):'<p>No assigned deliveries.</p>';
 }catch(error){notify('Connection unavailable. '+error.message);if(active)notify('Connection lost. Sharing will retry; keep this page open.');}finally{loadBusy=false;poll=setTimeout(load,10000);}}
 $('#riderLogin').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const {error}=await db.auth.signInWithPassword({email:f.elements.email.value,password:f.elements.password.value});f.elements.password.value='';if(error)return notify('Sign-in failed. Check your credentials.');notify('Signed in.');load();};
 $('#refreshDeliveries').onclick=load;
 $('#signOut').onclick=async()=>{try{await stop();}catch(_){}await db.auth.signOut();load();};
 $('#deliveries').onclick=async e=>{const b=e.target.closest('[data-action]');if(!b||actionBusy)return;actionBusy=true;b.disabled=true;try{const id=b.dataset.order,a=b.dataset.action;
 if(a==='start'){if(active===id&&gps.isActive())return;if(active)await stop();await rpc('sobers_rider_action',{p_order:id,p_action:'start'});active=id;gps.start();}
 else if(a==='stop'){if(active===id)await stop();else await rpc('sobers_rider_action',{p_order:id,p_action:'stop'});}
 else if(a==='delivered'){await rpc('sobers_rider_action',{p_order:id,p_action:'delivered'});if(active===id){gps.stop();active=null;}notify('Delivery completed. GPS stopped.');}await load();
 }catch(error){notify(error.message);}finally{actionBusy=false;b.disabled=false;}};
 window.addEventListener('online',load);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
 window.addEventListener('pagehide',()=>{gps.stop();subscribe(null);});db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){gps.stop();active=null;}});notify('Tap Start Delivery to share GPS. Refreshing does not restart location sharing.');load();
})();
