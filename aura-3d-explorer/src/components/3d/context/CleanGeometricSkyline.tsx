"use client";
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useFrame } from "@react-three/fiber";
import type { CityPreset } from "@/lib/cityPresets";
import { rectsOverlap, SITE_ROTATION_Y, type UWRect } from "@/lib/siteLayout";
import { cityPlan } from "./cityPlan";
import { applyArchitecturalFacade, setFacadeNight } from "./architecturalContextMaterial";
import { SUN, useCinematic } from "../environment/settings";
import { noRaycast } from "./shared";
import { invalidateShadows } from "../staticShadows";

// Site exclusion box: ensure buildings never overlap the project plinth
const SITE_CLEARING: UWRect = { u0: -56, u1: 56, w0: -46, w1: 20 };

function cityFacadeTint(preset: CityPreset): string {
  switch (preset.id) {
    case "seattle":
      return "#8fa6b2"; // Puget Sound cool slate/blue-gray glass
    case "toronto":
      return "#80a8bc"; // Lake Ontario crisp azure/cyan glass
    case "san-francisco":
      return "#96abb8"; // Bay fog silver-blue reflective glass
    case "los-angeles":
      return "#a2b4be"; // Golden haze crystal glass
    case "miami":
      return "#8cb3c2"; // Tropical turquoise/white coastal glass
    case "dubai":
      return "#72808c";
    case "chicago":
      return "#687a85";
    default:
      return "#7a8e99";
  }
}

/* -------------------------------------------------------------------------- */
/* Landmark Geometry Builders                                                 */
/* -------------------------------------------------------------------------- */

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

const cyl = (rt: number, rb: number, h: number, seg = 16, y = 0, x = 0, z = 0) =>
  new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y + h / 2, z);

const lathe = (profile: [number, number][], seg = 24, yOffset = 0, x = 0, z = 0) => {
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    seg
  );
  if (yOffset || x || z) g.translate(x, yOffset, z);
  return g;
};

/**
 * Builds Seattle's iconic Space Needle with soaring flared tripod legs,
 * central elevator core, two-tier flying saucer observation pod, and needle mast.
 */
function buildSpaceNeedle(u = -85, w = -165, H = 64): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];

  // Ground circular plaza base
  parts.push(cyl(6.2, 7.5, 1.8, 24, 0, u, w));

  // Three pairs of sweeping curved tripod legs
  const legSteps = 14;
  for (let a = 0; a < 3; a++) {
    const angle = (a * Math.PI * 2) / 3;
    for (const offsetAngle of [-0.18, 0.18]) {
      const legPts: THREE.Vector3[] = [];
      for (let s = 0; s <= legSteps; s++) {
        const t = s / legSteps;
        const curY = t * 46;
        // Flared outward at ground (radius 6.2), narrow at waist (radius 2.2), flaring to saucer (radius 5.0)
        const rad = 6.2 * (1 - t) * (1 - t) + 2.2 * 2 * (1 - t) * t + 5.0 * t * t;
        const totalAngle = angle + offsetAngle * (1 - t * 0.4);
        legPts.push(
          new THREE.Vector3(
            u + Math.cos(totalAngle) * rad,
            curY,
            w + Math.sin(totalAngle) * rad
          )
        );
      }
      const curve = new THREE.CatmullRomCurve3(legPts);
      parts.push(new THREE.TubeGeometry(curve, 20, 0.42, 8, false));
    }
  }

  // Central elevator core (triangular prism shaft with truss struts)
  parts.push(cyl(1.3, 1.6, 46, 3, 0, u, w));

  // Flying Saucer observation pod (height 46 to 55)
  // Lower flared saucer cone
  parts.push(
    lathe(
      [
        [2.0, 46],
        [4.8, 47.2],
        [8.4, 49.0],
      ],
      24,
      0,
      u,
      w
    )
  );

  // Main observation window band
  parts.push(
    lathe(
      [
        [8.4, 49.0],
        [8.6, 51.2],
        [8.4, 53.0],
      ],
      24,
      0,
      u,
      w
    )
  );

  // Upper rotating restaurant & open observation deck
  parts.push(
    lathe(
      [
        [8.4, 53.0],
        [7.2, 54.5],
        [4.2, 55.2],
        [0.0, 55.4],
      ],
      24,
      0,
      u,
      w
    )
  );

  // Upper elevator penthouse / mechanical ring
  parts.push(cyl(3.2, 3.6, 2.2, 20, 55.4, u, w));

  // Steel needle spire mast with aviation beacon
  parts.push(cyl(0.08, 0.35, 8.4, 8, 57.6, u, w));
  parts.push(cyl(0.45, 0.45, 0.4, 12, 65.5, u, w)); // beacon housing

  return parts;
}

