const map=L.map('map',{zoomControl:false}).setView([4.21,101.98],7);L.control.zoom({position:'bottomright'}).addTo(map);
const darkTiles=L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'© OpenStreetMap contributors © CARTO',maxZoom:19}).addTo(map);const streetTiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19});let darkMode=true;
const $=id=>document.getElementById(id),status=msg=>$('status').textContent=msg;
const selected={from:null,to:null},markers={from:null,to:null};let routes=[],active=0,routeLayer=null,tapNext='from',navWatch=null,navMarker=null,navAccuracy=null,lastSpokenStep=-1,offRouteNotified=false,followGPS=true,lastReroute=0,offRouteSamples=0,reroutePending=false,navSession=0,lastIncidentCheck=0,incidentBusy=false,incidentSeen=new Set();
const trafficLayer=L.layerGroup().addTo(map),railLayer=L.layerGroup().addTo(map);$('mapStyle').onclick=()=>{map.removeLayer(darkMode?darkTiles:streetTiles);(darkMode?streetTiles:darkTiles).addTo(map);darkMode=!darkMode;status(darkMode?'Dark map enabled.':'Street map enabled.');};
function mark(kind,point,name){selected[kind]={lat:point.lat,lng:point.lng,name};if(markers[kind])map.removeLayer(markers[kind]);markers[kind]=L.circleMarker([point.lat,point.lng],{radius:9,weight:3,color:'#fff',fillColor:kind==='from'?'#10b96a':'#a8ce45',fillOpacity:1}).addTo(map).bindPopup(document.createTextNode((kind==='from'?'Start: ':'Destination: ')+name));$(kind).value=name;tapNext=kind==='from'?'to':'from';if(threeD)sync3dRoute();}
function clearRoute(){if(navWatch!==null)stopNavigation();if(routeLayer)map.removeLayer(routeLayer);routeLayer=null;routes=[];if(threeD)sync3dRoute();$('routeSheet').hidden=true;}
function reset(){if(navWatch!==null)stopNavigation();for(const k of ['from','to']){selected[k]=null;$(k).value='';if(markers[k])map.removeLayer(markers[k]);markers[k]=null;}clearRoute();tapNext='from';status('Search for a destination to get started.');}
$('reset').onclick=reset;$('openSearch').onclick=()=>$('searchPanel').hidden=false;$('closeSearch').onclick=()=>$('searchPanel').hidden=true;$('sheetClose').onclick=()=>$('routeSheet').hidden=true;
map.on('click',e=>{const k=tapNext;mark(k,e.latlng,'Pinned location');clearRoute();status(k==='from'?'Starting point pinned. Search or tap a destination.':'Destination pinned. Press Find routes.');});
async function request(url){const r=await fetch(url);let d;try{d=await r.json()}catch{throw Error('Service returned an invalid response')}if(!r.ok)throw Error(d.error||'Request failed');return d;}
for(const kind of ['from','to']){const input=$(kind),list=$(kind+'-suggestions');let timer=0,seq=0;input.addEventListener('input',()=>{selected[kind]=null;clearRoute();clearTimeout(timer);const q=input.value.trim();const current=++seq;list.hidden=true;if(q.length<3)return;timer=setTimeout(async()=>{try{const data=await request('/api/search?q='+encodeURIComponent(q));if(current!==seq)return;list.replaceChildren();for(const place of data.results){const btn=document.createElement('button');btn.type='button';btn.textContent=place.name;const small=document.createElement('small');small.textContent=place.address||'';btn.appendChild(small);btn.onclick=()=>{mark(kind,{lat:place.lat,lng:place.lon},place.name);list.hidden=true;map.setView([place.lat,place.lon],Math.max(map.getZoom(),11));status(kind==='from'?'Starting point selected. Search for your destination.':'Destination selected. Press Find routes.');};list.appendChild(btn);}list.hidden=!data.results.length;if(!data.results.length)status('No matching places found.');}catch(e){if(current===seq)status('Search unavailable: '+e.message);}},320);});input.addEventListener('blur',()=>setTimeout(()=>list.hidden=true,180));}
$('swap').onclick=()=>{const a=selected.from,b=selected.to;if(!a||!b){status('Choose both locations first.');return;}mark('from',b,b.name);mark('to',a,a.name);clearRoute();};
function locate(){if(!navigator.geolocation){status('Location not supported.');return;}status('Requesting location permission…');navigator.geolocation.getCurrentPosition(p=>{mark('from',{lat:p.coords.latitude,lng:p.coords.longitude},'My current location');map.setView([p.coords.latitude,p.coords.longitude],13);status('Current location selected.');},()=>status('Location unavailable. Check permissions.'),{enableHighAccuracy:true,timeout:10000});}
$('locate').onclick=locate;$('useLocation').onclick=locate;
function renderRoute(index){active=index;const route=routes[index];if(!route)return;if(routeLayer)map.removeLayer(routeLayer);routeLayer=L.polyline(route.points.map(p=>[p.latitude,p.longitude]),{color:'#22bd74',weight:7,opacity:.95}).addTo(map);if(threeD){sync3dRoute();if(driveCamera)drivePreview();else fit3dRoute();}map.fitBounds(routeLayer.getBounds(),{padding:[45,45]});for(const [i,el] of [...$('routeOptions').children].entries())el.classList.toggle('active',i===index);$('routeInfo').textContent=route.distanceKm.toFixed(1)+' km · '+Math.round(route.travelMinutes)+' min estimated.'; $('tollInfo').textContent=route.tollStatus==='tollRoad'?'TomTom reports '+route.tollRoadSections+' toll-road section(s). Fare unavailable for vehicle class '+$('vehicleClass').value+': current verified prices are not connected.':route.tollStatus==='noTollRoadReported'?'TomTom did not report toll-road sections. This is not a guarantee of a toll-free journey.':'Toll information unavailable.';$('laneStatus').textContent=route.instructions?.some(s=>s.laneGuidance?.length)?'Provider lane guidance available for some maneuvers (see directions).':'Lane guidance unavailable for this route; follow road markings.';speedAtRoute();$('routeLanguageStatus').textContent='Route instructions requested in '+$('language').selectedOptions[0].textContent+'. Actual language depends on TomTom support; check the text before relying on voice.';refreshDirections();}

