/**
 * Binary min-heap keyed by a numeric priority.
 * Used as the priority queue for Dijkstra / A*.
 * Duplicate entries for the same value are allowed ("lazy deletion"):
 * the search simply skips entries that are already closed.
 */
export class MinHeap {
  constructor() {
    this.keys = [];
    this.vals = [];
  }

  get size() {
    return this.keys.length;
  }

  push(value, key) {
    const keys = this.keys;
    const vals = this.vals;
    let i = keys.length;
    keys.push(key);
    vals.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent];
      vals[i] = vals[parent];
      i = parent;
    }
    keys[i] = key;
    vals[i] = value;
  }

  /** Remove and return the value with the smallest key (undefined if empty). */
  pop() {
    const keys = this.keys;
    const vals = this.vals;
    const n = keys.length;
    if (n === 0) return undefined;
    const top = vals[0];
    const lastKey = keys.pop();
    const lastVal = vals.pop();
    const size = n - 1;
    if (size > 0) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= size) break;
        if (child + 1 < size && keys[child + 1] < keys[child]) child++;
        if (keys[child] >= lastKey) break;
        keys[i] = keys[child];
        vals[i] = vals[child];
        i = child;
      }
      keys[i] = lastKey;
      vals[i] = lastVal;
    }
    return top;
  }
}