/**
 * Columbia Center (Seattle's tallest building):
 * 76 storeys, dark concave bundled supertall with 3 stepped setbacks.
 */
function buildColumbiaCenter(u = 45, w = -205, H = 86): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const top1 = H * 0.44;
  const top2 = H * 0.76;
  const top3 = H * 0.94;

  // Base tier 1 (y = 0 to 38)
  parts.push(box(12, top1, 12, u, 0, w));
  // Setback tier 2 (y = 38 to 65)
  parts.push(box(9.6, top2 - top1, 9.6, u, top1, w));
  // Setback tier 3 (y = 65 to 81)
  parts.push(box(7.4, top3 - top2, 7.4, u, top2, w));
  // Mechanical penthouse crown (y = 81 to 84)
  parts.push(box(5.2, H * 0.04, 5.2, u, top3, w));
  // Twin broadcast antennas
  parts.push(cyl(0.06, 0.14, H - top3, 6, top3, u - 1.8, w));
  parts.push(cyl(0.06, 0.14, H - top3, 6, top3, u + 1.8, w));

  return parts;
}

/**
 * Toronto's CN Tower:
 * Soaring hexagonal concrete shaft, massive 7-storey main observation pod (SkyPod),
 * upper Space Deck, and red/white antenna mast.
 */
function buildCNTower(u = -60, w = -170, H = 92): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];

  // Tapered hexagonal concrete shaft (y = 0 to 54)
  parts.push(cyl(2.2, 6.8, 54, 6, 0, u, w));

  // Three structural buttress wings at base (tapering upward)
  for (let a = 0; a < 3; a++) {
    const angle = (a * Math.PI * 2) / 3;
    const wing = box(1.4, 28, 5.6, 0, 0, 4.2);
    wing.rotateY(angle);
    wing.translate(u, 0, w);
    parts.push(wing);
  }

  // Main Observation Pod (the iconic doughnut SkyPod, y = 54 to 65)
  // Lower flared support cone
  parts.push(
    lathe(
      [
        [2.2, 54.0],
        [5.2, 55.5],
        [8.2, 57.2],
      ],
      24,
      0,
      u,
      w
    )
  );

  // Observation deck & 360 Restaurant window ring (7 storeys)
  parts.push(
    lathe(
      [
        [8.2, 57.2],
        [8.4, 59.8],
        [8.0, 62.4],
      ],
      24,
      0,
      u,
      w
    )
  );

  // Upper pod dome and outdoor observation deck
  parts.push(
    lathe(
      [
        [8.0, 62.4],
        [6.4, 64.0],
        [2.4, 65.0],
      ],
      24,
      0,
      u,
      w
    )
  );

  // Upper shaft continuing to Space Deck (y = 65 to 72)
  parts.push(cyl(1.7, 1.9, 7, 12, 65, u, w));

  // Space Deck (Upper observation pod at y = 72 to 75.5)
  parts.push(cyl(3.4, 2.8, 3.5, 16, 72, u, w));

  // Broadcast transmission antenna mast (y = 75.5 to 92)
  parts.push(cyl(0.2, 0.75, 16.5, 8, 75.5, u, w));
  parts.push(cyl(0.4, 0.4, 0.35, 10, 91.8, u, w)); // top strobe

  return parts;
}

/**
 * First Canadian Place (Toronto):
 * 72-storey gleaming white glass skyscraper with chamfered bronze corners.
 */
function buildFirstCanadianPlace(u = 30, w = -185, H = 82): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const roof = H * 0.94;
  parts.push(box(13, roof, 13, u, 0, w));
  parts.push(box(10.5, H * 0.04, 10.5, u, roof, w)); // crown setback
  parts.push(cyl(0.08, 0.25, H - roof, 8, roof, u, w)); // mast
  return parts;
}

/**
 * San Francisco's Transamerica Pyramid:
 * 4-sided faceted pyramid with East and West structural wings and 65m spire.
 */