$('route').onclick=async()=>{if(!selected.from||!selected.to){status('Search for a starting point and destination.');return;}status('Finding driving routes…');try{const a=selected.from,b=selected.to;const d=await request('/api/route?from='+encodeURIComponent(a.lng+','+a.lat)+'&to='+encodeURIComponent(b.lng+','+b.lat)+'&language='+encodeURIComponent($('language').value));routes=d.routes?.length?d.routes:[d];$('destinationTitle').textContent=selected.to.name;$('routeCount').textContent=routes.length+' available';const options=$('routeOptions');options.replaceChildren();routes.forEach((r,i)=>{const btn=document.createElement('button');btn.className='route-option';const title=document.createElement('small');title.textContent=i===0?'FASTEST':'ALTERNATIVE '+i;const time=document.createElement('strong');time.textContent=Math.round(r.travelMinutes)+' min';const dist=document.createElement('span');dist.textContent=r.distanceKm.toFixed(1)+' km · '+(r.tollStatus==='tollRoad'?'Toll road detected':r.tollStatus==='noTollRoadReported'?'No toll road reported':'Toll status unknown');btn.append(title,time,dist);btn.onclick=()=>renderRoute(i);options.appendChild(btn);});$('searchPanel').hidden=true;$('routeSheet').hidden=false;renderRoute(0);status('Routes ready.');}catch(e){status('Route unavailable: '+e.message);}};
function distanceMeters(a,b){const r=Math.PI/180,dLat=(b.lat-a.lat)*r,dLon=(b.lng-a.lng)*r;const x=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;return 12742000*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function say(message){if(!$('voice').checked||!('speechSynthesis'in window)||!message)return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(message);u.lang=$('voiceLanguage').value;u.volume=Number($('voiceVolume').value)/100;u.rate=.95;const v=speechSynthesis.getVoices();const lang=u.lang.toLowerCase();u.voice=v.find(x=>x.lang.toLowerCase()===lang)||v.find(x=>x.lang.toLowerCase().split('-')[0]===lang.split('-')[0])||null;speechSynthesis.speak(u);}
function stopNavigation(){navSession++;incidentSeen.clear();$('incidentStatus').textContent='Traffic alerts: stopped';offRouteSamples=0;reroutePending=false;$('rerouteState').textContent='';if(navWatch!==null){navigator.geolocation.clearWatch(navWatch);navWatch=null;}if(navMarker){map.removeLayer(navMarker);navMarker=null;}if(navAccuracy){map.removeLayer(navAccuracy);navAccuracy=null;}$('navOverlay').hidden=true;$('routeSheet').hidden=false;if('speechSynthesis'in window)speechSynthesis.cancel();status('Navigation stopped.');}
async function rerouteFrom(here,session){if(reroutePending||!selected.to||!routes[active])return;reroutePending=true;lastReroute=Date.now();$('rerouteState').textContent='Finding updated route…';try{const b=selected.to;const d=await request('/api/route?from='+encodeURIComponent(here.lng+','+here.lat)+'&to='+encodeURIComponent(b.lng+','+b.lat)+'&language='+encodeURIComponent($('language').value));if(session!==navSession)return;const next=d.routes?.[0];if(!next?.points?.length)throw Error('No new route');routes=[next];active=0;lastSpokenStep=-1;offRouteSamples=0;offRouteNotified=false;lastGpsTimestamp=0;if(routeLayer)map.removeLayer(routeLayer);routeLayer=L.polyline(next.points.map(p=>[p.latitude,p.longitude]),{color:'#22bd74',weight:7}).addTo(map);if(threeD)sync3dRoute();$('navEta').textContent=Math.round(next.travelMinutes)+' min · '+next.distanceKm.toFixed(1)+' km planned';$('rerouteState').textContent='Route updated';say('Route updated. Follow the new route when safe.');}catch(e){if(session===navSession)$('rerouteState').textContent='Could not reroute; follow road signs';}finally{reroutePending=false;}}
async function checkRouteIncidents(here,accuracy,route,closest,session){if(!document.hidden&&!incidentBusy&&$('incidentAlerts').checked&&Date.now()-lastIncidentCheck>=60000&&accuracy<65){lastIncidentCheck=Date.now();incidentBusy=true;try{const span=.015,west=Math.max(-180,here.lng-span),east=Math.min(180,here.lng+span),south=Math.max(-90,here.lat-span),north=Math.min(90,here.lat+span);const data=await request('/api/traffic?bbox='+encodeURIComponent([west,south,east,north].join(',')));if(session!==navSession)return;const points=route.points;let ahead=0;const path=[];for(let i=closest;i<points.length&&ahead<1500;i++){const p={lat:points[i].latitude,lng:points[i].longitude};path.push(p);if(i+1<points.length)ahead+=distanceMeters(p,{lat:points[i+1].latitude,lng:points[i+1].longitude});}let count=0;for(const item of data.incidents||[]){const g=item.geometry;if(g?.type!=='Point'||!Array.isArray(g.coordinates))continue;const location={lat:Number(g.coordinates[1]),lng:Number(g.coordinates[0])};if(!Number.isFinite(location.lat)||!Number.isFinite(location.lng))continue;const nearest=path.reduce((best,p)=>Math.min(best,distanceMeters(p,location)),Infinity);if(nearest>45)continue;count++;const description=String(item.description||'Reported traffic incident').slice(0,110);const key=[location.lat.toFixed(4),location.lng.toFixed(4),description].join('|');if(!incidentSeen.has(key)){incidentSeen.add(key);if(incidentSeen.size>100)incidentSeen.clear();$('incidentStatus').textContent='Reported traffic incident near route';say('Reported traffic incident may be ahead. Check road signs.');}}if(!count)$('incidentStatus').textContent='No nearby point incidents reported';}catch(e){if(session===navSession)$('incidentStatus').textContent='Traffic alerts unavailable';}finally{incidentBusy=false;}}}
function routeProgress(here,points){
 const rad=Math.PI/180,latScale=111195,lonScale=latScale*Math.cos(here.lat*rad);
 let best={distance:Infinity,travelled:0,index:0},sum=0;
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1],ax=(a.longitude-here.lng)*lonScale,ay=(a.latitude-here.lat)*latScale,bx=(b.longitude-here.lng)*lonScale,by=(b.latitude-here.lat)*latScale;
  const dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy,t=len2?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/len2)):0;
  const dist=Math.hypot(ax+t*dx,ay+t*dy),length=distanceMeters({lat:a.latitude,lng:a.longitude},{lat:b.latitude,lng:b.longitude});
  if(dist<best.distance)best={distance:dist,travelled:sum+t*length,index:i};
  sum+=length;
 }
 return {...best,total:sum,remaining:Math.max(0,sum-best.travelled)};
}
let lastGpsTimestamp=0,lastProgressMeters=0,routeGeometryCache=null,routeGeometryRef=null;
function updatePosition(pos){
 const route=routes[active];if(!route||route.points?.length<2)return;
 if(pos.timestamp&&pos.timestamp<=lastGpsTimestamp)return;
 const here={lat:pos.coords.latitude,lng:pos.coords.longitude},accuracy=Number(pos.coords.accuracy);
 if(!Number.isFinite(here.lat)||!Number.isFinite(here.lng))return;
 if(pos.timestamp)lastGpsTimestamp=pos.timestamp;
 if(!navMarker)navMarker=L.circleMarker([here.lat,here.lng],{radius:9,color:'#fff',weight:3,fillColor:'#238bff',fillOpacity:1}).addTo(map);else navMarker.setLatLng([here.lat,here.lng]);
 if(!navAccuracy)navAccuracy=L.circle([here.lat,here.lng],{radius:Number.isFinite(accuracy)?accuracy:100,color:'#338cf7',weight:1,fillOpacity:.08}).addTo(map);else navAccuracy.setLatLng([here.lat,here.lng]).setRadius(Number.isFinite(accuracy)?accuracy:100);
 if(followGPS&&!threeD&&distanceMeters(here,map.getCenter())>20)map.setView([here.lat,here.lng],Math.max(15,map.getZoom()),{animate:false});
 const progress=routeProgress(here,route.points),closest=progress.index,min=progress.distance,remaining=progress.remaining;
 const speedMatch=Number.isFinite(accuracy)&&accuracy<30?matchedSpeed(here):null;
 $('speedLimit').textContent=speedMatch?'Road dataset: '+speedMatch.speed+' km/h (unverified; obey posted signs)':'Speed limit: unavailable (no reliable match)';
 if(threeD&&driveCamera&&driveCameraFollowing&&threeDReady&&Date.now()-lastCameraMove>850){const heading=Number.isFinite(pos.coords.heading)&&Number.isFinite(pos.coords.speed)&&pos.coords.speed>2?pos.coords.heading:routeHeading(route.points,closest);setDriveCamera(here,heading,true);lastCameraMove=Date.now();}
 $('navDistance').textContent='Remaining: '+(remaining>=1000?(remaining/1000).toFixed(1)+' km':Math.round(remaining)+' m');
 $('navSpeed').textContent=Number.isFinite(pos.coords.speed)?'GPS speed: '+Math.max(0,Math.round(pos.coords.speed*3.6))+' km/h':'GPS speed: unavailable';
 const plannedSpeed=Math.max(15,Math.min(110,route.distanceKm/(route.travelMinutes/60||1)));
 const speed=Number.isFinite(pos.coords.speed)&&pos.coords.speed>4?Math.max(15,Math.min(110,pos.coords.speed*3.6)):plannedSpeed;
 const etaMinutes=Math.ceil(remaining/1000/speed*60);
 $('navEta').textContent='Approx. '+etaMinutes+' min remaining · '+(remaining/1000).toFixed(1)+' km';
 if(!Number.isFinite(accuracy)||accuracy>=60){$('navProgress').textContent='GPS accuracy low — route guidance may be unreliable';return;}
 checkRouteIncidents(here,accuracy,route,closest,navSession);checkAwas(here,accuracy,route,closest);
 if(min>Math.max(85,accuracy*2)){
  offRouteSamples++;$('navProgress').textContent='Possibly off route — check road signs';
  if(!offRouteNotified){say('You may be off the planned route. Check your surroundings.');offRouteNotified=true;}
  if(offRouteSamples>=3&&$('autoReroute').checked&&Date.now()-lastReroute>45000&&!reroutePending)rerouteFrom(here,navSession);
  return;
 }
 offRouteNotified=false;offRouteSamples=0;
 const travelled=progress.travelled;
 const steps=route.instructions||[];
 let stepIndex=steps.findIndex(s=>Number(s.distanceMeters)>=travelled-20);
 if(stepIndex<0)stepIndex=steps.length-1;
 const step=steps[stepIndex];
 if(step){
  const delta=Math.max(0,Math.round(Number(step.distanceMeters)-travelled));
  $('nextTurn').textContent=(delta>0?delta+' m · ':'')+localizedStep(step).primary;
  $('navProgress').textContent='GPS guidance · Position accuracy ±'+Math.round(accuracy)+' m';
  if(stepIndex!==lastSpokenStep&&delta<180&&accuracy<40){lastSpokenStep=stepIndex;say(localizedStep(step).primary);}
 }else{$('nextTurn').textContent='Follow planned route';$('navProgress').textContent='GPS active · Detailed directions unavailable';}
 if(remaining<45&&min<35){$('nextTurn').textContent='Approaching destination';$('navProgress').textContent='Check destination access and road signs';}
}

