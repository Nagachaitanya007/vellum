/**
 * Hybrid logical clock used as the per-mutation version.
 *
 * Wall-clock milliseconds when they move forward; otherwise last+1 so two
 * mutations in the same millisecond never share a version. Last-write-wins
 * still compares this single integer — no CRDT.
 */

let lastRevision = 0;

export function nextRevision(now: number = Date.now()): number {
  const tick = Number.isFinite(now) && now >= 0 ? now : Date.now();
  lastRevision = tick > lastRevision ? tick : lastRevision + 1;
  return lastRevision;
}

/** Next version strictly greater than a previous record version. */
export function revisionAfter(previous: number, now: number = Date.now()): number {
  const floor = Number.isFinite(previous) && previous >= 0 ? previous : 0;
  const next = nextRevision(now);
  const value = next > floor ? next : floor + 1;
  observeRevision(value);
  return value;
}

export function observeRevision(value: number): void {
  if (typeof value === "number" && Number.isFinite(value) && value > lastRevision) {
    lastRevision = value;
  }
}

export function resetRevisionForTests(value = 0): void {
  lastRevision = value;
}
