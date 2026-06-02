// Hump Bop (this / that / these / those) - Phaser 3. A desert Whack-a-Mole. temee the
// ancient Gobi camel watches the dunes; cheeky sandpups pop CLOSE (foreground, big) or FAR
// (up the dunes, small), as ONE or in a CLUSTER. Distance x number picks the word:
//   close+one = this | close+many = these | far+one = that | far+many = those
// Bop each popped critter with the matching word-mallet before it ducks. Reading the four
// English words + judging near/far and one/many IS the game. temee's old-man Japanese is
// how-to / reactions only (A2). The 2x2 word grid mirrors the grammar (near/far x one/many).
"use strict";
(function () {
  const W = 760, H = 1200;
  const WIN = 12, LIVES = 3;
  const NEAR_Y = 804, FAR_Y = 566;
  const NEAR = [{ x: 188 }, { x: 380 }, { x: 572 }];      // foreground holes (big, close)
  const FAR = [{ x: 150 }, { x: 326 }, { x: 470 }, { x: 642 }];   // dune holes (small, far)
  const NEAR_S = 0.96, FAR_S = 0.58;
  const TINTS = [0xffffff, 0xf3b977, 0xe7d2a6, 0xefa766, 0xd9c08c];
  const wordFor = (near, many) => near ? (many ? "these" : "this") : (many ? "those" : "that");

  const Sfx = {
    ctx: null,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    tone(f0, f1, dur, type, gain) { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); g.gain.setValueAtTime(gain || 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur); },
    noise(dur, gain, freq) { if (!this.ctx) return; const t = this.ctx.currentTime, b = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 1200; const g = this.ctx.createGain(); g.gain.setValueAtTime(gain || 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(this.ctx.destination); s.start(t); s.stop(t + dur); },
    pop() { this.tone(380, 720, 0.12, "sine", 0.14); this.noise(0.06, 0.08, 2200); },
    bop() { this.noise(0.05, 0.22, 1400); this.tone(220, 90, 0.16, "square", 0.12); },
    good() { [0, 80].forEach((d, i) => setTimeout(() => this.tone(620 + i * 220, 1000 + i * 220, 0.15, "triangle", 0.15), d)); },
    bad() { this.tone(330, 120, 0.34, "sawtooth", 0.14); },
    win() { [0, 120, 240, 380].forEach((d, i) => setTimeout(() => this.tone(560 + i * 150, 940 + i * 150, 0.2, "triangle", 0.16), d)); },
    lose() { this.tone(420, 100, 0.5, "sawtooth", 0.16); }
  };

  class Play extends Phaser.Scene {
    constructor() { super("play"); }
    preload() {
      this.load.svg("temee", "assets/temee.svg", { width: 232, height: 196 });   // canonical art, viewBox 760x640
      this.load.svg("pup", "assets/pup.svg", { width: 110, height: 114 });
      this.load.svg("mallet", "assets/mallet.svg", { width: 132, height: 154 });
      this.load.svg("heart", "assets/heart.svg", { width: 46, height: 42 });
      ["p_star", "p_spark", "p_puff"].forEach((k) => this.load.svg(k, "assets/" + k + ".svg", { width: 46, height: 46 }));
    }
    create() {
      this.time.removeAllEvents();   // restart-safety: drop any timers left from a prior run
      this.cleared = 0; this.lives = LIVES; this.combo = 0; this.voices = {}; this.playStarted = false;
      this.targets = []; this.busyTap = false; this.holes = []; this.spawnEv = null;
      if (window.KMEAudio) { KMEAudio.setBase("assets/").stopAll(); KMEAudio.register(["en_this", "en_that", "en_these", "en_those", "te_yes", "te_no", "ti_intro"]); }

      this.buildBackdrop();
      this.buildField();
      this.buildHud();
      this.buildButtons();
      this.temee = this.add.image(86, 150, "temee").setScale(0.6).setDepth(40).setVisible(false);
      this.mallet = this.add.image(0, 0, "mallet").setOrigin(0.5, 1).setDepth(38).setVisible(false);

      const q = new URLSearchParams(location.search);
      if (q.has("cap")) { this.cap = true; this.markSeen(); this.temee.setVisible(true); this.capSetup(q); }
      else this.showTitle();
    }

    buildBackdrop() {
      if (!this.textures.exists("hbbg")) {
        const tex = this.textures.createCanvas("hbbg", W, H), cx = tex.getContext();
        const g = cx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "#3a2a6e"); g.addColorStop(0.34, "#7a4a86"); g.addColorStop(0.5, "#d98a5a"); g.addColorStop(0.62, "#e8a85e"); g.addColorStop(1, "#caa05c");
        cx.fillStyle = g; cx.fillRect(0, 0, W, H);
        // low sun glow
        const sun = cx.createRadialGradient(W / 2, 360, 20, W / 2, 360, 340); sun.addColorStop(0, "rgba(255,236,170,0.85)"); sun.addColorStop(1, "rgba(255,210,140,0)");
        cx.fillStyle = sun; cx.fillRect(0, 0, W, H);
        const sd = cx.createRadialGradient(W / 2, 360, 8, W / 2, 360, 76); sd.addColorStop(0, "#fff4cc"); sd.addColorStop(0.66, "#ffe6a8"); sd.addColorStop(1, "rgba(255,230,168,0)");
        cx.fillStyle = sd; cx.beginPath(); cx.arc(W / 2, 360, 76, 0, Math.PI * 2); cx.fill();
        // dune bands (far -> near)
        const dune = (y, h, c) => { cx.fillStyle = c; cx.beginPath(); cx.moveTo(0, y + 30); cx.quadraticCurveTo(W * 0.3, y - 30, W * 0.58, y + 18); cx.quadraticCurveTo(W * 0.85, y + 54, W, y + 8); cx.lineTo(W, y + h); cx.lineTo(0, y + h); cx.closePath(); cx.fill(); };
        dune(470, 760, "#c98a52"); dune(620, 620, "#bd7c46"); dune(720, 520, "#a86a3a");
        tex.refresh();
      }
      if (!this.textures.exists("hole")) {
        const t = this.textures.createCanvas("hole", 174, 104), c = t.getContext();
        c.fillStyle = "#8a5a30"; c.beginPath(); c.ellipse(87, 58, 82, 40, 0, 0, Math.PI * 2); c.fill();   // mound rim
        const rg = c.createRadialGradient(87, 48, 4, 87, 52, 70); rg.addColorStop(0, "#190d06"); rg.addColorStop(0.62, "#3a2412"); rg.addColorStop(1, "#5e3c1f");
        c.fillStyle = rg; c.beginPath(); c.ellipse(87, 50, 66, 33, 0, 0, Math.PI * 2); c.fill();           // dark mouth
        c.strokeStyle = "rgba(255,226,170,0.5)"; c.lineWidth = 4; c.beginPath(); c.ellipse(87, 44, 64, 29, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();   // lit upper rim
        t.refresh();
      }
      this.add.image(0, 0, "hbbg").setOrigin(0).setDepth(0);
      // a few slow heat-shimmer motes
      for (let i = 0; i < 8; i++) { const m = this.add.image(Phaser.Math.Between(20, W - 20), Phaser.Math.Between(380, 720), "p_spark").setScale(Phaser.Math.FloatBetween(0.16, 0.32)).setAlpha(0.18).setTint(0xffe6b0).setDepth(2); this.tweens.add({ targets: m, y: m.y - Phaser.Math.Between(30, 70), alpha: 0.03, duration: Phaser.Math.Between(4000, 7000), delay: Phaser.Math.Between(0, 2500), repeat: -1, yoyo: true, ease: "Sine.inOut" }); }
    }
    buildField() {
      const ao = this.add.graphics().setDepth(3);
      const place = (x, y, s, near) => {
        ao.fillStyle(0x190c04, 0.22); ao.fillEllipse(x, y + 16 * s, 184 * s, 44 * s);   // contact shadow on the sand
        this.add.image(x, y, "hole").setScale(s).setDepth(4);
        this.holes.push({ x: x, y: y, near: near, scale: s, occupied: null });
      };
      FAR.forEach((h) => place(h.x, FAR_Y, FAR_S, false));
      NEAR.forEach((h) => place(h.x, NEAR_Y, NEAR_S, true));
    }
    buildHud() {
      const bar = this.add.graphics().setDepth(31); bar.fillStyle(0x2a1838, 0.82); bar.fillRoundedRect(8, 8, W - 16, 50, 16);
      this.hud = this.add.text(20, 17, "", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "23px", color: "#ffe08a", fontStyle: "700" }).setDepth(32);
      this.hearts = []; for (let i = 0; i < LIVES; i++) this.hearts.push(this.add.image(W - 30 - i * 46, 33, "heart").setOrigin(1, 0.5).setDepth(32));
      this.hudObjs = [bar, this.hud].concat(this.hearts);
      this.updateHud();
    }
    updateHud() { this.hud.setText("ボップ " + this.cleared + " / " + WIN); this.hearts.forEach((h, i) => { const on = i < this.lives; h.setTint(on ? 0xffffff : 0x6a5040).setAlpha(on ? 1 : 0.5); }); }

    buildButtons() {
      const WB = 224, HB = 100, cx0 = W / 2 - 120, cx1 = W / 2 + 120, cy0 = 1008, cy1 = 1116;
      const cells = [{ x: cx0, y: cy0 }, { x: cx1, y: cy0 }, { x: cx0, y: cy1 }, { x: cx1, y: cy1 }];
      // SHUFFLE the four words across the four cells each game: position is not a cue, so the
      // kid must READ this/that/these/those (the only answer signal; A2).
      const words = Phaser.Utils.Array.Shuffle(["this", "these", "that", "those"]);
      this.btns = {};
      words.forEach((w, i) => {
        const c = cells[i];
        const g = this.add.graphics().setDepth(33);
        g.fillGradientStyle(0x4c3270, 0x4c3270, 0x2e1a48, 0x2e1a48, 1); g.fillRoundedRect(c.x - WB / 2, c.y - HB / 2, WB, HB, 20);
        g.lineStyle(5, 0xffd24d, 1); g.strokeRoundedRect(c.x - WB / 2, c.y - HB / 2, WB, HB, 20);
        this.add.text(c.x, c.y, w, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "42px", color: "#fff", fontStyle: "800" }).setOrigin(0.5).setDepth(34).setStroke("#2a1838", 6);
        this.add.zone(c.x, c.y, WB, HB).setInteractive({ useHandCursor: true }).setDepth(35).on("pointerdown", () => { Sfx.init(); this.onWord(w); this.pressFx(g); });
        this.btns[w] = { g: g, x: c.x, y: c.y };
      });
    }
    pressFx(g) { this.tweens.add({ targets: g, alpha: 0.6, duration: 70, yoyo: true }); }

    // ---------- whack-a-mole engine ----------
    stayMs() { return Math.max(1150, 2500 - this.cleared * 105); }
    spawnMs() { return Math.max(620, 1380 - this.cleared * 62); }
    activeCap() { return 1; }   // one critter (single or cluster) at a time; difficulty ramps via speed, not count

    spawnLoop() {
      if (this.state !== "play") return;
      this.trySpawn();
      this.spawnEv = this.time.delayedCall(this.spawnMs(), () => this.spawnLoop());
    }
    trySpawn() {
      if (this.targets.length >= this.activeCap()) return;
      const used = new Set(this.targets.map((t) => t.word)), opts = [];
      [[true, false], [true, true], [false, false], [false, true]].forEach(([near, many]) => {
        const word = wordFor(near, many);
        if (used.has(word)) return;
        const free = this.holes.filter((h) => h.near === near && !h.occupied);
        if (free.length) opts.push({ near, many, word, free });
      });
      if (!opts.length) return;
      const o = Phaser.Utils.Array.GetRandom(opts);
      this.makeTarget(o.near, o.many, o.word, Phaser.Utils.Array.GetRandom(o.free));
    }
    makeTarget(near, many, word, hole) {
      const n = many ? Phaser.Math.Between(2, 3) : 1, s = hole.scale, sprites = [];
      const spread = many ? 30 * s : 0;
      for (let i = 0; i < n; i++) {
        const ox = n === 1 ? 0 : (i - (n - 1) / 2) * spread;
        const restY = hole.y - 30 * s, sp = this.add.image(hole.x + ox, hole.y + 12 * s, "pup").setOrigin(0.5, 1).setScale(s * 0.4).setDepth(hole.near ? 22 : 12).setAlpha(hole.near ? 1 : 0.86).setTint(Phaser.Utils.Array.GetRandom(TINTS));
        this.tweens.add({ targets: sp, y: restY, scaleX: s, scaleY: s, duration: 200, ease: "Back.out", delay: i * 50 });
        this.tweens.add({ targets: sp, y: restY - 5 * s, duration: 520, yoyo: true, repeat: -1, delay: 200 + i * 60, ease: "Sine.inOut" });
        sprites.push(sp);
      }
      const puff = this.add.image(hole.x, hole.y, "p_puff").setScale(s * 0.5).setAlpha(0.7).setDepth(hole.near ? 21 : 11).setTint(0xe8c98a);
      this.tweens.add({ targets: puff, scale: s * 1.1, alpha: 0, duration: 320, onComplete: () => puff.destroy() });
      Sfx.pop();
      const target = { near, many, word, hole, sprites, bopped: false };
      hole.occupied = target; this.targets.push(target);
      target.ev = this.time.delayedCall(this.stayMs(), () => this.duckTarget(target, true));
    }
    duckTarget(target, missed) {
      if (target.bopped) return;
      target.bopped = true; if (target.ev) target.ev.remove();
      this.targets = this.targets.filter((t) => t !== target); target.hole.occupied = null;
      target.sprites.forEach((sp) => { this.tweens.killTweensOf(sp); this.tweens.add({ targets: sp, y: target.hole.y + 14 * target.hole.scale, scaleX: target.hole.scale * 0.4, scaleY: target.hole.scale * 0.3, alpha: 0, duration: 200, ease: "Quad.in", onComplete: () => sp.destroy() }); });
      if (missed) { this.combo = 0; if (this.temee && this.state === "play") this.tweens.add({ targets: this.temee, angle: 6, duration: 90, yoyo: true }); }
    }
    onWord(w) {
      if (this.state !== "play" || this.busyTap) return;
      const match = this.targets.filter((t) => !t.bopped && t.word === w);
      if (match.length) { this.bopTarget(match[0]); return; }
      const live = this.targets.filter((t) => !t.bopped);
      if (live.length) this.wrongTap(w); else this.whiff(w);
    }
    bopTarget(target) {
      target.bopped = true; if (target.ev) target.ev.remove();
      this.targets = this.targets.filter((t) => t !== target);
      const hole = target.hole, s = hole.scale;
      this.swingMallet(hole.x, hole.y - 36 * s, hole.near);
      this.time.delayedCall(150, () => {
        Sfx.bop();
        target.sprites.forEach((sp, i) => { this.tweens.killTweensOf(sp); this.tweens.add({ targets: sp, scaleX: s * 1.2, scaleY: s * 0.5, duration: 90, yoyo: true, onComplete: () => this.tweens.add({ targets: sp, y: hole.y + 14 * s, scale: s * 0.3, alpha: 0, duration: 180, ease: "Quad.in", onComplete: () => sp.destroy() }) }); this.burst(sp.x, sp.y - 20 * s); });
        hole.occupied = null;
        Sfx.good(); this.voice("en_" + target.word);
        this.combo++; this.cleared++; this.updateHud();
        this.toast(this.combo >= 3 ? "ほっほ！ x" + this.combo : "ナイス！", "#ffe08a", hole.x, hole.y - 70 * s);
        if (this.temee) this.tweens.add({ targets: this.temee, scaleX: 0.66, scaleY: 0.66, duration: 130, yoyo: true });
        if (this.cleared >= WIN) this.win();
      });
    }
    wrongTap(w) {
      Sfx.bad(); this.lives--; this.updateHud(); this.cameras.main.shake(160, 0.008); this.combo = 0;
      if (this.temee) this.tweens.add({ targets: this.temee, angle: -8, duration: 70, yoyo: true, repeat: 2 });
      this.toast("ちがうぞい！", "#ff9a9a", W / 2, 360);
      this.voice("te_no");
      this.busyTap = true; this.time.delayedCall(520, () => { this.busyTap = false; });
      if (this.lives <= 0) this.lose();
    }
    whiff(w) { Sfx.noise(0.05, 0.06, 900); const b = this.btns[w]; if (b) { const p = this.add.image(b.x, b.y - 60, "p_puff").setScale(0.4).setAlpha(0.5).setTint(0xcaa46a).setDepth(36); this.tweens.add({ targets: p, scale: 0.7, alpha: 0, duration: 260, onComplete: () => p.destroy() }); } }
    swingMallet(x, y, near) {
      const m = this.mallet; m.setVisible(true).setPosition(x + 54, y - 30).setScale(near ? 0.92 : 0.66).setAngle(-58).setAlpha(1).setDepth(near ? 30 : 20);
      this.tweens.add({ targets: m, angle: 8, duration: 130, ease: "Quad.in", onComplete: () => { this.tweens.add({ targets: m, angle: -40, alpha: 0, duration: 200, delay: 60, ease: "Quad.out", onComplete: () => m.setVisible(false) }); } });
    }
    burst(x, y) { for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2, p = this.add.image(x, y, i % 2 ? "p_star" : "p_spark").setScale(0.4).setTint(0xffd24d).setDepth(37); this.tweens.add({ targets: p, x: x + Math.cos(a) * 44, y: y + Math.sin(a) * 44, scale: 0.1, alpha: 0, duration: 360, ease: "Quad.out", onComplete: () => p.destroy() }); } }
    toast(txt, color, x, y) { const t = this.add.text(x, y, txt, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "32px", color: color, fontStyle: "800" }).setOrigin(0.5).setDepth(47).setStroke("#2a1838", 6).setScale(0.6); this.tweens.add({ targets: t, scale: 1, y: y - 26, duration: 240, ease: "Back.out", yoyo: true, hold: 360, onComplete: () => t.destroy() }); }

    // ---------- title / intro / voice ----------
    introNeeded() { try { return !localStorage.getItem("hb_intro_seen"); } catch (e) { return true; } }
    markSeen() { try { localStorage.setItem("hb_intro_seen", "1"); } catch (e) {} }
    showTitle() {
      this.state = "title"; this.titleStarted = false;
      if (this.hudObjs) this.hudObjs.forEach((o) => o.setVisible(false));
      const dim = this.add.graphics().setDepth(60); dim.fillStyle(0x2a1838, 0.5); dim.fillRect(0, 0, W, H);
      const host = this.add.image(W / 2, H * 0.33, "temee").setScale(1.25).setDepth(62);
      this.titleBob = this.tweens.add({ targets: host, y: H * 0.33 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.add.text(W / 2, H * 0.55, "ハンプ ボップ", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "44px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5).setDepth(62).setStroke("#2a1838", 7);
      this.add.text(W / 2, H * 0.55 + 46, "Hump Bop", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "26px", color: "#fff2d8", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#2a1838", 5);
      const bw = 300, bh = 92, bx = W / 2, by = H * 0.72;
      const bg = this.add.graphics().setDepth(62); bg.fillStyle(0xff8a3d, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26); bg.lineStyle(6, 0xb85a18, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26);
      this.add.triangle(bx - 58, by, 0, 0, 26, 16, 0, 32, 0xffffff).setDepth(63);
      this.add.text(bx + 14, by, "あそぶ", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "34px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(63).setStroke("#2a1838", 5);
      this.titlePulse = this.tweens.add({ targets: bg, alpha: 0.7, duration: 650, yoyo: true, repeat: -1 });
      this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(64).on("pointerdown", () => this.startFromTitle());
    }
    startFromTitle() {
      if (this.titleStarted) return; this.titleStarted = true; Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.titleBob) this.titleBob.stop(); if (this.titlePulse) this.titlePulse.stop();
      this.children.list.filter((o) => o.depth >= 60 && o.depth < 65).forEach((o) => o.destroy());
      if (this.introNeeded()) this.startIntro(); else { this.markSeen(); this.temee.setVisible(true); this.startPlay(); }
    }
    startIntro() {
      this.state = "intro";
      this.introDim = this.add.graphics().setDepth(45); this.introDim.fillStyle(0x2a1838, 0.62); this.introDim.fillRect(0, 0, W, H);
      this.introBig = this.add.image(W / 2, H * 0.36, "temee").setScale(1.35).setDepth(47);
      this.introBob = this.tweens.add({ targets: this.introBig, y: H * 0.36 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const bx = W / 2, by = H * 0.62;
      this.introBg = this.add.graphics().setDepth(46); this.introBg.fillStyle(0xfff6e8, 0.97); this.introBg.fillRoundedRect(bx - 336, by - 116, 672, 232, 24); this.introBg.lineStyle(5, 0xb85a18, 1); this.introBg.strokeRoundedRect(bx - 336, by - 116, 672, 232, 24); this.introBg.fillTriangle(bx - 18, by + 114, bx + 18, by + 114, bx, by + 144);
      this.introText = this.add.text(bx, by, "ほっほ！ わし は ティメー、さばく の ながおい じゃ。\nすな から わんぱくもの が でるぞい。\nちかく は this（ひとつ）these（たくさん）、\nとおく は that（ひとつ）those（たくさん）。\nただしい コトバ の ツチ で たたくのじゃ！", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "23px", color: "#3a2410", fontStyle: "700", align: "center", lineSpacing: 7 }).setOrigin(0.5).setDepth(47);
      this.skipBtn = this.add.text(W - 56, 92, "スキップ", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "24px", color: "#fff2d8", fontStyle: "700" }).setOrigin(1, 0.5).setDepth(48).setInteractive({ useHandCursor: true }).setStroke("#2a1838", 5);
      this.skipChev = this.add.triangle(W - 34, 92, 0, 0, 18, 11, 0, 22, 0xffd24d).setDepth(48).setInteractive({ useHandCursor: true });
      let advanced = false; this.advIntro = () => { if (advanced) return; advanced = true; this.endIntro(); };
      this.skipBtn.on("pointerdown", this.advIntro); this.skipChev.on("pointerdown", this.advIntro);
      this.voice("ti_intro", this.advIntro);   // advances when the clip actually ends
      this.time.delayedCall(20000, this.advIntro);   // safety net if audio is blocked
    }
    endIntro() {
      this.markSeen();
      if (window.KMEAudio) KMEAudio.stopAll();
      [this.skipBtn, this.skipChev].forEach((o) => { if (o) o.destroy(); }); this.skipBtn = null; this.skipChev = null;
      if (this.introBob) this.introBob.stop();
      this.tweens.add({ targets: [this.introDim, this.introBg, this.introText], alpha: 0, duration: 420, onComplete: () => { [this.introDim, this.introBg, this.introText].forEach((o) => { if (o) o.destroy(); }); } });
      this.tweens.add({ targets: this.introBig, x: 86, y: 150, scaleX: 0.6, scaleY: 0.6, duration: 600, ease: "Cubic.inOut", onComplete: () => { if (this.introBig) { this.introBig.destroy(); this.introBig = null; } this.temee.setVisible(true); } });
      this.time.delayedCall(700, () => this.startPlay());
    }
    voice(key, onEnd) {
      const p = window.KMEAudio ? KMEAudio.play(key) : Promise.resolve();
      if (onEnd) p.then(onEnd);
      return p;
    }
    startPlay() { if (this.playStarted) return; this.playStarted = true; this.state = "play"; if (this.hudObjs) this.hudObjs.forEach((o) => o.setVisible(true)); this.time.delayedCall(400, () => this.spawnLoop()); }

    win() { this.state = "over"; if (window.KMEFlow) KMEFlow.win(); if (this.spawnEv) this.spawnEv.remove(); Sfx.win(); this.flash(0xfff2c4, 0.5); this.voice("te_yes"); this.tweens.add({ targets: this.temee, scaleX: 0.7, scaleY: 0.7, duration: 180, yoyo: true, repeat: 3 }); this.time.delayedCall(700, () => this.panel("みごと じゃ！", "YOU WIN!")); }
    lose() { this.state = "over"; if (this.spawnEv) this.spawnEv.remove(); Sfx.lose(); this.cameras.main.shake(280, 0.012); this.time.delayedCall(500, () => this.panel("まだまだ じゃ！", "GAME OVER")); }
    flash(color, alpha) { const f = this.add.rectangle(0, 0, W, H, color, alpha).setOrigin(0).setDepth(50); this.tweens.add({ targets: f, alpha: 0, duration: 240, onComplete: () => f.destroy() }); }
    panel(titleJp, big) {
      const cy = H * 0.42;
      const p = this.add.graphics().setDepth(70); p.fillStyle(0x2a1838, 0.96); p.fillRoundedRect(W / 2 - 230, cy - 140, 460, 320, 28); p.lineStyle(6, 0xffd24d, 1); p.strokeRoundedRect(W / 2 - 230, cy - 140, 460, 320, 28);
      this.add.text(W / 2, cy - 76, titleJp, { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "38px", color: "#fff7f0", fontStyle: "700" }).setOrigin(0.5).setDepth(71).setStroke("#2a1838", 7);
      this.add.text(W / 2, cy + 2, big, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "52px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5).setDepth(71).setStroke("#2a1838", 7);
      const bw = 280, bh = 80, bx = W / 2, by = cy + 100;
      const bg = this.add.graphics().setDepth(71); bg.fillStyle(0xff8a3d, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 24); bg.lineStyle(5, 0xb85a18, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 24);
      this.add.text(bx - 16, by, "もう いちど", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "30px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(72).setStroke("#2a1838", 5);
      this.add.triangle(bx + 88, by, 0, 0, 20, 12, 0, 24, 0xffffff).setDepth(72);
      this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(73).on("pointerdown", () => this.scene.restart());
      this.tweens.add({ targets: bg, alpha: 0.7, duration: 700, yoyo: true, repeat: -1 });
    }

    capSetup(q) {
      this.state = "play"; this.playStarted = true;
      // place one target per word for a deterministic showcase frame
      const want = (q.get("acts") ? q.get("acts").split(",") : ["this", "these", "that", "those"]);
      want.forEach((w) => {
        let near, many;
        if (w === "this") { near = true; many = false; } else if (w === "these") { near = true; many = true; }
        else if (w === "that") { near = false; many = false; } else if (w === "those") { near = false; many = true; } else return;
        const free = this.holes.filter((h) => h.near === near && !h.occupied);
        if (free.length) this.makeTarget(near, many, w, Phaser.Utils.Array.GetRandom(free));
      });
    }
  }

  let booted = false;
  function boot() { if (booted) return; booted = true; new Phaser.Game({ type: Phaser.CANVAS, parent: "game", backgroundColor: "#2a1838", audio: { disableWebAudio: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: [Play] }); }
  if (document.fonts && document.fonts.load) { Promise.all([document.fonts.load('800 44px "Baloo 2"'), document.fonts.load('700 24px "Zen Maru Gothic"')]).then(boot, boot); setTimeout(boot, 1800); } else boot();
})();
