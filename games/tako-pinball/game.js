// Tako Bubble (be-verb am/is/are) - Phaser 3. A Puzzle-Bobble / Snood shooter. A cluster of
// bubbles labeled am | is | are (one colour each) hangs at the top. tako loads a NEUTRAL bubble
// carrying a SUBJECT ("The cats"); you aim (with bank shots off the walls) and fire. On landing
// the bubble turns into the subject's correct be-verb colour, so you must route it to the right
// colour cluster from grammar knowledge: connect 3+ of a colour and they burst, and any cluster
// left unattached drops. Clear the board to win; if the clutter from wrong shots crosses the
// danger line, you lose. Japanese is how-to / banter only; it never names the answer (A2).
"use strict";
(function () {
  const W = 760, H = 1200;
  const WL = 40, WR = 720;                 // side walls
  const R = 34, D = 68;                    // bubble radius / diameter
  const COLS = 9;                          // bubbles per row (every row 9 wide; odd rows offset by R)
  const TOP = 168, ROWH = 59;              // row-0 centre y, hex row pitch (~D*0.866)
  const LX = W / 2, LY = 1006;             // launcher / loaded-bubble centre
  const DLY = 720;                         // danger line: lose if the cluster descends to it (~row 9)
  const MAXROW = 12;
  const DESCEND_EVERY = 6;                 // every N shots the ceiling drops a fresh row (Puzzle Bobble)
  // TWO colours per answer (6 total) so clusters are finer and the board takes more shots.
  // Both colours of a be-verb wear the same am/is/are label; matching is by exact colour.
  const BUBS = {
    am1: { be: "am", c: 0xFFCF4D }, am2: { be: "am", c: 0xFF8A3D },
    is1: { be: "is", c: 0x3DBE6A }, is2: { be: "is", c: 0x29C2D6 },
    are1: { be: "are", c: 0xFF5AA0 }, are2: { be: "are", c: 0xA66BF0 }
  };
  const BE_COLORS = { am: ["am1", "am2"], is: ["is1", "is2"], are: ["are1", "are2"] };
  const BES = ["am", "is", "are"];
  const colorOf = (ck) => (BUBS[ck] ? BUBS[ck].c : 0x8794a6);
  const beOf = (ck) => (BUBS[ck] ? BUBS[ck].be : null);

  const SUBJECTS = [
    { k: "I", t: "I", be: "am" },
    { k: "he", t: "He", be: "is" }, { k: "she", t: "She", be: "is" }, { k: "it", t: "It", be: "is" },
    { k: "the_dog", t: "The dog", be: "is" }, { k: "the_cat", t: "The cat", be: "is" },
    { k: "tom", t: "Tom", be: "is" }, { k: "my_mom", t: "My mom", be: "is" }, { k: "this", t: "This", be: "is" },
    { k: "you", t: "You", be: "are" }, { k: "we", t: "We", be: "are" }, { k: "they", t: "They", be: "are" },
    { k: "the_cats", t: "The cats", be: "are" }, { k: "the_dogs", t: "The dogs", be: "are" },
    { k: "my_friends", t: "My friends", be: "are" }, { k: "tom_and_i", t: "Tom and I", be: "are" },
    { k: "you_and_i", t: "You and I", be: "are" }, { k: "he_and_i", t: "He and I", be: "are" }
  ];

  const Sfx = {
    ctx: null,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    tone(f0, f1, dur, type, gain) { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); g.gain.setValueAtTime(gain || 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur); },
    noise(dur, gain, freq) { if (!this.ctx) return; const t = this.ctx.currentTime, b = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 800; const g = this.ctx.createGain(); g.gain.setValueAtTime(gain || 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(this.ctx.destination); s.start(t); s.stop(t + dur); },
    shoot() { this.tone(300, 720, 0.12, "sine", 0.10); },
    ink() { this.noise(0.2, 0.13, 620); this.tone(200, 80, 0.22, "sawtooth", 0.07); },
    stick() { this.tone(380, 300, 0.07, "sine", 0.12); },
    pop() { this.tone(660, 1080, 0.10, "triangle", 0.16); this.noise(0.06, 0.05, 2400); },
    drop() { this.tone(500, 180, 0.18, "sine", 0.10); },
    descend() { this.tone(240, 150, 0.26, "sawtooth", 0.11); this.noise(0.2, 0.06, 480); },
    bad() { this.tone(360, 140, 0.3, "square", 0.13); },
    win() { [0, 120, 240, 380].forEach((d, i) => setTimeout(() => this.tone(620 + i * 160, 980 + i * 160, 0.2, "triangle", 0.16), d)); },
    lose() { this.tone(420, 110, 0.5, "sawtooth", 0.16); }
  };

  class Play extends Phaser.Scene {
    constructor() { super("play"); }
    preload() {
      this.load.svg("tako", "assets/tako.svg", { width: 220, height: 185 });
      this.load.svg("p_bubble", "assets/p_bubble.svg", { width: 46, height: 46 });
      this.load.svg("p_spark", "assets/p_spark.svg", { width: 44, height: 44 });
      this.load.svg("p_star", "assets/p_star.svg", { width: 44, height: 44 });
      this.load.svg("ink_splat", "assets/ink_splat.svg", { width: 140, height: 140 });
      this.load.svg("ink_blob", "assets/ink_blob.svg", { width: 60, height: 60 });
    }
    create() {
      this.voices = {}; this.playStarted = false; this.grid = []; this.shot = null; this.flying = false; this.firing = false; this.lastK = null; this.rewardDone = null;
      if (window.KMEAudio) { KMEAudio.setBase("assets/").stopAll(); KMEAudio.register(SUBJECTS.map((s) => "en_" + s.k).concat(["tb_intro"])); }
      this.aiming = false; this.aimAngle = -Math.PI / 2; this.cur = null; this.busy = false;
      Object.keys(BUBS).forEach((k) => this.bakeBubbleTex("bub_" + k, BUBS[k].c)); this.bakeBubbleTex("bub_neutral", 0x9fb0c4);

      this.buildBackground();
      this.buildWalls();
      this.add.ellipse(LX, H - 8, 210, 38, 0x05111c, 0.3).setDepth(6);   // contact shadow under tako
      this.tako = this.add.image(LX, H - 96, "tako").setOrigin(0.5, 0.5).setDepth(8).setVisible(false);   // centre origin so it can flip in place
      this.aimG = this.add.graphics().setDepth(7);
      this.bubbleLayer = this.add.container(0, 0).setDepth(10);
      this.buildHud(); this.buildSubject();

      this.input.on("pointerdown", (p) => { Sfx.init(); if (this.canAim()) { this.aiming = true; this.setAim(p.worldX, p.worldY); } });
      this.input.on("pointermove", (p) => { if (this.aiming) this.setAim(p.worldX, p.worldY); });
      this.input.on("pointerup", () => { if (this.aiming) { this.aiming = false; this.fire(); } });

      const q = new URLSearchParams(location.search);
      if (q.has("cap")) { window.__tb = this; this.markSeen(); this.tako.setVisible(true); this.capSetup(q); }
      else this.showTitle();
    }

    bakeBubbleTex(key, hex) {
      if (this.textures.exists(key)) return;
      const s = D, tex = this.textures.createCanvas(key, s, s), cx = tex.getContext(), r = s / 2;
      const cr = (hex >> 16) & 255, cg = (hex >> 8) & 255, cb = hex & 255;
      const lite = (f) => `rgb(${Math.min(255, cr + (255 - cr) * f) | 0},${Math.min(255, cg + (255 - cg) * f) | 0},${Math.min(255, cb + (255 - cb) * f) | 0})`;
      const dark = (f) => `rgb(${(cr * f) | 0},${(cg * f) | 0},${(cb * f) | 0})`;
      const g = cx.createRadialGradient(r * 0.7, r * 0.62, r * 0.15, r, r, r);
      g.addColorStop(0, lite(0.65)); g.addColorStop(0.5, `rgb(${cr},${cg},${cb})`); g.addColorStop(1, dark(0.6));
      cx.fillStyle = g; cx.beginPath(); cx.arc(r, r, r - 3, 0, 7); cx.fill();
      cx.lineWidth = 4; cx.strokeStyle = dark(0.42); cx.beginPath(); cx.arc(r, r, r - 3, 0, 7); cx.stroke();
      // takoyaki toppings: a sauce drizzle (darker in-hue) + a white mayo crosshatch + aonori specks
      cx.lineCap = "round"; cx.lineWidth = 4; cx.strokeStyle = dark(0.5); cx.globalAlpha = 0.85;
      cx.beginPath(); cx.moveTo(r * 0.5, r * 1.18); cx.quadraticCurveTo(r, r * 0.95, r * 1.5, r * 1.16); cx.stroke();
      cx.lineWidth = 3; cx.strokeStyle = "#fff7ec"; cx.globalAlpha = 0.92;
      for (let i = -1; i <= 1; i++) { cx.beginPath(); cx.moveTo(r * (0.55 + i * 0.28), r * 1.34); cx.lineTo(r * (0.95 + i * 0.28), r * 0.92); cx.stroke(); cx.beginPath(); cx.moveTo(r * (0.55 + i * 0.28), r * 0.92); cx.lineTo(r * (0.95 + i * 0.28), r * 1.34); cx.stroke(); }
      cx.globalAlpha = 0.7; cx.fillStyle = "#2f5f2a"; [[r * 0.7, r * 0.78], [r * 1.28, r * 1.05], [r * 1.02, r * 1.3]].forEach(([px, py]) => { cx.beginPath(); cx.arc(px, py, 2.6, 0, 7); cx.fill(); });
      cx.globalAlpha = 0.8; cx.fillStyle = "#ffffff"; cx.beginPath(); cx.ellipse(r * 0.64, r * 0.48, r * 0.32, r * 0.18, -0.5, 0, 7); cx.fill();
      cx.globalAlpha = 0.5; cx.beginPath(); cx.ellipse(r * 0.56, r * 0.42, r * 0.12, r * 0.08, -0.5, 0, 7); cx.fill(); cx.globalAlpha = 1;
      tex.refresh();
    }
    buildBackground() {
      if (!this.textures.exists("tbbg")) {
        const tex = this.textures.createCanvas("tbbg", W, H), cx = tex.getContext();
        const g = cx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#1d6a96"); g.addColorStop(0.5, "#123f63"); g.addColorStop(1, "#08202f");
        cx.fillStyle = g; cx.fillRect(0, 0, W, H);
        cx.fillStyle = "#0c3148"; cx.globalAlpha = 0.55; for (let i = 0; i < 7; i++) { const bx = 60 + i * 110; cx.beginPath(); cx.moveTo(bx, H); cx.quadraticCurveTo(bx - 30, H - 360, bx + 10, H - 600); cx.quadraticCurveTo(bx + 40, H - 360, bx + 30, H); cx.fill(); }
        cx.globalAlpha = 0.06; cx.fillStyle = "#bfe8ff"; for (let i = 0; i < 34; i++) { cx.beginPath(); cx.arc((i * 151) % W, (i * 263) % H, 3 + (i % 4), 0, 7); cx.fill(); }
        cx.globalAlpha = 1;
        const vg = cx.createRadialGradient(W / 2, H * 0.4, H * 0.24, W / 2, H * 0.4, H * 0.62); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(4,14,22,0.5)"); cx.fillStyle = vg; cx.fillRect(0, 0, W, H);
        tex.refresh();
      }
      this.add.image(0, 0, "tbbg").setOrigin(0).setDepth(0);
      this.bubbles = []; for (let i = 0; i < 12; i++) { const s = this.add.image(Phaser.Math.Between(WL, WR), Phaser.Math.Between(TOP, H - 120), "p_bubble").setDepth(2).setScale(Phaser.Math.FloatBetween(0.2, 0.5)).setAlpha(0.2); s.bv = Phaser.Math.FloatBetween(12, 30); this.bubbles.push(s); }
    }
    buildWalls() {
      if (!this.textures.exists("tbwall")) {
        const tex = this.textures.createCanvas("tbwall", WL, H), cx = tex.getContext();
        const g = cx.createLinearGradient(0, 0, WL, 0); g.addColorStop(0, "#0a2536"); g.addColorStop(0.7, "#15506f"); g.addColorStop(1, "#2f7fa6");
        cx.fillStyle = g; cx.fillRect(0, 0, WL, H); tex.refresh();
      }
      this.add.image(0, 0, "tbwall").setOrigin(0).setDepth(4);
      this.add.image(W, 0, "tbwall").setOrigin(1, 0).setDepth(4).setFlipX(true);
      const g = this.add.graphics().setDepth(4); g.fillStyle(0x0a2536, 1); g.fillRect(WL, 0, WR - WL, 96);   // ceiling the top row hangs from
      g.lineStyle(4, 0x6fd0e8, 0.8); g.lineBetween(WL, 96, WR, 96);
      const haz = this.add.graphics().setDepth(5);   // hazard band: clutter past here loses
      haz.fillStyle(0xee2a3c, 0.14); haz.fillRect(WL, DLY, WR - WL, 64);
      haz.fillStyle(0xee2a3c, 0.07); haz.fillRect(WL, DLY + 64, WR - WL, 40);
      haz.fillStyle(0xff3a4d, 0.9); for (let x = WL + 8; x < WR - 10; x += 32) haz.fillRoundedRect(x, DLY - 6, 20, 11, 4);
    }
    buildHud() {
      const bar = this.add.graphics().setDepth(29); bar.fillStyle(0x0a2438, 0.9); bar.fillRoundedRect(8, 8, W - 16, 50, 16);
      this.hud = this.add.text(20, 17, "", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "24px", color: "#ffe08a", fontStyle: "700" }).setDepth(30);
      this.updateHud();
    }
    updateHud() { this.hud.setText("のこり  " + this.countBubbles()); }
    buildSubject() {
      this.subjBg = this.add.graphics().setDepth(21);
      this.subjT = this.add.text(W / 2, 124, "", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "36px", color: "#fff", fontStyle: "800" }).setOrigin(0.5).setDepth(22).setStroke("#06121e", 6);
    }
    drawSubject() {
      if (!this.cur) { this.subjBg.clear(); this.subjT.setText(""); return; }
      this.subjT.setText(this.cur.t);
      const tw = Math.max(150, this.subjT.width + 56);
      this.subjBg.clear(); this.subjBg.fillStyle(0x0a2438, 0.95); this.subjBg.fillRoundedRect(W / 2 - tw / 2, 102, tw, 48, 16); this.subjBg.lineStyle(4, 0x6fd0e8, 1); this.subjBg.strokeRoundedRect(W / 2 - tw / 2, 102, tw, 48, 16);
      this.subjT.setScale(0.6); this.tweens.add({ targets: this.subjT, scale: 1, duration: 200, ease: "Back.out" });
    }

    // ---------- hex grid ----------
    rowCount(r) { return COLS; }
    cellPos(r, c) { return { x: WL + 16 + R + c * D + (r % 2 ? R : 0), y: TOP + r * ROWH }; }
    inb(r, c) { return r >= 0 && r < MAXROW && c >= 0 && c < this.rowCount(r); }
    get(r, c) { return (this.grid[r] && this.grid[r][c]) || null; }
    neigh(r, c) {
      const o = r % 2 ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]] : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
      const res = []; for (const [dr, dc] of o) { const nr = r + dr, nc = c + dc; if (this.inb(nr, nc)) res.push([nr, nc]); } return res;
    }
    makeBubble(r, c, ck) {
      const p = this.cellPos(r, c), be = beOf(ck);
      const spr = this.add.image(p.x, p.y, "bub_" + ck).setDisplaySize(D - 2, D - 2);
      const label = this.add.text(p.x, p.y, be || "?", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "23px", color: "#FFF7F0", fontStyle: "800" }).setOrigin(0.5).setStroke("#1E1233", 4);
      this.bubbleLayer.add(spr); this.bubbleLayer.add(label);
      if (!this.grid[r]) this.grid[r] = [];
      return (this.grid[r][c] = { ck, be, spr, label, r, c });
    }
    removeBubble(b, drop) {
      if (this.grid[b.r]) this.grid[b.r][b.c] = null;
      if (drop) { this.tweens.add({ targets: [b.spr, b.label], y: H + 80, alpha: 0, angle: 180, duration: 520, ease: "Quad.in", onComplete: () => { b.spr.destroy(); b.label.destroy(); } }); }
      else { this.sparkle(b.spr.x, b.spr.y, colorOf(b.ck)); this.tweens.add({ targets: [b.spr, b.label], scale: 0, alpha: 0, duration: 220, ease: "Back.in", onComplete: () => { b.spr.destroy(); b.label.destroy(); } }); }
    }
    countBubbles() { let n = 0; for (const row of this.grid) if (row) for (const b of row) if (b) n++; return n; }

    genLevel() {
      this.grid = []; this.shots = 0; const swap = Math.random() < 0.5; this.leftBe = swap ? "are" : "is"; this.rightBe = swap ? "is" : "are";
      for (let r = 0; r < 3; r++) for (let c = 0; c < COLS; c++) this.makeBubble(r, c, this.pickColor(r, c));
      this.updateHud();
    }
    pickColor(r, c) {
      const side = this.cellPos(r, c).x < W / 2 ? this.leftBe : this.rightBe;
      let be;
      if (r >= 1 && Math.random() < 0.09) be = "am";   // am stays sparse, never in a fresh top row
      else be = Math.random() < 0.16 ? (side === "is" ? "are" : "is") : side;
      const variant = ((r + Math.floor(c / 2)) % 2) ? 0 : 1;   // 2-wide colour bands -> same-shade sub-clusters
      return BE_COLORS[be][variant];
    }
    descend() {   // ceiling drops: a fresh top row appears and everything shifts down one row
      Sfx.descend(); const old = this.grid; this.grid = [];
      for (let c = 0; c < COLS; c++) this.makeBubble(0, c, this.pickColor(0, c));
      for (let r = 0; r < old.length; r++) { const row = old[r]; if (!row) continue; const dest = r + 1; if (!this.grid[dest]) this.grid[dest] = [];
        for (let c = 0; c < row.length; c++) { const b = row[c]; if (!b) continue; b.r = dest; const p = this.cellPos(dest, c); this.tweens.add({ targets: [b.spr, b.label], x: p.x, y: p.y, duration: 300, ease: "Quad.out" }); this.grid[dest][c] = b; } }
      this.updateHud();
    }

    // ---------- aim + fire ----------
    canAim() { return this.state === "play" && this.shot && !this.flying && !this.firing && !this.busy; }
    setAim(px, py) {
      let a = Math.atan2(py - LY, px - LX);
      if (a > 0) a = (a < Math.PI / 2) ? -0.2 : -(Math.PI - 0.2);   // keep it pointing upward
      this.aimAngle = Phaser.Math.Clamp(a, -(Math.PI - 0.2), -0.2);
      if (this.tako) this.tako.rotation = Math.atan2(-Math.cos(this.aimAngle), Math.sin(this.aimAngle));   // tako turns so its bottom points where the shot goes
      this.drawAim();
    }
    simulate(angle) {
      // step the shot along (angle) reflecting off walls; stop at a bubble or the ceiling
      let x = LX, y = LY, vx = Math.cos(angle), vy = Math.sin(angle), step = 12;
      const pts = [{ x, y }];
      for (let i = 0; i < 600; i++) {
        x += vx * step; y += vy * step;
        if (x < WL + R) { x = WL + R; vx = Math.abs(vx); } else if (x > WR - R) { x = WR - R; vx = -Math.abs(vx); }
        let hit = false;
        for (const row of this.grid) { if (!row) continue; for (const b of row) { if (b && (x - b.spr.x) ** 2 + (y - b.spr.y) ** 2 < (D * 0.92) ** 2) { hit = true; break; } } if (hit) break; }
        if (hit || y <= TOP - 4) { pts.push({ x, y }); break; }
        if (i % 3 === 0) pts.push({ x, y });
      }
      return pts;
    }
    drawAim() {   // full landing guide, always on (touch aiming is easy enough that it stays fair)
      this.aimG.clear(); if (!this.canAim()) return;
      const pts = this.simulate(this.aimAngle);
      for (let i = 1; i < pts.length; i++) { if ((i % 2) === 0) continue; const p0 = pts[i - 1], p1 = pts[i], k = i / pts.length, x = (p0.x + p1.x) / 2, y = (p0.y + p1.y) / 2, rr = 3 + k * 3; this.aimG.fillStyle(0xbfe8ff, 0.22); this.aimG.fillCircle(x, y, rr + 3); this.aimG.fillStyle(0xffffff, 0.85); this.aimG.fillCircle(x, y, rr); }
      const end = pts[pts.length - 1];   // landing ring stays NEUTRAL white (colouring it would leak the answer, A2)
      this.aimG.lineStyle(5, 0xbfe8ff, 0.45); this.aimG.strokeCircle(end.x, end.y, R - 3); this.aimG.lineStyle(3, 0xffffff, 0.95); this.aimG.strokeCircle(end.x, end.y, R - 6);
    }
    fire() {
      if (!this.canAim()) return;
      this.firing = true; this.aiming = false; this.aimG.clear(); Sfx.ink();
      this.tweens.add({ targets: this.tako, scaleX: 1.22, scaleY: 1.26, duration: 130, ease: "Quad.out" });   // tako swells at its bottom...
      this.time.delayedCall(130, () => this.release());
    }
    release() {
      this.firing = false; if (!this.shot) return;
      this.flying = true; Sfx.shoot();
      this.shotVX = Math.cos(this.aimAngle) * 1180; this.shotVY = Math.sin(this.aimAngle) * 1180;
      if (this.shotLabel) this.shotLabel.setVisible(false);
      this.tweens.add({ targets: this.tako, scaleX: 1, scaleY: 1, duration: 200, ease: "Back.out" });   // ...then lets it out
      this.inkBlast();
    }
    inkBlast() {   // a bold black ink sploosh (cyan-rimmed so it pops on the dark water) flung along the shot
      const ox = LX, oy = LY + 10, ang = this.aimAngle;
      const flash = this.add.image(ox, oy, "ink_splat").setDepth(9).setTint(0x9fe8ff).setScale(0.5).setAlpha(0.55).setAngle(Phaser.Math.Between(0, 360));
      this.tweens.add({ targets: flash, scale: 3.2, alpha: 0, duration: 300, ease: "Quad.out", onComplete: () => flash.destroy() });
      const splat = this.add.image(ox, oy, "ink_splat").setDepth(10).setScale(0.45).setAlpha(0.97).setAngle(Phaser.Math.Between(0, 360));
      this.tweens.add({ targets: splat, scaleX: 2.7, scaleY: 2.7, alpha: 0, angle: splat.angle + 50, duration: 480, ease: "Quad.out", onComplete: () => splat.destroy() });
      for (let i = 0; i < 16; i++) {
        const s = this.add.image(ox, oy, "ink_blob").setDepth(10).setScale(Phaser.Math.FloatBetween(0.45, 1.05)).setAngle(Phaser.Math.Between(0, 360)).setAlpha(0.96);
        const a = ang + Phaser.Math.FloatBetween(-0.6, 0.6), sp = Phaser.Math.Between(240, 580);
        this.tweens.add({ targets: s, x: ox + Math.cos(a) * sp, y: oy + Math.sin(a) * sp, scale: 0.15, alpha: 0, angle: s.angle + Phaser.Math.Between(-160, 160), duration: Phaser.Math.Between(460, 800), ease: "Quad.out", onComplete: () => s.destroy() });
      }
    }

    loadNext() {
      if (this.countBubbles() === 0) return this.win();
      if (this.tako) this.tweens.add({ targets: this.tako, rotation: 0, duration: 200, ease: "Quad.out" });   // upright until you aim
      const present = BES.filter((be) => this.hasBe(be));
      const poppable = present.filter((be) => this.hasPair(be));
      const pool = (poppable.length ? poppable : present);
      const be = pool[Phaser.Math.Between(0, pool.length - 1)];
      const subs = SUBJECTS.filter((s) => s.be === be);
      let pick = subs[Phaser.Math.Between(0, subs.length - 1)];
      if (subs.length > 1) { let tries = 0; while (pick.k === this.lastK && tries++ < 6) pick = subs[Phaser.Math.Between(0, subs.length - 1)]; }   // avoid immediate repeats
      this.cur = pick; this.lastK = pick.k;
      this.shotBe = be;
      this.shot = this.add.image(LX, LY, "bub_neutral").setDepth(11).setDisplaySize(D - 2, D - 2).setScale(0);
      this.tweens.add({ targets: this.shot, scaleX: (D - 2) / D, scaleY: (D - 2) / D, duration: 200, ease: "Back.out" });
      this.shotLabel = this.add.text(LX, LY, "?", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "30px", color: "#0a2438", fontStyle: "800" }).setOrigin(0.5).setDepth(12);
      this.drawSubject(); this.voiceQueued("en_" + this.cur.k); this.drawAim();
    }
    hasBe(be) { for (const row of this.grid) if (row) for (const b of row) if (b && b.be === be) return true; return false; }
    hasPair(be) { for (const row of this.grid) if (row) for (const b of row) if (b && b.be === be) { for (const [nr, nc] of this.neigh(b.r, b.c)) { const n = this.get(nr, nc); if (n && n.ck === b.ck) return true; } } return false; }

    update(time, delta) {
      const dt = Math.min(0.033, delta / 1000);
      if (this.bubbles) for (const b of this.bubbles) { b.y -= b.bv * dt; if (b.y < TOP) { b.y = H - 100; b.x = Phaser.Math.Between(WL, WR); } }
      if (!this.flying || !this.shot) return;
      if (Math.random() < 0.6) { const tr = this.add.image(this.shot.x, this.shot.y, "ink_blob").setDepth(9).setScale(0.5).setAlpha(0.7); this.tweens.add({ targets: tr, scale: 0.12, alpha: 0, duration: 340, onComplete: () => tr.destroy() }); }   // ink trail
      const sub = 3;
      for (let s = 0; s < sub; s++) {
        this.shot.x += this.shotVX * dt / sub; this.shot.y += this.shotVY * dt / sub;
        if (this.shot.x < WL + R) { this.shot.x = WL + R; this.shotVX = Math.abs(this.shotVX); }
        else if (this.shot.x > WR - R) { this.shot.x = WR - R; this.shotVX = -Math.abs(this.shotVX); }
        if (this.shotLabel) this.shotLabel.setPosition(this.shot.x, this.shot.y);
        let hit = false;
        for (const row of this.grid) { if (!row) continue; for (const b of row) { if (b && (this.shot.x - b.spr.x) ** 2 + (this.shot.y - b.spr.y) ** 2 < (D * 0.9) ** 2) { hit = true; break; } } if (hit) break; }
        if (hit || this.shot.y <= TOP) { this.snap(); return; }
      }
    }
    snap() {
      this.flying = false;
      const cell = this.nearestEmptyCell(this.shot.x, this.shot.y);
      if (this.shotLabel) { this.shotLabel.destroy(); this.shotLabel = null; }
      this.shot.destroy(); this.shot = null;
      if (!cell) { this.busy = true; this.time.delayedCall(120, () => { this.busy = false; this.loadNext(); }); return; }
      // conform-on-hit: if it touches a cluster of the CORRECT be-verb it becomes that cluster's
      // exact colour and can match; otherwise it becomes a grey dud (clutter, never matches).
      // it becomes the EXACT colour of the answer-cluster it touches; if it touches both shades
      // of its answer (or none) it is 50/50. Matching is by exact colour, so aim at one shade.
      const cks = new Set(); let adj = false;
      for (const [nr, nc] of this.neigh(cell[0], cell[1])) { const n = this.get(nr, nc); if (n && n.be === this.shotBe) { cks.add(n.ck); adj = true; } }
      const ck = (cks.size === 1) ? [...cks][0] : BE_COLORS[this.shotBe][Math.random() < 0.5 ? 0 : 1];
      const b = this.makeBubble(cell[0], cell[1], ck); b.adj = adj; Sfx.stick();
      b.spr.setScale(0.001); this.tweens.add({ targets: b.spr, displayWidth: D - 2, displayHeight: D - 2, duration: 130, ease: "Back.out" });
      this.resolve(b);
    }
    nearestEmptyCell(px, py) {
      let best = null, bd = 1e9;
      for (let r = 0; r < MAXROW; r++) for (let c = 0; c < this.rowCount(r); c++) {
        if (this.get(r, c)) continue;
        const anchored = r === 0 || this.neigh(r, c).some(([nr, nc]) => this.get(nr, nc));
        if (!anchored) continue;
        const p = this.cellPos(r, c), d = (px - p.x) ** 2 + (py - p.y) ** 2;
        if (d < bd) { bd = d; best = [r, c]; }
      }
      return best;
    }
    resolve(b) {
      this.busy = true;
      const group = this.sameColorGroup(b.r, b.c);   // pop by EXACT colour (3+ same shade)
      if (group.length >= 3) {
        Sfx.pop(); this.rewardDone = this.voice("en_full_" + this.cur.k);   // the next subject waits until this review finishes playing
        group.forEach((g, i) => this.time.delayedCall(i * 24, () => this.removeBubble(g, false)));
        this.time.delayedCall(group.length * 24 + 160, () => this.dropFloaters());
      } else if (!b.adj) { Sfx.bad(); this.cameras.main.shake(130, 0.007); this.bubbleAt(b, "ちがう！"); this.time.delayedCall(200, () => this.afterResolve()); }   // not touching its answer = wrong aim, clutter
      else { Sfx.stick(); this.time.delayedCall(180, () => this.afterResolve()); }   // right answer, building toward 3
    }
    bubbleAt(b, txt) { const t = this.add.text(b.spr.x, b.spr.y - 44, txt, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "26px", color: "#ff6a6a", fontStyle: "800" }).setOrigin(0.5).setDepth(35).setStroke("#06121e", 5); this.tweens.add({ targets: t, y: t.y - 24, alpha: 0, duration: 700, onComplete: () => t.destroy() }); }
    sameColorGroup(r, c) {
      const start = this.get(r, c); if (!start) return []; const ck = start.ck, seen = {}, stack = [[r, c]], out = [];
      while (stack.length) { const [cr, cc] = stack.pop(), key = cr + "," + cc; if (seen[key]) continue; seen[key] = 1; const cell = this.get(cr, cc); if (!cell || cell.ck !== ck) continue; out.push(cell); for (const [nr, nc] of this.neigh(cr, cc)) if (!seen[nr + "," + nc]) stack.push([nr, nc]); }
      return out;
    }
    dropFloaters() {
      const seen = {}; const stack = [];
      for (let c = 0; c < this.rowCount(0); c++) if (this.get(0, c)) { stack.push([0, c]); seen["0," + c] = 1; }
      while (stack.length) { const [cr, cc] = stack.pop(); for (const [nr, nc] of this.neigh(cr, cc)) { const key = nr + "," + nc; if (!seen[key] && this.get(nr, nc)) { seen[key] = 1; stack.push([nr, nc]); } } }
      let dropped = 0;
      for (let r = 0; r < MAXROW; r++) for (let c = 0; c < this.rowCount(r); c++) { const b = this.get(r, c); if (b && !seen[r + "," + c]) { this.removeBubble(b, true); dropped++; } }
      if (dropped) Sfx.drop();
      this.time.delayedCall(dropped ? 320 : 60, () => this.afterResolve());
    }
    afterResolve() {
      this.updateHud();
      if (this.countBubbles() === 0) return this.win();
      this.shots = (this.shots || 0) + 1;
      if (this.shots % DESCEND_EVERY === 0) this.descend();
      if (this.loseCheck()) return this.lose();
      // hold the next subject (and the next shot) until the reward review has
      // finished playing; busy stays true through the wait so no shot sneaks in.
      const reward = this.rewardDone || Promise.resolve(); this.rewardDone = null;
      const beat = new Promise((r) => this.time.delayedCall(450, r));
      Promise.all([reward, beat]).then(() => { if (this.state === "play") { this.busy = false; this.loadNext(); } });
    }
    loseCheck() { for (const row of this.grid) if (row) for (const b of row) if (b && this.cellPos(b.r, b.c).y + R >= DLY) return true; return false; }

    sparkle(x, y, color) { for (let i = 0; i < 8; i++) { const s = this.add.image(x, y, i % 2 ? "p_spark" : "p_star").setDepth(34).setTint(color).setScale(Phaser.Math.FloatBetween(0.3, 0.6)).setAngle(Phaser.Math.Between(0, 360)); const a = Math.random() * Math.PI * 2, d = Phaser.Math.Between(20, 70); this.tweens.add({ targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.1, duration: Phaser.Math.Between(360, 520), ease: "Quad.out", onComplete: () => s.destroy() }); } }

    // ---------- title / intro / voice ----------
    introNeeded() { try { return !localStorage.getItem("tb_intro_seen"); } catch (e) { return true; } }
    markSeen() { try { localStorage.setItem("tb_intro_seen", "1"); } catch (e) {} }
    showTitle() {
      this.state = "title"; this.titleStarted = false;
      const dim = this.add.graphics().setDepth(60); dim.fillStyle(0x06121e, 0.5); dim.fillRect(0, 0, W, H);
      const host = this.add.image(W / 2, H * 0.34, "tako").setScale(1.6).setDepth(62);
      this.titleBob = this.tweens.add({ targets: host, y: H * 0.34 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const t1 = this.add.text(W / 2, H * 0.55, "タコ バブル", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "46px", color: "#ffe08a", fontStyle: "800" }).setOrigin(0.5).setDepth(62).setStroke("#06121e", 7);
      const t2 = this.add.text(W / 2, H * 0.55 + 46, "Tako Bubble", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "26px", color: "#cfeaff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#06121e", 5);
      const bw = 300, bh = 92, bx = W / 2, by = H * 0.72;
      const bg = this.add.graphics().setDepth(62); bg.fillStyle(0x2fb0c0, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26); bg.lineStyle(6, 0x1c7e8c, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26);
      const tri = this.add.triangle(bx - 58, by, 0, 0, 26, 16, 0, 32, 0xffffff).setDepth(63);
      const bt = this.add.text(bx + 14, by, "あそぶ", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "34px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(63).setStroke("#06121e", 5);
      this.titlePulse = this.tweens.add({ targets: bg, alpha: 0.7, duration: 650, yoyo: true, repeat: -1 });
      const zone = this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(64).on("pointerdown", () => this.startFromTitle());
      this.titleObjs = [dim, host, t1, t2, bg, tri, bt, zone];
    }
    startFromTitle() {
      if (this.titleStarted) return; this.titleStarted = true; Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.titleBob) this.titleBob.stop(); if (this.titlePulse) this.titlePulse.stop();
      (this.titleObjs || []).forEach((o) => { if (o && o.destroy) o.destroy(); });
      if (this.introNeeded()) this.startIntro(); else { this.markSeen(); this.tako.setVisible(true); this.startPlay(); }
    }
    startIntro() {
      this.state = "intro"; this.tako.setVisible(false);
      this.introDim = this.add.graphics().setDepth(45); this.introDim.fillStyle(0x06121e, 0.64); this.introDim.fillRect(0, 0, W, H);
      this.introBig = this.add.image(W / 2, H * 0.38, "tako").setScale(1.7).setDepth(47);
      this.introBob = this.tweens.add({ targets: this.introBig, y: H * 0.38 - 16, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const bx = W / 2, by = H * 0.63;
      this.introBg = this.add.graphics().setDepth(46); this.introBg.fillStyle(0xffffff, 0.97); this.introBg.fillRoundedRect(bx - 332, by - 104, 664, 208, 24); this.introBg.lineStyle(5, 0x2a6f9e, 1); this.introBg.strokeRoundedRect(bx - 332, by - 104, 664, 208, 24); this.introBg.fillTriangle(bx - 18, by + 102, bx + 18, by + 102, bx, by + 132);
      this.introText = this.add.text(bx, by, "まいど！ たこ や で！ ことば に あう いろ の\nたこやき を ねらって うちこむんや！\nおなじ いろ が みっつ で ポン！ てんじょう が\nさがってくる で、 ぜんぶ けして かち や！", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "24px", color: "#0a2438", fontStyle: "700", align: "center", lineSpacing: 8 }).setOrigin(0.5).setDepth(47);
      this.skipBtn = this.add.text(W - 56, 92, "スキップ", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "24px", color: "#cfeaff", fontStyle: "700" }).setOrigin(1, 0.5).setDepth(48).setInteractive({ useHandCursor: true }).setStroke("#06121e", 5);
      this.skipChev = this.add.triangle(W - 34, 92, 0, 0, 18, 11, 0, 22, 0xffd24d).setDepth(48).setInteractive({ useHandCursor: true });
      let advanced = false; this.advIntro = () => { if (advanced) return; advanced = true; this.endIntro(); };
      this.skipBtn.on("pointerdown", this.advIntro); this.skipChev.on("pointerdown", this.advIntro);
      this.voice("tb_intro", this.advIntro);   // advances when the clip actually ends
      this.time.delayedCall(20000, this.advIntro);   // safety net if audio is blocked
    }
    endIntro() {
      this.markSeen();
      if (window.KMEAudio) KMEAudio.stopAll();
      [this.skipBtn, this.skipChev].forEach((o) => { if (o) o.destroy(); }); this.skipBtn = null; this.skipChev = null;
      if (this.introBob) this.introBob.stop();
      this.tweens.add({ targets: [this.introDim, this.introBg, this.introText], alpha: 0, duration: 420, onComplete: () => { [this.introDim, this.introBg, this.introText].forEach((o) => { if (o) o.destroy(); }); } });
      this.tweens.add({ targets: this.introBig, x: LX, y: H - 96, scaleX: 1, scaleY: 1, duration: 600, ease: "Cubic.inOut", onComplete: () => { if (this.introBig) { this.introBig.destroy(); this.introBig = null; } this.tako.setVisible(true); } });
      this.time.delayedCall(700, () => this.startPlay());
    }
    voice(key, onEnd) {
      const p = window.KMEAudio ? KMEAudio.play(key) : Promise.resolve();
      if (onEnd) p.then(onEnd);
      return p;
    }

    startPlay() { if (this.playStarted) return; this.playStarted = true; this.state = "play"; this.genLevel(); this.loadNext(); }
    voiceQueued(key) { this.voice(key); }   // the audio bus serializes, so this queues behind the reward line already playing

    win() {
      if (this.state === "over") return; this.state = "over"; if (window.KMEFlow) KMEFlow.win(); Sfx.win(); this.cameras.main.flash(260, 180, 240, 255);
      this.tweens.add({ targets: this.tako, scaleX: 1.1, scaleY: 1.1, duration: 180, yoyo: true, repeat: 3 });
      for (let i = 0; i < 36; i++) this.time.delayedCall(i * 32, () => { const s = this.add.image(Phaser.Math.Between(WL, WR), Phaser.Math.Between(TOP, 560), i % 2 ? "p_star" : "p_spark").setDepth(55).setTint([0xffd24d, 0x6ee29a, 0xff7ab0, 0xbfe8ff][i % 4]).setScale(0.6); this.tweens.add({ targets: s, y: s.y + 80, alpha: 0, duration: 600, onComplete: () => s.destroy() }); });
      this.time.delayedCall(900, () => this.panel("ぜんぶ けした！", "YOU WIN!"));
    }
    lose() { if (this.state === "over") return; this.state = "over"; Sfx.lose(); this.cameras.main.shake(300, 0.012); this.time.delayedCall(500, () => this.panel("いっぱい や！", "GAME OVER")); }
    panel(titleJp, big) {
      const cy = H * 0.42;
      const p = this.add.graphics().setDepth(70); p.fillStyle(0x0a2438, 0.96); p.fillRoundedRect(W / 2 - 230, cy - 140, 460, 320, 28); p.lineStyle(6, 0xffd24d, 1); p.strokeRoundedRect(W / 2 - 230, cy - 140, 460, 320, 28);
      this.add.text(W / 2, cy - 76, titleJp, { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "38px", color: "#fff7f0", fontStyle: "700" }).setOrigin(0.5).setDepth(71).setStroke("#06121e", 7);
      this.add.text(W / 2, cy + 2, big, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "52px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5).setDepth(71).setStroke("#06121e", 7);
      const bw = 280, bh = 80, bx = W / 2, by = cy + 100;
      const bg = this.add.graphics().setDepth(71); bg.fillStyle(0x2fb0c0, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 24); bg.lineStyle(5, 0x1c7e8c, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 24);
      this.add.text(bx - 16, by, "もう いちど", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "30px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(72).setStroke("#06121e", 5);
      this.add.triangle(bx + 88, by, 0, 0, 20, 12, 0, 24, 0xffffff).setDepth(72);
      this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(73).on("pointerdown", () => this.scene.restart());
      this.tweens.add({ targets: bg, alpha: 0.7, duration: 700, yoyo: true, repeat: -1 });
    }

    capSetup(q) {
      this.state = "play"; this.playStarted = true; this.genLevel();
      const nd = parseInt(q.get("desc") || "0"); for (let i = 0; i < nd; i++) this.descend();
      const ck = q.get("be") || "are"; const subs = SUBJECTS.filter((s) => s.be === ck); this.cur = subs[0]; this.shotBe = ck;
      this.shot = this.add.image(LX, LY, "bub_neutral").setDepth(11).setDisplaySize(D - 2, D - 2);
      this.shotLabel = this.add.text(LX, LY, "?", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "30px", color: "#0a2438", fontStyle: "800" }).setOrigin(0.5).setDepth(12);
      this.aimAngle = parseFloat(q.get("ang") || "-1.4"); this.drawSubject();
      if (q.get("fire") || q.get("aimpose")) this.tako.rotation = Math.atan2(-Math.cos(this.aimAngle), Math.sin(this.aimAngle));   // butt points along the aim
      this.drawAim();
      if (q.get("fire")) { this.firing = true; this.release(); }   // skip the windup delay for a deterministic motion capture
    }
  }

  let booted = false;
  function boot() { if (booted) return; booted = true; new Phaser.Game({ type: Phaser.CANVAS, parent: "game", backgroundColor: "#08202f", audio: { disableWebAudio: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: [Play] }); }
  if (document.fonts && document.fonts.load) { Promise.all([document.fonts.load('800 46px "Baloo 2"'), document.fonts.load('700 24px "Zen Maru Gothic"')]).then(boot, boot); setTimeout(boot, 1800); } else boot();
})();
