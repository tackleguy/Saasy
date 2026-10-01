/**
 * Building cores — one or many, optionally stepped.
 * -----------------------------------------------------------------------------
 * A core is a square lift-and-stair shaft. It never twists. A building may
 * have several. Any core may taper: at `transferFloor` the shaft steps in,
 * the outer lifts end, and the cars in the middle of the bank keep going
 * to the top.
 *
 * The step keeps the lobby face (+Z) where it was and pulls the back wall
 * and the two sides in, so those middle shafts stay one straight run.
 * Scene units, building-local plan. No React, no Three.js.
 */
import type { CoreInput, CoreSpec, FloorCore, FloorData } from "@/types";
import { liftBank, liftDims, type LiftCar } from "./lift";

export interface ServedCar extends LiftCar {
  /** Local cars stop at the transfer; express cars run to the top of this core. */
  reach: "local" | "express";
  /** Shaft box relative to the core's base centre. */
  shaft: { x: number; z: number; w: number; d: number };
}

/** Smallest upper core that still holds the inner cars (the outermost rank ends). */
function minUpperForInner(base: number): number {
  const bank = liftBank(base);
  const cars = bank.cars;
  if (cars.length <= 1) return base;
  const outer = Math.max(...cars.map((c) => Math.abs(c.x)));
  const inner = cars.filter((c) => Math.abs(c.x) < outer - 1e-3);
  const keep = inner.length ? inner : cars.filter((c) => c.main);
  const margin = 0.14;
  const needX = 2 * (Math.max(...keep.map((c) => Math.abs(c.x) + c.cabW / 2)) + margin);
  const L = liftDims(base, 10);
  const needZ = base / 2 - L.zBack + margin;
  return Math.min(base, Math.max(needX, needZ, L.cabW + 0.45));
}

/** Upper side length. A taper mild enough that the core would barely move is dropped. */
export function upperCoreSize(base: number, taper: number): number {
  if (!(taper < 0.995)) return base;
  const requested = base * Math.min(1, Math.max(0.4, taper));
  const upper = Math.min(base, Math.max(requested, minUpperForInner(base)));
  return upper > base * 0.97 ? base : +upper.toFixed(3);
}

/**
 * Cars of the base bank against the upper, face-aligned core.
 * When the core steps in, the outermost car ends there and the centre car continues.
 */
export function servedCars(baseSize: number, upperSize: number): ServedCar[] {
  const bank = liftBank(baseSize);
  const z = (bank.zBack + bank.zFront) / 2;
  const d = bank.zFront - bank.zBack;
  const tapered = upperSize < baseSize - 1e-3;
  const xh = upperSize / 2;
  const z0 = baseSize / 2 - upperSize;
  const margin = 0.06;
  let cars: ServedCar[] = bank.cars.map((car) => {
    const fits =
      !tapered ||
      (Math.abs(car.x) + car.cabW / 2 <= xh - margin && z - d / 2 >= z0 + margin && z + d / 2 <= baseSize / 2 + 1e-3);
    return { ...car, reach: fits ? "express" : "local", shaft: { x: car.x, z, w: car.cabW, d } };
  });
  if (tapered && cars.length > 1 && cars.every((c) => c.reach === "express")) {
    const outer = Math.max(...cars.map((c) => Math.abs(c.x)));
    cars = cars.map((c) => (Math.abs(Math.abs(c.x) - outer) < 1e-3 ? { ...c, reach: "local" } : c));
  }
  if (tapered && !cars.some((c) => c.reach === "express")) {
    const main = cars.find((c) => c.main) ?? cars[0];
    main.reach = "express";
  }
  return cars;
}

/** Doors on one floor: the whole bank below the step, only the express cars above it. */
export function doorsOnFloor(core: FloorCore): LiftCar[] {
  if (core.service !== "express") return liftBank(core.size).cars;
  return servedCars(core.baseSize, core.size).filter((c) => c.reach === "express");
}

/** Upper-core centre: same X, lobby face (+Z) unmoved. */
export function taperedCentre(offset: [number, number], base: number, upper: number): [number, number] {
  return [offset[0], offset[1] + (base - upper) / 2];
}

