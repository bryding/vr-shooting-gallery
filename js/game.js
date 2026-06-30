/* ===========================================================================
   VR BEACH SHOOTING GALLERY  —  the game code.

   The idea:
     • You stand on a wooden platform in a beach cabana. Waves and birds play.
     • A gun rests on a stand. Squeeze the GRIP button to grab it.
     • Birds fly past carrying colorful targets. Pull the TRIGGER to shoot them.
     • Out of bullets? Pull the JOYSTICK BACK to reload. (All on the right hand.)

   This file is in parts:
     1. CONFIG   — the fun numbers to change.
     2. HELPERS  — tiny tools (random numbers).
     3. SOUND    — all the sounds, made by the browser itself (no sound files!).
     4. PIECES   — small building blocks: the gun shape, a bird, a target.
     5. GAME     — the boss component that ties grabbing, shooting, score & ammo.
   =========================================================================== */


/* ---- 1. CONFIG: change these to tweak the game! -------------------------- */
const CONFIG = {
  ammoMax: 6,             // bullets per magazine before you must reload
  pointsPerHit: 10,       // points for each target you break

  maxBirds: 5,            // how many birds can be flying at once
  birdSpawnMs: 1600,      // a new bird tries to appear this often (milliseconds)
  birdSpeedMin: 1.2,      // how slow/fast birds fly (meters per second)
  birdSpeedMax: 2.6,

  // The strip of sky the birds fly across (meters): x = left/right edge they
  // enter/exit, y = how high, z = how far in front (negative = forward).
  sky: { edge: 11, yMin: 1.8, yMax: 4.2, zMin: -11, zMax: -5 },

  targetColors: ['#ff4136', '#ffdc00', '#2ecc40', '#0074d9', '#b10dc9', '#ff851b', '#ff69b4'],
  targetRadius: 0.28,     // size of the target a bird carries
};


/* ---- 2. HELPERS ---------------------------------------------------------- */
function rand(a, b) { return a + Math.random() * (b - a); }
function pick(list) { return list[Math.floor(Math.random() * list.length)]; }


/* ---- 3. SOUND: every sound is built live in the browser (Web Audio API) --- */
const Sound = {
  ctx: null,
  started: false,

  // Browsers block sound until you tap/click once. Call this on the first tap.
  unlock() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.started) { this.started = true; this.startAmbience(); this.scheduleChirp(); }
  },

  // a buffer full of static (white noise) or soft rumble (brown noise)
  noise(seconds, brown) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.5; }
      else data[i] = white;
    }
    return buf;
  },

  // BANG! A short crack of noise plus a low thump.
  gunshot() {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise(0.25, false);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    src.connect(lp); lp.connect(g); g.connect(ctx.destination); src.start(t); src.stop(t + 0.25);

    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.7, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g2); g2.connect(ctx.destination); o.start(t); o.stop(t + 0.2);
  },

  // a single mechanical "clack"
  clack(delay, volume) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = this.noise(0.05, false);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hp); hp.connect(g); g.connect(ctx.destination); src.start(t); src.stop(t + 0.06);
  },

  reload() { this.clack(0, 0.4); this.clack(0.14, 0.3); this.clack(0.30, 0.45); }, // cha-chunk-clack
  empty()  { this.clack(0, 0.25); },                                              // dry click

  // a bright "ding" when a target breaks
  hit() {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    [1318, 1760].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.02);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.02 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g); g.connect(ctx.destination); o.start(t + i * 0.02); o.stop(t + 0.32);
    });
  },

  // endless soft OCEAN WAVES: rumble that slowly swells up and down
  startAmbience() {
    const ctx = this.ctx; if (!ctx) return;
    const src = ctx.createBufferSource(); src.buffer = this.noise(3, true); src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 450;
    const g = ctx.createGain(); g.gain.value = 0.06;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.15;        // one swell every ~7s
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(ctx.destination);
    src.start(); lfo.start();
  },

  // BIRDS chirping now and then
  chirp() {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    const tweets = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < tweets; i++) {
      const start = t + i * 0.12;
      const o = ctx.createOscillator(); o.type = 'sine';
      const base = rand(1800, 2600);
      o.frequency.setValueAtTime(base, start);
      o.frequency.exponentialRampToValueAtTime(base * 1.3, start + 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.05, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.09);
      o.connect(g); g.connect(ctx.destination); o.start(start); o.stop(start + 0.1);
    }
  },
  scheduleChirp() {
    setTimeout(() => { this.chirp(); this.scheduleChirp(); }, rand(2500, 6000));
  },
};


