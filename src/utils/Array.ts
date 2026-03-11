/**
 * In-place array compaction — removes dead entities without allocating a new array.
 * Replaces `.filter(e => e.alive)` which creates a new array every frame (GC pressure).
 */
export function compactAlive<T extends { alive: boolean }>(arr: T[]): void {
  let writeIdx = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].alive) {
      if (i !== writeIdx) arr[writeIdx] = arr[i];
      writeIdx++;
    }
  }
  arr.length = writeIdx;
}