function buildTransamericaPyramid(u = 25, w = -180, H = 74): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const apex = H * 0.78;

  // 4-sided pyramid frustum from ground to apex
  const pyramid = new THREE.CylinderGeometry(0.35, 12.0, apex, 4).rotateY(Math.PI / 4);
  pyramid.translate(u, apex / 2, w);
  parts.push(pyramid);

  // East wing (elevator shaft): extends outward between height 28 and 62
  parts.push(box(1.8, 34, 3.2, u + 5.2, 28, w));
  // West wing (stairwell & smoke evacuation tower)
  parts.push(box(1.8, 34, 3.2, u - 5.2, 28, w));

  // Open lattice spire mast
  parts.push(cyl(0.08, 0.45, H - apex, 8, apex, u, w));
  // Crown jewel beacon
  parts.push(cyl(0.35, 0.35, 0.3, 10, H - 0.2, u, w));

  return parts;
}

/**
 * Salesforce Tower (San Francisco):
 * Curved tapering obelisk with rounded pill profile and crowned lattice art top.
 */
function buildSalesforceTower(u = -20, w = -170, H = 78): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const crownH = H * 0.88;

  // Gentle curved taper profile
  parts.push(
    lathe(
      [
        [6.8, 0],
        [6.9, H * 0.22],
        [6.7, H * 0.45],
        [6.1, H * 0.68],
        [4.8, crownH],
      ],
      24,
      0,
      u,
      w
    )
  );

  // Crown lattice art top (glowing perforated tiara)
  parts.push(
    lathe(
      [
        [4.8, crownH],
        [3.8, H * 0.95],
        [1.8, H],
      ],
      20,
      0,
      u,
      w
    )
  );

  return parts;
}

/**
 * Suspension Bridge (Golden Gate / Bay Bridge span):
 * Two Art Deco stepped suspension towers, catenary main cables, deck, and hangers.
 */
function buildSuspensionBridge(u = -210, H = 44): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const deckY = H * 0.28;
  const halfDeck = 3.6;
  const wStart = -50;
  const wEnd = 380;
  const towerWPositions = [90, 260];

  // Roadway deck
  parts.push(box(halfDeck * 2, 0.9, wEnd - wStart, u, deckY - 0.9, (wStart + wEnd) / 2));
  // Truss railings
  parts.push(box(0.3, 1.2, wEnd - wStart, u - halfDeck, deckY - 1.2, (wStart + wEnd) / 2));
  parts.push(box(0.3, 1.2, wEnd - wStart, u + halfDeck, deckY - 1.2, (wStart + wEnd) / 2));

  // Twin suspension towers
  for (const tw of towerWPositions) {
    for (const s of [-1, 1]) {
      const legX = u + s * (halfDeck + 0.5);
      // Stepped Art Deco tower legs
      parts.push(box(1.6, H, 1.8, legX, 0, tw));
    }
    // Cross-bracing portal struts
    for (const f of [0.35, 0.58, 0.8, 0.98]) {
      parts.push(box(halfDeck * 2 + 2.2, 1.2, 1.4, u, H * f - 0.6, tw));
    }
  }

  // Catenary cables
  const cablePts = (w0: number, y0: number, w1: number, y1: number, sag: number, x: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      pts.push(new THREE.Vector3(x, y0 + (y1 - y0) * t - sag * 4 * t * (1 - t), w0 + (w1 - w0) * t));
    }
    return pts;
  };

  for (const s of [-1, 1]) {
    const x = u + s * (halfDeck + 0.5);
    const spans = [
      cablePts(wStart, deckY + 1, towerWPositions[0], H, H * 0.1, x),
      cablePts(towerWPositions[0], H, towerWPositions[1], H, H * 0.6, x),
      cablePts(towerWPositions[1], H, wEnd, deckY + 1, H * 0.1, x),
    ];
    for (const pts of spans) {
      parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 36, 0.28, 6, false));
    }
  }

  return parts;
}

/**
 * Los Angeles: US Bank Tower:
 * 73 storeys, cylindrical tower with 3 concentric stepped setbacks and crowning tiara.
 */