/* ---- 4a. GUN-MODEL: builds a simple gun out of boxes ---------------------- */
// We use this twice: one gun resting on the stand, one gun in your hand.
AFRAME.registerComponent('gun-model', {
  init: function () {
    const make = (geo, attrs) => {
      const e = document.createElement(geo);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      this.el.appendChild(e);
      return e;
    };
    // body, barrel, handle, sight — the gun "points" forward (toward -z).
    make('a-box', { color: '#2b2f33', width: 0.06, height: 0.09, depth: 0.2, position: '0 0 -0.02' });
    make('a-box', { color: '#1a1d20', width: 0.035, height: 0.04, depth: 0.26, position: '0 0.02 -0.18' });
    make('a-box', { color: '#5a3b22', width: 0.05, height: 0.13, depth: 0.06, position: '0 -0.1 0.04', rotation: '20 0 0' });
    make('a-box', { color: '#11ff88', width: 0.012, height: 0.02, depth: 0.012, position: '0 0.07 -0.05' });
  },
});


/* ---- 4b. TARGET: the colorful disc a bird is carrying --------------------- */
AFRAME.registerComponent('target', {
  init: function () {
    this.broken = false;
    this.el.classList.add('target');               // tag it so the laser can hit it
    this.el.setAttribute('color', pick(CONFIG.targetColors));
    // mouse-click also breaks it (handy for testing on the computer)
    this.el.addEventListener('click', () => this.hit());
  },
  hit: function () {
    if (this.broken) return;                        // only count it once
    this.broken = true;
    this.el.emit('target-hit', {}, true);           // tells the bird AND the game (bubbles up)
    this.el.setAttribute('animation__pop', {
      property: 'scale', to: '0.01 0.01 0.01', dur: 120, easing: 'easeInQuad',
    });
    setTimeout(() => { if (this.el.parentNode) this.el.setAttribute('visible', false); }, 130);
  },
});


/* ---- 4c. BIRD: flies across the sky holding a target --------------------- */
AFRAME.registerComponent('bird', {
  schema: { dir: { default: 1 }, speed: { default: 2 } },
  init: function () {
    const make = (geo, attrs, parent) => {
      const e = document.createElement(geo);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      (parent || this.el).appendChild(e);
      return e;
    };
    // body + head + beak
    make('a-sphere', { color: '#5b6770', radius: 0.16, scale: '1.6 1 1' });
    make('a-sphere', { color: '#5b6770', radius: 0.1, position: (this.data.dir > 0 ? 0.22 : -0.22) + ' 0.05 0' });
    make('a-cone',   { color: '#f5a623', radius: 0.04, height: 0.12,
                       position: (this.data.dir > 0 ? 0.34 : -0.34) + ' 0.05 0',
                       rotation: '0 0 ' + (this.data.dir > 0 ? -90 : 90) });
    // two wings that flap
    this.wingL = make('a-box', { color: '#7a8893', width: 0.32, height: 0.02, depth: 0.18, position: '0 0.05 0.16' });
    this.wingR = make('a-box', { color: '#7a8893', width: 0.32, height: 0.02, depth: 0.18, position: '0 0.05 -0.16' });
    // string + the target it carries (the part YOU shoot)
    make('a-cylinder', { color: '#cccccc', radius: 0.004, height: 0.5, position: '0 -0.28 0' });
    this.target = make('a-sphere', { radius: CONFIG.targetRadius, position: '0 -0.62 0', target: '' });

    // start just off one edge of the sky
    const s = CONFIG.sky;
    this.el.setAttribute('position', {
      x: this.data.dir > 0 ? -s.edge : s.edge,
      y: rand(s.yMin, s.yMax),
      z: rand(s.zMin, s.zMax),
    });
    this.phase = Math.random() * Math.PI * 2;
    this.gone = false;
    // when its target is shot, fly off quicker
    this.el.addEventListener('target-hit', () => { this.data.speed *= 2.2; });
  },
  tick: function (time, dt) {
    if (this.gone) return;
    const step = this.data.dir * this.data.speed * (dt / 1000);
    const p = this.el.object3D.position;
    p.x += step;
    // flap the wings up and down
    this.phase += dt / 90;
    const flap = Math.sin(this.phase) * 50;
    if (this.wingL && this.wingL.object3D) this.wingL.object3D.rotation.x =  flap * Math.PI / 180;
    if (this.wingR && this.wingR.object3D) this.wingR.object3D.rotation.x = -flap * Math.PI / 180;
    // flew off the far edge? remove this bird.
    if (p.x > CONFIG.sky.edge + 2 || p.x < -CONFIG.sky.edge - 2) {
      this.gone = true;
      if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
    }
  },
});


