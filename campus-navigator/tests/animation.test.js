import test from 'node:test';
import assert from 'node:assert/strict';
import { runWavefront, perFrameForSpeed } from '../src/animation.js';

/** Manual scheduler so tests control exactly when each "frame" fires. */
function manualScheduler() {
  const queue = [];
  return { schedule: (fn) => queue.push(fn), step: () => queue.shift()?.(), get pending() { return queue.length; } };
}

test('advances each track by perFrame and finishes', async () => {
  const s = manualScheduler();
  const calls = [];
  const h = runWavefront({
    tracks: [{ total: 7, draw: (a, b) => calls.push([a, b]) }],
    perFrame: 3,
    schedule: s.schedule,
  });
  while (s.pending) s.step();
  assert.equal(await h.done, true);
  assert.deepEqual(calls, [[0, 3], [3, 6], [6, 7]]);
});

test('in a race the track with fewer steps finishes first, same pace for both', async () => {
  const s = manualScheduler();
  const log = [];
  const h = runWavefront({
    tracks: [
      { total: 10, draw: (a, b) => log.push(['long', a, b]) },
      { total: 4, draw: (a, b) => log.push(['short', a, b]) },
    ],
    perFrame: 2,
    schedule: s.schedule,
  });
  while (s.pending) s.step();
  await h.done;
  const shortDone = log.findIndex((e) => e[0] === 'short' && e[2] === 4);
  const longDone = log.findIndex((e) => e[0] === 'long' && e[2] === 10);
  assert.ok(shortDone < longDone);
  assert.ok(log.filter((e) => e[0] === 'short').every((e) => e[2] - e[1] <= 2));
});

test('cancel stops drawing and resolves done with false', async () => {
  const s = manualScheduler();
  let drawn = 0;
  const h = runWavefront({ tracks: [{ total: 100, draw: () => drawn++ }], perFrame: 1, schedule: s.schedule });
  s.step();
  h.cancel();
  s.step();
  assert.equal(await h.done, false);
  assert.equal(drawn, 1);
});

test('perFrame = Infinity reveals everything in one frame; empty tracks finish immediately', async () => {
  const s = manualScheduler();
  const calls = [];
  const h = runWavefront({ tracks: [{ total: 50, draw: (a, b) => calls.push([a, b]) }], perFrame: Infinity, schedule: s.schedule });
  while (s.pending) s.step();
  assert.equal(await h.done, true);
  assert.deepEqual(calls, [[0, 50]]);
  const e = runWavefront({ tracks: [{ total: 0, draw() { throw new Error('nope'); } }], perFrame: 5, schedule: s.schedule });
  assert.equal(await e.done, true);
});

test('speed slider maps monotonically to nodes per frame', () => {
  let last = 0;
  for (let sp = 1; sp <= 10; sp++) {
    const v = perFrameForSpeed(sp);
    assert.ok(v > last);
    last = v;
  }
  assert.equal(perFrameForSpeed(0), perFrameForSpeed(1));
  assert.equal(perFrameForSpeed(99), perFrameForSpeed(10));
});
