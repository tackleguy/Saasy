export type DistrictDetail = "standard" | "high";
export type DistrictLoadStatus = "idle" | "loading" | "updating" | "ready" | "fallback" | "retained" | "failed";

interface DistrictLoadOptions<T> {
  load(detail: DistrictDetail, signal: AbortSignal): Promise<T>;
  dispose(value: T): void;
  replace(next: T | null, previous: T | null, detail: DistrictDetail | null): void;
  status(status: DistrictLoadStatus): void;
}

/** Owns one district and its pending replacement. Each load returns independently
 * owned resources; replacing texture detail never removes the usable district. */
export class DistrictLoadController<T> {
  private active: { value: T; detail: DistrictDetail } | null = null;
  private pending: AbortController | null = null;
  private generation = 0;
  private stopped = false;
  private readonly releasedObjects = new WeakSet<object>();
  private readonly releasedPrimitives = new Set<T>();

  constructor(private readonly options: DistrictLoadOptions<T>) {}

  private release(value: T) {
    // Avoid retaining disposed scene graphs merely to remember their ownership.
    if (value !== null && (typeof value === "object" || typeof value === "function")) {
      const object = value as object;
      if (this.releasedObjects.has(object)) return;
      this.releasedObjects.add(object);
    } else {
      if (this.releasedPrimitives.has(value)) return;
      this.releasedPrimitives.add(value);
    }
    this.options.dispose(value);
  }

  async request(detail: DistrictDetail): Promise<void> {
    if (this.stopped) return;
    const generation = ++this.generation;
    this.pending?.abort();
    this.pending = null;
    if (this.active?.detail === detail) {
      this.options.status("ready");
      return;
    }

    const controller = new AbortController();
    this.pending = controller;
    const current = () => !this.stopped && generation === this.generation && !controller.signal.aborted;
    const finish = (status: DistrictLoadStatus) => {
      if (!current()) return;
      this.pending = null;
      this.options.status(status);
    };
    this.options.status(this.active ? "updating" : "loading");

    let value: T;
    let resolvedDetail = detail;
    let fallback = false;
    try {
      value = await this.options.load(detail, controller.signal);
    } catch {
      if (!current()) return;
      if (detail !== "high") {
        finish(this.active ? "retained" : "failed");
        return;
      }
      if (this.active?.detail === "standard") {
        finish("fallback");
        return;
      }
      try {
        value = await this.options.load("standard", controller.signal);
        resolvedDetail = "standard";
        fallback = true;
      } catch {
        finish(this.active ? "retained" : "failed");
        return;
      }
    }

    if (!current()) {
      this.release(value);
      return;
    }
    const previous = this.active;
    this.active = { value, detail: resolvedDetail };
    // The renderer must detach the old graph before its resources are released.
    this.options.replace(value, previous?.value ?? null, resolvedDetail);
    if (previous && previous.value !== value) this.release(previous.value);
    finish(fallback ? "fallback" : "ready");
  }

  dispose(): void {
    if (this.stopped) return;
    this.stopped = true;
    ++this.generation;
    this.pending?.abort();
    this.pending = null;
    const previous = this.active;
    this.active = null;
    if (previous) {
      this.options.replace(null, previous.value, null);
      this.release(previous.value);
    }
  }
}