$('startNav').onclick=()=>{if(!routes[active])return;if(!navigator.geolocation){status('GPS location is not supported by this browser.');return;}$('routeSheet').hidden=true;$('navOverlay').hidden=false;$('navDestination').textContent=selected.to?.name||'Destination';$('navEta').textContent=Math.round(routes[active].travelMinutes)+' min · '+routes[active].distanceKm.toFixed(1)+' km planned';$('nextTurn').textContent='Waiting for GPS…';$('navProgress').textContent='Allow location permission to begin';lastSpokenStep=-1;offRouteNotified=false;offRouteSamples=0;lastGpsTimestamp=0;navSession++;lastIncidentCheck=0;incidentSeen.clear();awasSeen.clear();$('incidentStatus').textContent='Traffic alerts: waiting';followGPS=true;
try{navWatch=navigator.geolocation.watchPosition(updatePosition,e=>{const message=e.code===1?'Location permission denied':'GPS unavailable. Check location settings or signal.';$('navProgress').textContent=message;status(message);},{enableHighAccuracy:true,maximumAge:1500,timeout:15000});}catch(e){$('navProgress').textContent='Could not start GPS';status('GPS could not be started.');}};
$('endNav').onclick=stopNavigation;
$('recenterNav').onclick=()=>{followGPS=true;driveCameraFollowing=true;if(navMarker){const p=navMarker.getLatLng();if(threeD&&driveCamera&&threeDReady){const route=routes[active];setDriveCamera(p,route?.points?.length>1?routeHeading(route.points,0):0);}else map.setView(p,16);}};
map.on('dragstart',()=>{if(navWatch!==null)followGPS=false;});
$('traffic').onclick=async()=>{status('Loading traffic incidents…');trafficLayer.clearLayers();try{const b=map.getBounds();const d=await request('/api/traffic?bbox='+encodeURIComponent([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].join(',')));let n=0;for(const f of d.incidents){const g=f.geometry||{};if(g.type!=='Point'||!Array.isArray(g.coordinates))continue;L.circleMarker([g.coordinates[1],g.coordinates[0]],{radius:7,color:'#d43d38'}).bindPopup(document.createTextNode(f.description||'Traffic incident')).addTo(trafficLayer);n++;}status('Showing '+n+' traffic incident points.');}catch(e){status('Traffic unavailable: '+e.message);}};
$('rail').onclick=async()=>{status('Loading official rail stops…');railLayer.clearLayers();try{const d=await request('/api/gtfs?feed='+encodeURIComponent($('feed').value));for(const s of d.stops)L.circleMarker([s.lat,s.lon],{radius:4,color:'#26825b',weight:1,fillOpacity:.75}).bindPopup(document.createTextNode(s.name)).addTo(railLayer);status('Loaded '+d.stops.length+' rail stops.');}catch(e){status('Rail feed unavailable: '+e.message);}};
$('searchPanel').hidden=false;
/* Press-kit features: language selector and local-only hazard draft. */
const translations={
 en:{search:'Where to?',start:'FROM',dest:'DESTINATION',find:'Find routes',layers:'Explore Malaysia'},
 ms:{search:'Ke mana?',start:'DARI',dest:'DESTINASI',find:'Cari laluan',layers:'Terokai Malaysia'},
 zh:{search:'去哪里？',start:'出发地',dest:'目的地',find:'查找路线',layers:'探索马来西亚'},
 ta:{search:'எங்கு செல்ல?',start:'தொடக்கம்',dest:'சேருமிடம்',find:'வழிகளைக் காண்க',layers:'மலேசியாவை ஆராயுங்கள்'}
};
$('language').onchange=()=>{const t=translations[$('language').value];$('openSearch').textContent='⌕  '+t.search;document.querySelector('.panel-heading strong').textContent=t.search;document.querySelector('label[for="from"]').textContent=t.start;document.querySelector('label[for="to"]').textContent=t.dest;$('route').textContent=t.find;document.querySelector('.explore-badge').textContent='●  '+t.layers;status('Interface labels updated. Place names and directions depend on available data.');};

