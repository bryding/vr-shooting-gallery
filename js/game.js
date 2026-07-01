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
    const METAL = 'color: #3a4046; metalness: 0.85; roughness: 0.35';
    const DARK  = 'color: #23272b; metalness: 0.8; roughness: 0.4';
    const GRIP  = 'color: #1c1f22; metalness: 0.1; roughness: 0.95';
    // The gun "points" forward (toward -z). Built from several shaped parts.
    make('a-box',      { width: 0.07, height: 0.085, depth: 0.24, position: '0 0 -0.02', material: METAL }); // receiver
    make('a-box',      { width: 0.06, height: 0.045, depth: 0.27, position: '0 0.06 -0.04', material: DARK }); // slide
    make('a-cylinder', { radius: 0.02, height: 0.18, position: '0 0.025 -0.22', rotation: '90 0 0', material: DARK }); // barrel
    make('a-cylinder', { radius: 0.026, height: 0.02, position: '0 0.025 -0.31', rotation: '90 0 0', material: 'color: #15181a; metalness: 0.9; roughness: 0.3' }); // muzzle
    make('a-box',      { width: 0.055, height: 0.13, depth: 0.07, position: '0 -0.1 0.05', rotation: '18 0 0', material: GRIP }); // grip
    make('a-box',      { width: 0.045, height: 0.11, depth: 0.05, position: '0 -0.095 -0.04', material: DARK }); // magazine
    make('a-torus',    { radius: 0.028, 'radius-tubular': 0.006, position: '0 -0.05 -0.02', rotation: '90 0 0', material: DARK }); // trigger guard
    make('a-box',      { width: 0.01, height: 0.025, depth: 0.01, position: '0 -0.05 -0.02', material: 'color: #888; metalness: 0.9; roughness: 0.3' }); // trigger
    make('a-box',      { width: 0.008, height: 0.012, depth: 0.008, position: '0 0.085 -0.16', material: DARK }); // front sight
    make('a-sphere',   { radius: 0.006, position: '0 0.088 0.07', material: 'color: #19ff7a; emissive: #19ff7a; emissiveIntensity: 1' }); // rear sight dot
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
    const FEATHER = 'color: #eef1f4; metalness: 0; roughness: 0.9';   // seagull white
    const fwd = this.data.dir > 0 ? 1 : -1;
    // body (egg-shaped) + head + tail + orange beak
    make('a-sphere', { radius: 0.15, scale: '1.7 0.95 0.95', material: FEATHER });
    make('a-sphere', { radius: 0.1, position: (fwd * 0.24) + ' 0.06 0', material: FEATHER });
    make('a-cone',   { radius: 0.09, height: 0.34, position: (-fwd * 0.3) + ' 0.04 0',
                       rotation: '0 0 ' + (fwd > 0 ? 90 : -90), scale: '1 1 0.4', material: 'color: #cfd6db; roughness: 0.9' });
    make('a-cone',   { radius: 0.035, height: 0.13, position: (fwd * 0.38) + ' 0.05 0',
                       rotation: '0 0 ' + (fwd > 0 ? -90 : 90), material: 'color: #f5a623; roughness: 0.6' });
    // two swept-back wings that flap
    this.wingL = make('a-cone', { radius: 0.1, height: 0.42, position: '0 0.06 0.2',
                                  rotation: '90 0 0', scale: '1 1 0.18', material: 'color: #d7dde2; roughness: 0.9' });
    this.wingR = make('a-cone', { radius: 0.1, height: 0.42, position: '0 0.06 -0.2',
                                  rotation: '-90 0 0', scale: '1 1 0.18', material: 'color: #d7dde2; roughness: 0.9' });
    // string + the target it carries (the part YOU shoot)
    make('a-cylinder', { color: '#bfae8a', radius: 0.004, height: 0.5, position: '0 -0.28 0' });
    this.target = make('a-sphere', { radius: CONFIG.targetRadius, position: '0 -0.62 0', target: '',
                                     material: 'metalness: 0.1; roughness: 0.5' });
    this.el.setAttribute('shadow', 'cast: true; receive: false');

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


/* ---- 6. EXTRA REALISM ---------------------------------------------------- */

