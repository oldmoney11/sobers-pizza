(function(root){
  'use strict';
  const distance=(a,b)=>{const rad=x=>x*Math.PI/180,dl=rad(b.latitude-a.latitude),dn=rad(b.longitude-a.longitude);const v=Math.sin(dl/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dn/2)**2;return 6371000*2*Math.atan2(Math.sqrt(v),Math.sqrt(1-v));};
  function create({geo,send,notify,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}){
    let watch=null,timer=null,latest=null,last=null,lastSent=0,busy=false,generation=0;
    async function flush(){timer=null;if(!latest||busy)return;if(now()-latest.fixTime>20000){notify('Waiting for a fresh GPS fix.');return;}const g=generation;const pos=latest;busy=true;
      try{await send(pos);if(g!==generation)return;last=pos;lastSent=now();notify('Sharing location · keep Rider Mode open');}
      catch(error){if(g!==generation)return;if(error.fatal){stop();notify(error.message);return;}notify(error.message||'Connection lost. Retrying the latest position.');}
      finally{busy=false;if(g===generation&&watch!==null)timer=setTimer(flush,15000);}
    }
    function stop(){generation++;if(watch!==null)geo.clearWatch(watch);watch=null;if(timer!==null)clearTimer(timer);timer=null;latest=null;last=null;lastSent=0;notify('Location sharing stopped');}
    function start(){stop();if(!geo)throw Error('GPS is unavailable on this device');notify('Waiting for GPS permission and a location fix…');watch=geo.watchPosition(position=>{
      const c=position.coords;if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||!Number.isFinite(c.accuracy)||c.accuracy>200){notify('GPS accuracy is poor. Waiting for a better fix.');return;}
      if(position.timestamp && now()-position.timestamp>20000){notify('Waiting for a fresh GPS fix.');return;}
      latest={latitude:c.latitude,longitude:c.longitude,accuracy:c.accuracy,heading:Number.isFinite(c.heading)&&c.heading>=0&&c.heading<360?c.heading:null,speed:Number.isFinite(c.speed)&&c.speed>=0&&c.speed<=100?c.speed:null,fixTime:now()};
      if(!busy&&now()-lastSent>=15000&&(!last||distance(last,latest)>=20||now()-lastSent>=30000)){if(timer!==null)clearTimer(timer);flush();}
    },error=>{if(error.code===1)stop();notify(error.code===1?'Location permission denied. Enable location access to start delivery.':error.code===2?'GPS unavailable. Move somewhere with a clear signal.':'Waiting for a GPS fix.');},{enableHighAccuracy:true,maximumAge:5000,timeout:15000});}
    return {start,stop,isActive:()=>watch!==null};
  }
  root.SobersGPS={create,distance};
  if(typeof module!=='undefined')module.exports=root.SobersGPS;
})(typeof window!=='undefined'?window:globalThis);
