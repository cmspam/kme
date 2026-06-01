// Ink Tally (there is / there are) - Phaser 3. Host: tako. A tide-pool counting
// shooter: sea critters swim around the tank; you ink-tag each one (tako fires an
// ink blob at where you tap, moving targets so aiming is the skill), and the tally
// counts them. Then you DECLARE: "There is" for one, "There are" for many. The
// is/are choice is the grammar; the count you made yourself decides it. Aria
// speaks the full sentence on a correct call. English-only test (A2): the JP is
// flavor and never names is/are for you. Art per art-bible.md (gradients, sheen).
"use strict";
(function () {
  const W = 760, H = 1200;
  const TANK = { x0: 40, x1: 720, y0: 250, y1: 940 };   // swim bounds
  const WIN_ROUNDS = 6, LIVES = 3, RAD = 64;            // tag hit radius

  const KINDS = [
    { k: "fish", sing: "fish", plur: "fish", art: "fish", tint: null, sc: 0.9 },
    { k: "crab", sing: "crab", plur: "crabs", art: "crab", tint: null, sc: 0.8 },
    { k: "shell", sing: "shell", plur: "shells", art: "shell", tint: null, sc: 0.8 }
  ];
  const NUM = ["", "a", "two", "three", "four", "five", "six"];

  const Sfx = {
    ctx: null,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    tone(f0, f1, dur, type, gain) { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); g.gain.setValueAtTime(gain || 0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur); },
    noise(dur, gain, freq) { if (!this.ctx) return; const t = this.ctx.currentTime, b = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 1000; const g = this.ctx.createGain(); g.gain.setValueAtTime(gain || 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(this.ctx.destination); s.start(t); s.stop(t + dur); },
    splat() { this.noise(0.12, 0.16, 1600); this.tone(420, 180, 0.12, "sine", 0.1); },
    tag() { this.tone(700, 1050, 0.08, "triangle", 0.16); },
    miss() { this.noise(0.08, 0.06, 600); },
    good() { [0, 90, 180].forEach((d, i) => setTimeout(() => this.tone(620 + i * 160, 980 + i * 160, 0.14, "triangle", 0.16), d)); },
    bad() { this.tone(300, 130, 0.32, "sawtooth", 0.14); },
    win() { [0, 120, 240, 380].forEach((d, i) => setTimeout(() => this.tone(620 + i * 160, 980 + i * 160, 0.2, "triangle", 0.16), d)); },
    lose() { this.tone(420, 100, 0.5, "sawtooth", 0.16); }
  };

  class Play extends Phaser.Scene {
    constructor() { super("play"); }
    preload() {
      this.load.svg("tako", "assets/tako.svg", { width: 220, height: 240 });
      this.load.svg("fish", "assets/fish.svg", { width: 92, height: 74 });
      this.load.svg("crab", "assets/crab.svg", { width: 108, height: 90 });
      this.load.svg("shell", "assets/shell.svg", { width: 86, height: 86 });
      this.load.svg("ink_blob", "assets/ink_blob.svg", { width: 54, height: 54 });
      this.load.svg("ink_splat", "assets/ink_splat.svg", { width: 96, height: 96 });
      this.load.svg("bub", "assets/p_bubble.svg", { width: 40, height: 40 });
      this.load.svg("heart", "assets/heart.svg", { width: 44, height: 44 });
    }
    create() {
      this.time.removeAllEvents();
      this.round = 0; this.lives = LIVES; this.critters = []; this.tally = 0; this.kind = null;
      this.declaring = false; this.busy = false; this.playStarted = false; this.state = null; this.rewardDone = null;
      if (window.KMEAudio) {
        KMEAudio.setBase("assets/").stopAll();
        const keys = ["ti_intro", "en_fish", "en_crab", "en_shell"];
        KINDS.forEach((kd) => { for (let n = 1; n <= 6; n++) keys.push("there_" + n + "_" + kd.k); });
        KMEAudio.register(keys);
      }

      this.buildBackdrop();
      this.tako = this.add.image(W / 2, H - 70, "tako").setScale(0.62).setDepth(20).setVisible(false);
      this.buildHud();

      const q = new URLSearchParams(location.search);
      if (q.has("cap")) { window.__it = this; this.markSeen(); this.tako.setVisible(true); this.startPlay(); }
      else this.showTitle();

      this.input.on("pointerdown", (p) => this.onTap(p));
    }

    buildBackdrop() {
      if (this.textures.exists("tankbg")) this.textures.remove("tankbg");
      const tex = this.textures.createCanvas("tankbg", W, H), cx = tex.getContext();
      const g = cx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#bfeeff"); g.addColorStop(0.45, "#4fb3e0"); g.addColorStop(1, "#0e3f63");
      cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      // light shafts
      cx.globalAlpha = 0.10; cx.fillStyle = "#ffffff";
      for (let i = 0; i < 4; i++) { const lx = 80 + i * 190; cx.beginPath(); cx.moveTo(lx, 0); cx.lineTo(lx + 80, 0); cx.lineTo(lx - 40, H); cx.lineTo(lx - 120, H); cx.closePath(); cx.fill(); }
      cx.globalAlpha = 1; tex.refresh();
      this.add.image(0, 0, "tankbg").setOrigin(0, 0).setDepth(0);
      // sandy bottom
      const fl = this.add.graphics().setDepth(1); fl.fillStyle(0xe6cf95, 1); fl.fillRoundedRect(-20, H - 120, W + 40, 220, 60);
      fl.fillStyle(0xd8bd7e, 1); for (let x = 20; x < W; x += 64) fl.fillCircle(x, H - 116, 22);
      // kelp
      const kelp = this.add.graphics().setDepth(2); kelp.lineStyle(16, 0x2f8f5e, 0.85);
      [70, 150, 640, 700].forEach((kx, i) => { kelp.beginPath(); kelp.moveTo(kx, H - 110); for (let y = H - 110; y > 360; y -= 40) kelp.lineTo(kx + Math.sin((y + i * 60) * 0.02) * 26, y); kelp.strokePath(); });
      // drifting bubbles
      this.bubbles = []; for (let i = 0; i < 9; i++) { const b = this.add.image(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), "bub").setDepth(3).setAlpha(0.5).setScale(Phaser.Math.FloatBetween(0.4, 1)); b.vy = Phaser.Math.Between(20, 46); this.bubbles.push(b); }
      // vignette
      const v = this.add.graphics().setDepth(40); for (let i = 0; i < 46; i++) { v.lineStyle(2, 0x06243a, i / 46 * 0.16); v.strokeRect(i, i, W - 2 * i, H - 2 * i); }
    }

    buildHud() {
      this.hud = this.add.graphics().setDepth(30); this.hud.fillStyle(0x0a2d47, 0.82); this.hud.fillRoundedRect(8, 8, W - 16, 56, 16);
      this.roundTx = this.add.text(20, 20, "", { fontFamily: '"Baloo 2"', fontSize: "24px", color: "#cdeeff", fontStyle: "800" }).setDepth(31);
      this.hearts = this.add.text(W - 20, 20, "", { fontFamily: '"Baloo 2"', fontSize: "26px", color: "#ff5a7a" }).setOrigin(1, 0).setDepth(31);
      this.tallyTx = this.add.text(W / 2, 36, "", { fontFamily: '"Baloo 2"', fontSize: "30px", color: "#fff", fontStyle: "800" }).setOrigin(0.5).setDepth(31).setStroke("#0a2d47", 5);
      this.banner = this.add.text(W / 2, 120, "", { fontFamily: '"Baloo 2"', fontSize: "34px", color: "#ffffff", fontStyle: "800" }).setOrigin(0.5).setDepth(31).setStroke("#0a2d47", 7).setVisible(false);
      this.bannerJp = this.add.text(W / 2, 158, "", { fontFamily: '"Zen Maru Gothic"', fontSize: "20px", color: "#d6f3ff", fontStyle: "700" }).setOrigin(0.5).setDepth(31).setVisible(false);
      this.updateHud();
    }
    updateHud() {
      this.roundTx.setText("ラウンド " + Math.min(this.round + 1, WIN_ROUNDS) + "/" + WIN_ROUNDS);
      this.hearts.setText("❤".repeat(Math.max(0, this.lives)));
      if (this.kind) this.tallyTx.setText("かぞえた: " + this.tally); else this.tallyTx.setText("");
    }

    // ---------- rounds ----------
    startPlay() { if (this.playStarted) return; this.playStarted = true; this.state = "play"; this.hud.setVisible(true); this.time.delayedCall(300, () => this.newRound()); }

    newRound() {
      this.declaring = false; this.busy = false; this.tally = 0;
      this.clearDeclare();
      const kd = KINDS[Phaser.Math.Between(0, KINDS.length - 1)]; this.kind = kd;
      // ~1 in 3 rounds is a single (exercise "There is"); else 2..cap
      let n;
      const cap = Math.min(6, 3 + Math.floor(this.round / 2));
      if (Phaser.Math.Between(0, 2) === 0) n = 1; else n = Phaser.Math.Between(2, cap);
      this.target = n;
      const sp = 70 + this.round * 16;   // speed ramps
      for (let i = 0; i < n; i++) this.spawnCritter(kd, sp);
      // banner
      this.banner.setText("Count the " + kd.plur + "!").setVisible(true).setScale(0.7);
      this.tweens.add({ targets: this.banner, scale: 1, duration: 220, ease: "Back.out" });
      this.bannerJp.setText("ぜんぶ インク で タグ して、かぞえてや！").setVisible(true);
      this.voice("en_" + kd.k);
      this.updateHud();
    }

    spawnCritter(kd, sp) {
      const x = Phaser.Math.Between(TANK.x0 + 40, TANK.x1 - 40), y = Phaser.Math.Between(TANK.y0 + 30, TANK.y1 - 30);
      const spr = this.add.image(x, y, kd.art).setScale(kd.sc).setDepth(12);
      if (kd.tint) spr.setTint(kd.tint);
      const ang = Phaser.Math.FloatBetween(0, Math.PI * 2), s = Phaser.Math.FloatBetween(0.7, 1.2) * sp;
      const c = { spr, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, tagged: false, splat: null, baseSc: kd.sc };
      this.tweens.add({ targets: spr, scaleY: kd.sc * 0.92, duration: 360, yoyo: true, repeat: -1, ease: "Sine.inOut" });   // wiggle
      this.critters.push(c);
    }

    onTap(p) {
      Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.state !== "play" || this.declaring || this.busy) return;
      // nearest untagged critter under the tap
      let best = null, bd = RAD * RAD;
      for (const c of this.critters) { if (c.tagged) continue; const dx = c.spr.x - p.x, dy = c.spr.y - p.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = c; } }
      if (!best) { Sfx.miss(); this.ripple(p.x, p.y); return; }
      this.tagCritter(best);
    }

    tagCritter(c) {
      c.tagged = true; this.tally++; this.updateHud();
      // tako fires an ink blob at the critter
      const blob = this.add.image(this.tako.x, this.tako.y - 40, "ink_blob").setScale(0.6).setDepth(18);
      Sfx.splat();
      this.tweens.add({ targets: this.tako, scaleX: 0.56, scaleY: 0.68, duration: 110, yoyo: true });
      this.tweens.add({ targets: blob, x: c.spr.x, y: c.spr.y, scale: 1, duration: 200, ease: "Quad.in", onComplete: () => {
        blob.destroy(); Sfx.tag();
        const sp = this.add.image(c.spr.x, c.spr.y, "ink_splat").setScale(0.2).setDepth(11).setAlpha(0.9).setTint(0x123a5e);
        this.tweens.add({ targets: sp, scale: c.baseSc * 1.15, duration: 220, ease: "Back.out" });
        c.splat = sp; c.spr.setTint(0x6f86a0);
        this.tweens.add({ targets: c.spr, scale: c.baseSc * 1.3, duration: 120, yoyo: true });
        if (this.tally >= this.target) this.time.delayedCall(360, () => this.askDeclare());
      } });
    }

    ripple(x, y) { const r = this.add.circle(x, y, 8, 0xffffff, 0).setStrokeStyle(3, 0xffffff, 0.7).setDepth(15); this.tweens.add({ targets: r, radius: 46, alpha: 0, duration: 360, onComplete: () => r.destroy() }); }

    // ---------- declaration ----------
    askDeclare() {
      if (this.declaring || this.state !== "play") return;
      this.declaring = true;
      this.banner.setText("How many " + this.kind.plur + "?").setVisible(true);
      this.bannerJp.setText("いくつ おった？ ただしい いいかた を えらんでや！").setVisible(true);
      const by = H - 250, bw = 320, bh = 96, gap = 28;
      this.declareObjs = [];
      const mk = (cx, label, sub, val) => {
        const bg = this.add.graphics().setDepth(34); bg.fillStyle(0x123a5e, 0.96); bg.fillRoundedRect(cx - bw / 2, by - bh / 2, bw, bh, 22); bg.lineStyle(5, 0x7fd0ff, 1); bg.strokeRoundedRect(cx - bw / 2, by - bh / 2, bw, bh, 22);
        const t1 = this.add.text(cx, by, label, { fontFamily: '"Baloo 2"', fontSize: "32px", color: "#fff", fontStyle: "800" }).setOrigin(0.5).setDepth(35).setStroke("#0a2d47", 5);
        const z = this.add.zone(cx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(36).on("pointerdown", () => this.choose(val));
        this.declareObjs.push(bg, t1, z);
      };
      // English-only labels (no JP count hint): the player must read There is / There are (A2).
      mk(W / 2 - (bw + gap) / 2, "There is", "", "is");
      mk(W / 2 + (bw + gap) / 2, "There are", "", "are");
    }
    clearDeclare() { if (this.declareObjs) { this.declareObjs.forEach((o) => o.destroy()); this.declareObjs = null; } }

    choose(val) {
      if (!this.declaring) return; this.declaring = false; this.busy = true;
      const correct = (this.target === 1) ? "is" : "are";
      this.clearDeclare();
      if (val === correct) {
        Sfx.good(); this.cameras.main.flash(160, 200, 240, 255);
        this.tweens.add({ targets: this.tako, scaleX: 0.7, scaleY: 0.7, duration: 160, yoyo: true, repeat: 2 });
        this.rewardDone = this.voice("there_" + this.target + "_" + this.kind.k);   // "There are four crabs."
        const say = (this.target === 1 ? "There is a " + this.kind.sing : "There are " + NUM[this.target] + " " + this.kind.plur) + ".";
        this.banner.setText(say).setVisible(true);
        this.bannerJp.setVisible(false);
        this.round++; this.updateHud();
        // hold the next round until the spoken sentence review has finished
        const reward = this.rewardDone || Promise.resolve(); this.rewardDone = null;
        const beat = new Promise((r) => this.time.delayedCall(700, r));
        Promise.all([reward, beat]).then(() => { this.sweepCritters(); if (this.round >= WIN_ROUNDS) this.win(); else this.time.delayedCall(300, () => this.newRound()); });
      } else {
        Sfx.bad(); this.cameras.main.shake(200, 0.01);
        this.tweens.add({ targets: this.tako, angle: 8, duration: 60, yoyo: true, repeat: 3 });
        this.lives--; this.updateHud();
        this.banner.setText(this.target === 1 ? "1ぴき は There is や！" : "たくさん は There are や！").setVisible(true);
        this.time.delayedCall(1400, () => { if (this.lives <= 0) this.lose(); else { this.busy = false; this.askDeclare(); } });
      }
    }

    sweepCritters() { this.critters.forEach((c) => { if (c.splat) c.splat.destroy(); this.tweens.add({ targets: c.spr, alpha: 0, y: c.spr.y - 40, duration: 300, onComplete: () => c.spr.destroy() }); }); this.critters = []; }

    update(time, delta) {
      const dt = Math.min(0.033, delta / 1000);
      for (const b of this.bubbles) { b.y -= b.vy * dt; if (b.y < -20) { b.y = H + 20; b.x = Phaser.Math.Between(0, W); } }
      if (this.state !== "play") return;
      for (const c of this.critters) {
        c.spr.x += c.vx * dt; c.spr.y += c.vy * dt;
        if (c.spr.x < TANK.x0) { c.spr.x = TANK.x0; c.vx = Math.abs(c.vx); }
        if (c.spr.x > TANK.x1) { c.spr.x = TANK.x1; c.vx = -Math.abs(c.vx); }
        if (c.spr.y < TANK.y0) { c.spr.y = TANK.y0; c.vy = Math.abs(c.vy); }
        if (c.spr.y > TANK.y1) { c.spr.y = TANK.y1; c.vy = -Math.abs(c.vy); }
        c.spr.setFlipX(c.vx < 0);
        if (c.splat) { c.splat.x = c.spr.x; c.splat.y = c.spr.y; }
      }
    }

    // ---------- end ----------
    flash(color, alpha) { const f = this.add.rectangle(0, 0, W, H, color, alpha).setOrigin(0).setDepth(50); this.tweens.add({ targets: f, alpha: 0, duration: 240, onComplete: () => f.destroy() }); }
    win() { this.state = "over"; if (window.KMEFlow) KMEFlow.win(); Sfx.win(); this.flash(0xfff2c4, 0.5); this.tweens.add({ targets: this.tako, scaleX: 0.74, scaleY: 0.74, duration: 180, yoyo: true, repeat: 3 }); this.time.delayedCall(700, () => this.panel("ようでけた！", "YOU WIN!")); }
    lose() { this.state = "over"; Sfx.lose(); this.cameras.main.shake(280, 0.012); this.time.delayedCall(500, () => this.panel("もういっぺん！", "GAME OVER")); }
    panel(jp, big) {
      const p = this.add.graphics().setDepth(60); p.fillStyle(0x0a2d47, 0.95); p.fillRoundedRect(W / 2 - 200, H / 2 - 150, 400, 300, 28); p.lineStyle(6, 0x7fd0ff, 1); p.strokeRoundedRect(W / 2 - 200, H / 2 - 150, 400, 300, 28);
      this.add.image(W / 2, H / 2 - 80, "tako").setScale(0.4).setDepth(61);
      this.add.text(W / 2, H / 2 - 6, big, { fontFamily: '"Baloo 2"', fontSize: "44px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5).setDepth(61).setStroke("#0a2d47", 6);
      this.add.text(W / 2, H / 2 + 42, jp, { fontFamily: '"Zen Maru Gothic"', fontSize: "26px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(61);
      const bw = 240, bh = 72, by = H / 2 + 108;
      const bg = this.add.graphics().setDepth(61); bg.fillStyle(0x3DBE6A, 1); bg.fillRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, 20); bg.lineStyle(5, 0x1F8A4C, 1); bg.strokeRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, 20);
      this.add.text(W / 2, by, "もう いちど ▶", { fontFamily: '"Zen Maru Gothic"', fontSize: "26px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#0a2d47", 5);
      this.add.zone(W / 2, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(63).on("pointerdown", () => this.scene.restart());
      this.tweens.add({ targets: bg, alpha: 0.65, duration: 700, yoyo: true, repeat: -1 });
    }

    // ---------- title / intro / voice ----------
    introNeeded() { try { return !localStorage.getItem("it_intro_seen"); } catch (e) { return true; } }
    markSeen() { try { localStorage.setItem("it_intro_seen", "1"); } catch (e) {} }
    voice(key, onEnd) { const p = window.KMEAudio ? KMEAudio.play(key) : Promise.resolve(); if (onEnd) p.then(onEnd); return p; }
    showTitle() {
      this.state = "title"; this.titleStarted = false;
      const dim = this.add.graphics().setDepth(60); dim.fillStyle(0x06243a, 0.5); dim.fillRect(0, 0, W, H);
      const host = this.add.image(W / 2, H * 0.34, "tako").setScale(0.9).setDepth(62);
      this.titleBob = this.tweens.add({ targets: host, y: H * 0.34 - 16, duration: 950, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.add.text(W / 2, H * 0.56, "インク タリー", { fontFamily: '"Baloo 2"', fontSize: "46px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5).setDepth(62).setStroke("#06243a", 7);
      this.add.text(W / 2, H * 0.56 + 46, "Ink Tally", { fontFamily: '"Baloo 2"', fontSize: "26px", color: "#bdeaff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#06243a", 5);
      const bw = 300, bh = 92, bx = W / 2, by = H * 0.73;
      const bg = this.add.graphics().setDepth(62); bg.fillStyle(0x2aa9d8, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26); bg.lineStyle(6, 0x16708f, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26);
      this.add.triangle(bx - 58, by, 0, 0, 26, 16, 0, 32, 0xffffff).setDepth(63);
      this.add.text(bx + 14, by, "あそぶ", { fontFamily: '"Zen Maru Gothic"', fontSize: "34px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(63).setStroke("#0a3a4a", 5);
      this.titlePulse = this.tweens.add({ targets: bg, alpha: 0.7, duration: 650, yoyo: true, repeat: -1 });
      this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(64).on("pointerdown", () => this.startFromTitle());
    }
    startFromTitle() {
      if (this.titleStarted) return; this.titleStarted = true; Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.titleBob) this.titleBob.stop(); if (this.titlePulse) this.titlePulse.stop();
      this.children.list.filter((o) => o.depth >= 60 && o.depth < 65).forEach((o) => o.destroy());
      if (this.introNeeded()) this.startIntro(); else { this.markSeen(); this.tako.setVisible(true); this.startPlay(); }
    }
    startIntro() {
      this.state = "intro";
      this.introDim = this.add.graphics().setDepth(45); this.introDim.fillStyle(0x06243a, 0.6); this.introDim.fillRect(0, 0, W, H);
      this.introBig = this.add.image(W / 2, H * 0.36, "tako").setScale(0.85).setDepth(47);
      this.introBob = this.tweens.add({ targets: this.introBig, y: H * 0.36 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const bx = W / 2, by = H * 0.62;
      this.introBg = this.add.graphics().setDepth(46); this.introBg.fillStyle(0xffffff, 0.97); this.introBg.fillRoundedRect(bx - 332, by - 104, 664, 208, 24); this.introBg.lineStyle(5, 0x0a2d47, 1); this.introBg.strokeRoundedRect(bx - 332, by - 104, 664, 208, 24);
      this.introText = this.add.text(bx, by, "まいど！ ワシ の いけす へ ようこそ や！\nおよいでる やつ を インク で タグ して、\nなんびき おるか かぞえるんや。\nそんで、1ぴき なら There is、\nぎょうさん なら There are で いうんやで！", { fontFamily: '"Zen Maru Gothic"', fontSize: "23px", color: "#0a2d47", fontStyle: "700", align: "center", lineSpacing: 7 }).setOrigin(0.5).setDepth(47);
      this.skipBtn = this.add.text(W - 56, 92, "スキップ", { fontFamily: '"Zen Maru Gothic"', fontSize: "24px", color: "#bdeaff", fontStyle: "700" }).setOrigin(1, 0.5).setDepth(48).setInteractive({ useHandCursor: true }).setStroke("#06243a", 5);
      this.skipChev = this.add.triangle(W - 34, 92, 0, 0, 18, 11, 0, 22, 0xffd24d).setDepth(48).setInteractive({ useHandCursor: true });
      let advanced = false; this.advIntro = () => { if (advanced) return; advanced = true; this.endIntro(); };
      this.skipBtn.on("pointerdown", this.advIntro); this.skipChev.on("pointerdown", this.advIntro);
      this.voice("ti_intro", this.advIntro);
      this.time.delayedCall(20000, this.advIntro);
    }
    endIntro() {
      this.markSeen();
      if (window.KMEAudio) KMEAudio.stopAll();
      [this.skipBtn, this.skipChev].forEach((o) => { if (o) o.destroy(); }); this.skipBtn = null; this.skipChev = null;
      if (this.introBob) this.introBob.stop();
      this.tweens.add({ targets: [this.introDim, this.introBg, this.introText], alpha: 0, duration: 420, onComplete: () => { [this.introDim, this.introBg, this.introText].forEach((o) => { if (o) o.destroy(); }); } });
      this.tweens.add({ targets: this.introBig, x: W / 2, y: H - 70, scaleX: 0.62, scaleY: 0.62, duration: 600, ease: "Cubic.inOut", onComplete: () => { if (this.introBig) { this.introBig.destroy(); this.introBig = null; } this.tako.setVisible(true); } });
      this.time.delayedCall(700, () => this.startPlay());
    }
  }

  let booted = false;
  function boot() { if (booted) return; booted = true; new Phaser.Game({ type: Phaser.CANVAS, parent: "game", backgroundColor: "#0e3f63", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: [Play] }); }
  if (document.fonts && document.fonts.load) { Promise.all([document.fonts.load('800 30px "Baloo 2"'), document.fonts.load('700 22px "Zen Maru Gothic"')]).then(boot, boot); setTimeout(boot, 1500); } else boot();
})();
