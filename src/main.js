// Raquel & Flávio — opening sequence.
//
// Phases (hero[data-phase]):
//   loading  → waiting for the main photograph (and fonts, briefly)
//   intro    → colour photograph, slow push-in, desaturation, titles
//   montage  → short cut sequence, ending on main in black & white
//   settled  → stable; tap toggles colour, deliberate pull at the top replays
//
// Every animation of a run lives in `running`; any interruption (tap, scroll
// away, tab hidden) calls settle(), which freezes the current frame, cancels
// everything and lets CSS transitions carry the page to the settled state.
(() => {
  'use strict';

  const hero = document.querySelector('.hero');
  if (!hero || !('animate' in Element.prototype)) {
    if (hero) {
      hero.dataset.phase = 'settled';
      hero.dataset.colour = 'off';
    }
    return;
  }

  const stage = hero.querySelector('.stage');
  const plate = hero.querySelector('.plate');
  const colourShot = hero.querySelector('.shot--colour');
  const monoShot = hero.querySelector('.shot--mono');
  const titles = hero.querySelector('.titles');
  const lines = [...hero.querySelectorAll('.line > span')];
  const date = hero.querySelector('.date');
  const hit = hero.querySelector('.hit');
  const replayBtn = hero.querySelector('.replay');
  const pull = hero.querySelector('.pull');
  const cuts = [...hero.querySelectorAll('.cut')];
  const depth = hero.querySelector('.depth');
  const motionBtn = hero.querySelector('.motion');

  const reduceMq = matchMedia('(prefers-reduced-motion: reduce)');
  const framedMq = matchMedia('(min-aspect-ratio: 4/5)');
  const coarseMq = matchMedia('(hover: none) and (pointer: coarse)');

  const PULL_TOUCH = 130; // px of downward drag at the very top
  const PULL_WHEEL = 340; // accumulated upward wheel delta at the very top
  const TOP_DWELL = 450; // ms the page must already rest at the top
  const COOLDOWN = 1200; // ms after a run before a replay can be triggered

  const state = {
    phase: 'loading',
    coloured: false,
    interacted: false,
    run: 0,
    endedAt: 0,
  };
  // Gyroscope depth: target (tx, ty) from the sensor, eased (x, y, s) on screen.
  const motion = { on: false, base: null, tx: 0, ty: 0, x: 0, y: 0, s: 1, raf: 0, visible: true };
  let running = [];
  let timers = [];

  // ───────── helpers ─────────

  const now = () => performance.now();

  function setPhase(phase) {
    state.phase = phase;
    hero.dataset.phase = phase;
    kickMotion(); // ease back to centre during a run, resume once settled
  }

  function setColour(on) {
    state.coloured = on;
    hero.dataset.colour = on ? 'on' : 'off';
  }

  function anim(el, keyframes, options) {
    const a = el.animate(keyframes, { fill: 'both', ...options });
    running.push(a);
    return a;
  }

  function wait(ms, run) {
    return new Promise((resolve, reject) => {
      const id = setTimeout(() => {
        timers = timers.filter((t) => t !== id);
        run === state.run ? resolve() : reject(new Error('stale'));
      }, ms);
      timers.push(id);
    });
  }

  function decoded(img) {
    if (img.complete && img.naturalWidth) return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
    return new Promise((resolve) => {
      img.addEventListener('load', () => resolve(img.decode ? img.decode().catch(() => {}) : undefined), { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  }

  // Stops the current run on the frame that is on screen; `next` sets the new
  // CSS state, and removing the frozen inline values lets transitions carry it.
  function freeze(next) {
    state.run++;
    timers.forEach(clearTimeout);
    timers = [];

    const touched = new Set();
    for (const a of running) {
      try { a.commitStyles(); } catch (_) { /* element not rendered */ }
      touched.add(a.effect.target);
      a.cancel();
    }
    running = [];

    hero.offsetWidth; // flush: committed values become the transition start
    next();
    touched.forEach((el) => {
      el.style.removeProperty('opacity');
      el.style.removeProperty('transform');
    });
  }

  function settle() {
    if (state.phase === 'settled') return;
    const wasMontage = state.phase === 'montage';
    freeze(() => setPhase('settled'));
    state.endedAt = now();
    if (!state.interacted) hero.dataset.hint = 'show';
    // The film has been seen (or skipped): scrolling may now take the visitor on.
    if (wasMontage) openGate();
  }

  // ───────── assets ─────────

  let cutsReady = null;
  function loadCuts() {
    if (cutsReady) return cutsReady;
    cuts.forEach((img) => {
      const p = img.dataset.photo;
      img.decoding = 'async';
      img.sizes = '(min-aspect-ratio: 4/5) 62vh, 100vw';
      img.srcset = `media/web/${p}-720.jpg 720w, media/web/${p}-1080.jpg 1080w`;
      img.src = `media/web/${p}-1080.jpg`;
    });
    cutsReady = Promise.all(cuts.map(decoded));
    return cutsReady;
  }

  // ───────── intro ─────────

  async function intro() {
    const run = state.run;
    setPhase('intro');
    setColour(false); // CSS target; the animation below holds colour until it fades

    if (reduceMq.matches) {
      // No camera move, no cuts: a still crossfade from colour to black & white.
      anim(plate, [{ opacity: 0 }, { opacity: 1 }], { duration: 900, easing: 'linear' });
      anim(colourShot, [{ opacity: 1 }, { opacity: 0 }], { delay: 1200, duration: 2600, easing: 'ease-in-out' });
      lines.forEach((el, i) => anim(el, [{ opacity: 0 }, { opacity: 1 }], { delay: 2200 + i * 400, duration: 1400 }));
      anim(date, [{ opacity: 0 }, { opacity: 1 }], { delay: 3400, duration: 1400 });
      await Promise.all(running.map((a) => a.finished));
      if (run === state.run) settle();
      return;
    }

    anim(plate, [{ opacity: 0 }, { opacity: 1 }], { duration: 1100, easing: 'cubic-bezier(.45,0,.25,1)' });
    anim(plate, [{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], {
      duration: 7400, easing: 'cubic-bezier(.22,.61,.36,1)',
    });
    const desaturate = anim(colourShot, [{ opacity: 1 }, { opacity: 0 }], {
      delay: 1100, duration: 3600, easing: 'cubic-bezier(.45,0,.25,1)',
    });
    lines.forEach((el, i) => anim(el, [{ transform: 'translateY(110%)' }, { transform: 'translateY(0)' }], {
      delay: 2100 + i * 280, duration: 1500, easing: 'cubic-bezier(.16,1,.3,1)',
    }));
    const dated = anim(date, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], {
      delay: 3400, duration: 1200, easing: 'cubic-bezier(.16,1,.3,1)',
    });

    // Chain on the animations themselves, not the wall clock, so a slow device
    // never cuts the opening short. Rejects (and stops here) if the run is frozen.
    // The montage itself waits for the visitor's first scroll (see the gate below).
    await Promise.all([desaturate.finished, dated.finished, ...running.map((a) => a.finished)]);
    if (run === state.run) settle();
  }

  // ───────── montage ─────────

  async function montage(run) {
    setPhase('montage'); // immediately, so taps during the wait below skip rather than toggle
    await Promise.race([loadCuts(), wait(1800, run)]);
    if (run !== state.run) return;

    const ready = cuts.filter((img) => img.complete && img.naturalWidth);
    if (!ready.length) { settle(); return; }

    // Finish the intro animations in place, then start a clean set for the cuts.
    running.forEach((a) => a.finish());
    running.forEach((a) => a.cancel());
    running = [];
    const reduce = reduceMq.matches;
    const hideTitles = !framedMq.matches;
    const fade = reduce ? 600 : 110;
    const outro = reduce ? 1000 : 800;
    let t = 0;

    if (hideTitles) {
      anim(titles, [{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-out' });
      t = 260;
    }
    const start = t;

    ready.forEach((img, i) => {
      const last = i === ready.length - 1;
      const hold = reduce ? 900 : Number(img.dataset.hold) || 320;
      const out = last ? outro : fade; // stay opaque until the next frame has covered it
      const dur = fade + hold + out;
      // Alternate a slight push-in / pull-out so each cut has its own breath.
      const [s0, s1] = reduce ? [1, 1] : (i % 2 ? [1.0, 1.035] : [1.045, 1.0]);
      anim(img, [
        { offset: 0, opacity: 0, transform: `scale(${s0})` },
        { offset: fade / dur, opacity: 1 },
        { offset: last ? (fade + hold) / dur : 0.999, opacity: 1, easing: 'cubic-bezier(.45,0,.25,1)' },
        { offset: 1, opacity: 0, transform: `scale(${s1})` },
      ], { delay: t, duration: dur, easing: 'linear' });
      t += fade + hold;
    });

    // The main photograph waits underneath and lands exactly on the opening frame.
    // fill: forwards — it only takes the landing scale once the first cut covers it.
    const landing = reduce ? 1 : 1.03;
    const plateDur = t + outro + 600 - (start + fade);
    anim(plate, [
      { offset: 0, transform: `scale(${landing})` },
      { offset: Math.max(0, (t - 200 - start - fade) / plateDur), transform: `scale(${landing})`, easing: 'cubic-bezier(.16,1,.3,1)' },
      { offset: 1, transform: 'scale(1)' },
    ], { delay: start + fade, duration: plateDur, fill: 'forwards' });

    if (hideTitles) {
      // forwards only: a backwards fill would override the fade-out above
      anim(titles, [{ opacity: 0 }, { opacity: 1 }], { delay: t + 300, duration: 1000, easing: 'ease-in-out', fill: 'forwards' });
    }

    try {
      await Promise.all(running.map((a) => a.finished));
    } catch (_) {
      return; // cancelled by settle()
    }
    if (run === state.run) settle();
  }

  // ───────── interaction ─────────

  function replay() {
    if (state.phase !== 'settled' || now() - state.endedAt < COOLDOWN) return;
    state.run++;
    press = null;
    setColour(false);
    montage(state.run).catch(() => {});
  }

  // Colour is shown only while the photograph is held (finger, mouse or key).
  const PRESS_SLOP = 14; // px of movement that turns a press into a gesture
  let press = null;

  function holdColour(id, x, y) {
    if (state.phase !== 'settled') return;
    press = { id, x, y };
    setColour(true);
    if (!state.interacted) {
      state.interacted = true;
      hero.dataset.hint = 'done';
      replayBtn.hidden = false;
    }
  }

  function releaseColour(id) {
    if (!press || (id !== undefined && id !== press.id)) return;
    press = null;
    setColour(false);
  }

  hit.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    holdColour(e.pointerId, e.clientX, e.clientY);
  });
  hit.addEventListener('pointermove', (e) => {
    // Scrolling or pulling to replay is not a press.
    if (press && e.pointerId === press.id
      && Math.hypot(e.clientX - press.x, e.clientY - press.y) > PRESS_SLOP) releaseColour(e.pointerId);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
    hit.addEventListener(type, (e) => releaseColour(e.pointerId));
  });
  hit.addEventListener('contextmenu', (e) => { if (press) e.preventDefault(); });

  hit.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) holdColour('key', 0, 0);
  });
  hit.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') releaseColour('key');
  });
  hit.addEventListener('blur', () => releaseColour());

  // A tap while the film is playing skips to the settled frame.
  hit.addEventListener('click', () => {
    if (state.phase === 'intro' || state.phase === 'montage') settle();
  });

  replayBtn.addEventListener('click', replay);

  // Deliberate pull at the top of the page. Normal scrolling is never captured:
  // listeners are passive and only gestures that *start* while the page has
  // been resting at the top count — momentum from scrolling back up does not.
  let topSince = scrollY <= 0 ? now() : Infinity;
  addEventListener('scroll', () => {
    if (scrollY <= 0) { if (topSince === Infinity) topSince = now(); }
    else topSince = Infinity;
  }, { passive: true });

  const canArm = () => state.phase === 'settled' && scrollY <= 0
    && now() - topSince > TOP_DWELL && now() - state.endedAt > COOLDOWN;

  function showPull(p) {
    if (p > 0.06) {
      hero.classList.add('is-pulling');
      pull.style.transform = `scaleX(${Math.min(p, 1)})`;
    } else {
      hero.classList.remove('is-pulling');
      pull.style.transform = '';
    }
  }

  let touch = null;
  addEventListener('touchstart', (e) => {
    touch = e.touches.length === 1 && canArm()
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY, dy: 0 }
      : null;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (!touch) return;
    const dx = e.touches[0].clientX - touch.x;
    touch.dy = e.touches[0].clientY - touch.y;
    if (touch.dy < -10 || Math.abs(dx) > Math.abs(touch.dy) + 12 || scrollY > 0) {
      touch = null; showPull(0); return;
    }
    showPull(touch.dy / PULL_TOUCH);
  }, { passive: true });
  const endTouch = () => {
    if (touch && touch.dy >= PULL_TOUCH) replay();
    touch = null;
    showPull(0);
  };
  addEventListener('touchend', endTouch, { passive: true });
  addEventListener('touchcancel', () => { touch = null; showPull(0); }, { passive: true });

  let wheel = { acc: 0, last: 0, armed: false, idle: 0 };
  addEventListener('wheel', (e) => {
    const t = now();
    if (t - wheel.last > 240) wheel = { acc: 0, last: t, armed: canArm(), idle: 0 };
    wheel.last = t;
    clearTimeout(wheel.idle);
    if (!wheel.armed) return;
    if (e.deltaY > 0) { wheel.armed = false; showPull(0); return; }
    wheel.acc -= e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    if (wheel.acc >= PULL_WHEEL) {
      wheel.armed = false;
      showPull(0);
      replay();
      return;
    }
    showPull(wheel.acc / PULL_WHEEL);
    wheel.idle = setTimeout(() => showPull(0), 260);
  }, { passive: true });

  // ───────── first-scroll gate ─────────
  //
  // On the first visit the page is held at the top: the first scroll gesture
  // plays the montage instead of moving the page, and only once it has ended
  // (or been skipped) does scrolling take the visitor on. Non-passive listeners
  // exist only while the gate is closed, plus a short drain afterwards so the
  // tail of a gesture already in flight does not carry the page down by itself.

  const GATE_SWIPE = 24; // px of upward finger travel that counts as a scroll
  const GATE_SAFETY = 15000; // ms: the gate always opens, whatever happens
  const DRAIN_IDLE = 280; // ms without wheel events before scrolling is handed back
  const gate = { closed: false, triggered: false, queued: false, draining: false, touchY: null, touching: false, idle: 0 };
  const root = document.documentElement;
  const nonPassive = { passive: false };
  const forwardKeys = new Set(['ArrowDown', 'PageDown', 'End', ' ', 'Spacebar']);

  function closeGate() {
    gate.closed = true;
    root.classList.add('is-gated');
    addEventListener('wheel', onGateWheel, nonPassive);
    addEventListener('touchstart', onGateTouchStart, { passive: true });
    addEventListener('touchmove', onGateTouchMove, nonPassive);
    addEventListener('touchend', onGateTouchEnd, { passive: true });
    addEventListener('touchcancel', onGateTouchEnd, { passive: true });
    addEventListener('keydown', onGateKey);
  }

  function openGate() {
    if (!gate.closed) return;
    gate.closed = false;
    gate.draining = true;
    root.classList.remove('is-gated');
    drainLater();
  }

  function removeGate() {
    gate.draining = false;
    clearTimeout(gate.idle);
    removeEventListener('wheel', onGateWheel, nonPassive);
    removeEventListener('touchstart', onGateTouchStart);
    removeEventListener('touchmove', onGateTouchMove, nonPassive);
    removeEventListener('touchend', onGateTouchEnd);
    removeEventListener('touchcancel', onGateTouchEnd);
    removeEventListener('keydown', onGateKey);
  }

  function drainLater() {
    clearTimeout(gate.idle);
    gate.idle = setTimeout(() => { if (!gate.touching) removeGate(); }, DRAIN_IDLE);
  }

  function startFilm() {
    if (gate.triggered) return;
    gate.triggered = true;
    setTimeout(openGate, GATE_SAFETY);
    if (state.phase === 'loading') { gate.queued = true; return; }
    if (state.phase === 'montage') return;
    press = null;
    // From the opening or the still frame alike: hand over without a jump.
    freeze(() => { setColour(false); setPhase('montage'); });
    montage(state.run).catch(() => {});
  }

  function onGateWheel(e) {
    e.preventDefault();
    if (gate.closed) { if (e.deltaY > 2) startFilm(); return; }
    drainLater(); // still the same gesture: keep swallowing until it pauses
  }
  function onGateTouchStart(e) {
    gate.touching = true;
    gate.touchY = e.touches[0] ? e.touches[0].clientY : null;
  }
  function onGateTouchMove(e) {
    if (e.touches.length > 1) return; // never block pinch-zoom
    e.preventDefault();
    if (gate.closed && gate.touchY != null && e.touches[0]
      && gate.touchY - e.touches[0].clientY > GATE_SWIPE) startFilm();
  }
  function onGateTouchEnd() {
    gate.touching = false;
    gate.touchY = null;
    if (gate.draining) drainLater();
  }
  function onGateKey(e) {
    if (!gate.closed || !forwardKeys.has(e.key)) return;
    if (e.target.closest && e.target.closest('button, a, input, textarea, select')) return;
    e.preventDefault();
    startFilm();
  }

  // "Convite" is an explicit request to read the invitation: it always goes there.
  hero.querySelector('.cue').addEventListener('click', () => {
    if (state.phase === 'intro' || state.phase === 'montage') settle();
    openGate();
    removeGate();
  });

  // Leaving the hero, hiding the tab or switching to reduced motion mid-run
  // resolves the sequence instead of letting it play unseen.
  const heroIo = new IntersectionObserver(([entry]) => {
    motion.visible = entry.intersectionRatio >= 0.35;
    kickMotion();
    if (!motion.visible && state.phase !== 'loading') settle();
  }, { threshold: [0.35] });
  heroIo.observe(hero);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    releaseColour();
    if (state.phase !== 'loading') settle();
  });
  reduceMq.addEventListener?.('change', settle);

  // ───────── motion (gyroscope depth, mobile only, opt-in) ─────────
  //
  // Offered through a discreet button; iOS shows its permission prompt only
  // when it is tapped. Sensor events just set a target; one rAF loop eases
  // towards it and stops itself once the picture is still.

  const TILT = 2.6; // max rotation, degrees
  const SHIFT = 7; // max photo translation, px
  const DRIFT = 8; // max title translation, px
  const ZOOM = 1.09; // cover the edges the tilt would reveal
  const RANGE = 18; // degrees of device tilt for full effect

  const clamp = (v) => Math.max(-1, Math.min(1, v));

  if ('DeviceOrientationEvent' in window && window.isSecureContext && coarseMq.matches && !reduceMq.matches) {
    motionBtn.hidden = false;
  }

  motionBtn.addEventListener('click', async () => {
    motionBtn.hidden = true;
    const ask = window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission;
    try {
      // Must be called synchronously inside the tap (iOS 13+).
      if (typeof ask === 'function' && (await ask.call(DeviceOrientationEvent)) !== 'granted') return;
    } catch (_) {
      return;
    }
    addEventListener('deviceorientation', onOrientation, { passive: true });
    // No sensor readings after a moment (e.g. a device without a gyroscope): give up quietly.
    setTimeout(() => {
      if (!motion.base) removeEventListener('deviceorientation', onOrientation);
    }, 1500);
  });

  function onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    if (!motion.base) {
      motion.base = { b: e.beta, g: e.gamma };
      motion.on = true;
    }
    // The neutral pose slowly follows how the phone is being held.
    motion.base.b += (e.beta - motion.base.b) * 0.006;
    motion.base.g += (e.gamma - motion.base.g) * 0.006;
    motion.tx = clamp((e.gamma - motion.base.g) / RANGE);
    motion.ty = clamp((e.beta - motion.base.b) / RANGE);
    kickMotion();
  }

  function kickMotion() {
    if (motion.on && !motion.raf) motion.raf = requestAnimationFrame(stepMotion);
  }

  function stepMotion() {
    motion.raf = 0;
    const live = motion.visible && !framedMq.matches && !reduceMq.matches;
    const follow = live && state.phase === 'settled';
    const tx = follow ? motion.tx : 0;
    const ty = follow ? motion.ty : 0;
    const ts = live ? ZOOM : 1;

    motion.x += (tx - motion.x) * 0.075;
    motion.y += (ty - motion.y) * 0.075;
    motion.s += (ts - motion.s) * 0.06;

    // Tilt never outpaces the zoom that hides the photo's edges.
    const p = Math.max(0, Math.min(1, (motion.s - 1) / (ZOOM - 1)));
    const x = motion.x * p;
    const y = motion.y * p;
    const s = motion.s;
    depth.style.transform = `perspective(1100px) translate3d(${(-x * SHIFT).toFixed(2)}px, ${(-y * SHIFT).toFixed(2)}px, 0) `
      + `rotateX(${(y * TILT).toFixed(3)}deg) rotateY(${(-x * TILT).toFixed(3)}deg) scale(${s.toFixed(4)})`;
    titles.style.transform = `translate3d(${(x * DRIFT).toFixed(2)}px, ${(y * DRIFT * 0.75).toFixed(2)}px, 0)`;

    const moving = Math.abs(tx - motion.x) + Math.abs(ty - motion.y) + Math.abs(ts - motion.s) > 0.0008;
    if (moving) kickMotion();
  }

  // ───────── reveal on scroll ─────────

  const reveals = [...document.querySelectorAll('[data-reveal]')];
  let pending = reveals.length;
  const revealIo = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-in');
      revealIo.unobserve(entry.target);
      if (--pending === 0) revealIo.disconnect();
    }
  }, { rootMargin: '0px 0px -12% 0px' });
  reveals.forEach((el) => revealIo.observe(el));

  // ───────── start ─────────

  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  const timeout = (ms) => new Promise((r) => setTimeout(r, ms));

  Promise.all([
    decoded(colourShot),
    decoded(monoShot),
    Promise.race([fontsReady, timeout(1500)]),
  ]).then(() => {
    if (state.phase !== 'loading') return;
    // A visitor who already scrolled away skips the film entirely.
    if (scrollY > innerHeight * 0.5 || document.hidden) { setPhase('intro'); setColour(false); settle(); return; }
    loadCuts();
    intro().catch(() => {});
    if (gate.queued) { gate.triggered = false; startFilm(); } // scrolled while loading
  });

  // Hold the page only on a fresh arrival at the top, never for reduced motion.
  if (scrollY <= 0 && !location.hash && !reduceMq.matches) closeGate();

  // Never stay on a black screen if the photograph is slow or fails.
  setTimeout(() => {
    if (state.phase === 'loading') { setPhase('intro'); setColour(false); settle(); }
  }, 8000);
})();
