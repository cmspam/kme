// Fluff Hug (plurals, reg + irreg) - Phaser 3. pamp (plushie collector) tosses fluff animals
// into the air; swipe over one and her long arm reels it in for a big squeeze ("ぎゅ〜♡") into
// her collection cage. Her order is ENGLISH ONLY: "a cat" = hug EXACTLY ONE, "cats" = hug them
// ALL. The wave always holds several, so the child cannot count by sight; the plural -s /
// irregular form is the only cue. Irregulars (sheep, fish, mouse->mice) are gold "tricky"
// rounds. Never hug the grumpy burr-bomb (it is prickly). The Japanese is how-to / banter only
// and never reveals which order is singular or plural (A2).
"use strict";
(function () {
  const W = 760, H = 1200;
  const GRAV = 1550;                 // px/s^2, pulls tossed fluffs back down
  const FR = 46, PAD = 16;           // fluff radius + slice forgiveness
  const LIVES = 3, WIN = 8;
  const PAMPY = H - 64;
  const CAGE = { x: W - 94, y: H - 158, w: 150, h: 168 };   // pampam's collection cage (bottom-right)

  // kind -> { sing: singular order, plur: plural order, irr: irregular? }
  const KINDS = {
    cat:   { sing: "a cat",   plur: "cats",  irr: false },
    dog:   { sing: "a dog",   plur: "dogs",  irr: false },
    bird:  { sing: "a bird",  plur: "birds", irr: false },
    sheep: { sing: "a sheep", plur: "sheep", irr: true  },
    fish:  { sing: "a fish",  plur: "fish",  irr: true  },
    mouse: { sing: "a mouse", plur: "mice",  irr: true  }
  };
  const KEYS = Object.keys(KINDS);
  // filename-safe audio key for an order phrase
  const voiceKey = (s) => "en_" + s.replace(/\s+/g, "_");

  const Sfx = {
    ctx: null,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    tone(f0, f1, dur, type, gain) { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); g.gain.setValueAtTime(gain || 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur); },
    noise(dur, gain, freq) { if (!this.ctx) return; const t = this.ctx.currentTime, b = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 800; const g = this.ctx.createGain(); g.gain.setValueAtTime(gain || 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(this.ctx.destination); s.start(t); s.stop(t + dur); },
    toss() { this.tone(300, 760, 0.16, "sine", 0.06); },
    pop() { this.tone(720, 1180, 0.10, "triangle", 0.16); this.noise(0.07, 0.05, 2600); },
    squee() { this.tone(680, 1500, 0.55, "sine", 0.10); this.tone(1150, 1560, 0.4, "triangle", 0.05); },
    combo() { this.tone(680, 1320, 0.16, "triangle", 0.18); this.tone(1020, 1500, 0.12, "sine", 0.1); },
    chime() { this.tone(560, 880, 0.14, "sine", 0.12); this.tone(880, 1180, 0.16, "sine", 0.08); },
    boom() { this.noise(0.45, 0.4, 1400); this.tone(220, 60, 0.4, "sawtooth", 0.2); },
    bad() { this.tone(360, 140, 0.3, "square", 0.14); },
    win() { [0, 120, 240, 380].forEach((d, i) => setTimeout(() => this.tone(620 + i * 160, 980 + i * 160, 0.2, "triangle", 0.16), d)); },
    lose() { this.tone(420, 120, 0.5, "sawtooth", 0.16); }
  };

  class Play extends Phaser.Scene {
    constructor() { super("play"); }
    preload() {
      KEYS.forEach((k) => this.load.svg(k, "assets/" + k + ".svg", { width: 100, height: 103 }));
      this.load.svg("bomb", "assets/bomb.svg", { width: 100, height: 103 });
      this.load.svg("pamp", "assets/pamp.svg", { width: 220, height: 185 });
      this.load.svg("heart", "assets/heart.svg", { width: 48, height: 44 });
      this.load.svg("chevron", "assets/chevron.svg", { width: 30, height: 30 });
      this.load.svg("p_star", "assets/p_star.svg", { width: 44, height: 44 });
      this.load.svg("p_spark", "assets/p_spark.svg", { width: 44, height: 44 });
      this.load.svg("p_puff", "assets/p_puff.svg", { width: 48, height: 48 });
      this.load.svg("p_ring", "assets/p_ring.svg", { width: 60, height: 60 });
    }
    create() {
      this.cleared = 0; this.lives = LIVES; this.fluffs = []; this.voices = {};
      this.trail = []; this.down = false; this.lastX = 0; this.lastY = 0;
      this.resolved = true; this.volleyDone = true; this.order = null;
      this.playStarted = false; this.arms = []; this.caged = [];   // restart-safe (scene.restart reuses the instance)
      if (window.KMEAudio) { KMEAudio.setBase("assets/").stopAll(); KMEAudio.register(["en_a_cat", "en_a_dog", "en_a_bird", "en_a_fish", "en_a_sheep", "en_a_mouse", "en_cats", "en_dogs", "en_birds", "en_fish", "en_sheep", "en_mice", "fs_intro"]); }
      this.deck = Phaser.Utils.Array.Shuffle(KEYS.flatMap((k) => [{ k, plural: false }, { k, plural: true }]));
      this.di = 0;

      this.buildBackground();
      this.pamp = this.add.image(W / 2, PAMPY, "pamp").setOrigin(0.5, 1).setDepth(8).setVisible(false);
      this.pampHome = { y: PAMPY };
      this.buildCage();
      this.buildHud();
      this.buildOrderBanner();
      this.wandGlow = this.add.graphics().setDepth(39).setBlendMode(Phaser.BlendModes.ADD);
      this.wand = this.add.graphics().setDepth(40);
      this.wandTip = this.add.image(0, 0, "p_spark").setDepth(41).setVisible(false);

      this.input.on("pointerdown", (p) => { Sfx.init(); this.onDown(p); });
      this.input.on("pointermove", (p) => this.onMove(p));
      this.input.on("pointerup", () => { this.down = false; });

      const q = new URLSearchParams(location.search);
      if (q.has("cap")) { this.cap = true; this.markSeen(); this.pamp.setVisible(true); this.capFrame(q); }
      else this.showTitle();   // PLAY button: its tap unlocks audio so pampam speaks on the intro
    }

    buildBackground() {
      if (!this.textures.exists("fsbg")) {
        const tex = this.textures.createCanvas("fsbg", W, H), cx = tex.getContext();
        const g = cx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#6a4f9e"); g.addColorStop(0.45, "#4a3a82"); g.addColorStop(1, "#2a2150");
        cx.fillStyle = g; cx.fillRect(0, 0, W, H);
        // soft confetti dots
        cx.globalAlpha = 0.10; const cols = ["#ffd2ec", "#cfe0ff", "#fff2c4", "#d7ffe6"];
        for (let i = 0; i < 60; i++) { cx.fillStyle = cols[i % 4]; cx.beginPath(); cx.arc((i * 137) % W, (i * 219) % H, 3 + (i % 3), 0, 7); cx.fill(); }
        cx.globalAlpha = 1; const v = cx.createRadialGradient(W / 2, H * 0.42, H * 0.2, W / 2, H * 0.42, H * 0.62); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(20,12,40,0.5)"); cx.fillStyle = v; cx.fillRect(0, 0, W, H);
        tex.refresh();
      }
      this.add.image(0, 0, "fsbg").setOrigin(0).setDepth(0);
      // a soft "stage" mound pamp sits on, with a gradient lip so it is not flat clipart
      const m = this.add.graphics().setDepth(6); m.fillStyle(0x4a3a82, 1); m.fillEllipse(W / 2, H + 64, W * 1.18, 280); m.fillStyle(0x5a478f, 0.7); m.fillEllipse(W / 2, H + 52, W * 1.04, 250); m.fillStyle(0x6a4f9e, 0.5); m.fillEllipse(W / 2, H + 44, W * 0.88, 220);
      // drifting ambient twinkles so the field reads as a magical stage, not dead space
      this.ambient = []; for (let i = 0; i < 9; i++) { const s = this.add.image(Phaser.Math.Between(30, W - 30), Phaser.Math.Between(200, H - 220), i % 2 ? "p_spark" : "p_star").setDepth(2).setScale(Phaser.Math.FloatBetween(0.18, 0.4)).setAlpha(0.16).setAngle(Phaser.Math.Between(0, 360)); s.av = Phaser.Math.FloatBetween(6, 16); this.ambient.push(s); }
    }

    buildHud() {
      const bar = this.add.graphics().setDepth(29); bar.fillStyle(0x241b48, 0.92); bar.fillRoundedRect(8, 8, W - 16, 56, 18);
      this.hud = this.add.text(20, 20, "", { fontFamily: '"Baloo 2"', fontSize: "28px", color: "#FFE08A", fontStyle: "800" }).setDepth(30);
      this.hearts = []; for (let i = 0; i < LIVES; i++) { const h = this.add.image(W - 32 - i * 50, 36, "heart").setOrigin(1, 0.5).setDepth(30); this.hearts.push(h); }
      this.updateHud();
    }
    updateHud() {
      this.hud.setText("集 " + this.cleared + " / " + WIN);
      this.hearts.forEach((h, i) => { const on = i < this.lives; h.setTint(on ? 0xffffff : 0x4a3e66).setAlpha(on ? 1 : 0.55); });
    }

    buildOrderBanner() {
      this.orderBg = this.add.graphics().setDepth(20);
      this.orderT = this.add.text(W / 2, 112, "", { fontFamily: '"Baloo 2"', fontSize: "62px", color: "#fff", fontStyle: "800" }).setOrigin(0.5).setDepth(22).setStroke("#3a2060", 8);
      this.orderHint = this.add.text(W / 2, 168, "", { fontFamily: '"Zen Maru Gothic"', fontSize: "24px", color: "#ffe08a", fontStyle: "700" }).setOrigin(0.5).setDepth(22).setStroke("#3a2060", 4);
      this.trickyT = this.add.text(W / 2 + 16, 202, "", { fontFamily: '"Baloo 2"', fontSize: "24px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0, 0.5).setDepth(22).setStroke("#3a2060", 4);
      this.trickyStar = this.add.image(0, 202, "p_star").setDepth(22).setScale(0.62).setVisible(false);
      this.trickyTw = null;
    }
    drawOrderBanner() {
      const o = KINDS[this.order.k], txt = this.order.plural ? o.plur : o.sing;
      this.orderT.setText(txt);
      const tw = Math.max(260, this.orderT.width + 90);
      // border + tag stay CONSTANT regardless of number, so no visual cue leaks the answer (A2);
      // TRICKY flags an irregular word (both its forms) so the child reads the form, not the count.
      this.orderBg.clear(); this.orderBg.fillStyle(0x241b48, 0.92); this.orderBg.fillRoundedRect(W / 2 - tw / 2, 78, tw, 70, 22); this.orderBg.lineStyle(5, 0xffcf4d, 1); this.orderBg.strokeRoundedRect(W / 2 - tw / 2, 78, tw, 70, 22);
      this.orderHint.setText("ぎゅっと しよう！");   // "Hug them!"  (generic, no answer)
      if (o.irr) {
        this.trickyT.setText("TRICKY!");
        const sw = 28, gap = 8, gpw = sw + gap + this.trickyT.width, sx = W / 2 - gpw / 2;
        this.trickyStar.setVisible(true).setPosition(sx + sw / 2, 202);
        this.trickyT.setVisible(true).setPosition(sx + sw + gap, 202);
        if (!this.trickyTw) this.trickyTw = this.tweens.add({ targets: this.trickyStar, angle: 360, duration: 2400, repeat: -1 });
      } else { this.trickyT.setVisible(false); this.trickyStar.setVisible(false); }
      this.voice(voiceKey(txt));   // the child HEARS the English order
    }

    // ---------- intro (first play only, auto-talks, skippable, smooth) ----------
    introNeeded() { try { return !localStorage.getItem("fs_intro_seen"); } catch (e) { return true; } }
    markSeen() { try { localStorage.setItem("fs_intro_seen", "1"); } catch (e) {} }
    startIntro() {
      this.state = "intro";
      this.introDim = this.add.graphics().setDepth(45); this.introDim.fillStyle(0x1a0f30, 0.62); this.introDim.fillRect(0, 0, W, H);
      this.introBig = this.add.image(W / 2, H * 0.40, "pamp").setScale(1.7).setDepth(47);
      this.introBob = this.tweens.add({ targets: this.introBig, y: H * 0.40 - 16, duration: 950, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const bx = W / 2, by = H * 0.64;
      this.introBg = this.add.graphics().setDepth(46); this.introBg.fillStyle(0xffffff, 0.97); this.introBg.fillRoundedRect(bx - 330, by - 104, 660, 208, 24); this.introBg.lineStyle(5, 0x6a4f9e, 1); this.introBg.strokeRoundedRect(bx - 330, by - 104, 660, 208, 24);
      this.introText = this.add.text(bx, by,
        "ばぶ！ パンパム でちゅ！ もふもふ を あつめる でちゅ。\n「a」 が ついてたら ひとつだけ ぎゅっ！\nいっぱい の かたち なら ぜんぶ ぎゅっ！\nおこりんぼ の トゲトゲ は さわっちゃ だめ でちゅ！",
        { fontFamily: '"Zen Maru Gothic"', fontSize: "25px", color: "#3a2060", fontStyle: "700", align: "center", lineSpacing: 9 }).setOrigin(0.5).setDepth(47);
      this.skipBtn = this.add.text(W - 56, 96, "スキップ", { fontFamily: '"Zen Maru Gothic"', fontSize: "24px", color: "#ffe0f0", fontStyle: "700" }).setOrigin(1, 0.5).setDepth(48).setInteractive({ useHandCursor: true }).setStroke("#1a0f30", 5);
      this.skipChev = this.add.image(W - 34, 96, "chevron").setDepth(48).setScale(0.95).setInteractive({ useHandCursor: true });
      let advanced = false; this.advIntro = () => { if (advanced) return; advanced = true; this.endIntro(); };
      this.skipBtn.on("pointerdown", this.advIntro); this.skipChev.on("pointerdown", this.advIntro);
      this.voice("fs_intro", this.advIntro);   // advances when the clip actually ends
      this.time.delayedCall(22000, this.advIntro);   // safety net if audio is blocked
    }
    endIntro() {
      this.markSeen();
      if (window.KMEAudio) KMEAudio.stopAll();
      if (this.skipBtn) { this.skipBtn.destroy(); this.skipBtn = null; }
      if (this.skipChev) { this.skipChev.destroy(); this.skipChev = null; }
      if (this.introBob) this.introBob.stop();
      this.tweens.add({ targets: [this.introDim, this.introBg, this.introText], alpha: 0, duration: 420, onComplete: () => { [this.introDim, this.introBg, this.introText].forEach((o) => { if (o) o.destroy(); }); } });
      this.tweens.add({ targets: this.introBig, x: W / 2, y: this.pampHome.y, scaleX: 0.86, scaleY: 0.86, originY: 1, duration: 600, ease: "Cubic.inOut", onComplete: () => { if (this.introBig) { this.introBig.destroy(); this.introBig = null; } this.pamp.setVisible(true); } });
      this.time.delayedCall(700, () => this.startPlay());
    }

    voice(key, onEnd) {
      const p = window.KMEAudio ? KMEAudio.play(key) : Promise.resolve();
      if (onEnd) p.then(onEnd);
      return p;
    }

    showTitle() {
      this.state = "title"; this.titleStarted = false;
      const dim = this.add.graphics().setDepth(60); dim.fillStyle(0x1a0f30, 0.5); dim.fillRect(0, 0, W, H);
      const host = this.add.image(W / 2, H * 0.34, "pamp").setScale(1.7).setDepth(62);
      this.titleBob = this.tweens.add({ targets: host, y: H * 0.34 - 14, duration: 950, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const t1 = this.add.text(W / 2, H * 0.55, "フワフワ ぎゅっ", { fontFamily: '"Baloo 2"', fontSize: "46px", color: "#ffd2ec", fontStyle: "800" }).setOrigin(0.5).setDepth(62).setStroke("#1a0f30", 7);
      const t2 = this.add.text(W / 2, H * 0.55 + 46, "Fluff Hug", { fontFamily: '"Baloo 2"', fontSize: "26px", color: "#e8d6ff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#1a0f30", 5);
      const bw = 300, bh = 92, bx = W / 2, by = H * 0.72;
      const bg = this.add.graphics().setDepth(62); bg.fillStyle(0xff7ab0, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26); bg.lineStyle(6, 0xb32e63, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26);
      const tri = this.add.triangle(bx - 58, by, 0, 0, 26, 16, 0, 32, 0xffffff).setDepth(63);
      const bt = this.add.text(bx + 14, by, "あそぶ", { fontFamily: '"Zen Maru Gothic"', fontSize: "34px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(63).setStroke("#7a1f4a", 5);
      this.titlePulse = this.tweens.add({ targets: bg, alpha: 0.7, duration: 650, yoyo: true, repeat: -1 });
      const zone = this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(64).on("pointerdown", () => this.startFromTitle());
      this.titleObjs = [dim, host, t1, t2, bg, tri, bt, zone];
    }
    startFromTitle() {
      if (this.titleStarted) return; this.titleStarted = true; Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();   // gesture unlocks audio for the session
      if (this.titleBob) this.titleBob.stop(); if (this.titlePulse) this.titlePulse.stop();
      (this.titleObjs || []).forEach((o) => { if (o && o.destroy) o.destroy(); });
      if (this.introNeeded()) this.startIntro(); else { this.markSeen(); this.pamp.setVisible(true); this.startPlay(); }
    }
    startPlay() { if (this.playStarted) return; this.playStarted = true; this.state = "play"; this.time.delayedCall(300, () => this.nextRound()); }

    nextRound() {
      if (this.di >= this.deck.length) { this.deck = Phaser.Utils.Array.Shuffle(this.deck); this.di = 0; }
      this.order = this.deck[this.di++];
      this.resolved = false; this.volleyDone = false; this.tgtPopped = 0;
      this.drawOrderBanner();
      Sfx.chime();
      // schedule the volley: target fluffs + occasional bombs, staggered. The count
      // distribution is IDENTICAL for singular and plural so the wave never leaks the
      // answer by sight (A2); only the English word distinguishes the rounds.
      const n = Phaser.Math.Between(3, 5);
      const nb = this.cleared < 2 ? 0 : (Math.random() < 0.6 ? 1 : 0) + (this.cleared >= 5 && Math.random() < 0.45 ? 1 : 0);
      const slots = [];
      for (let i = 0; i < n; i++) slots.push("t");
      for (let i = 0; i < nb; i++) slots.splice(Phaser.Math.Between(0, slots.length), 0, "b");
      this.volleyLeft = slots.length; this.volleyTimers = [];
      slots.forEach((s, i) => this.volleyTimers.push(this.time.delayedCall(420 + i * 300, () => {
        if (this.resolved) return;   // round already decided; pending spawns are cancelled on resolve too
        this.spawnFluff(s === "b" ? "bomb" : this.order.k, s === "b");
        this.volleyLeft--; if (this.volleyLeft <= 0) this.volleyDone = true;
      })));
    }

    spawnFluff(kind, isBomb) {
      const x0 = Phaser.Math.Between(W * 0.24, W * 0.76);
      const spr = this.add.image(x0, H + FR, kind).setDepth(12).setScale(0.95);
      const apex = Phaser.Math.Between(300, 520);
      const vy = -Math.sqrt(2 * GRAV * (H + FR - apex));
      const vx = (W / 2 - x0) * Phaser.Math.FloatBetween(0.7, 1.3) + Phaser.Math.Between(-120, 120);
      spr.fl = { vx, vy, spin: Phaser.Math.FloatBetween(-2.6, 2.6), bomb: isBomb, kind, sliced: false };
      this.fluffs.push(spr);
      // a little launch puff at pamp
      Sfx.toss(); this.puff(W / 2, PAMPY - 150);
    }
    puff(x, y) { for (let i = 0; i < 4; i++) { const s = this.add.image(x + Phaser.Math.Between(-22, 22), y, "p_puff").setDepth(7).setScale(Phaser.Math.FloatBetween(0.4, 0.7)).setAlpha(0.8); this.tweens.add({ targets: s, y: y - Phaser.Math.Between(24, 52), alpha: 0, scale: s.scaleX * 1.4, duration: 420, onComplete: () => s.destroy() }); } }

    // ---------- input / slicing ----------
    onDown(p) { this.down = true; this.lastX = p.worldX; this.lastY = p.worldY; this.trail.push({ x: p.worldX, y: p.worldY, t: this.time.now }); }
    onMove(p) {
      if (!this.down) return;
      const x = p.worldX, y = p.worldY; this.trail.push({ x, y, t: this.time.now });
      if (Math.hypot(x - this.lastX, y - this.lastY) > 20) { const s = this.add.image(x, y, "p_spark").setDepth(38).setScale(Phaser.Math.FloatBetween(0.28, 0.5)).setAlpha(0.85); this.tweens.add({ targets: s, alpha: 0, scale: 0.1, y: y + 16, duration: 360, onComplete: () => s.destroy() }); }
      if (this.state === "play" && !this.resolved) this.sliceSegment(this.lastX, this.lastY, x, y);
      this.lastX = x; this.lastY = y;
    }
    sliceSegment(x0, y0, x1, y1) {
      if (Math.hypot(x1 - x0, y1 - y0) < 6) return;   // a real swipe, not a tap
      let segTargets = 0, segBomb = false;
      for (const f of this.fluffs) {
        if (!f.fl || f.fl.sliced) continue;
        if (this.segDist(x0, y0, x1, y1, f.x, f.y) < FR + PAD) {
          f.fl.sliced = true;
          if (f.fl.bomb) { segBomb = true; this.popBomb(f); }
          else { segTargets++; this.hugFluff(f); }
        }
      }
      if (segBomb) { return this.resolveRound(false, "bomb"); }
      if (segTargets > 0) {
        // Singular ("a cat") demands restraint: hugging a SECOND animal anywhere in the wave
        // (this swipe or later) fails. Success is decided at wave end with exactly one hugged.
        // Plural ("cats") rewards gathering many (combos). A child hugging one-at-a-time wins
        // plural but busts singular, so reading the form is the only winning strategy.
        if (!this.order.plural && this.tgtPopped >= 2) return this.resolveRound(false, "toomany");
        if (this.order.plural && segTargets >= 2) this.combo(segTargets);
      }
    }
    segDist(ax, ay, bx, by, px, py) {
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Phaser.Math.Clamp(t, 0, 1);
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }

    hugFluff(f) {
      this.tgtPopped++; Sfx.pop();
      // claim it out of play; pampam's long arm reels it in for a full, lingering, too-eager hug
      const idx = this.fluffs.indexOf(f); if (idx >= 0) this.fluffs.splice(idx, 1); f.fl = null; f.setDepth(13);
      const ex = W / 2 + Phaser.Math.Between(-26, 26), ey = PAMPY - 150, base = f.scaleX;
      const arm = { g: this.add.graphics().setDepth(10), tgt: f, fx: W / 2 + Phaser.Math.Between(-30, 30), fy: PAMPY - 118, phase: "reel" };
      this.arms.push(arm);
      // 1) reel it in to her embrace
      this.tweens.add({ targets: f, x: ex, y: ey, angle: 0, duration: 260, ease: "Back.in", onComplete: () => {
        arm.phase = "hug"; Sfx.squee();
        const gyu = this.gyuBubble(ex, ey - 66);
        // 2) THE HUG (~0.9s): squeeze it flat and round, over and over; shake it lovingly-too-hard;
        //    pampam pulses with each squeeze; hearts pour out. Creepy-cute, she will not let go.
        this.tweens.add({ targets: f, scaleX: base * 1.36, scaleY: base * 0.58, duration: 150, yoyo: true, repeat: 2, ease: "Sine.inOut" });
        this.tweens.add({ targets: f, angle: 9, duration: 60, yoyo: true, repeat: 8, delay: 130 });
        this.tweens.add({ targets: this.pamp, scaleX: 0.95, scaleY: 0.85, duration: 150, yoyo: true, repeat: 2, ease: "Sine.inOut" });
        for (let k = 0; k < 4; k++) this.time.delayedCall(130 + k * 165, () => this.hearts2(ex + Phaser.Math.Between(-16, 16), ey - 4, 4));
        // 3) release: a dizzy spin, then tuck into the collection cage
        this.time.delayedCall(860, () => {
          const ai = this.arms.indexOf(arm); if (ai >= 0) this.arms.splice(ai, 1); arm.g.destroy();
          if (gyu && gyu.active) this.tweens.add({ targets: gyu, alpha: 0, y: gyu.y - 18, duration: 220, onComplete: () => gyu.destroy() });
          const slot = this.cageSlot();
          this.tweens.add({ targets: f, x: slot.x, y: slot.y, scaleX: 0.42, scaleY: 0.42, angle: 360, duration: 380, ease: "Quad.in", onComplete: () => { f.setDepth(7); f.setAngle(Phaser.Math.Between(-8, 8)); this.caged.push(f); this.capCage(); this.bobCaged(f); } });
        });
      } });
    }
    gyuBubble(x, y) {
      const t = this.add.text(x, y, "ぎゅ〜♡", { fontFamily: '"Baloo 2"', fontSize: "48px", color: "#ff7ab0", fontStyle: "800" }).setOrigin(0.5).setDepth(33).setStroke("#7a1f4a", 7).setScale(0.4).setAngle(-8);
      this.tweens.add({ targets: t, scaleX: 1.15, scaleY: 1.15, duration: 200, ease: "Back.out" });
      this.tweens.add({ targets: t, angle: 9, duration: 110, yoyo: true, repeat: 6, delay: 200 });   // eager wobble (kimoi)
      return t;
    }
    hearts2(x, y, n) {
      n = n || 8;
      for (let i = 0; i < n; i++) { const h = this.add.image(x, y, "heart").setDepth(34).setScale(Phaser.Math.FloatBetween(0.28, 0.55)).setAngle(Phaser.Math.Between(-30, 30)); const a = -Math.PI / 2 + Phaser.Math.FloatBetween(-1, 1), d = Phaser.Math.Between(28, 84); this.tweens.add({ targets: h, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d - 26, alpha: 0, scale: 0.1, duration: Phaser.Math.Between(440, 640), ease: "Quad.out", onComplete: () => h.destroy() }); }
    }
    cageSlot() { const i = this.caged.length % 16, c = i % 4, r = Math.floor(i / 4); return { x: CAGE.x - CAGE.w / 2 + 26 + c * 33, y: CAGE.y + CAGE.h / 2 - 30 - r * 38 }; }
    capCage() { while (this.caged.length > 16) { const o = this.caged.shift(); if (o) o.destroy(); } }
    bobCaged(f) { this.tweens.add({ targets: f, y: f.y - 4, duration: Phaser.Math.Between(700, 1100), yoyo: true, repeat: -1, ease: "Sine.inOut" }); }
    buildCage() {
      const x = CAGE.x - CAGE.w / 2, y = CAGE.y - CAGE.h / 2;
      const g = this.add.graphics().setDepth(6);
      g.fillStyle(0x1f1640, 0.85); g.fillRoundedRect(x, y, CAGE.w, CAGE.h, 14);
      g.lineStyle(6, 0xcbb6e0, 1); g.strokeRoundedRect(x, y, CAGE.w, CAGE.h, 14);
      g.fillStyle(0x6a4f9e, 1); g.fillRoundedRect(x - 6, y + CAGE.h - 12, CAGE.w + 12, 18, 7);
      this.add.text(CAGE.x, y - 14, "コレクション", { fontFamily: '"Zen Maru Gothic"', fontSize: "18px", color: "#e8d6ff", fontStyle: "700" }).setOrigin(0.5).setDepth(20).setStroke("#1a0f30", 4);
      const bars = this.add.graphics().setDepth(9); bars.lineStyle(4, 0xcbb6e0, 0.85);
      for (let bx = x + 20; bx < x + CAGE.w - 8; bx += 22) bars.lineBetween(bx, y + 8, bx, y + CAGE.h - 8);
      bars.lineBetween(x + 8, y + 12, x + CAGE.w - 8, y + 12); bars.lineBetween(x + 8, y + CAGE.h / 2, x + CAGE.w - 8, y + CAGE.h / 2);
    }
    popBomb(f) {
      Sfx.boom(); this.cameras.main.shake(260, 0.016); this.cameras.main.flash(160, 255, 90, 90);
      this.sparkle(f.x, f.y, 0xff6a6a, 22, 120); this.removeFluff(f);
    }
    combo(n) {
      Sfx.combo(); this.tweens.add({ targets: this.cameras.main, zoom: 1.03, duration: 70, yoyo: true });
      const t = this.add.text(W / 2, 250, "COMBO x" + n + "!", { fontFamily: '"Baloo 2"', fontSize: "54px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5).setDepth(35).setStroke("#3a2060", 8).setScale(0.4);
      this.tweens.add({ targets: t, scale: 1, duration: 220, ease: "Back.out", yoyo: true, hold: 240, onComplete: () => t.destroy() });
    }
    sparkle(x, y, color, n, spread) {
      n = n || 14; spread = spread || 80;
      const kinds = ["p_spark", "p_spark", "p_star", "p_puff"];
      for (let i = 0; i < n; i++) {
        const s = this.add.image(x, y, kinds[i % kinds.length]).setDepth(34).setTint(color).setScale(Phaser.Math.FloatBetween(0.3, 0.7)).setAngle(Phaser.Math.Between(0, 360));
        const a = Math.random() * Math.PI * 2, d = Phaser.Math.Between(20, spread);
        this.tweens.add({ targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.1, angle: s.angle + Phaser.Math.Between(-160, 160), duration: Phaser.Math.Between(380, 560), ease: "Quad.out", onComplete: () => s.destroy() });
      }
      const r = this.add.image(x, y, "p_ring").setDepth(33).setTint(color).setScale(0.3).setAlpha(0.8);   // shockwave
      this.tweens.add({ targets: r, scale: 1.3, alpha: 0, duration: 360, ease: "Quad.out", onComplete: () => r.destroy() });
    }
    removeFluff(f) { const i = this.fluffs.indexOf(f); if (i >= 0) this.fluffs.splice(i, 1); f.destroy(); }

    // ---------- round resolution ----------
    resolveRound(success, reason) {
      if (this.resolved) return; this.resolved = true;
      // cancel any still-pending volley spawns so none leak into the next round
      if (this.volleyTimers) { this.volleyTimers.forEach((t) => { if (t) t.remove(false); }); this.volleyTimers = []; }
      this.volleyDone = true; this.volleyLeft = 0;
      // clear the field (sparkle remaining away, no penalty)
      this.fluffs.slice().forEach((f) => { if (f.fl && !f.fl.bomb) this.sparkle(f.x, f.y, 0xcfe0ff, 6); this.removeFluff(f); });
      if (success) {
        this.cleared++; this.updateHud(); Sfx.chime();
        this.bubble(this.order.plural ? "あつめた！" : "ひとつ だけ！", "#6ee29a");   // "Collected!" / "Just one!"
        this.tweens.add({ targets: this.pamp, scaleX: 0.95, scaleY: 0.95, duration: 150, yoyo: true });
        if (this.cleared >= WIN) return this.time.delayedCall(700, () => this.win());
      } else {
        this.lives--; this.updateHud(); Sfx.bad();
        // toomany teaches the rule the child broke (how-to, not an answer leak): "a" = just one
        const msg = reason === "bomb" ? "いたいー！" : reason === "toomany" ? "「a」 は ひとつ だけ！" : "あぁー！";
        this.bubble(msg, "#ff9ec4");
        this.tweens.add({ targets: this.pamp, angle: 5, duration: 70, yoyo: true, repeat: 3 });
        if (this.lives <= 0) return this.time.delayedCall(800, () => this.lose());
      }
      this.time.delayedCall(950, () => { if (this.state === "play") this.nextRound(); });
    }
    bubble(txt, color) {
      const x = W / 2, y = PAMPY - 200;
      const g = this.add.graphics().setDepth(24); const t = this.add.text(x, y, txt, { fontFamily: '"Baloo 2"', fontSize: "36px", color: "#3a2060", fontStyle: "800" }).setOrigin(0.5).setDepth(25);
      const tw = t.width + 56; g.fillStyle(0xffffff, 0.98); g.fillRoundedRect(x - tw / 2, y - 34, tw, 68, 18); g.lineStyle(5, Phaser.Display.Color.HexStringToColor(color).color, 1); g.strokeRoundedRect(x - tw / 2, y - 34, tw, 68, 18); g.fillTriangle(x - 14, y + 30, x + 14, y + 30, x, y + 56);
      this.time.delayedCall(1100, () => { g.destroy(); t.destroy(); });
    }

    checkVolleyEnd() {
      if (this.resolved) return;
      const liveTargets = this.fluffs.some((f) => f.fl && !f.fl.bomb);
      if (this.volleyDone && this.volleyLeft <= 0 && !liveTargets) {
        if (this.order.plural) this.resolveRound(this.tgtPopped >= 2);                  // "cats" = many
        else if (this.tgtPopped === 1) this.resolveRound(true);                          // "a cat" = exactly one
        else this.resolveRound(false, "missed");                                         // popped none (2+ already busted mid-wave)
      }
    }

    update(time, delta) {
      const dt = Math.min(0.033, delta / 1000);
      this.drawWand(time);
      if (this.ambient) for (const s of this.ambient) { s.y -= s.av * dt; s.angle += 7 * dt; if (s.y < 170) { s.y = H - 180; s.x = Phaser.Math.Between(30, W - 30); } }
      if (this.cap) return;
      for (const f of this.fluffs.slice()) {
        if (!f.fl) continue;
        f.fl.vy += GRAV * dt; f.x += f.fl.vx * dt; f.y += f.fl.vy * dt; f.angle += f.fl.spin * 60 * dt;
        if (f.y > H + FR + 40 || f.x < -FR - 60 || f.x > W + FR + 60) this.removeFluff(f);
      }
      // pampam's stretchy arms: reaching out to reel an animal in, then wrapping it in a hug
      for (const arm of this.arms) {
        arm.g.clear(); if (!arm.tgt || !arm.tgt.active) continue;
        const tx = arm.tgt.x, ty = arm.tgt.y;
        if (arm.phase === "hug") {                       // two arms wrap around for the squeeze
          arm.g.lineStyle(17, 0xb79ad6, 1); arm.g.lineBetween(W / 2 - 60, PAMPY - 92, tx - 6, ty + 6); arm.g.lineBetween(W / 2 + 60, PAMPY - 92, tx + 6, ty + 6);
          arm.g.lineStyle(9, 0xe8dcff, 1); arm.g.lineBetween(W / 2 - 60, PAMPY - 92, tx - 6, ty + 6); arm.g.lineBetween(W / 2 + 60, PAMPY - 92, tx + 6, ty + 6);
          arm.g.fillStyle(0xb79ad6, 1); arm.g.fillCircle(tx - 16, ty + 4, 13); arm.g.fillCircle(tx + 16, ty + 4, 13);
        } else {                                          // single limb reaching out
          arm.g.lineStyle(17, 0xb79ad6, 1); arm.g.lineBetween(arm.fx, arm.fy, tx, ty);
          arm.g.lineStyle(9, 0xe8dcff, 1); arm.g.lineBetween(arm.fx, arm.fy, tx, ty);
          arm.g.fillStyle(0xb79ad6, 1); arm.g.fillCircle(tx, ty, 15); arm.g.fillStyle(0xe8dcff, 1); arm.g.fillCircle(tx - 4, ty - 4, 6);
        }
      }
      if (this.state === "play" && !this.resolved && this.volleyDone) this.checkVolleyEnd();
    }
    drawWand(time) {
      const now = time || (this.trail.length ? this.trail[this.trail.length - 1].t : 0);
      while (this.trail.length && now - this.trail[0].t > 160) this.trail.shift();
      this.wand.clear(); this.wandGlow.clear();
      if (this.trail.length < 2) { if (this.wandTip) this.wandTip.setVisible(false); return; }
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1], b = this.trail[i], k = i / this.trail.length;
        this.wandGlow.lineStyle(10 + k * 26, 0xff9ad8, 0.06 + k * 0.16); this.wandGlow.lineBetween(a.x, a.y, b.x, b.y);   // soft pink halo
        this.wandGlow.lineStyle(4 + k * 14, 0xffe6a0, 0.10 + k * 0.22); this.wandGlow.lineBetween(a.x, a.y, b.x, b.y);    // warm gold core glow
        this.wand.lineStyle(2 + k * 7, 0xffffff, 0.30 + k * 0.6); this.wand.lineBetween(a.x, a.y, b.x, b.y);              // bright white center
      }
      const tip = this.trail[this.trail.length - 1];
      this.wandTip.setVisible(true).setPosition(tip.x, tip.y).setScale(0.7 + Math.sin(now / 70) * 0.12).setAngle((now / 6) % 360);
    }

    win() {
      this.state = "over"; if (window.KMEFlow) KMEFlow.win(); Sfx.win(); this.cameras.main.flash(260, 255, 230, 150);
      this.tweens.add({ targets: this.pamp, scaleX: 1.0, scaleY: 1.0, y: PAMPY - 20, duration: 200, yoyo: true, repeat: 3 });
      for (let i = 0; i < 40; i++) this.time.delayedCall(i * 30, () => this.sparkle(Phaser.Math.Between(60, W - 60), Phaser.Math.Between(120, 500), [0xffd24d, 0xff9ec4, 0x6ee29a, 0xcfe0ff][i % 4], 6));
      this.time.delayedCall(900, () => this.panel("コレクション 完成！", "YOU WIN!"));
    }
    lose() {
      this.state = "over"; Sfx.lose(); this.cameras.main.shake(300, 0.012);
      this.tweens.add({ targets: this.pamp, alpha: 0.6, y: PAMPY + 14, duration: 400 });
      this.time.delayedCall(700, () => this.panel("もう いっかい！", "GAME OVER"));
    }
    panel(titleJp, big) {
      const cy = H * 0.42;
      const p = this.add.graphics().setDepth(50); p.fillStyle(0x241b48, 0.96); p.fillRoundedRect(W / 2 - 230, cy - 140, 460, 320, 28); p.lineStyle(6, 0xffd24d, 1); p.strokeRoundedRect(W / 2 - 230, cy - 140, 460, 320, 28);
      this.add.text(W / 2, cy - 76, titleJp, { fontFamily: '"Zen Maru Gothic"', fontSize: "38px", color: "#fff7f0", fontStyle: "700" }).setOrigin(0.5).setDepth(51).setStroke("#1a0f30", 7);
      this.add.text(W / 2, cy + 2, big, { fontFamily: '"Baloo 2"', fontSize: "52px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5).setDepth(51).setStroke("#1a0f30", 7);
      const bw = 280, bh = 80, bx = W / 2, by = cy + 100;
      const bg = this.add.graphics().setDepth(51); bg.fillStyle(0x6ee29a, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 24); bg.lineStyle(5, 0x2f9e63, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 24);
      this.add.text(bx - 18, by, "もう いちど", { fontFamily: '"Zen Maru Gothic"', fontSize: "30px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(52).setStroke("#1a0f30", 5);
      this.add.image(bx + 86, by, "chevron").setDepth(52).setScale(1.05);
      this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(53).on("pointerdown", () => this.scene.restart());
      this.tweens.add({ targets: bg, alpha: 0.7, duration: 700, yoyo: true, repeat: -1 });
    }

    // deterministic frame for headless review (no rAF dependence)
    capFrame(q) {
      this.state = "play"; this.playStarted = true; this.resolved = false;
      const plural = q.get("plural") !== "0";
      this.order = { k: q.get("kind") || "cat", plural };
      this.cleared = parseInt(q.get("cleared") || "2"); this.updateHud();
      this.drawOrderBanner();
      const pts = [[180, 360, -18], [330, 300, 22], [470, 410, -30], [600, 330, 14]];
      pts.forEach(([x, y, a]) => this.add.image(x, y, this.order.k).setDepth(12).setScale(0.95).setAngle(a));
      if (q.get("bomb") !== "0") this.add.image(548, 500, "bomb").setDepth(12).setScale(0.95).setAngle(-12);
      for (let i = 0; i < 3; i++) { const slot = this.cageSlot(); const c = this.add.image(slot.x, slot.y, this.order.k).setDepth(7).setScale(0.42); this.caged.push(c); }   // some already collected
      // pampam's stretchy arm reaching out to reel one in, mid-hug
      const arm = this.add.graphics().setDepth(10), fx = W / 2, fy = PAMPY - 118, tx = 330, ty = 300;
      arm.lineStyle(17, 0xb79ad6, 1); arm.lineBetween(fx, fy, tx, ty); arm.lineStyle(9, 0xe8dcff, 1); arm.lineBetween(fx, fy, tx, ty); arm.fillStyle(0xb79ad6, 1); arm.fillCircle(tx, ty, 15);
      this.hearts2(W / 2, PAMPY - 150, 8);
      this.add.text(W / 2, PAMPY - 212, "ぎゅ〜♡", { fontFamily: '"Baloo 2"', fontSize: "46px", color: "#ff7ab0", fontStyle: "800" }).setOrigin(0.5).setDepth(33).setStroke("#7a1f4a", 7).setAngle(-6);
      const now = 1000; for (let i = 0; i < 8; i++) this.trail.push({ x: 120 + i * 50, y: 330 + Math.sin(i) * 24, t: now - (8 - i) * 16 });
      this.drawWand(now);
      if (plural) this.combo(3);
    }
  }

  let booted = false;
  function boot() { if (booted) return; booted = true; new Phaser.Game({ type: Phaser.CANVAS, parent: "game", backgroundColor: "#2a2150", audio: { disableWebAudio: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: [Play] }); }
  if (document.fonts && document.fonts.load) { Promise.all([document.fonts.load('800 62px "Baloo 2"'), document.fonts.load('700 25px "Zen Maru Gothic"')]).then(boot, boot); setTimeout(boot, 1800); } else boot();
})();