/** Massing `cores` (or a single default) → resolved shafts. Primary is marked, else nearest the centre. */
export function resolveCores(inputs: CoreInput[] | undefined, fallbackSize: number, lastFloor: number): CoreSpec[] {
  const src = inputs?.length ? inputs : [{}];
  const draft = src.map((c, i) => ({
    id: c.id ?? (src.length === 1 ? "core" : `core-${i + 1}`),
    offset: (c.offset ?? [0, 0]) as [number, number],
    size: c.size ?? (i === 0 ? fallbackSize : Math.min(fallbackSize, 2.2)),
    taper: c.taper ?? 1,
    transfer: c.transfer,
    primary: c.primary ?? false,
  }));
  let primary = draft.findIndex((c) => c.primary);
  if (primary < 0) {
    primary = 0;
    let best = Infinity;
    draft.forEach((c, i) => {
      const d = c.offset[0] ** 2 + c.offset[1] ** 2;
      if (d < best - 1e-6) {
        best = d;
        primary = i;
      }
    });
  }
  return draft.map((c, i) => {
    const upper = upperCoreSize(c.size, c.taper);
    const taper = c.size > 1e-3 ? +(upper / c.size).toFixed(3) : 1;
    const stepped = taper < 0.995;
    let transferFloor = lastFloor + 1;
    if (stepped) {
      const f = c.transfer ?? 0.58;
      transferFloor = Math.round(Math.min(1, Math.max(0, f)) * lastFloor);
      transferFloor = Math.max(3, Math.min(lastFloor - 1, transferFloor));
    }
    return {
      id: c.id,
      offset: [+c.offset[0].toFixed(3), +c.offset[1].toFixed(3)],
      size: +c.size.toFixed(3),
      taper,
      transferFloor,
      primary: i === primary,
    };
  });
}

/** This floor's slice of one core. */
export function floorCoreFrom(spec: CoreSpec, floorNumber: number): FloorCore {
  const express = floorNumber >= spec.transferFloor;
  const size = express ? +(spec.size * spec.taper).toFixed(3) : spec.size;
  const offset = express ? taperedCentre(spec.offset, spec.size, size) : spec.offset;
  return { id: spec.id, offset, size, service: express ? "express" : "full", primary: spec.primary, baseSize: spec.size };
}

export function primaryCoreOf(floor: Pick<FloorData, "cores">, fallbackSize = 0): FloorCore {
  const cores = floor.cores;
  const found = cores?.find((c) => c.primary) ?? cores?.[0];
  return found ?? { id: "core", offset: [0, 0], size: fallbackSize, service: "full", primary: true, baseSize: fallbackSize };
}

export interface CoreBand {
  id: string;
  x: number;
  z: number;
  size: number;
  /** Full bank, or the stepped express prism. */
  service: "full" | "express";
  floor0: number;
  floor1: number;
}

/** Consecutive floors that share one core size and centre. */
export function coreBands(floors: FloorData[]): CoreBand[] {
  const open = new Map<string, CoreBand>();
  const out: CoreBand[] = [];
  const close = (id: string) => {
    const band = open.get(id);
    if (band) {
      out.push(band);
      open.delete(id);
    }
  };
  for (const f of floors) {
    const present = new Set((f.cores ?? []).map((c) => c.id));
    for (const id of [...open.keys()]) if (!present.has(id)) close(id);
    for (const c of f.cores ?? []) {
      const band = open.get(c.id);
      const same =
        band &&
        band.service === c.service &&
        Math.abs(band.size - c.size) < 1e-3 &&
        Math.abs(band.x - c.offset[0]) < 1e-3 &&
        Math.abs(band.z - c.offset[1]) < 1e-3;
      if (same && band) band.floor1 = f.index;
      else {
        close(c.id);
        open.set(c.id, { id: c.id, x: c.offset[0], z: c.offset[1], size: c.size, service: c.service, floor0: f.index, floor1: f.index });
      }
    }
  }
  for (const id of [...open.keys()]) close(id);
  return out;
}

export interface ShaftRun {
  x: number;
  z: number;
  w: number;
  d: number;
  floor0: number;
  floor1: number;
  express: boolean;
}

/** Express shafts run the whole core; local shafts stop at the last full-service floor. */
export function shaftRuns(floors: FloorData[], cores: CoreSpec[]): ShaftRun[] {
  const runs: ShaftRun[] = [];
  for (const spec of cores) {
    const served = floors.filter((f) => f.cores?.some((c) => c.id === spec.id));
    if (!served.length) continue;
    const last = served[served.length - 1].index;
    const full = served.filter((f) => f.cores!.find((c) => c.id === spec.id)!.service === "full");
    const fullEnd = full.length ? full[full.length - 1].index : served[0].index;
    const upper = +(spec.size * spec.taper).toFixed(3);
    for (const car of servedCars(spec.size, upper)) {
      const toTop = car.reach === "express";
      runs.push({
        x: spec.offset[0] + car.shaft.x,
        z: spec.offset[1] + car.shaft.z,
        w: car.shaft.w,
        d: car.shaft.d,
        floor0: served[0].index,
        floor1: toTop ? last : Math.min(fullEnd, last),
        express: toTop && spec.taper < 0.995,
      });
    }
  }
  return runs;
}