function buildUSBankTower(u = -20, w = -210, H = 82): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const top1 = H * 0.52;
  const top2 = H * 0.78;
  const top3 = H * 0.93;

  // Concentric cylindrical setbacks
  parts.push(cyl(6.2, 6.4, top1, 24, 0, u, w));
  parts.push(cyl(5.2, 5.4, top2 - top1, 24, top1, u, w));
  parts.push(cyl(4.2, 4.4, top3 - top2, 24, top2, u, w));

  // Crowning glass Tiara (2-storey circular crown)
  parts.push(cyl(4.5, 4.2, H - top3, 24, top3, u, w));
  // Central roof mast
  parts.push(cyl(0.08, 0.2, 3.5, 8, H, u, w));

  return parts;
}

/**
 * Wilshire Grand Center (Los Angeles):
 * Tallest building in LA, curved sail roofline and 90m illuminated spire.
 */
function buildWilshireGrand(u = 35, w = -200, H = 78): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const roof = H * 0.86;

  // Slender aerodynamic tower shaft
  parts.push(box(8.5, roof, 8.5, u, 0, w));

  // Curved glass sail roof crown
  const sail = box(7.2, H * 0.08, 7.2, u, roof, w);
  sail.rotateZ(0.12);
  parts.push(sail);

  // Soaring architectural spire
  parts.push(cyl(0.08, 0.28, H - roof, 8, roof, u + 1.2, w));

  return parts;
}

/**
 * Miami: Panorama Tower & Southeast Financial Center
 */
function buildMiamiLandmarks(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];

  // Panorama Tower (u: 25, w: -135, H: 84)
  const panH = 84;
  parts.push(box(16, 8, 12, 25, 0, -135)); // podium
  parts.push(box(9, panH - 8, 7.5, 25, 8, -135)); // main residential tower
  parts.push(box(7, 3, 5.5, 25, panH, -135)); // crown

  // Southeast Financial Center (u: -30, w: -150, H: 76)
  const seH = 76;
  parts.push(box(12, seH * 0.6, 12, -30, 0, -150));
  parts.push(box(9.5, seH * 0.35, 9.5, -30, seH * 0.6, -150));
  parts.push(box(6.5, seH * 0.05, 6.5, -30, seH * 0.95, -150)); // illuminated crown

  return parts;
}

/* -------------------------------------------------------------------------- */
/* Clean Geometric Skyline Main Component                                     */
/* -------------------------------------------------------------------------- */