// Draw a texture onto a canvas (no image files needed) so wood/thatch look real.
function drawTexture(ctx, type, size) {
  if (type === 'wood') {
    ctx.fillStyle = '#a9763f'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 5; i++) {                       // plank gaps
      const y = (i + 1) * size / 6;
      ctx.fillStyle = 'rgba(60,35,15,0.55)'; ctx.fillRect(0, y - 1, size, 2);
    }
    for (let i = 0; i < 900; i++) {                     // grain streaks
      ctx.strokeStyle = 'rgba(80,50,25,' + (0.05 + Math.random() * 0.15) + ')';
      ctx.lineWidth = Math.random() * 1.5;
      const y = Math.random() * size, len = 20 + Math.random() * 80, x = Math.random() * size;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y + (Math.random() - 0.5) * 4); ctx.stroke();
    }
  } else if (type === 'thatch') {
    ctx.fillStyle = '#c6a046'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1600; i++) {                    // straws
      ctx.strokeStyle = 'rgba(110,80,25,' + (0.1 + Math.random() * 0.3) + ')';
      ctx.lineWidth = 1 + Math.random();
      const x = Math.random() * size, y = Math.random() * size, len = 14 + Math.random() * 26;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (Math.random() - 0.5) * 6, y + len); ctx.stroke();
    }
  }
}

// "paint" component: builds a canvas texture and lays it on the entity's mesh.
AFRAME.registerComponent('paint', {
  schema: { type: { default: 'wood' }, repeat: { default: 1 } },
  init: function () {
    const size = 256;
    const c = document.createElement('canvas'); c.width = c.height = size;
    drawTexture(c.getContext('2d'), this.data.type, size);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(this.data.repeat, this.data.repeat);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    const apply = () => {
      const mesh = this.el.getObject3D('mesh');
      if (mesh && mesh.material) { mesh.material.map = tex; mesh.material.needsUpdate = true; }
    };
    if (this.el.getObject3D('mesh')) apply();
    else this.el.addEventListener('object3dset', apply);
  },
});

// "ocean-waves": a big ring of water whose points bob up and down like waves.
AFRAME.registerComponent('ocean-waves', {
  schema: { color: { default: '#1592b0' }, amp: { default: 0.12 }, speed: { default: 1 } },
  init: function () {
    const geo = new THREE.RingGeometry(15, 150, 90, 12);
    geo.rotateX(-Math.PI / 2);                          // lay it flat
    this.base = geo.attributes.position.array.slice();  // remember the calm shape
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.data.color),
      metalness: 0.5, roughness: 0.2, flatShading: true,
      transparent: true, opacity: 0.92, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.el.setObject3D('mesh', this.mesh);
  },
  tick: function (time) {
    const t = time * 0.001 * this.data.speed;
    const pos = this.mesh.geometry.attributes.position;
    const arr = pos.array, base = this.base, amp = this.data.amp;
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i], z = base[i + 2];
      arr[i + 1] = Math.sin(x * 0.3 + t) * amp + Math.cos(z * 0.4 + t * 0.8) * amp;
    }
    pos.needsUpdate = true;                              // flatShading re-lights the facets for us
  },
});

// "palm-tree": a leaning trunk topped with drooping fronds and a few coconuts.
AFRAME.registerComponent('palm-tree', {
  init: function () {
    const make = (geo, attrs) => {
      const e = document.createElement(geo);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      this.el.appendChild(e);
      return e;
    };
    make('a-cylinder', { 'radius-top': 0.12, 'radius-bottom': 0.2, height: 3.6, position: '0 1.8 0',
                         rotation: '0 0 6', paint: 'type: wood; repeat: 3',
                         material: 'color: #9c6b3f; roughness: 0.9', shadow: 'cast: true' });
    const crownY = 3.55, crownX = 0.38;                 // top of the (leaning) trunk
    for (let i = 0; i < 7; i++) {                        // a ring of fronds
      const ang = i * (360 / 7);
      const greens = ['#2f8f3a', '#37a043', '#2a7d33'];
      make('a-cone', { radius: 0.16, height: 1.7, position: crownX + ' ' + crownY + ' 0',
                       rotation: '-72 ' + ang + ' 0', scale: '1 1 0.12',
                       material: 'color: ' + greens[i % 3] + '; roughness: 0.85; side: double',
                       shadow: 'cast: true' });
    }
    ['0.12 0.1', '-0.05 0.16', '0.16 -0.08'].forEach((xz) => {  // coconuts
      const p = xz.split(' ');
      make('a-sphere', { radius: 0.09, position: (crownX + parseFloat(p[0])) + ' ' + (crownY - 0.1) + ' ' + p[1],
                         material: 'color: #5a3a22; roughness: 0.8' });
    });
  },
});
