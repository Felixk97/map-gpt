
// Official Malaysia GTFS Static rail planner. Parsed data is cached per Worker isolate.
const RAIL_FEEDS=[
 {agency:"KTMB",url:"https://api.data.gov.my/gtfs-static/ktmb"},
 {agency:"Prasarana Rapid Rail KL",url:"https://api.data.gov.my/gtfs-static/prasarana?category=rapid-rail-kl"}
];
let railCache=null,railCacheAt=0,railPending=null;
const railText=v=>String(v??"").replace(/^\uFEFF/,"").trim();
function railCsv(s){
 const rows=[];let row=[],v="",q=false;
 for(let i=0;i<s.length;i++){const c=s[i];if(q){if(c==='"'&&s[i+1]==='"'){v+='"';i++}else if(c==='"')q=false;else v+=c}
 else if(c==='"')q=true;else if(c===","){row.push(v);v=""}else if(c==="\n"){row.push(v);rows.push(row);row=[];v=""}else if(c!=="\r")v+=c}
 if(v.length||row.length){row.push(v);rows.push(row)}
 if(!rows.length)return [];
 const headers=rows.shift().map(railText);
 return rows.filter(r=>r.some(x=>x!=="")).map(r=>Object.fromEntries(headers.map((h,i)=>[h,railText(r[i]) ])));
}
async function railZipFiles(buffer){
 const bytes=new Uint8Array(buffer),view=new DataView(buffer),decoder=new TextDecoder(),out={};
 let eocd=-1;
 for(let i=Math.max(0,bytes.length-65557);i<=bytes.length-22;i++)if(view.getUint32(i,true)===0x06054b50)eocd=i;
 if(eocd<0)throw Error("GTFS ZIP directory not found");
 const count=view.getUint16(eocd+10,true),offset=view.getUint32(eocd+16,true);let p=offset;
 for(let n=0;n<count;n++){
  if(view.getUint32(p,true)!==0x02014b50)break;
  const method=view.getUint16(p+10,true),compressed=view.getUint32(p+20,true),nameLen=view.getUint16(p+28,true),extra=view.getUint16(p+30,true),comment=view.getUint16(p+32,true),local=view.getUint32(p+42,true);
  const name=decoder.decode(bytes.slice(p+46,p+46+nameLen));p+=46+nameLen+extra+comment;
  if(!/^(stops|routes|trips|stop_times|calendar|calendar_dates|shapes|transfers|fare_attributes|fare_rules)\.txt$/i.test(name))continue;
  const lp=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true),raw=bytes.slice(lp,lp+compressed);let data;
  if(method===0)data=raw;else if(method===8){const stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));data=new Uint8Array(await new Response(stream).arrayBuffer())}else continue;
  out[name.toLowerCase()]=railCsv(decoder.decode(data));
 }
 if(!out["stops.txt"]||!out["trips.txt"]||!out["stop_times.txt"])throw Error("Required GTFS files are missing");
 return out;
}
async function railFeed(feed){
 const response=await fetch(feed.url,{headers:{"Accept":"application/zip"},signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error(feed.agency+" feed returned "+response.status);
 const files=await railZipFiles(await response.arrayBuffer());return {agency:feed.agency,files};
}
async function getRailFeeds(){
 if(railCache&&Date.now()-railCacheAt<3600000)return railCache;
 if(railPending)return railPending;
 railPending=Promise.all(RAIL_FEEDS.map(railFeed)).then(x=>(railCache=x,railCacheAt=Date.now(),x)).finally(()=>railPending=null);
 return railPending;
}
const railDateKey=d=>d.toISOString().slice(0,10);
function railServiceActive(files,service,date){
 const day=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][date.getUTCDay()],key=railDateKey(date).replaceAll("-","");
 let active=(files["calendar.txt"]||[]).find(x=>x.service_id===service);
 let ok=!!active&&active[day]==="1"&&key>=active.start_date&&key<=active.end_date;
 const exception=(files["calendar_dates.txt"]||[]).find(x=>x.service_id===service&&x.date===key);
 if(exception)ok=exception.exception_type==="1";
 return ok;
}
function railSecs(s){const a=s.split(":").map(Number);return a.length===3&&a.every(Number.isFinite)?a[0]*3600+a[1]*60+a[2]:null}
function railFmt(s){const h=Math.floor(s/3600)%24,m=Math.floor(s%3600/60);return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")}
function railDist(a,b){const r=Math.PI/180,dy=(a.lat-b.lat)*r,dx=(a.lon-b.lon)*r;return 6371000*2*Math.asin(Math.sqrt(Math.sin(dy/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dx/2)**2))}
function railMatch(files,name){
 const q=name.toLowerCase().replace(/\b(station|stesen)\b/g,"").replace(/[^a-z0-9]/g,"");
 const list=files["stops.txt"].map(s=>({...s,lat:Number(s.stop_lat),lon:Number(s.stop_lon)})).filter(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon));
 const scored=list.map(s=>{const n=(s.stop_name||"").toLowerCase().replace(/\b(station|stesen)\b/g,"").replace(/[^a-z0-9]/g,"");return {s,score:n===q?0:n.startsWith(q)||q.startsWith(n)?1:n.includes(q)?2:9}}).sort((a,b)=>a.score-b.score);
 return scored[0]?.score<=2?scored[0].s:null;
}
function railShape(files,trip,stops){
 const shapeId=trip.shape_id,rows=(files["shapes.txt"]||[]).filter(x=>x.shape_id===shapeId).sort((a,b)=>Number(a.shape_pt_sequence)-Number(b.shape_pt_sequence));
 if(rows.length>1)return rows.map(x=>[Number(x.shape_pt_lon),Number(x.shape_pt_lat)]).filter(p=>p.every(Number.isFinite));
 return stops.map(s=>[s.lon,s.lat]);
}
async function railPlan(request){
 const u=new URL(request.url),from=railText(u.searchParams.get("from")),to=railText(u.searchParams.get("to")),dateRaw=u.searchParams.get("date"),timeRaw=u.searchParams.get("time")||"08:00";
 const json=(v,status=200)=>Response.json(v,{status,headers:{"Cache-Control":"public, max-age=60"}});
 if(request.method!=="GET")return json({error:"GET required"},405);
 if(!from||!to||from.length>100||to.length>100)return json({error:"Enter both station names"},400);
 const date=new Date(dateRaw+"T12:00:00Z");if(!dateRaw||!Number.isFinite(date.getTime()))return json({error:"Choose a valid travel date"},400);
 const dep=railSecs(timeRaw+":00");if(dep===null)return json({error:"Choose a valid departure time"},400);
 try{
  const feeds=await getRailFeeds(),candidates=[];
  for(const feed of feeds){
   const f=feed.files,origin=railMatch(f,from),dest=railMatch(f,to);
   if(origin&&dest)candidates.push({feed,origin,dest});
  }
  if(!candidates.length)return json({error:"Could not match both stations in the official KTMB or Prasarana feeds. Try the station's official name."},404);
  const results=[];
  for(const c of candidates){
   const {feed,origin,dest}=c,f=feed.files,stopMap=new Map(f["stops.txt"].map(s=>[s.stop_id,s])),routes=new Map((f["routes.txt"]||[]).map(r=>[r.route_id,r]));
   const trips=new Map((f["trips.txt"]||[]).filter(t=>railServiceActive(f,t.service_id,date)).map(t=>[t.trip_id,t]));
   const grouped=new Map();
   for(const st of f["stop_times.txt"]||[]){if(!trips.has(st.trip_id))continue;const sec=railSecs(st.departure_time||st.arrival_time);if(sec===null)continue;if(!grouped.has(st.trip_id))grouped.set(st.trip_id,[]);grouped.get(st.trip_id).push({...st,sec})}
   const graph=new Map();
   for(const [tripId,arr] of grouped){arr.sort((a,b)=>Number(a.stop_sequence)-Number(b.stop_sequence));for(let i=0;i<arr.length-1;i++){const a=arr[i],b=arr[i+1],key=a.stop_id;if(!graph.has(key))graph.set(key,[]);graph.get(key).push({to:b.stop_id,depart:a.sec,arrive:railSecs(b.arrival_time)||b.sec,trip:trips.get(tripId),route:routes.get(trips.get(tripId).route_id),tripId,fromSeq:i,toSeq:i+1})}}
   const start=origin.stop_id,goal=dest.stop_id,dist=new Map([[start,dep]]),prev=new Map(),visited=new Set();
   for(let iter=0;iter<Math.min(100000,graph.size+1);iter++){
    let node=null,best=Infinity;for(const [k,v] of dist)if(!visited.has(k)&&v<best){node=k;best=v}
    if(node===null||node===goal)break;visited.add(node);
    for(const e of graph.get(node)||[]){if(e.depart<best||e.arrive<e.depart)continue;const wait=e.depart-best,transferPenalty=0,next=e.arrive+transferPenalty;if(next<(dist.get(e.to)??Infinity)){dist.set(e.to,next);prev.set(e.to,{node,edge:e})}}
   }
   if(!dist.has(goal))continue;
   const path=[];let cur=goal;while(cur!==start&&prev.has(cur)){const x=prev.get(cur);path.unshift(x.edge);cur=x.node}
   if(cur!==start||!path.length)continue;
   const legs=[];let leg=null;
   for(const e of path){if(!leg||leg.tripId!==e.tripId){leg={tripId:e.tripId,route:e.route,trip:e.trip,agency:feed.agency,stops:[stopMap.get(e.from),stopMap.get(e.to)],departure:railFmt(e.depart),arrival:railFmt(e.arrive)};legs.push(leg)}else{leg.stops.push(stopMap.get(e.to));leg.arrival=railFmt(e.arrive)}}
   const allStops=legs.flatMap((l,i)=>i?l.stops.slice(1):l.stops).filter(Boolean);
   const shape=legs.flatMap(l=>railShape(f,l.trip,l.stops));
   results.push({agency:feed.agency,from:origin.stop_name,to:dest.stop_name,departure:legs[0].departure,arrival:railFmt(dist.get(goal)),legs:legs.map(l=>({line:l.route?.route_long_name||l.route?.route_short_name||"Rail service",agency:l.agency,departure:l.departure,arrival:l.arrival,stops:l.stops.map(s=>({name:s.stop_name,lat:Number(s.stop_lat),lon:Number(s.stop_lon)})),transferAt:null})),transfers:Math.max(0,legs.length-1),geometry:{type:"LineString",coordinates:shape},fare:null,fareNote:"Per-journey fare is not consistently published in these static feeds; verify with the operator."});
  }
  results.sort((a,b)=>a.transfers-b.transfers||a.arrival.localeCompare(b.arrival));
  if(!results.length)return json({error:"No scheduled journey found for this date and departure time. Try an earlier time or another date."},404);
  return json({source:"Malaysia official GTFS Static",checkedAt:new Date().toISOString(),journeys:results.slice(0,3),note:"Scheduled services only; not live train positions or disruption data."});
 }catch(e){return json({error:"Rail timetable temporarily unavailable: "+String(e.message||e).slice(0,180)},502)}
}

// Station discovery for autocomplete, nearby station search and local offline snapshots.
async function railStations(request){
 const u=new URL(request.url),query=railText(u.searchParams.get('q')).toLowerCase(),lat=Number(u.searchParams.get('lat')),lon=Number(u.searchParams.get('lon'));
 if(query.length>80)return Response.json({error:'Search is too long'},{status:400});
 const nearby=u.searchParams.has('lat')&&u.searchParams.has('lon');
 if(nearby&&(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<0||lat>8||lon<98||lon>120))return Response.json({error:'Invalid coordinates'},{status:400});
 try{
  const feeds=await getRailFeeds(),seen=new Set(),stations=[];
  for(const f of feeds)for(const s of f.files['stops.txt']||[]){
   const name=railText(s.stop_name),a=Number(s.stop_lat),b=Number(s.stop_lon);
   if(!name||!Number.isFinite(a)||!Number.isFinite(b))continue;
   if(query&&!name.toLowerCase().includes(query))continue;
   const key=f.agency+':'+name.toLowerCase();if(seen.has(key))continue;seen.add(key);
   const station={name,agency:f.agency,lat:a,lon:b};
   if(nearby)station.distanceMeters=Math.round(railDist({lat,lon},{lat:a,lon:b}));
   stations.push(station);
  }
  stations.sort((a,b)=>nearby?a.distanceMeters-b.distanceMeters:a.name.localeCompare(b.name));
  return Response.json({stations:stations.slice(0,nearby?12:query?35:2500),checkedAt:new Date().toISOString(),source:'Official GTFS Static',live:false},{headers:{'Cache-Control':'public, max-age=600'}});
 }catch(e){return Response.json({error:'Station directory unavailable: '+String(e.message||e).slice(0,100)},{status:502})}
}
