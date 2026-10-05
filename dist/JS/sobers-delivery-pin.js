(() => {
 'use strict';let map,marker,pin=null;
 const $=s=>document.querySelector(s),status=text=>$('#deliveryPinStatus').textContent=text;
 function set(lat,lng){pin={latitude:lat,longitude:lng};if(marker)marker.setLatLng([lat,lng]);else marker=L.circleMarker([lat,lng],{radius:10,color:'#ef233c'}).addTo(map);status('Delivery pin saved. You can tap the map to adjust it.');}
 function open(){const host=$('#deliveryPinMap');host.hidden=false;if(!map){map=L.map(host).setView([4.9,-1.76],13);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:"origin",attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);map.on('click',e=>set(e.latlng.lat,e.latlng.lng));}map.invalidateSize();}
 $('#chooseDeliveryPin').onclick=()=>{open();status('Tap your delivery location on the map.');};
 $('#locateDeliveryPin').onclick=()=>{open();if(!navigator.geolocation)return status('GPS unavailable. Choose a pin on the map.');status('Finding your location…');navigator.geolocation.getCurrentPosition(p=>{if(p.coords.accuracy>200)return status('GPS accuracy is poor. Please choose your delivery pin on the map.');set(p.coords.latitude,p.coords.longitude);map.setView([p.coords.latitude,p.coords.longitude],17);},()=>status('Location unavailable or permission denied. You can choose a pin manually.'),{enableHighAccuracy:true,timeout:15000,maximumAge:5000});};
 let saved;try{const prefs=JSON.parse(localStorage.getItem('sobersCustomerPrefsV1')||'null');if(prefs?.location&&Number.isFinite(prefs.coords?.lat)&&Number.isFinite(prefs.coords?.lng)&&Math.abs(prefs.coords.lat)<=90&&Math.abs(prefs.coords.lng)<=180)saved=prefs.coords;}catch(_){}
 $('#savedDeliveryPin').hidden=!saved;$('#savedDeliveryPin').onclick=()=>{if(!saved)return;open();set(saved.lat,saved.lng);map.setView([saved.lat,saved.lng],17);status('Saved location selected. Check the pin matches this delivery address.');};
 $('#clearDeliveryPin').onclick=()=>{pin=null;if(marker){map.removeLayer(marker);marker=null;}status('Pin removed. Your written address will be used.');};
 window.SobersDeliveryPin={get:()=>pin,clear:()=>{pin=null;if(marker){map.removeLayer(marker);marker=null;}status('Optional: choose your delivery location.');}};
})();