/* Optional 3D preview: MapLibre vector map with building extrusions where mapped. */
let map3d=null,threeD=false,threeDReady=false,driveCamera=false,driveCameraFollowing=true,lastCameraMove=0;
function routeBearing(a,b){const rad=Math.PI/180,lat1=a.lat*rad,lat2=b.lat*rad,dLon=(b.lng-a.lng)*rad;const y=Math.sin(dLon)*Math.cos(lat2),x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);return (Math.atan2(y,x)/rad+360)%360;}
function routeHeading(points,index){const a=points[Math.min(index,points.length-2)],b=points[Math.min(index+1,points.length-1)];return routeBearing({lat:a.latitude,lng:a.longitude},{lat:b.latitude,lng:b.longitude});}
function setDriveCamera(point,heading,animated=true){if(!map3d||!threeDReady||!threeD)return;const camera={center:[point.lng,point.lat],zoom:17,pitch:68,bearing:Number.isFinite(heading)?heading:0};if(animated)map3d.easeTo({...camera,duration:650,essential:true});else map3d.jumpTo(camera);}
function drivePreview(){const route=routes[active];if(!route?.points?.length||!threeDReady){status('Choose a route and wait for the 3D map to load.');return;}const first=route.points[0];driveCamera=true;driveCameraFollowing=true;$('driveView').setAttribute('aria-pressed','true');setDriveCamera({lat:first.latitude,lng:first.longitude},routeHeading(route.points,0));status('3D driving preview. Drag to inspect; use Recenter to restore.');}