export default function CleanGeometricSkyline({
  preset,
  clearings = [],
}: {
  preset: CityPreset;
  clearings?: UWRect[];
}) {
  const { time } = useCinematic();

  useFrame(() => {
    setFacadeNight(SUN[time].night);
  });

  const tint = useMemo(() => cityFacadeTint(preset), [preset]);

  // Build merged building geometries and custom landmark geometries
  const {
    buildingsGeometry,
    roofGeometry,
    spiresGeometry,
    bridgeGeometry,
  } = useMemo(() => {
    const plan = cityPlan(preset);
    const allClearings = [...clearings, SITE_CLEARING];

    const isExcluded = (u: number, w: number, su: number, sw: number) => {
      const rect: UWRect = {
        u0: u - su / 2,
        u1: u + su / 2,
        w0: w - sw / 2,
        w1: w + sw / 2,
      };
      return allClearings.some((c) => rectsOverlap(rect, c));
    };

    const buildingParts: THREE.BufferGeometry[] = [];
    const roofParts: THREE.BufferGeometry[] = [];
    const spireParts: THREE.BufferGeometry[] = [];
    const bridgeParts: THREE.BufferGeometry[] = [];

    // 1. Procedural city grid buildings
    for (const b of plan.buildings) {
      if (isExcluded(b.u, b.w, b.su, b.sw)) continue;

      let geo: THREE.BufferGeometry;
      if (b.shape === "round") {
        geo = cyl(b.su * 0.48, b.su * 0.48, b.h, 20, b.y, b.u, b.w);
      } else {
        geo = box(b.su, b.h, b.sw, b.u, b.y, b.w);
      }
      buildingParts.push(geo);
    }

    // 2. Rooftop mechanical equipment
    for (const r of plan.roof) {
      if (isExcluded(r.u, r.w, r.su, r.sw)) continue;
      roofParts.push(box(r.su, r.h, r.sw, r.u, r.y, r.w));
    }

    // 3. Architectural spires on towers
    for (const s of plan.spires) {
      if (isExcluded(s.u, s.w, s.r * 2, s.r * 2)) continue;
      spireParts.push(cyl(s.r * 0.2, s.r, s.h, 8, s.y, s.u, s.w));
    }

    // 4. Iconic city landmarks
    switch (preset.id) {
      case "seattle":
        buildingParts.push(...buildSpaceNeedle());
        buildingParts.push(...buildColumbiaCenter());
        break;
      case "toronto":
        buildingParts.push(...buildCNTower());
        buildingParts.push(...buildFirstCanadianPlace());
        break;
      case "san-francisco":
        buildingParts.push(...buildTransamericaPyramid());
        buildingParts.push(...buildSalesforceTower());
        bridgeParts.push(...buildSuspensionBridge());
        break;
      case "los-angeles":
        buildingParts.push(...buildUSBankTower());
        buildingParts.push(...buildWilshireGrand());
        break;
      case "miami":
        buildingParts.push(...buildMiamiLandmarks());
        break;
      default:
        break;
    }

    const mergedBuildings = buildingParts.length > 0 ? mergeGeometries(buildingParts, false) : null;
    const mergedRoofs = roofParts.length > 0 ? mergeGeometries(roofParts, false) : null;
    const mergedSpires = spireParts.length > 0 ? mergeGeometries(spireParts, false) : null;
    const mergedBridge = bridgeParts.length > 0 ? mergeGeometries(bridgeParts, false) : null;

    buildingParts.forEach((p) => p.dispose());
    roofParts.forEach((p) => p.dispose());
    spireParts.forEach((p) => p.dispose());
    bridgeParts.forEach((p) => p.dispose());

    return {
      buildingsGeometry: mergedBuildings,
      roofGeometry: mergedRoofs,
      spiresGeometry: mergedSpires,
      bridgeGeometry: mergedBridge,
    };
  }, [preset, clearings]);

  // Create materials decorated with applyArchitecturalFacade
  const { buildingMat, roofMat, spireMat, bridgeMat } = useMemo(() => {
    const bMat = new THREE.MeshStandardMaterial({
      color: tint,
      roughness: 0.16,
      metalness: 0.62,
      envMapIntensity: 1.35,
    });
    applyArchitecturalFacade(bMat, { defaultColor: tint });

    const rMat = new THREE.MeshStandardMaterial({
      color: "#545b62",
      roughness: 0.88,
      metalness: 0.08,
      envMapIntensity: 0.5,
    });

    const sMat = new THREE.MeshStandardMaterial({
      color: "#d0d7dc",
      roughness: 0.22,
      metalness: 0.88,
      envMapIntensity: 1.5,
    });

    const brMat = new THREE.MeshStandardMaterial({
      color: "#c0362c", // International Orange for suspension bridge
      roughness: 0.55,
      metalness: 0.2,
      envMapIntensity: 0.8,
    });

    return {
      buildingMat: bMat,
      roofMat: rMat,
      spireMat: sMat,
      bridgeMat: brMat,
    };
  }, [tint]);

  useEffect(() => {
    invalidateShadows();
    return () => {
      buildingsGeometry?.dispose();
      roofGeometry?.dispose();
      spiresGeometry?.dispose();
      bridgeGeometry?.dispose();
      buildingMat.dispose();
      roofMat.dispose();
      spireMat.dispose();
      bridgeMat.dispose();
      invalidateShadows();
    };
  }, [
    buildingsGeometry,
    roofGeometry,
    spiresGeometry,
    bridgeGeometry,
    buildingMat,
    roofMat,
    spireMat,
    bridgeMat,
  ]);

  return (
    <group rotation-y={SITE_ROTATION_Y} position={[0, 0.04, 0]}>
      {buildingsGeometry && (
        <mesh
          geometry={buildingsGeometry}
          material={buildingMat}
          castShadow
          receiveShadow
          raycast={noRaycast}
        />
      )}
      {roofGeometry && (
        <mesh
          geometry={roofGeometry}
          material={roofMat}
          castShadow={false}
          receiveShadow
          raycast={noRaycast}
        />
      )}
      {spiresGeometry && (
        <mesh
          geometry={spiresGeometry}
          material={spireMat}
          castShadow
          receiveShadow={false}
          raycast={noRaycast}
        />
      )}
      {bridgeGeometry && (
        <mesh
          geometry={bridgeGeometry}
          material={bridgeMat}
          castShadow
          receiveShadow
          raycast={noRaycast}
        />
      )}
    </group>
  );
}
