// Raquel & Flávio — opening sequence.
//
// Phases (hero[data-phase]):
//   loading  → waiting for the main photograph (and fonts, briefly)
//   intro    → colour photograph, slow push-in, desaturation, titles
//   settled  → the cover: black & white, hold for colour, "Ver o filme" / "Rever"
//   film     → the save-the-date film plays over the cover, then dissolves back:
//              the short cut the first time, the full film on "Rever"
//
// hero[data-reel] carries the film's own transition: wait (asked to play, the
// cover still showing) → on (picture up) → off (dissolving back to the cover).
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
      hero.querySelector('.replay').hidden = true;
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
  const reel = hero.querySelector('.reel');
  const skipBtn = hero.querySelector('.skip');
  const soundBtn = hero.querySelector('.sound');
  const depth = hero.querySelector('.depth');
  const motionBtn = hero.querySelector('.motion');

  const reduceMq = matchMedia('(prefers-reduced-motion: reduce)');
  const framedMq = matchMedia('(min-aspect-ratio: 4/5)');
  const coarseMq = matchMedia('(hover: none) and (pointer: coarse)');

  const PULL_TOUCH = 130; // px of downward drag at the very top
  const PULL_WHEEL = 340; // accumulated upward wheel delta at the very top
  const TOP_DWELL = 450; // ms the page must already rest at the top
  const COOLDOWN = 1200; // ms after a run before a replay can be triggered

  const REEL_LEAD = 1.1; // s before the end the film dissolves into the cover (its music has faded by then)
  const REEL_STALL = 12000; // ms: a film that never starts gives way to the cover
  const REEL_OUT = 1700; // ms the dissolve back to the cover takes (matches the CSS)

  const state = {
    phase: 'loading',
    coloured: false,
    interacted: false,
    run: 0,
    endedAt: 0,
    plays: 0, // the first play is the short cut, every replay the full film
    watched: false,
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
    const wasFilm = state.phase === 'film';
    freeze(() => setPhase('settled'));
    state.endedAt = now();
    if (wasFilm) {
      stopReel();
      state.watched = true;
      hero.dataset.watched = 'yes';
      // The film has been seen (or skipped): scrolling may now take the visitor on.
      openGate();
    }
    if (state.watched && !state.interacted) hero.dataset.hint = 'show';
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
    // The film itself waits for the visitor's first scroll or tap (see the gate below).
    await Promise.all([desaturate.finished, dated.finished, ...running.map((a) => a.finished)]);
    if (run === state.run) settle();
  }

  // ───────── film ─────────
  //
  // play() is called synchronously inside the gesture that asked for the film,
  // the only way a browser lets it start with sound. If sound is refused anyway
  // (a mouse wheel is not a gesture that counts), it plays muted and the sound
  // button is offered instead.

  const canFade = (() => {
    // iOS keeps volume read-only at 1: there, sound can only be cut, not faded.
    try { reel.volume = 0.5; const ok = reel.volume === 0.5; reel.volume = 1; return ok; } catch (_) { return false; }
  })();
  let fadeRaf = 0;
  let reelToken = 0; // invalidates a pending pause when the film is asked for again
  let selfPause = false;

  function pauseReel() {
    selfPause = true;
    reel.pause();
    selfPause = false;
  }

  function fadeVolume(to, ms) {
    cancelAnimationFrame(fadeRaf);
    if (!canFade) return;
    const from = reel.volume;
    const t0 = now();
    const step = () => {
      const p = Math.min(1, (now() - t0) / ms);
      reel.volume = from + (to - from) * p;
      if (p < 1) fadeRaf = requestAnimationFrame(step);
    };
    fadeRaf = requestAnimationFrame(step);
  }

  function setSound(on) {
    reel.muted = !on;
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.setAttribute('aria-label', on ? 'Desligar o som' : 'Ligar o som');
  }

  // Sound is on by default. When the browser refuses it (no gesture yet: a mouse
  // wheel, or a swipe on some phones) the film carries on muted, and the very
  // first tap, click or key anywhere — the first gesture the browser accepts —
  // turns it on, without having to find the icon.
  let refused = false;
  let unmutedAt = -Infinity;

  function soundRefused() {
    setSound(false);
    refused = true;
    nudge(soundBtn);
  }

  function claimSound(e) {
    if (!refused || state.phase !== 'film') return;
    // The icon, "Saltar" and "Convite" do their own thing.
    if (e.target.closest && e.target.closest('.sound, .skip, .cue')) return;
    refused = false;
    unmutedAt = now();
    setSound(true);
    if (canFade) reel.volume = 1;
  }
  // pointerup, not pointerdown: on touch screens only the lift counts as a gesture.
  addEventListener('pointerup', claimSound, true);
  addEventListener('keydown', claimSound, true);

  function nudge(el) {
    el.classList.remove('is-nudged');
    el.offsetWidth; // restart the animation
    el.classList.add('is-nudged');
  }

  function playFilm() {
    const src = state.plays === 0 ? reel.dataset.short : reel.dataset.long;
    press = null;
    freeze(() => { setColour(false); setPhase('film'); });
    const run = state.run;
    const token = ++reelToken;
    state.plays++;
    hero.dataset.reel = 'wait';

    reel.preload = 'auto';
    cancelAnimationFrame(fadeRaf); // a fade-out from the last run may still be going
    // Still running from the last dissolve: stop it, so "playing" fires again on restart.
    if (!reel.paused) pauseReel();
    if (reel.getAttribute('src') !== src) reel.src = src;
    try { reel.currentTime = 0; } catch (_) { /* no metadata yet: it starts at 0 anyway */ }
    // The sound eases in only after a real gesture. Without one (a mouse wheel), it
    // asks at full volume so the browser decides at once: Chrome lets a silent
    // video start and then pauses it the moment it becomes audible.
    const activated = !navigator.userActivation || navigator.userActivation.isActive;
    if (canFade) reel.volume = activated ? 0 : 1;
    refused = false;
    setSound(true);

    const started = reel.play();
    if (started && started.catch) {
      started.catch((err) => {
        if (token !== reelToken || state.phase !== 'film') return;
        if (err && err.name === 'NotAllowedError' && !reel.muted) {
          soundRefused();
          reel.play().catch(() => { if (token === reelToken) settle(); });
        } else if (!err || err.name !== 'AbortError') {
          settle();
        }
      });
    }

    // Slow network or a film that cannot play: the cover takes over again.
    wait(REEL_STALL, run).then(() => { if (hero.dataset.reel === 'wait') settle(); }).catch(() => {});
  }

  function stopReel() {
    hero.dataset.reel = 'off';
    const token = reelToken;
    if (canFade) fadeVolume(0, REEL_OUT * 0.8);
    else if (reel.currentTime < reel.duration - REEL_LEAD - 0.2) reel.muted = true; // skipped: cut the sound
    setTimeout(() => {
      if (token !== reelToken) return;
      pauseReel();
      // Get the full film ready for "Rever" without downloading all of it yet.
      if (reel.getAttribute('src') !== reel.dataset.long) {
        reel.preload = 'metadata';
        reel.src = reel.dataset.long;
      }
    }, REEL_OUT);
  }

  // The picture comes up only once frames are really moving, so a slow start
  // just holds the cover a little longer instead of showing a black frame.
  reel.addEventListener('playing', () => {
    if (state.phase !== 'film' || hero.dataset.reel !== 'wait') return;
    hero.dataset.reel = 'on';
    if (!reel.muted && reel.volume < 1) fadeVolume(1, 700);
    watchEnd(reelToken);
  });

  // A browser that stops the film for having sound without permission: carry on muted.
  reel.addEventListener('pause', () => {
    if (selfPause || reel.ended || document.hidden || state.phase !== 'film' || reel.muted) return;
    const token = reelToken;
    soundRefused();
    reel.play().catch(() => { if (token === reelToken) settle(); });
  });

  // Dissolve slightly before the last frame: the film closes on "28.08.2027"
  // over black, which melts into the cover and its own date.
  function watchEnd(token) {
    if (token !== reelToken || state.phase !== 'film') return;
    if (reel.duration && reel.currentTime >= reel.duration - REEL_LEAD) { settle(); return; }
    requestAnimationFrame(() => watchEnd(token));
  }
  reel.addEventListener('ended', () => { if (state.phase === 'film') settle(); });
  reel.addEventListener('error', () => { if (state.phase === 'film') settle(); });

  soundBtn.addEventListener('click', () => {
    refused = false; // a choice made with the icon is final for this film
    const on = reel.muted;
    setSound(on);
    if (on && canFade) reel.volume = 1;
  });
  skipBtn.addEventListener('click', () => { if (state.phase === 'film') settle(); });

  // ───────── interaction ─────────

  function replay() {
    if (state.phase !== 'settled' || now() - state.endedAt < COOLDOWN) return;
    gate.triggered = true; // asked for directly: the first scroll no longer needs to
    playFilm();
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

  // A tap during the opening skips to the cover. During the film it only points
  // at the controls: a stray tap must not cut it short.
  hit.addEventListener('click', () => {
    if (state.phase === 'intro') settle();
    else if (state.phase === 'film' && now() - unmutedAt > 600) nudge(skipBtn); // that tap was for the sound
  });

  replayBtn.addEventListener('click', () => {
    if (state.phase === 'intro') settle();
    if (state.phase === 'settled') { state.endedAt = 0; replay(); }
  });

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
  // plays the film instead of moving the page, and only once it has ended
  // (or been skipped) does scrolling take the visitor on. Non-passive listeners
  // exist only while the gate is closed, plus a short drain afterwards so the
  // tail of a gesture already in flight does not carry the page down by itself.

  const GATE_SWIPE = 24; // px of upward finger travel that counts as a scroll
  const DRAIN_IDLE = 280; // ms without wheel events before scrolling is handed back
  const gate = { closed: false, triggered: false, queued: false, draining: false, touchY: null, touching: false, swiped: false, idle: 0, nudged: 0 };
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
    if (state.phase === 'loading') { gate.queued = true; return; }
    if (state.phase === 'film') return;
    // From the opening or the cover alike: hand over without a jump.
    playFilm();
  }

  // Scrolling while the film plays does nothing but point at "Saltar".
  function nudgeSkip() {
    if (state.phase !== 'film' || now() - gate.nudged < 1200 || now() - unmutedAt < 600) return;
    gate.nudged = now();
    nudge(skipBtn);
  }

  function onGateWheel(e) {
    e.preventDefault();
    if (gate.closed) {
      if (e.deltaY > 2) { if (gate.triggered) nudgeSkip(); else startFilm(); }
      return;
    }
    drainLater(); // still the same gesture: keep swallowing until it pauses
  }
  function onGateTouchStart(e) {
    gate.touching = true;
    gate.swiped = false;
    gate.touchY = e.touches[0] ? e.touches[0].clientY : null;
  }
  function onGateTouchMove(e) {
    if (e.touches.length > 1) return; // never block pinch-zoom
    e.preventDefault();
    if (gate.closed && gate.touchY != null && e.touches[0]
      && gate.touchY - e.touches[0].clientY > GATE_SWIPE) gate.swiped = true;
  }
  // The film starts as the finger lifts: touchend is a gesture that allows sound.
  function onGateTouchEnd() {
    gate.touching = false;
    gate.touchY = null;
    if (gate.closed && gate.swiped) { if (gate.triggered) nudgeSkip(); else startFilm(); }
    gate.swiped = false;
    if (gate.draining) drainLater();
  }
  function onGateKey(e) {
    if (!gate.closed || !forwardKeys.has(e.key)) return;
    if (e.target.closest && e.target.closest('button, a, input, textarea, select')) return;
    e.preventDefault();
    if (gate.triggered) nudgeSkip(); else startFilm();
  }

  // "Convite" is an explicit request to read the invitation: it always goes there.
  hero.querySelector('.cue').addEventListener('click', () => {
    if (state.phase === 'intro' || state.phase === 'film') settle();
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

  // The film pauses with the tab and carries on when the visitor is back.
  let pausedHidden = false;
  document.addEventListener('visibilitychange', () => {
    if (state.phase === 'film') {
      if (document.hidden) {
        pausedHidden = !reel.paused;
        pauseReel();
      } else if (pausedHidden) {
        pausedHidden = false;
        reel.play().catch(() => { soundRefused(); reel.play().catch(() => settle()); });
      }
      return;
    }
    if (!document.hidden) return;
    releaseColour();
    if (state.phase !== 'loading') settle();
  });
  reduceMq.addEventListener?.('change', () => { if (state.phase !== 'film') settle(); });

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
    const ts = live && state.phase !== 'film' ? ZOOM : 1; // the film is never cropped further

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
    // Start buffering the film while the opening plays, unless data is being saved.
    if (!(navigator.connection && navigator.connection.saveData)) reel.preload = 'auto';
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
