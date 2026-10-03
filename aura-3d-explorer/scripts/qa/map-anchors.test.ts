import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {MAP_SITES} from '../../src/lib/mapLocations';
import type {MapSnapshot} from '../../src/lib/geographicContext';
import {PROJECTS,projectSite} from '../../src/content/projects';
import {buildMappedGeometry} from '../../src/lib/mappedGeometry';

for(const site of MAP_SITES){
 test(`${site.id}: example proposal footprints do not intersect recorded water`,()=>{
  const data:MapSnapshot=JSON.parse(readFileSync(resolve(__dirname,`../../public/maps/${site.id}.json`),'utf8'));
  const project=PROJECTS.find(project=>site.projects.includes(project.slug))??PROJECTS.find(project=>project.flagship)!;
  // Reuse the renderer's polygon/holes/rotated-floor intersection rule. This
  // asserts absence of mapped water, not vacant land or development permission.
  const waterFootprints:MapSnapshot={...data,features:data.features.filter(feature=>feature.kind==='water').map(feature=>({...feature,kind:'building',height:undefined,heightSource:'unknown'}))};
  const result=buildMappedGeometry(waterFootprints,{latitude:site.latitude,longitude:site.longitude,label:site.label,example:true},projectSite(project));
  try {assert.equal(result.hiddenBuildingPolygons,0,`${site.id}: proposal intersects recorded water`);}
  finally {result.dispose();}
 });
}