const buildingStyle='https://tiles.openfreemap.org/styles/liberty';
function sync3dRoute(){
 if(!map3d||!threeDReady)return;
 const route=routes[active];
 const features=[];
 if(route?.points?.length>1)features.push({type:'Feature',properties:{kind:'route'},geometry:{type:'LineString',coordinates:route.points.map(p=>[p.longitude,p.latitude])}});
 for(const kind of ['from','to'])if(selected[kind])features.push({type:'Feature',properties:{kind},geometry:{type:'Point',coordinates:[selected[kind].lng,selected[kind].lat]}});
 const data={type:'FeatureCollection',features};
 const source=map3d.getSource('lapan-route');if(source)source.setData(data);
}
function init3d(){
 if(map3d)return;
 if(!window.maplibregl)throw Error('3D renderer unavailable. Check network connection.');
 const c=map.getCenter();
 map3d=new maplibregl.Map({container:'map3d',style:buildingStyle,center:[c.lng,c.lat],zoom:map.getZoom(),pitch:60,bearing:0,antialias:true,attributionControl:true});
 map3d.addControl(new maplibregl.NavigationControl({showCompass:true}),'bottom-right');
 map3d.on('load',()=>{
  threeDReady=true;
  const style=map3d.getStyle(),sources=style.sources||{};
  const vectorId=Object.keys(sources).find(k=>sources[k]?.type==='vector');
  if(vectorId){
   const layers=style.layers||[];
   const label=layers.find(l=>l.type==='symbol');
   try{map3d.addLayer({id:'lapan-buildings-3d',type:'fill-extrusion',source:vectorId,'source-layer':'building',minzoom:14,paint:{'fill-extrusion-color':'#7f91a1','fill-extrusion-height':['coalesce',['get','render_height'],['get','height'],12],'fill-extrusion-base':['coalesce',['get','render_min_height'],['get','min_height'],0],'fill-extrusion-opacity':0.76}},label?.id);}catch(e){status('3D view loaded; building heights unavailable in this area.');}
  }
  map3d.addSource('lapan-route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map3d.addLayer({id:'lapan-route-line',type:'line',source:'lapan-route',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':'#ffce2c','line-width':7,'line-opacity':.95}});
  map3d.addLayer({id:'lapan-route-points',type:'circle',source:'lapan-route',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':8,'circle-color':['case',['==',['get','kind'],'from'],'#20d47b','#ffd447'],'circle-stroke-width':2,'circle-stroke-color':'#fff'}});
  sync3dRoute();if(routes[active]?.points?.length>1)fit3dRoute();
 });
 map3d.on('error',()=>{if(threeD&&!threeDReady)status('3D map tiles unavailable. Try 2D mode.');});
 map3d.on('dragstart',()=>{driveCameraFollowing=false;});
 map3d.on('rotatestart',()=>{driveCameraFollowing=false;});
 map3d.on('click',e=>{const kind=tapNext;mark(kind,{lat:e.lngLat.lat,lng:e.lngLat.lng},'Pinned location');clearRoute();sync3dRoute();status(kind==='from'?'Starting point pinned.':'Destination pinned.');});
}
function fit3dRoute(){
 if(!map3d||!threeDReady)return;
 const pts=routes[active]?.points;if(!pts?.length)return;
 const bounds=new maplibregl.LngLatBounds();for(const p of pts)bounds.extend([p.longitude,p.latitude]);
 map3d.fitBounds(bounds,{padding:90,pitch:55,maxZoom:16,duration:550});
}
$('mode3d').onclick=()=>{
 if(!threeD){try{init3d();}catch(e){status(e.message);return;}}
 threeD=!threeD;$('map3d').hidden=!threeD;$('map').hidden=threeD;$('mode3d').setAttribute('aria-pressed',String(threeD));
 if(threeD){map3d.resize();const c=map.getCenter();if(threeDReady){map3d.jumpTo({center:[c.lng,c.lat],zoom:map.getZoom(),pitch:60});sync3dRoute();if(routes[active]){if(driveCamera)drivePreview();else fit3dRoute();}}status('3D preview enabled. Buildings depend on available map data.');}
 else{driveCamera=false;$('driveView').setAttribute('aria-pressed','false');const c=map3d.getCenter();map.setView([c.lat,c.lng],map3d.getZoom());map.invalidateSize();status('2D map enabled.');}
};

