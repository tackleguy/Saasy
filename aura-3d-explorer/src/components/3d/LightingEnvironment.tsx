"use client";
import { useEffect, useMemo, useRef } from "react";
import { Environment, Sky } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import gsap from "gsap";
import type { Sky as SkyImpl } from "three-stdlib";
import type { CityPreset } from "@/lib/cityPresets";
import { invalidateShadows } from "./staticShadows";
import LegacyLightingEnvironment from "./LegacyLightingEnvironment";
import { SUN, useCinematic } from "./environment/settings";
export function sunDirection(elevation: number) {
  const e = THREE.MathUtils.degToRad(elevation);
  return new THREE.Vector3(Math.cos(e)*0.313, Math.sin(e), Math.cos(e)*0.95);
}
function CinematicLightingEnvironment({ sun, noFog=false, extent=80 }: {quality: "high"|"low"; preset: CityPreset; sun?: {elevation:number;azimuth:number}|null; noFog?:boolean; extent?:number}) {
  const {time,tier} = useCinematic();
  const p = SUN[time];
  const values = useMemo(() => ({elevation:p.elevation as number,azimuth:p.azimuth as number,intensity:p.intensity as number,fill:p.fill as number,env:p.env as number,turbidity:p.turbidity as number,rayleigh:p.rayleigh as number,night:p.night as number}), []); // animated, stable ownership
  const key = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sky = useRef<SkyImpl>(null);
  const scene = useThree(s=>s.scene);
  const color = useMemo(()=>new THREE.Color(p.color),[]);
  const haze = useMemo(()=>new THREE.Color(p.haze),[]);
  const pos = useMemo(()=>new THREE.Vector3(),[]);
  useEffect(()=>{
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1.5;
    const tween = gsap.to(values,{intensity:p.intensity,fill:p.fill,env:p.env,turbidity:p.turbidity,rayleigh:p.rayleigh,night:p.night,elevation:sun?.elevation??p.elevation,azimuth:sun?.azimuth??p.azimuth,duration,ease:"power2.inOut",onUpdate:()=>invalidateShadows(100)});
    const c = new THREE.Color(p.color), h = new THREE.Color(p.haze);
    const ct = gsap.to(color,{r:c.r,g:c.g,b:c.b,duration});
    const ht = gsap.to(haze,{r:h.r,g:h.g,b:h.b,duration});
    return ()=>{tween.kill();ct.kill();ht.kill();};
  },[p,sun?.elevation,sun?.azimuth,values,color,haze]);
  useFrame(()=>{
    const e = THREE.MathUtils.degToRad(values.elevation), a = THREE.MathUtils.degToRad(values.azimuth);
    pos.set(Math.cos(e)*Math.sin(a),Math.sin(e),-Math.cos(e)*Math.cos(a)).multiplyScalar(200);
    if(key.current){key.current.position.copy(pos);key.current.color.copy(color);key.current.intensity=values.intensity;}
    if(hemi.current)hemi.current.intensity=values.fill;
    if(sky.current){const u=sky.current.material.uniforms;u.sunPosition.value.copy(pos);u.turbidity.value=values.turbidity;u.rayleigh.value=values.rayleigh;if(u.auraNight)u.auraNight.value=values.night;sky.current.visible=values.night<0.98;}
    if(scene.fog)scene.fog.color.copy(haze);
    if(scene.background instanceof THREE.Color)scene.background.copy(haze);
    scene.environmentIntensity=values.env;
  });
  useEffect(()=>{
    const material=sky.current?.material;if(!material)return;
    material.uniforms.auraHaze={value:haze};material.uniforms.auraNight={value:values.night};
    if(!material.fragmentShader.includes("uniform vec3 auraHaze")) {
      material.fragmentShader="uniform vec3 auraHaze; uniform float auraNight;\n"+material.fragmentShader.replace("gl_FragColor = vec4( retColor, 1.0 );", "float horizon = pow(1.0 - abs(direction.y), 12.0); vec3 graded = mix(retColor * 0.055, auraHaze, 0.78); graded += vec3(0.085, 0.024, 0.008) * horizon * (1.0 - abs(auraNight - 0.5) * 2.0); gl_FragColor = vec4(graded, 1.0);");
      material.needsUpdate=true;
    }
  },[haze,values]);
  const map = tier==="high"?4096:tier==="medium"?2048:1024;
  useEffect(()=>{ invalidateShadows(2200); },[map,extent]);
  return <>
    <color attach="background" args={[p.haze]}/>
    {!noFog&&<fogExp2 attach="fog" args={[p.haze,0.0032]}/>}
    <Sky ref={sky} distance={4500} sunPosition={[60,80,180]} turbidity={p.turbidity} rayleigh={p.rayleigh} mieCoefficient={0.004} mieDirectionalG={0.85}/>
    <Environment files="/hdri/dusk.hdr" background={false}/>
    <hemisphereLight ref={hemi} args={["#9EB7D9","#1A1C22",p.fill]}/>
    <directionalLight ref={key} castShadow position={[60,80,180]} color={p.color} intensity={p.intensity}
      shadow-mapSize={[map,map]} shadow-bias={-0.00008} shadow-normalBias={0.025}
      shadow-camera-left={-extent} shadow-camera-right={extent} shadow-camera-top={extent} shadow-camera-bottom={-extent}
      shadow-camera-near={0.5} shadow-camera-far={450} />
  </>;
}

/** Authored daylight scans retain the original city lighting; cinematic lighting is separate. */
export default function LightingEnvironment(props: Parameters<typeof CinematicLightingEnvironment>[0]) {
  const { legacy } = useCinematic();
  return legacy ? <LegacyLightingEnvironment {...props} /> : <CinematicLightingEnvironment {...props} />;
}
