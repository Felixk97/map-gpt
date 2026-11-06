(function(){
const $=id=>document.getElementById(id);if(!$('railMode'))return;
let active=false,layer=null;
const today=new Date(),date=$('railDate');date.value=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
function mode(on){active=on;$('railPanel').hidden=!on;$('roadMode').setAttribute('aria-pressed',String(!on));$('railMode').setAttribute('aria-pressed',String(on));$('plan').hidden=on;$('refreshRoute').hidden=on||!document.body.classList.contains('has-route');if(on){$('journeytitle').textContent='Plan a rail journey';$('status').textContent='Enter station names above, then choose your travel date and time.'}else{$('journeytitle').textContent='Where are we going?'}}
$('roadMode').onclick=()=>mode(false);$('railMode').onclick=()=>mode(true);
function clear(){if(layer&&window.LapanMap){window.LapanMap.removeLayer(layer);layer=null}}
function stationNames(j){return j.legs.map((l,i)=>`${i+1}. ${l.line} · ${l.departure}–${l.arrival} · ${l.stops.length} stops`).join('\n')}
$('railPlan').onclick=async()=>{
 const from=$('origin').value.trim(),to=$('destination').value.trim(),date=$('railDate').value,time=$('railTime').value;
 if(!from||!to){$('railStatus').textContent='Enter both station names in the From and To fields.';return}
 $('railPlan').disabled=true;$('railStatus').textContent='Downloading and processing official rail timetables…';$('railResults').replaceChildren();clear();
 try{
  const qs=new URLSearchParams({from,to,date,time}),r=await fetch('/api/rail?'+qs),data=await r.json();
  if(!r.ok)throw Error(data.error||'Rail planning failed');
  $('railStatus').textContent=`${data.journeys.length} scheduled option(s) · Data checked ${new Date(data.checkedAt).toLocaleTimeString()}`;
  data.journeys.forEach((j,index)=>{
   const card=document.createElement('article');card.className='rail-result';
   const title=document.createElement('strong');title.textContent=`${j.departure} → ${j.arrival}`;
   const meta=document.createElement('small');meta.textContent=`${j.from} to ${j.to} · ${j.transfers} transfer(s) · ${j.agency}`;
   card.append(title,meta);
   j.legs.forEach((leg,i)=>{const row=document.createElement('div');row.className='rail-leg';const names=leg.stops.map(s=>s.name);row.textContent=`${leg.line}: ${names[0]} → ${names.at(-1)} (${leg.departure}–${leg.arrival})`;card.append(row);if(i<j.legs.length-1){const transfer=document.createElement('small');transfer.textContent=`Change trains at ${names.at(-1)}`;card.append(transfer)}});
   const fare=document.createElement('small');fare.textContent=j.fare==null?j.fareNote:`Estimated fare: RM ${Number(j.fare).toFixed(2)}`;card.append(fare);
   const show=document.createElement('button');show.type='button';show.className='link';show.textContent='Show this rail route on map';show.onclick=()=>{clear();if(window.LapanMap&&j.geometry?.coordinates?.length>1){layer=L.polyline(j.geometry.coordinates.map(p=>[p[1],p[0]]),{color:'#1677d2',weight:6,opacity:.9}).addTo(window.LapanMap);window.LapanMap.fitBounds(layer.getBounds(),{padding:[45,45]})}};card.append(show);$('railResults').append(card);
   if(index===0)show.click();
  });
 }catch(e){$('railStatus').textContent=e.message||'Rail timetable unavailable. Try again later.'}
 finally{$('railPlan').disabled=false}
};
})();
