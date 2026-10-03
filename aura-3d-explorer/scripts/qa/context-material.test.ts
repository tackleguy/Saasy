import {test} from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {contextFacadeMaterial,contextRoofMaterial} from "../../src/components/3d/context/architecturalContextMaterial";
import {mappedWaterMaterial} from "../../src/components/3d/context/mappedWaterMaterial";
import {getCityPreset} from "../../src/lib/cityPresets";

function shaderFor(material: THREE.Material) {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

test("detailed city materials share programs while preserving district families and independently owned uniforms", () => {
  const a=contextFacadeMaterial(getCityPreset('new-york')), b=contextFacadeMaterial(getCityPreset('miami'));
  assert.equal(a.material.customProgramCacheKey(),b.material.customProgramCacheKey());
  assert.notDeepEqual(a.uniforms.auraFamilies.value.toArray(),b.uniforms.auraFamilies.value.toArray());
  a.uniforms.auraNight.value=1;
  assert.equal(b.uniforms.auraNight.value,0);
  for(const material of [a.material,b.material,contextRoofMaterial(),mappedWaterMaterial().material]) {
    assert.ok(!Object.values(material).some(value=>value instanceof THREE.Texture),'no per-building texture allocation');
    let released=0;material.addEventListener('dispose',()=>released++);material.dispose();assert.equal(released,1);
  }
});

test("facade shader retains PBR lighting, physical local scale and distance filtering", () => {
  const {material}=contextFacadeMaterial(),shader=shaderFor(material);
  assert.match(shader.vertexShader,/vAuraFacade = auraFacade/);
  assert.match(shader.fragmentShader,/fwidth\(cell\)/);
  assert.match(shader.fragmentShader,/mix\(coverage,pane,readable\)/);
  assert.match(shader.fragmentShader,/#include <lights_physical_fragment>/);
  assert.match(shader.fragmentShader,/#include <roughnessmap_fragment>/);
  assert.match(shader.fragmentShader,/#include <emissivemap_fragment>/);
  assert.ok('auraNight' in shader.uniforms);
  assert.doesNotMatch(shader.fragmentShader,/discard;/);
  material.dispose();
});

test("water adds surface normals without displacing the measured shoreline or restoring depth fighting", () => {
  const {material,uniforms}=mappedWaterMaterial(),shader=shaderFor(material);
  assert.equal(material.depthWrite,false);assert.equal(material.depthTest,false);assert.equal(material.transparent,false);
  assert.match(shader.vertexShader,/vAuraWater = \(modelMatrix/);
  assert.match(shader.fragmentShader,/fwidth\(phase\)/);
  assert.doesNotMatch(shader.fragmentShader,/float broad =/);
  assert.doesNotMatch(shader.vertexShader,/transformed\.[xyz]\s*[+*\-]=/);
  assert.equal(uniforms.auraWaterTime.value,0);
  material.dispose();
});
