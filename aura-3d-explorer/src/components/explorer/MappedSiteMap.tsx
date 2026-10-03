"use client";
import {useEffect,useMemo,useRef,useState,type PointerEvent} from 'react';
import {ArrowUp,ExternalLink,MapPin,RotateCcw,X} from 'lucide-react';
import type {ExplorerState} from '@/hooks/useExplorer';
import {geographicToWorld,type LonLat} from '@/lib/geographicContext';
import {openStreetMapUrl,parseMapPin} from '@/lib/mapLocations';
import {MODEL_SCALE,planOutline} from '@/lib/tower';

export default function MappedSiteMap({explorer:x,onClose}:{explorer:ExplorerState;onClose:()=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),svg=useRef<SVGSVGElement>(null),close=useRef<HTMLButtonElement>(null);
 const [district,setDistrict]=useState(false),[pin,setPin]=useState(`${x.location.latitude.toFixed(6)}, ${x.location.longitude.toFixed(6)}`),[label,setLabel]=useState(x.location.label.replace(' — example site','')),[notice,setNotice]=useState('');
 const [invalid,setInvalid]=useState('');
 const dragging=useRef<{id:string;offset:[number,number]}|null>(null);
 const radius=(district?1500:250)*MODEL_SCALE;
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;close.current?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
 useEffect(()=>{setPin(`${x.location.latitude.toFixed(6)}, ${x.location.longitude.toFixed(6)}`);setLabel(x.location.label.replace(' — example site',''));},[x.location]);
 useEffect(()=>()=>x.setDragging(false),[x.setDragging]);
 const counts=useMemo(()=>{
  const b=x.mapSnapshot?.features.filter(f=>f.kind==='building')??[];
  return {provided:b.filter(f=>f.heightSource==='recorded').length,estimated:b.filter(f=>f.heightSource==='levels').length,unknown:b.filter(f=>!f.height||f.heightSource==='unknown').length};
 },[x.mapSnapshot]);
 useEffect(()=>{
  const c=canvas.current,ctx=c?.getContext('2d');if(!c||!ctx)return;
  const w=1000,h=750;c.width=w;c.height=h;ctx.fillStyle='#f1eee7';ctx.fillRect(0,0,w,h);
  ctx.setTransform(w/(radius*2),0,0,h/(radius*1.5),w/2,h/2);
  const path=(points:LonLat[],closed:boolean)=>{points.forEach((point,i)=>{const [px,pz]=geographicToWorld(point,x.location);if(i===0)ctx.moveTo(px,pz);else ctx.lineTo(px,pz);});if(closed)ctx.closePath();};
  for(const kind of ['water','park','building','road'])for(const feature of x.mapSnapshot?.features??[]){
   if(feature.kind!==kind)continue;
   ctx.beginPath();const g=feature.geometry;
   if(g.type==='Polygon')g.coordinates.forEach(r=>path(r,true));
   else if(g.type==='MultiPolygon')g.coordinates.forEach(p=>p.forEach(r=>path(r,true)));
   else if(g.type==='LineString')path(g.coordinates,false);
   else g.coordinates.forEach(r=>path(r,false));
   if(kind==='road'){ctx.strokeStyle='#b7b0a4';ctx.lineWidth=radius/400;ctx.stroke();}
   else {ctx.fillStyle=kind==='water'?'#aec7ce':kind==='park'?'#c7d0b6':feature.height?'#b4aa99':'#dfd9cf';ctx.fill('evenodd');}
  }
 },[x.mapSnapshot,x.location,radius]);
 function move(event:PointerEvent<SVGSVGElement>){
  if(!dragging.current||!svg.current)return;const r=svg.current.getBoundingClientRect();
  const px=(event.clientX-r.left)/r.width*radius*2-radius;
  const pz=(event.clientY-r.top)/r.height*radius*1.5-radius*.75;
  x.moveBuilding(dragging.current.id,[Math.round((px-dragging.current.offset[0])/MODEL_SCALE)*MODEL_SCALE,Math.round((pz-dragging.current.offset[1])/MODEL_SCALE)*MODEL_SCALE]);
 }
 function end(){dragging.current=null;x.setDragging(false);}
 return <section role="dialog" aria-label="Project map location" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}} className="overlay absolute inset-x-3 top-3 z-40 max-h-[calc(100%-1.5rem)] overflow-auto p-4 text-ink sm:left-auto sm:right-4 sm:w-[420px]">
  <div className="flex items-center justify-between gap-3"><h2 className="font-serif text-xl">Project location</h2><button ref={close} type="button" aria-label="Close project map" onClick={onClose} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-stone focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"><X size={18}/></button></div>
  <p className="mb-3 text-sm">{x.location.example?'This sample uses an example pin. Set the real project location before presenting it.':'Buildings and streets are positioned relative to your saved project pin.'}</p>
  <form onSubmit={e=>{e.preventDefault();const point=parseMapPin(pin);if(!point){setInvalid('Enter latitude, longitude or a map link containing coordinates.');return;}setInvalid('');if(x.setLocation({...point,label:label.trim()||'Project pin',example:false}))setNotice('Project pin saved on this device.');}} className="space-y-2">
   <label className="block text-sm font-medium">Site name<input maxLength={160} value={label} onChange={e=>setLabel(e.target.value)} className="mt-1 block w-full border border-plaster bg-paper px-2 py-2 text-base"/></label>
   <label className="block text-sm font-medium">Map pin or coordinates<input aria-describedby="pin-help" value={pin} maxLength={2048} onChange={e=>{setPin(e.target.value);setInvalid('');setNotice('');}} className="mt-1 block w-full border border-plaster bg-paper px-2 py-2 text-base"/></label>
   <p id="pin-help" className="text-xs">Latitude, longitude — or an OpenStreetMap / Google Maps link with coordinates. Your pin stays on this device. Surrounding buildings are available within downloaded map areas.</p>
   <div className="flex flex-wrap items-center gap-2"><button type="submit" className="btn-primary min-h-11"><MapPin size={14}/>Save project pin</button><a href={openStreetMapUrl(x.location)} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm underline underline-offset-2">Open map<ExternalLink size={12}/></a></div>
   {(invalid||x.locationError)&&<p role="alert" className="text-sm">{invalid||x.locationError}</p>}{notice&&<p role="status" className="text-sm">{notice}</p>}
  </form>
  <div className="my-3 flex flex-wrap items-center justify-between gap-2"><div role="group" aria-label="Map zoom" className="flex gap-1">{[false,true].map(v=><button key={String(v)} type="button" aria-pressed={district===v} onClick={()=>setDistrict(v)} className={district===v?'btn-primary min-h-11':'btn-secondary min-h-11'}>{v?'District':'Site'}</button>)}</div><button type="button" className="inline-flex min-h-11 items-center gap-1 text-xs underline" onClick={x.resetLayout}><RotateCcw size={12}/>Reset layout</button></div>
  <div className="relative aspect-[4/3] overflow-hidden border border-plaster bg-paper">
   <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 h-full w-full"/>
   <svg ref={svg} role="group" aria-label="Mapped site. Proposed buildings can be moved with arrow keys." viewBox={`${-radius} ${-radius*.75} ${radius*2} ${radius*1.5}`} className="absolute inset-0 h-full w-full touch-none" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
    {x.site.map(b=>{
      const outlines=new Set(b.floors.map(f=>{const c=Math.cos(f.rotationY),s=Math.sin(f.rotationY);return planOutline(f.shape,f.width,f.depth).map(([px,pz],i)=>`${i?'L':'M'}${b.position[0]+px*c+pz*s},${b.position[1]-px*s+pz*c}`).join(' ')+'Z';}));
      return <path key={b.id} d={[...outlines].join(' ')} fill={b.id===x.activeBuildingId?'#201f1b':'#9c7a52'} stroke="#fff" strokeWidth={radius/220} tabIndex={0} role="button" aria-label={`Move ${b.name}`} className="cursor-grab focus:stroke-[#9c7a52]" onPointerDown={e=>{
        e.preventDefault();e.currentTarget.focus();x.selectBuilding(b.id);const r=svg.current!.getBoundingClientRect();
        dragging.current={id:b.id,offset:[(e.clientX-r.left)/r.width*radius*2-radius-b.position[0],(e.clientY-r.top)/r.height*radius*1.5-radius*.75-b.position[1]]};x.setDragging(true);svg.current?.setPointerCapture(e.pointerId);
      }} onKeyDown={e=>{
        const d=e.shiftKey?10*MODEL_SCALE:MODEL_SCALE;const offsets:Record<string,[number,number]>={ArrowLeft:[-d,0],ArrowRight:[d,0],ArrowUp:[0,-d],ArrowDown:[0,d]};
        if(offsets[e.key]){e.preventDefault();e.stopPropagation();x.selectBuilding(b.id);x.moveBuilding(b.id,[b.position[0]+offsets[e.key][0],b.position[1]+offsets[e.key][1]]);}
      }}><title>{b.name} — proposed building</title></path>;
    })}
    <circle cx={0} cy={0} r={radius/90} fill="#fff" stroke="#201f1b" strokeWidth={radius/300}/>
   </svg>
   <span className="absolute right-2 top-2 bg-paper px-2 py-1 text-xs font-medium flex items-center"><ArrowUp size={12} aria-hidden/> N</span>
   <span className="absolute bottom-2 left-2 bg-paper px-2 py-1 text-xs">{district?'3 km':'500 m'} across · north up</span>
  </div>
  <p className="mt-2 text-xs">Dark shapes are proposed buildings. Drag them or use arrow keys to move 1 m; hold Shift for 10 m.</p>
  {x.mapLoading&&<p role="status" className="mt-2 text-sm">Loading the local map snapshot…</p>}
  {x.mapError&&<div role="status" className="mt-2 text-sm"><p>{x.mapError}</p><button type="button" onClick={x.retryMap} className="mt-1 min-h-11 underline">Retry map context</button></div>}
  {x.mapSnapshot&&<p className="mt-3 text-xs leading-relaxed">{counts.provided.toLocaleString()} building parts with source heights · {counts.estimated.toLocaleString()} floor-count estimates · {counts.unknown.toLocaleString()} footprints without height. Flat terrain; facade and roof details are not reconstructed.</p>}
  <div className="mt-3 border-t border-plaster pt-2 text-xs leading-relaxed"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">© OpenStreetMap contributors</a> · <a href="https://docs.overturemaps.org/attribution/" target="_blank" rel="noreferrer" className="underline">Overture Maps Foundation</a> · <a href="/maps/ATTRIBUTION.md" target="_blank" rel="noreferrer" className="underline">Sources and license</a></div>
 </section>;
}
