/**
 * Wavefront animation engine — DOM-free so it can be unit-tested.
 *
 * `tracks` is a list of { total, color, draw(from, to) }. Every frame, each track
 * advances by `perFrame` steps and calls draw(from, to) for the newly revealed
 * range. All tracks advance at the SAME rate, so in a race the algorithm that
 * needs fewer expansions finishes first.
 *
 * Returns a handle { cancel(), done: Promise<boolean> } (true = ran to the end).
 */
export function runWavefront({ tracks, perFrame, schedule = defaultSchedule }) {
  let cancelled = false;
  let cursor = tracks.map(() => 0);
  let resolveDone;
  const done = new Promise((res) => (resolveDone = res));

  const finishedAll = () => tracks.every((t, i) => cursor[i] >= t.total);

  function frame() {
    if (cancelled) return resolveDone(false);
    tracks.forEach((t, i) => {
      if (cursor[i] >= t.total) return;
      const to = Math.min(t.total, cursor[i] + perFrame);
      t.draw(cursor[i], to);
      cursor[i] = to;
    });
    if (finishedAll()) return resolveDone(true);
    schedule(frame);
  }

  if (finishedAll()) resolveDone(true);
  else schedule(frame);

  return {
    cancel() {
      cancelled = true;
    },
    done,
  };
}

function defaultSchedule(fn) {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
  else setTimeout(fn, 16);
}

/** Map the 1–10 speed slider to nodes revealed per animation frame. */
export function perFrameForSpeed(speed) {
  const table = [1, 2, 3, 5, 8, 14, 24, 45, 90, 250];
  const i = Math.min(table.length, Math.max(1, Math.round(speed))) - 1;
  return table[i];
}
