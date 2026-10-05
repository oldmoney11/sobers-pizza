(() => {
 'use strict';
 let map,rider,destination,branch,channel,topic=null,updated=null,sharing=false;
 const db=supabase.createClient('https://inthadecmxmbqexufzpe.supabase.co','sb_publishable_G6-TdmABB0bA93gzDZVElw_Q2VrwE80',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const $=s=>document.querySelector(s),valid=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a)<=90&&Math.abs(b)<=180;
 function age(){if(!sharing)return;const seconds=updated?Math.max(0,Math.floor((Date.now()-updated)/1000)):null;$('#gpsFreshness').textContent=seconds===null?'Waiting for a new rider location':seconds>45?`Waiting for a new rider location · last update ${seconds}s ago`:`Live location · last updated ${seconds}s ago`;if(rider)rider.setStyle({opacity:seconds>45?.35:1,fillOpacity:seconds>45?.15:.8});}
 function subscribe(next){if(topic===next)return;if(channel)db.removeChannel(channel);topic=next;channel=null;if(!next)return;channel=db.channel(next).on('broadcast',{event:'changed'},()=>window.dispatchEvent(new Event('sobers:delivery-changed'))).subscribe(status=>{if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT'].includes(status))window.dispatchEvent(new Event('sobers:delivery-changed'));});}
 function render(d){subscribe(d?.topic);const show=d&&['out_for_delivery','stopped'].includes(d.state);$('#deliveryMapCard').hidden=!show;sharing=!!show;if(!show){if(map){map.remove();map=null;rider=destination=branch=null;}updated=null;return;}
 $('#deliveryHeading').textContent='Your rider is on the way';updated=d.state==='out_for_delivery'&&d.updated_at?Date.parse(d.updated_at):null;
 if(!map){map=L.map('deliveryMap').setView([4.9,-1.76],13);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:"origin",attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);}
 const points=[];
 function marker(existing,lat,lng,color,label){if(!valid(lat,lng)){if(existing)map.removeLayer(existing);return null;}points.push([lat,lng]);if(existing){existing.setLatLng([lat,lng]);return existing;}return L.circleMarker([lat,lng],{radius:10,color,fillColor:color,fillOpacity:.8}).bindTooltip(label).addTo(map);}
 rider=marker(rider,d.latitude,d.longitude,'#ef233c','Your rider');destination=marker(destination,d.destination_latitude,d.destination_longitude,'#73d19c','Delivery pin');branch=marker(branch,d.branch_latitude==null?null:Number(d.branch_latitude),d.branch_longitude==null?null:Number(d.branch_longitude),'#f5ca74','Sobers branch');

 $('#deliveryPinNote').textContent=destination?'Green marker: your delivery pin.':'No customer map pin was supplied; your rider has your written address.';
 $('#deliveryDistance').textContent=rider&&destination?`Approximately ${(SobersGPS.distance({latitude:d.latitude,longitude:d.longitude},{latitude:d.destination_latitude,longitude:d.destination_longitude})/1000).toFixed(1)} km straight-line distance · not a road distance or ETA.`:'';
 requestAnimationFrame(()=>{if(!map)return;map.invalidateSize();if(points.length&&!map._sobersFitted){map.fitBounds(points,{padding:[30,30],maxZoom:16});map._sobersFitted=true;}});age();
 }
 setInterval(age,1000);window.addEventListener('pagehide',()=>{if(channel)db.removeChannel(channel);});window.SobersDeliveryMap={render};
})();