$('driveView').onclick=()=>{if(!threeD){$('mode3d').click();}if(threeDReady)drivePreview();else if(map3d)map3d.once('load',()=>{if(threeD)drivePreview();});};
const hazardDrafts=[];const draftLayer=L.layerGroup().addTo(map);
$('hazard').onclick=()=>{$('hazardPanel').hidden=false;$('searchPanel').hidden=true;};
$('closeHazard').onclick=()=>$('hazardPanel').hidden=true;
$('saveHazard').onclick=()=>{const c=map.getCenter();const kind=$('hazardType').value;hazardDrafts.push({type:kind,longitude:Number(c.lng.toFixed(6)),latitude:Number(c.lat.toFixed(6)),createdAt:new Date().toISOString(),status:'local-draft'});L.marker(c).bindPopup(document.createTextNode('Draft only: '+kind+' (not submitted)')).addTo(draftLayer).openPopup();$('hazardPanel').hidden=true;status('Hazard draft pin added locally. No report was submitted.');};

$('vehicleClass').onchange=()=>{if(routes[active])renderRoute(active);};
$('exportHazards').onclick=()=>{if(!hazardDrafts.length){status('No local hazard drafts to export.');return;}const blob=new Blob([JSON.stringify({schema:'lapan-hazard-drafts-v1',reports:hazardDrafts},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='lapan-hazard-drafts.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Local draft reports exported. Nothing was submitted.');};
$('language').addEventListener('change',()=>{const language={'en':'en-GB','ms':'ms-MY','zh':'zh-CN','ta':'ta-IN'}[$('language').value];$('voiceLanguage').value=language;});

/* JPJ AWAS: verified official records only. Empty dataset is intentional. */
const awasLayer=L.layerGroup().addTo(map);let awasRecords=[],awasEnabled=false,awasLoaded=false,awasSeen=new Set();
async function loadAwas(){
 const response=await fetch('/data/jpj-awas.json',{cache:'no-store'});
 if(!response.ok)throw Error('AWAS dataset unavailable');
 const data=await response.json();
 if(data.schema!=='lapan-jpj-awas-v1'||!Array.isArray(data.cameras))throw Error('AWAS dataset format invalid');
 awasRecords=data.cameras.filter(c=>Number.isFinite(c.latitude)&&Number.isFinite(c.longitude)&&Math.abs(c.latitude)<=90&&Math.abs(c.longitude)<=180&&['speed','traffic-light'].includes(c.type)&&c.verified===true&&typeof c.sourceUrl==='string'&&/^https:\/\//.test(c.sourceUrl)&&/^\d{4}-\d{2}-\d{2}$/.test(c.verifiedDate||''));
 awasLoaded=true;return awasRecords;
}
function drawAwas(){
 awasLayer.clearLayers();
 if(!awasEnabled)return;
 for(const c of awasRecords){
  const node=document.createElement('div');
  const heading=document.createElement('strong');heading.textContent='JPJ AWAS · '+(c.type==='speed'?'Speed enforcement':'Traffic-light enforcement');
  const description=document.createElement('p');description.textContent=(c.road||'Road unspecified')+(c.direction?' · '+c.direction:'')+' · Verified '+c.verifiedDate;
  const link=document.createElement('a');link.href=c.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Official source';
  node.append(heading,description,link);
  L.circleMarker([c.latitude,c.longitude],{radius:8,color:'#ffcb36',weight:3,fillColor:'#222',fillOpacity:1}).bindPopup(node).addTo(awasLayer);
 }
}
$('awas').onclick=async()=>{
 awasEnabled=!awasEnabled;$('awas').setAttribute('aria-pressed',String(awasEnabled));
 if(awasEnabled&&!awasLoaded){try{await loadAwas();}catch(e){awasEnabled=false;$('awas').setAttribute('aria-pressed','false');status(e.message);return;}}
 drawAwas();const msg=awasEnabled?'JPJ AWAS: '+awasRecords.length+' verified locations available.':'AWAS layer hidden.';
 status(msg);$('awasStatus').textContent=msg;
};
function checkAwas(here,accuracy,route,closest){
 if(!awasEnabled||!awasLoaded||!awasRecords.length||accuracy>=40)return;
 const points=route.points;let ahead=0;
 const segments=[];
 for(let i=closest;i<points.length-1&&ahead<1200;i++){const a={lat:points[i].latitude,lng:points[i].longitude},b={lat:points[i+1].latitude,lng:points[i+1].longitude};segments.push([a,b]);ahead+=distanceMeters(a,b);}
 for(const c of awasRecords){
  if(awasSeen.has(c.id)||distanceMeters(here,{lat:c.latitude,lng:c.longitude})>1000)continue;
  const near=segments.some(([a,b])=>{const latScale=111195,lonScale=latScale*Math.cos(c.latitude*Math.PI/180);const ax=(a.lng-c.longitude)*lonScale,ay=(a.lat-c.latitude)*latScale,bx=(b.lng-c.longitude)*lonScale,by=(b.lat-c.latitude)*latScale,dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));return Math.hypot(ax+t*dx,ay+t*dy)<35;});
  if(!near)continue;
  // No direction matching is available yet. Avoid voice alerts on opposing carriageways.
  $('awasStatus').textContent='Verified AWAS camera near route · Check road signs';
  awasSeen.add(c.id);
 }
}

/* Phase 3: local, explicitly sourced GeoJSON speed limits. No inferred legal limits. */
let speedSegments=[];
function parseSpeedKmh(value){
 if(typeof value==='number')return Number.isFinite(value)&&value>=5&&value<=150?value:null;
 if(typeof value!=='string')return null;
 const match=value.trim().match(/^(\d{1,3})(?:\s*(km\/h|kmh|kph|mph))?$/i);
 if(!match)return null;
 const speed=Number(match[1])*(match[2]?.toLowerCase()==='mph'?1.609344:1);
 return speed>=5&&speed<=150?Math.round(speed):null;
}
function segmentDistance(point,a,b){
 const scale=111195,cos=Math.cos(point.lat*Math.PI/180),ax=(a[0]-point.lng)*scale*cos,ay=(a[1]-point.lat)*scale,bx=(b[0]-point.lng)*scale*cos,by=(b[1]-point.lat)*scale,dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(ax+t*dx,ay+t*dy);
}
function matchedSpeed(point){
 let closest=Infinity,result=null;
 for(const seg of speedSegments){const d=segmentDistance(point,seg.a,seg.b);if(d<closest){closest=d;result=seg;}}
 return closest<=18?result:null;
}
function speedAtRoute(){
 const route=routes[active];
 if(!route?.points?.length){$('speedRouteStatus').textContent='Speed limits on route: unavailable.';return;}
 let matched=0,unknown=0;const values=new Set();
 const pts=route.points,step=Math.max(1,Math.ceil(pts.length/300));
 for(let i=0;i<pts.length;i+=step){const seg=matchedSpeed({lat:pts[i].latitude,lng:pts[i].longitude});if(seg){matched++;values.add(seg.speed);}else unknown++;}
 $('speedRouteStatus').textContent=speedSegments.length?'Local road data matched '+matched+' sampled route points; '+unknown+' unmatched. Values: '+([...values].sort((a,b)=>a-b).join(', ')||'none')+' km/h. Check posted signs.':'Speed limits on route: unavailable — import a verified GeoJSON dataset.';
}
$('speedDataFile').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 if(file.size>12*1024*1024){$('speedDataStatus').textContent='File too large (12 MB maximum).';return;}
 try{
  const data=JSON.parse(await file.text());if(data.type!=='FeatureCollection'||!Array.isArray(data.features)||data.features.length>30000)throw Error('Expected GeoJSON FeatureCollection with up to 30,000 features');
  const segments=[];
  for(const feature of data.features){
   const speed=parseSpeedKmh(feature.properties?.maxspeed);if(speed===null)continue;
   const geometry=feature.geometry||{},lines=geometry.type==='LineString'?[geometry.coordinates]:geometry.type==='MultiLineString'?geometry.coordinates:[];
   for(const line of lines){if(!Array.isArray(line)||line.length>10000)continue;for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i];if(!Array.isArray(a)||!Array.isArray(b)||a.length<2||b.length<2||![a[0],a[1],b[0],b[1]].every(Number.isFinite))continue;segments.push({a,b,speed});if(segments.length>100000)throw Error('Dataset has too many road segments');}}
  }
  speedSegments=segments;
  $('speedDataStatus').textContent=segments.length+' road segments with numeric maxspeed loaded locally. Accuracy depends on source and direction.';
  speedAtRoute();
 }catch(err){$('speedDataStatus').textContent='Import failed: '+err.message;}
});

