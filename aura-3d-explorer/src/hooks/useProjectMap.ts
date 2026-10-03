"use client";
import {useCallback,useEffect,useMemo,useState} from 'react';
import type {CityId} from '@/lib/cityPresets';
import {defaultMapLocation,mapCoverage} from '@/lib/mapLocations';
import {isProjectLocation,validateMapSnapshot,type ProjectLocation,type MapSnapshot} from '@/lib/geographicContext';

const RESTORE_ERROR = 'The saved location could not be restored. The example pin is shown.';
export function readStoredProjectLocation(storage: Pick<Storage, 'getItem'>, key: string): {location: ProjectLocation | null; error: string} {
 try {
  const raw=storage.getItem(key);
  if(raw===null)return {location:null,error:''};
  const saved:unknown=JSON.parse(raw);
  return isProjectLocation(saved)?{location:saved,error:''}:{location:null,error:RESTORE_ERROR};
 } catch {return {location:null,error:RESTORE_ERROR};}
}

/** Cancellation covers both the fetch and JSON parsing. A stalled request never
 * leaves the viewer indefinitely loading; late completion cannot become current. */
export async function fetchProjectMap(id:string,{signal,request=fetch,timeoutMs=30000,url}:{signal:AbortSignal;request?:typeof fetch;timeoutMs?:number;url?:string}):Promise<MapSnapshot>{
 if(signal.aborted)throw new DOMException('Map request cancelled','AbortError');
 const controller=new AbortController();
 let timedOut=false;
 let rejectInterrupted!:(reason:Error)=>void;
 const interrupted=new Promise<never>((_,reject)=>{rejectInterrupted=reject;});
 const cancel=()=>{controller.abort();rejectInterrupted(new DOMException('Map request cancelled','AbortError'));};
 signal.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(()=>{timedOut=true;controller.abort();rejectInterrupted(new Error('Map context took too long to load. Retry when your connection is available.'));},timeoutMs);
 try {
  const load=async()=>{
   const response=await request(url ?? `/maps/${id}.json`,{signal:controller.signal});
   if(!response.ok)throw new Error('Map context could not load. Your project is still available.');
   const data=validateMapSnapshot(await response.json());
   if(!data||data.id!==id)throw new Error('Map context could not load. Your project is still available.');
   return data;
  };
  return await Promise.race([load(),interrupted]);
 } catch {
  if(signal.aborted)throw new DOMException('Map request cancelled','AbortError');
  if(timedOut)throw new Error('Map context took too long to load. Retry when your connection is available.');
  throw new Error('Map context could not load. Your project is still available.');
 } finally {clearTimeout(timer);signal.removeEventListener('abort',cancel);}
}

export function useProjectMap(city:CityId,projectSlug?:string){
 const key=`aura:project-location:v1:${projectSlug??'preview'}`;
 const fallback=useMemo(()=>defaultMapLocation(city,projectSlug),[city,projectSlug]);
 const [stored,setStored]=useState<{key:string;location:ProjectLocation}|null>(null);
 const [locationError,setLocationError]=useState('');
 const location=stored?.key===key?stored.location:fallback;
 const coverage=useMemo(()=>mapCoverage(location),[location]);
 const sourceId=coverage?.id??`site-${location.latitude.toFixed(5)}-${location.longitude.toFixed(5)}`;
 const [loaded,setLoaded]=useState<{id:string;snapshot:MapSnapshot}|null>(null);
 const [failure,setFailure]=useState<{id:string;message:string}|null>(null);
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  // Clear stale in-memory pins even when a different project has no saved value.
  // Accessing localStorage itself may throw when browser storage is disabled.
  let restored:ReturnType<typeof readStoredProjectLocation>;
  try {restored=readStoredProjectLocation(localStorage,key);}
  catch {restored={location:null,error:RESTORE_ERROR};}
  setStored(restored.location?{key,location:restored.location}:null);
  setLocationError(restored.error);
 },[key]);
 const setLocation=useCallback((next:ProjectLocation)=>{
  if(!isProjectLocation(next)){setLocationError('Enter a valid latitude and longitude.');return false;}
  try {localStorage.setItem(key,JSON.stringify(next));}
  catch {setLocationError('Your browser could not save the location. Free storage or enable site storage, then retry.');return false;}
  setStored({key,location:next});setLocationError('');return true;
 },[key]);
 const resetLocation=useCallback(()=>setLocation(defaultMapLocation(city,projectSlug)),[city,projectSlug,setLocation]);
 useEffect(()=>{

  const controller=new AbortController();
  setFailure(null);setLoaded(null);
  if (!coverage) {
   setFailure({id:sourceId,message:'Map data is not installed for this location. Your pin is saved locally. Choose a downloaded map area to preview surroundings.'});
   return()=>controller.abort();
  }
  void fetchProjectMap(sourceId,{signal:controller.signal}).then(data=>{
   if(!controller.signal.aborted)setLoaded({id:sourceId,snapshot:data});
  }).catch(error=>{if(!controller.signal.aborted)setFailure({id:sourceId,message:error instanceof Error?error.message:'Map context could not load. Your project is still available.'});});
  return()=>controller.abort();
 },[sourceId,attempt]);
 const mapSnapshot=loaded&&loaded.id===sourceId?loaded.snapshot:null;
 const mapError=failure&&failure.id===sourceId?failure.message:'';
 return {location,setLocation,resetLocation,locationError,mapSnapshot,mapError,mapLoading:!mapSnapshot&&!mapError,retryMap:()=>setAttempt(n=>n+1),mapCoverage:coverage};
}
