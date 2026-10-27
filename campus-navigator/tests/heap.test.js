import test from 'node:test';
import assert from 'node:assert/strict';
import { MinHeap } from '../src/heap.js';
import { mulberry32 } from './helpers.js';

test('pops values in ascending key order', () => {
  const h = new MinHeap();
  [[ 'c', 3 ], [ 'a', 1 ], [ 'e', 5 ], [ 'b', 2 ], [ 'd', 4 ]].forEach(([v, k]) => h.push(v, k));
  const out = [];
  while (h.size) out.push(h.pop());
  assert.deepEqual(out, ['a', 'b', 'c', 'd', 'e']);
});

test('empty heap returns undefined', () => {
  assert.equal(new MinHeap().pop(), undefined);
});

test('handles duplicate keys and interleaved push/pop (matches a sorted reference)', () => {
  const rnd = mulberry32(7);
  const h = new MinHeap();
  const ref = [];
  for (let i = 0; i < 3000; i++) {
    if (ref.length && rnd() < 0.4) {
      ref.sort((x, y) => x - y);
      const expected = ref.shift();
      assert.equal(h.pop(), expected);
    } else {
      const k = Math.floor(rnd() * 50); // many duplicates
      h.push(k, k);
      ref.push(k);
    }
  }
  assert.equal(h.size, ref.length);
});