/* Lane arrows only represent explicit provider lane direction fields. */
const laneSymbols={LEFT:'↰',SLIGHT_LEFT:'↖',SHARP_LEFT:'↶',RIGHT:'↱',SLIGHT_RIGHT:'↗',SHARP_RIGHT:'↷',STRAIGHT:'↑',THROUGH:'↑',UTURN:'↩',U_TURN:'↩'};
function laneDetails(raw){
 if(!Array.isArray(raw))return [];
 return raw.slice(0,12).map(l=>{
  if(!l||typeof l!=='object')return null;
  const directions=Array.isArray(l.directions)?l.directions:Array.isArray(l.indications)?l.indications:[];
  const arrows=directions.map(d=>laneSymbols[String(typeof d==='string'?d:d?.direction||'').toUpperCase().replace(/[- ]/g,'_')]).filter(Boolean);
  if(!arrows.length)return null;
  return {arrows:[...new Set(arrows)].join(' '),recommended:l.recommended===true||l.isRecommended===true||l.active===true};
 }).filter(Boolean);
}
function appendLanes(parent,step){
 const lanes=laneDetails(step.laneGuidance);
 if(!lanes.length)return false;
 const wrap=document.createElement('div');wrap.className='lane-arrows';wrap.setAttribute('aria-label','Provider lane indications, verify against road signs');
 for(const lane of lanes){const item=document.createElement('span');item.className='lane-arrow'+(lane.recommended?' recommended':'');item.textContent=lane.arrows;wrap.appendChild(item);}
 parent.appendChild(wrap);return true;
}
const directionLabels={
 en:{LEFT:'Turn left',RIGHT:'Turn right',STRAIGHT:'Continue straight',KEEP_LEFT:'Keep left',KEEP_RIGHT:'Keep right',UTURN:'Make a U-turn',ROUNDABOUT:'Enter roundabout',ARRIVE:'You have arrived'},
 ms:{LEFT:'Belok kiri',RIGHT:'Belok kanan',STRAIGHT:'Teruskan perjalanan',KEEP_LEFT:'Kekal di kiri',KEEP_RIGHT:'Kekal di kanan',UTURN:'Buat pusingan U',ROUNDABOUT:'Masuk bulatan',ARRIVE:'Anda telah tiba'},
 zh:{LEFT:'左转',RIGHT:'右转',STRAIGHT:'继续直行',KEEP_LEFT:'靠左行驶',KEEP_RIGHT:'靠右行驶',UTURN:'掉头',ROUNDABOUT:'进入环岛',ARRIVE:'您已到达'},
 ta:{LEFT:'இடப்புறம் திரும்பவும்',RIGHT:'வலப்புறம் திரும்பவும்',STRAIGHT:'நேராகச் செல்லவும்',KEEP_LEFT:'இடப்புறமாகச் செல்லவும்',KEEP_RIGHT:'வலப்புறமாகச் செல்லவும்',UTURN:'யூ-டர்ன் செய்யவும்',ROUNDABOUT:'சுற்றுவட்டத்திற்குள் செல்லவும்',ARRIVE:'நீங்கள் வந்துவிட்டீர்கள்'}
};
function actionCode(maneuver){
 const s=String(maneuver||'').toUpperCase().replace(/([a-z])([A-Z])/g,'$1_$2').replace(/[- ]/g,'_');
 if(/ARRIVE|DESTINATION/.test(s))return 'ARRIVE';
 if(/ROUNDABOUT/.test(s))return 'ROUNDABOUT';
 if(/U_TURN|UTURN/.test(s))return 'UTURN';
 if(/KEEP.*LEFT|BEAR.*LEFT/.test(s))return 'KEEP_LEFT';
 if(/KEEP.*RIGHT|BEAR.*RIGHT/.test(s))return 'KEEP_RIGHT';
 if(/LEFT/.test(s))return 'LEFT';
 if(/RIGHT/.test(s))return 'RIGHT';
 if(/STRAIGHT|FOLLOW|CONTINUE/.test(s))return 'STRAIGHT';
 return null;
}
function localizedStep(step){
 const lang=$('language').value,code=actionCode(step.maneuver),label=code&&directionLabels[lang]?.[code];
 // Avoid translating place names, road numbers, exits, or unrecognized maneuvers.
 return label?{primary:label,original:step.message||'',localized:lang!=='en'}:{primary:step.message||'Continue',original:'',localized:false};
}
function refreshDirections(){
 const route=routes[active];if(!route)return;
 const list=$('instructions');list.replaceChildren();
 let laneCount=0,localizedCount=0;
 for(const step of (route.instructions||[]).slice(0,50)){
  const div=document.createElement('div');div.className='instruction';
  const t=localizedStep(step);if(t.localized)localizedCount++;
  const title=document.createElement('div');title.textContent=t.primary+(Number(step.distanceMeters)>0?' · '+Math.round(step.distanceMeters)+' m':'');div.appendChild(title);
  if(t.localized&&t.original){const original=document.createElement('small');original.className='original-direction';original.textContent=t.original;div.appendChild(original);}
  if(appendLanes(div,step))laneCount++;
  list.appendChild(div);
 }
 if(!route.instructions?.length)list.textContent='Detailed turn instructions unavailable from provider.';
 $('laneStatus').textContent=laneCount?laneCount+' maneuvers with usable provider lane arrows. Confirm with road markings.':'No usable lane directions supplied by provider. No arrows inferred.';
 $('routeLanguageStatus').textContent=$('language').value==='en'?'English route instructions.':'Localized maneuver labels: '+localizedCount+'; original provider text retained where available. Road names and unsupported maneuvers are not translated.';
}

$('language').addEventListener('change',()=>{if(routes[active])refreshDirections();});
