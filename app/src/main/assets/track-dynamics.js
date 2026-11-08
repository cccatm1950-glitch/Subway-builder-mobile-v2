/* Subway Builder mobile track dynamics: Windows v1.6.0 curve/speed primitives. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SBTrackDynamics=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const RAD=Math.PI/180,KMH=3.6;
 const dist=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
 const bearing=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x)/RAD;
 const angle=d=>((d+540)%360)-180;
 function calculateTurnRadius(a,b,c,options={}){
  if(!a||!b||!c||![a.x,a.y,b.x,b.y,c.x,c.y].every(Number.isFinite))return null;
  const ab=dist(a,b),bc=dist(b,c),chord=dist(a,c);
  if(Math.min(ab,bc,chord)<(options.minSegmentLength??.5))return null;
  const delta=Math.abs(angle(bearing(a,b)-bearing(b,c)));
  if(delta<(options.cubic?2:1))return null;
  const sine=Math.sin(delta*RAD/2);if(Math.abs(sine)<1e-9)return null;
  const radius=chord/(2*sine)*(options.cubic?(options.cubicSpeedMultiplier??3):1);
  return Number.isFinite(radius)&&radius>0?radius:null;
 }
 function calculateSmoothedTrackRadii(points,options={}){
  if(!Array.isArray(points)||points.length<3)return [];
  const raw=[];for(let i=0;i<points.length-2;i++)raw.push(calculateTurnRadius(points[i],points[i+1],points[i+2],options));
  const radius=Math.max(1,Math.floor(options.smoothingRadius??2));
  return raw.map((v,i)=>{if(v==null)return null;const window=raw.slice(Math.max(0,i-radius),Math.min(raw.length,i+radius+1)).filter(Number.isFinite);return window.length?Math.max(options.minTurnRadius??0,Math.min(...window)):null;});
 }
 function getMaxSpeedForSlope(maxSpeedKmh,slopePercent){
  if(!Number.isFinite(maxSpeedKmh)||maxSpeedKmh<=0)return 0;
  const s=Math.abs(Number.isFinite(slopePercent)?slopePercent:0),factor=s>=9.5?.60:s>=8?.75:s>=6?.90:1;
  return maxSpeedKmh*factor;
 }
 function getMaxSpeedForRadiusAndSlope(input={}){
  const top=Number(input.maxSpeedKmh);if(!Number.isFinite(top)||top<=0)return 0;
  let cap=top;const r=Number(input.radiusMeters),minR=Number(input.minTurnRadiusMeters)||0,lat=Number(input.maxLateralAcceleration)||.8;
  if(Number.isFinite(r)&&r>0&&lat>0)cap=Math.min(cap,Math.sqrt(Math.max(1,Math.min(r,minR>0?minR:r))*lat)*KMH);
  cap*=Number.isFinite(input.curveSpeedMultiplier)?Math.max(.5,input.curveSpeedMultiplier):1;
  cap=getMaxSpeedForSlope(cap,input.slopePercent);if(input.stationTrack)cap*=.5;
  return Math.max(0,cap);
 }
 function getSpeedBand(v){if(!Number.isFinite(v)||v<0)return'unknown';if(v<10)return'very-slow';if(v<25)return'slow';if(v<50)return'moderate';if(v<75)return'medium';if(v<90)return'fast';if(v<130)return'very-fast';return'high-speed';}
 return{calculateTurnRadius,calculateSmoothedTrackRadii,getMaxSpeedForSlope,getMaxSpeedForRadiusAndSlope,getSpeedBand};
});
