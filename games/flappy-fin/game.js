// Flappy Fin (a/an) - Phaser 3. dt-correct physics per planning/game-designs/g5-redesign.md.
// Logical field 480x800. UPPER gap = "an", LOWER gap = "a"; the word rides the gate and the
// gap is chosen by its first SOUND. Avatar = parfait's real iwashi sprite. Art per art-bible.md.
"use strict";
(function () {
  const W = 760, H = 1220, FISHX = 0.30 * W; // larger logical field = zoomed out, more room to see (portrait, like Flappy)
  const GRAV = 2000, FLAP = -640, MAXFALL = 1120;
  const SCROLL0 = 210, SCROLL_STEP = 7, SCROLL_CAP = 300;
  const SPACING = 360, GAPH = 188, MIDW = 110;
  const HITW = 34, HITH = 26, PW = 150, PAD = 10; // forgiveness pad at gap edges

  const WORDS = [
    { w: "apple", a: "an" }, { w: "dog", a: "a" }, { w: "egg", a: "an" }, { w: "cat", a: "a" },
    { w: "orange", a: "an" }, { w: "book", a: "a" }, { w: "umbrella", a: "an" }, { w: "banana", a: "a" },
    { w: "hour", a: "an", trap: 1 }, { w: "university", a: "a", trap: 1 }
  ];

  const Sfx = {
    ctx: null,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    tone(f0, f1, dur, type, gain) { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); g.gain.setValueAtTime(gain || 0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur); },
    noise(dur, gain, freq) { if (!this.ctx) return; const t = this.ctx.currentTime, b = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 800; const g = this.ctx.createGain(); g.gain.setValueAtTime(gain || 0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(this.ctx.destination); s.start(t); s.stop(t + dur); },
    flap() { this.tone(300, 180, 0.12, "sine", 0.16); this.noise(0.05, 0.05, 1400); },
    score(combo) { const base = 620 + (combo || 0) * 45; this.tone(base, base * 1.5, 0.14, "triangle", 0.2); },
    bonk() { this.noise(0.18, 0.28, 500); this.tone(170, 80, 0.2, "sawtooth", 0.16); },
    die() { this.tone(420, 90, 0.55, "sawtooth", 0.22); this.noise(0.45, 0.18, 380); }
  };

  class Play extends Phaser.Scene {
    constructor() { super("play"); }
    preload() {
      this.load.svg("iwashi", "assets/iwashi.svg", { width: 92, height: 83 });
      this.load.svg("pillar", "assets/pillar.svg", { width: PW, height: 582 });
    }
    create() {
      this.score = 0; this.lives = 3; this.scroll = 0; this.scrollMul = 0;
      this.gates = []; this.qi = 0;
      // traps (an hour / a university) are taught in the lesson, so they stay, but appear later as the skill ceiling
      this.queue = Phaser.Utils.Array.Shuffle(WORDS.filter((w) => !w.trap)).concat(Phaser.Utils.Array.Shuffle(WORDS.filter((w) => w.trap)));
      this.dead = false; this.invuln = 0; this.started = false; this.baseY = H * 0.45;

      this.buildBackground();
      this.bubbles = this.add.group();
      for (let i = 0; i < 7; i++) this.spawnBubble(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H));

      this.fishShadow = this.add.ellipse(FISHX, H - 26, 60, 14, 0x0a2540, 0.20).setDepth(2);
      this.fish = this.add.image(FISHX, this.baseY, "iwashi").setOrigin(0.5, 0.66).setDepth(10);
      this.vy = 0;

      this.spawnGate(W * 0.72);
      this.nextSpawnX = W * 0.72 + SPACING;
      this.buildHud();

      this.voices = {}; this.state = null; this.gateId = 0; this.spokenId = -1;
      if (window.KMEAudio) {
        KMEAudio.setBase("assets/").stopAll();
        KMEAudio.register(WORDS.map((w) => "en_" + w.w).concat(["ff_intro"]));
      }
      if (location.search.includes("cap")) { this.markSeen(); this.showReady(); }
      else this.showTitle();   // PLAY button first (unlocks audio), then the host intro

      this.input.on("pointerdown", () => this.onTap());
      this.input.keyboard.on("keydown-SPACE", () => this.onTap());
      this.input.keyboard.on("keydown-UP", () => this.onTap());
    }

    onTap() {
      Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.dead || this.state === "intro" || this.state === "title") return; // restart is via the game-over button; intro/title have their own buttons
      if (!this.started) {
        if (!this.readyG) return; // intro still up
        this.started = true; this.readyG.destroy(); this.readyT.destroy(); this.readyT2.destroy(); this.readyG = null;
        this.tweens.add({ targets: this, scrollMul: 1, duration: 800, ease: "Sine.out" }); // ramp in
        this.speakTarget(); // hear the word for the gate you are flying toward
      }
      this.flap();
    }

    voice(key, onEnd) {
      const p = window.KMEAudio ? KMEAudio.play(key) : Promise.resolve();
      if (onEnd) p.then(onEnd);
      return p;
    }
    introNeeded() { try { return !localStorage.getItem("ff_intro_seen"); } catch (e) { return true; } }
    markSeen() { try { localStorage.setItem("ff_intro_seen", "1"); } catch (e) {} }
    showReady() {
      this.readyG = this.add.graphics().setDepth(45); this.readyG.fillStyle(0x0a1626, 0.35); this.readyG.fillRect(0, 0, W, H);
      this.readyT = this.add.text(W / 2, H * 0.62, "タップ で スタート", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "30px", color: "#FFF7F0", fontStyle: "700" }).setOrigin(0.5).setDepth(46).setStroke("#1E1233", 7);
      this.readyT2 = this.add.text(W / 2, H * 0.62 + 40, "TAP TO START", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "20px", color: "#FFCF4D", fontStyle: "800" }).setOrigin(0.5).setDepth(46).setStroke("#1E1233", 5);
      this.tweens.add({ targets: [this.readyT, this.readyT2], alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
    }
    showTitle() {
      this.state = "title"; this.titleStarted = false;
      this.titleG = this.add.graphics().setDepth(50); this.titleG.fillStyle(0x06121f, 0.55); this.titleG.fillRect(0, 0, W, H);
      this.titleHost = this.add.image(W / 2, H * 0.33, "iwashi").setScale(3.0).setOrigin(0.5, 0.66).setDepth(52);
      this.titleBob2 = this.tweens.add({ targets: this.titleHost, y: H * 0.33 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.t1 = this.add.text(W / 2, H * 0.54, "イワシ・パタパタ", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "40px", color: "#FFCF4D", fontStyle: "800" }).setOrigin(0.5).setDepth(52).setStroke("#1E1233", 7);
      this.t2 = this.add.text(W / 2, H * 0.54 + 44, "Flappy Fin", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "24px", color: "#cfe0ff", fontStyle: "700" }).setOrigin(0.5).setDepth(52).setStroke("#1E1233", 5);
      const bw = 300, bh = 92, bx = W / 2, by = H * 0.72;
      this.tbg = this.add.graphics().setDepth(52); this.tbg.fillStyle(0x37c0c8, 1); this.tbg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26); this.tbg.lineStyle(6, 0x1d8e96, 1); this.tbg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26);
      this.ttri = this.add.triangle(bx - 58, by, 0, 0, 26, 16, 0, 32, 0xffffff).setDepth(53);
      this.tplay = this.add.text(bx + 14, by, "あそぶ", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "34px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(53).setStroke("#0a3a3e", 5);
      this.tpulse = this.tweens.add({ targets: this.tbg, alpha: 0.7, duration: 650, yoyo: true, repeat: -1 });
      this.tzone = this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(54).on("pointerdown", () => this.startFromTitle());
    }
    startFromTitle() {
      if (this.titleStarted) return; this.titleStarted = true; Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.titleBob2) this.titleBob2.stop(); if (this.tpulse) this.tpulse.stop();
      [this.titleG, this.titleHost, this.t1, this.t2, this.tbg, this.ttri, this.tplay, this.tzone].forEach((o) => o && o.destroy());
      this.state = null;
      if (this.introNeeded()) this.startIntro(); else this.showReady();
    }
    startIntro() {
      this.state = "intro";
      this.introDim = this.add.graphics().setDepth(45); this.introDim.fillStyle(0x06121f, 0.6); this.introDim.fillRect(0, 0, W, H);
      this.introBig = this.add.image(W / 2, H * 0.38, "iwashi").setScale(2.4).setOrigin(0.5, 0.66).setDepth(47);
      this.introBob = this.tweens.add({ targets: this.introBig, y: H * 0.38 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const bx = W / 2, by = H * 0.62;
      this.introBg = this.add.graphics().setDepth(46); this.introBg.fillStyle(0xffffff, 0.97); this.introBg.fillRoundedRect(bx - 322, by - 96, 644, 192, 24); this.introBg.lineStyle(5, 0x1E1233, 1); this.introBg.strokeRoundedRect(bx - 322, by - 96, 644, 192, 24);
      this.introText = this.add.text(bx, by, "あいや、よぐ きたね だじゃ！\nことば の はじめ の おと を きいで、\nうえ の あな（an）か した の あな（a）を\nくぐる べ！ タップ で パタパタ だじゃ！", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "25px", color: "#1E1233", fontStyle: "700", align: "center", lineSpacing: 7 }).setOrigin(0.5).setDepth(47);
      this.skipBtn = this.add.text(W - 22, 70, "スキップ ▶", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "23px", color: "#cfe0ff", fontStyle: "700" }).setOrigin(1, 0).setDepth(48).setInteractive({ useHandCursor: true }).setStroke("#06121f", 5);
      let advanced = false; const adv = () => { if (advanced) return; advanced = true; this.endIntro(); };
      this.skipBtn.on("pointerdown", adv);
      this.voice("ff_intro", adv); // parfait talks; adv fires when the clip actually ends
      this.time.delayedCall(9500, adv);
    }
    endIntro() {
      this.markSeen(); this.state = null;
      if (window.KMEAudio) KMEAudio.stopAll();
      if (this.skipBtn) { this.skipBtn.destroy(); this.skipBtn = null; }
      if (this.introBob) this.introBob.stop();
      this.tweens.add({ targets: [this.introDim, this.introBg, this.introText, this.introBig], alpha: 0, duration: 450, onComplete: () => { [this.introDim, this.introBg, this.introText, this.introBig].forEach((o) => { if (o) o.destroy(); }); this.showReady(); } });
    }

    buildBackground() {
      if (this.textures.exists("watergrad")) this.textures.remove("watergrad"); // allow scene.restart()
      const tex = this.textures.createCanvas("watergrad", W, H), cx = tex.getContext();
      const grd = cx.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, "#d4ecfb"); grd.addColorStop(0.55, "#7fbbe4"); grd.addColorStop(1, "#2f5f88");
      cx.fillStyle = grd; cx.fillRect(0, 0, W, H);
      cx.globalAlpha = 0.10; cx.fillStyle = "#ffffff";
      for (let i = 0; i < 4; i++) { const lx = 60 + i * 130; cx.beginPath(); cx.moveTo(lx, 0); cx.lineTo(lx + 70, 0); cx.lineTo(lx - 40, H); cx.lineTo(lx - 100, H); cx.closePath(); cx.fill(); }
      cx.globalAlpha = 1; tex.refresh();
      this.add.image(0, 0, "watergrad").setOrigin(0, 0).setDepth(0);
      const mid = this.add.graphics().setDepth(0); mid.fillStyle(0x6fb0d8, 0.5);
      mid.beginPath(); mid.moveTo(0, H * 0.72);
      for (let x = 0; x <= W; x += 80) mid.lineTo(x, H * 0.72 - 40 * Math.abs(Math.sin(x * 0.7)));
      mid.lineTo(W, H); mid.lineTo(0, H); mid.closePath(); mid.fillPath();
      const fl = this.add.graphics().setDepth(1); fl.fillStyle(0x2a5478, 1); fl.fillRoundedRect(-20, H - 60, W + 40, 120, 40);
      fl.fillStyle(0x3a6e96, 1); for (let x = 20; x < W; x += 70) fl.fillCircle(x, H - 56, 26);
      const v = this.add.graphics().setDepth(40); for (let i = 0; i < 50; i++) v.lineStyle(2, 0x0a1626, i / 50 * 0.18), v.strokeRect(i, i, W - 2 * i, H - 2 * i);
    }

    spawnBubble(x, y) { const r = Phaser.Math.Between(4, 11); const b = this.add.circle(x, y, r, 0xffffff, 0).setStrokeStyle(2, 0xffffff, 0.45).setDepth(3); b.vy = Phaser.Math.Between(18, 42); this.bubbles.add(b); return b; }

    spawnGate(x) {
      const word = this.queue[this.qi % this.queue.length]; this.qi++;
      const block = GAPH + MIDW + GAPH;
      const cy = Phaser.Math.Between(Math.round(H * 0.34), Math.round(H * 0.66)); // keep pillars covering the taller field
      const anTop = cy - block / 2, anBot = anTop + GAPH, midTop = anBot, midBot = midTop + MIDW, aTop = midBot, aBot = aTop + GAPH;
      const top = this.add.image(x, anTop, "pillar").setOrigin(0.5, 1).setDepth(6);
      const bot = this.add.image(x, aBot, "pillar").setOrigin(0.5, 0).setFlipY(true).setDepth(6);
      const mw = this.add.graphics().setDepth(6); mw.fillStyle(0xffe6bd, 1); mw.lineStyle(8, 0xc98a3a, 1);
      mw.fillRoundedRect(x - PW / 2, midTop, PW, MIDW, 18); mw.strokeRoundedRect(x - PW / 2, midTop, PW, MIDW, 18);
      const card = this.add.graphics().setDepth(7); card.fillStyle(0x42186e, 1); card.fillRoundedRect(x - 66, midTop + MIDW / 2 - 24, 132, 48, 14);
      const txt = this.add.text(x, midTop + MIDW / 2, word.w, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "31px", color: "#FFF7F0", fontStyle: "800" }).setOrigin(0.5).setDepth(8).setStroke("#1E1233", 6);
      const tabAn = this.add.text(x, anTop + GAPH / 2, "an ▲", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "21px", color: "#dffaff", fontStyle: "700" }).setOrigin(0.5).setDepth(8).setStroke("#1E5A6E", 5).setAlpha(0.8);
      const tabA = this.add.text(x, aTop + GAPH / 2, "a ▼", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "21px", color: "#ffe2ef", fontStyle: "700" }).setOrigin(0.5).setDepth(8).setStroke("#7a2a4a", 5).setAlpha(0.8);
      this.gates.push({ x, word, id: this.gateId++, anTop, anBot, aTop, aBot, midTop, midBot, scored: false, objs: [top, bot, mw, card, txt, tabAn, tabA] });
    }

    // Speak the word for the gate the fish is actually approaching, freshly, as
    // it becomes the target (drops any stale queued word so nothing overlaps or
    // lags behind the gate the player is reading).
    speakTarget() {
      const tg = this.gates.find((g) => !g.scored && g.x > FISHX - PW / 2);
      if (tg && tg.id !== this.spokenId) {
        this.spokenId = tg.id;
        if (window.KMEAudio) { KMEAudio.stopAll(); KMEAudio.play("en_" + tg.word.w); }
      }
    }

    buildHud() {
      const bar = this.add.graphics().setDepth(30); bar.fillStyle(0x2a1b45, 0.85); bar.fillRoundedRect(8, 8, W - 16, 50, 16);
      this.add.text(20, 19, "うえ=an / した=a", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "21px", color: "#FFE9C7", fontStyle: "700" }).setDepth(31);
      this.scoreText = this.add.text(W - 22, 18, "0", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "29px", color: "#FFCF4D", fontStyle: "800" }).setOrigin(1, 0).setDepth(31).setStroke("#1E1233", 5);
      this.hearts = this.add.text(W - 74, 22, "❤❤❤", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "20px", color: "#EE2A3C" }).setOrigin(1, 0).setDepth(31);
    }

    flap() {
      if (this.dead) return;
      this.vy = FLAP; Sfx.flap();
      this.tweens.add({ targets: this.fish, scaleY: 1.16, scaleX: 0.9, duration: 90, yoyo: true, ease: "Quad.out" });
      const b = this.spawnBubble(this.fish.x - 22, this.fish.y + 6); b.vy = 70;
    }

    burst(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const c = this.add.circle(x, y, Phaser.Math.Between(3, 7), color, 0.9).setDepth(20);
        const a = Math.random() * Math.PI * 2, d = Phaser.Math.Between(20, 70);
        this.tweens.add({ targets: c, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.2, duration: 420, ease: "Quad.out", onComplete: () => c.destroy() });
      }
    }

    update(time, delta) {
      const dt = Math.min(0.033, delta / 1000);
      this.bubbles.children.iterate((b) => { if (!b) return; b.y -= b.vy * dt; if (b.y < -14) { b.y = H + 14; b.x = Phaser.Math.Between(0, W); } });

      if (!this.started && !this.dead) { this.fish.y = this.baseY + Math.sin(time / 350) * 10; this.fish.rotation = Math.sin(time / 350) * 0.06; this.fishShadow.x = FISHX; return; }

      // physics
      this.vy = Math.min(MAXFALL, this.vy + GRAV * dt);
      this.fish.y += this.vy * dt;
      this.fish.x = FISHX;
      if (!this.dead) this.fish.rotation = Phaser.Math.Clamp(this.vy / 900, -0.5, 1.2) * 0.55;
      if (this.fish.y < 78 && !this.dead) { this.fish.y = 78; this.vy = 80; } // ceiling = soft block
      if (this.fish.y > H - 24 && !this.dead) { this.die(); return; }          // floor = instant death
      this.fishShadow.x = FISHX; this.fishShadow.setScale(Phaser.Math.Clamp(this.fish.y / H, 0.4, 1));
      if (this.dead) return;

      this.scroll = SCROLL0 * this.scrollMul + (this.score * SCROLL_STEP) * this.scrollMul; if (this.scroll > SCROLL_CAP) this.scroll = SCROLL_CAP;
      const move = this.scroll * dt;
      for (const gt of this.gates) {
        gt.x -= move; for (const o of gt.objs) o.x -= move;
        if (Math.abs(gt.x - FISHX) < PW / 2 + HITW / 2) {
          const top = this.fish.y - HITH / 2, bot = this.fish.y + HITH / 2;
          const inAn = top > gt.anTop - PAD && bot < gt.anBot + PAD;
          const inA = top > gt.aTop - PAD && bot < gt.aBot + PAD;
          if (!inAn && !inA) { this.die(); return; } // hit a pillar/wall = instant death
        }
        if (!gt.scored && gt.x < FISHX - PW / 2 - HITW / 2) {
          gt.scored = true;
          const chose = (this.fish.y > gt.anTop && this.fish.y < gt.anBot) ? "an"
            : (this.fish.y > gt.aTop && this.fish.y < gt.aBot) ? "a" : null;
          if (chose === gt.word.a) { this.score++; this.scoreText.setText(this.score); Sfx.score(this.score); this.burst(FISHX + 20, this.fish.y, 0x6CCB5F, 9); this.cameras.main.flash(120, 90, 220, 130); if (this.score >= 6 && !this.flowWon) { this.flowWon = true; if (window.KMEFlow) KMEFlow.win(); } }
          else { this.loseHeart(); if (this.dead) return; } // wrong gap = lose a heart
        }
      }
      this.gates = this.gates.filter((gt) => { if (gt.x < -PW) { gt.objs.forEach((o) => o.destroy()); return false; } return true; });
      this.nextSpawnX -= move;
      if (this.nextSpawnX <= W) { this.spawnGate(W + PW); this.nextSpawnX = W + PW + SPACING; }
      this.speakTarget();
    }

    loseHeart() {
      if (this.dead) return;
      this.lives--; this.hearts.setText("❤❤❤".slice(0, Math.max(0, this.lives)));
      this.cameras.main.flash(170, 230, 60, 60); this.cameras.main.shake(140, 0.009);
      Sfx.bonk(); this.burst(FISHX, this.fish.y, 0xEE2A3C, 9);
      this.tweens.add({ targets: this.fish, angle: this.fish.angle - 30, duration: 160, yoyo: true });
      if (this.lives <= 0) this.die();
    }

    die() {
      this.dead = true; Sfx.die();
      this.cameras.main.shake(280, 0.018);
      this.burst(FISHX, this.fish.y, 0xeaf7ff, 16);
      // bounce up, spin, then faint belly-up and sink
      this.vy = -360;
      this.tweens.add({ targets: this.fish, angle: 540, duration: 700, ease: "Cubic.out" });
      this.tweens.add({ targets: this.fish, y: H - 40, duration: 1400, delay: 500, ease: "Bounce.out", onComplete: () => { this.fish.setAngle(180); } });
      this.time.delayedCall(1500, () => this.showGameOver());
    }

    showGameOver() {
      const p = this.add.graphics().setDepth(50); p.fillStyle(0x2a1b45, 0.94); p.fillRoundedRect(W / 2 - 150, H / 2 - 120, 300, 240, 24); p.lineStyle(5, 0xFFCF4D, 1); p.strokeRoundedRect(W / 2 - 150, H / 2 - 120, 300, 240, 24);
      this.add.text(W / 2, H / 2 - 76, "ゲームオーバー", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "34px", color: "#FFF7F0", fontStyle: "700" }).setOrigin(0.5).setDepth(51).setStroke("#1E1233", 6);
      this.add.text(W / 2, H / 2 - 10, "スコア " + this.score, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "44px", color: "#FFCF4D", fontStyle: "800" }).setOrigin(0.5).setDepth(51).setStroke("#1E1233", 6);
      const bw = 230, bh = 70, bx = W / 2, by = H / 2 + 76;
      const bg = this.add.graphics().setDepth(51);
      bg.fillStyle(0x3DBE6A, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 20);
      bg.lineStyle(5, 0x1F8A4C, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 20);
      this.add.text(bx, by, "もう いちど ▶", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "27px", color: "#FFFFFF", fontStyle: "700" }).setOrigin(0.5).setDepth(52).setStroke("#1E1233", 5);
      const zone = this.add.zone(bx, by, bw, bh).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(53);
      zone.on("pointerdown", () => this.scene.restart());
      this.tweens.add({ targets: bg, alpha: 0.65, duration: 700, yoyo: true, repeat: -1 });
    }
  }

  let booted = false;
  function boot() { if (booted) return; booted = true; new Phaser.Game({ type: Phaser.CANVAS, parent: "game", backgroundColor: "#0b1a2b", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: [Play] }); }
  if (document.fonts && document.fonts.load) { Promise.all([document.fonts.load('800 31px "Baloo 2"'), document.fonts.load('700 21px "Zen Maru Gothic"')]).then(boot, boot); setTimeout(boot, 1500); } else boot();
})();