/* ---- 5. SHOOTING-RANGE: the boss component (grab, shoot, reload, score) --- */
AFRAME.registerComponent('shooting-range', {
  init: function () {
    this.held = false;
    this.ammo = CONFIG.ammoMax;
    this.score = 0;
    this.birds = 0;
    this.spawnClock = 0;

    this.scoreText = document.querySelector('#scoreText');
    this.ammoText  = document.querySelector('#ammoText');
    this.hintText  = document.querySelector('#hintText');
    this.gun       = document.querySelector('#gun');         // the right controller
    this.gunOnStand = document.querySelector('#gunOnStand');
    this.gunInHand  = document.querySelector('#gunInHand');
    this.muzzle     = document.querySelector('#muzzle');

    this.updateAmmo();

    // --- right-controller buttons ---
    if (this.gun) {
      this.gun.addEventListener('gripdown', () => { Sound.unlock(); this.grab(); });
      this.gun.addEventListener('triggerdown', () => { Sound.unlock(); this.fire(); });
      this.gun.addEventListener('thumbstickmoved', (e) => {
        if (e.detail && e.detail.y > 0.7) this.reload();   // pull the stick BACK = reload
      });
    }

    // count a point whenever a target breaks (from shooting OR a mouse click)
    this.el.addEventListener('target-hit', () => {
      Sound.hit();
      this.score += CONFIG.pointsPerHit;
      if (this.scoreText) this.scoreText.setAttribute('value', 'Score: ' + this.score);
    });

    // start sounds on the very first tap/click anywhere (browsers need a tap)
    window.addEventListener('click', () => Sound.unlock(), { once: true });
    this.el.addEventListener('enter-vr', () => Sound.unlock());
  },

  // Squeeze GRIP: the stand gun vanishes, the hand gun appears. You're armed!
  grab: function () {
    if (this.held) return;
    this.held = true;
    if (this.gunOnStand) this.gunOnStand.setAttribute('visible', false);
    if (this.gunInHand)  this.gunInHand.setAttribute('visible', true);
    if (this.hintText) this.hintText.setAttribute('value', 'TRIGGER = shoot   •   pull the STICK BACK = reload');
    Sound.clack(0, 0.3);
  },

  // Pull TRIGGER: shoot (if you grabbed the gun and have bullets).
  fire: function () {
    if (!this.held) return;                     // grab the gun first!
    if (this.ammo <= 0) { Sound.empty(); return; }
    this.ammo--; this.updateAmmo();
    Sound.gunshot();
    this.flash();
    this.recoil();
    // what is the laser pointing at right now?
    const ray = this.gun && this.gun.components.raycaster;
    if (!ray) return;
    const hitEl = ray.intersectedEls.find((el) => el.classList.contains('target'));
    if (hitEl && hitEl.components.target) hitEl.components.target.hit();
  },

  // Pull the STICK BACK: refill the magazine.
  reload: function () {
    if (!this.held || this.ammo === CONFIG.ammoMax) return;
    Sound.reload();
    this.ammo = CONFIG.ammoMax; this.updateAmmo();
    if (this.gunInHand) {
      this.gunInHand.setAttribute('animation__reload',
        { property: 'rotation', from: '0 0 0', to: '-35 0 0', dur: 140, dir: 'alternate', loop: 2 });
    }
  },

  updateAmmo: function () {
    if (!this.ammoText) return;
    this.ammoText.setAttribute('value', 'Ammo: ' + this.ammo + ' / ' + CONFIG.ammoMax +
      (this.ammo === 0 ? '   (pull stick back!)' : ''));
  },

  // a quick muzzle-flash blip at the barrel tip
  flash: function () {
    if (!this.muzzle) return;
    this.muzzle.setAttribute('visible', true);
    setTimeout(() => this.muzzle.setAttribute('visible', false), 60);
  },
  // the gun kicks up a little
  recoil: function () {
    if (!this.gunInHand) return;
    this.gunInHand.setAttribute('animation__recoil',
      { property: 'rotation', from: '0 0 0', to: '-14 0 0', dur: 55, dir: 'alternate', loop: 2 });
  },

  // keep the sky stocked with birds
  tick: function (time, dt) {
    this.spawnClock += dt;
    if (this.spawnClock >= CONFIG.birdSpawnMs) {
      this.spawnClock = 0;
      this.spawnBird();
    }
  },
  spawnBird: function () {
    if (this.birds >= CONFIG.maxBirds) {
      // recount living birds (some flew away)
      this.birds = document.querySelectorAll('[bird]').length;
      if (this.birds >= CONFIG.maxBirds) return;
    }
    const bird = document.createElement('a-entity');
    bird.setAttribute('bird', {
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: rand(CONFIG.birdSpeedMin, CONFIG.birdSpeedMax),
    });
    bird.addEventListener('loaded', () => { this.birds++; });
    this.el.appendChild(bird);
  },
});
