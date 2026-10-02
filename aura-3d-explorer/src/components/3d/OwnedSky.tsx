"use client";
import { forwardRef, useEffect, useState } from "react";
import { Sky as SkyImpl } from "three-stdlib";
import { UniformsUtils, Vector3 } from "three";

interface Props {
  distance: number;
  sunPosition: [number, number, number];
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
}

/** three-stdlib Sky shares its material; each lighting mode needs its own shader. */
const OwnedSky = forwardRef<SkyImpl, Props>(function OwnedSky({ distance, sunPosition, turbidity, rayleigh, mieCoefficient, mieDirectionalG }, ref) {
  const [sky] = useState(() => {
    const object = new SkyImpl();
    object.material = object.material.clone();
    object.material.uniforms = UniformsUtils.clone(SkyImpl.SkyShader.uniforms);
    return object;
  });
  useEffect(() => () => {
    sky.material.dispose();
    sky.geometry.dispose();
  }, [sky]);
  return <primitive object={sky} ref={ref} scale={distance}
    material-uniforms-sunPosition-value={new Vector3(...sunPosition)}
    material-uniforms-turbidity-value={turbidity}
    material-uniforms-rayleigh-value={rayleigh}
    material-uniforms-mieCoefficient-value={mieCoefficient}
    material-uniforms-mieDirectionalG-value={mieDirectionalG} />;
});

export default OwnedSky;
