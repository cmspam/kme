// Ink Tally -> "Tako's Tank" (there is / there are) - Phaser 3. Host: tako, the
// octopus (oceanic, 8 grabbing arms). A catch-to-order arcade: sea creatures swim
// around the tank; an ORDER is written in English ("There is a fish." / "There are
// three crabs.") and you must GRAB exactly that many of that kind with tako's
// tentacle (tap a creature -> a tentacle whips out and reels it in). Reading the
// sentence (number word -> how many; is/are -> one vs many) tells you the target;
// grabbing the right count of the right kind off the moving shoal is the skill.
// Grab a wrong kind or over-fill and you spoil it (lose a life). Aria reads the
// full sentence back on a correct serve. English-only order (A2).
"use strict";
(function () {
  const W = 760, H = 1200, WIN = 8, LIVES = 3;
  const TANK = { x0: 50, x1: 710, y0: 250, y1: H - 250 };
  const KINDS = [
    { k: "fish", art: "fish", sc: 0.95 }, { k: "crab", art: "crab", sc: 0.82 }, { k: "shell", art: "shell", sc: 0.82 }
  ];
  const NUM = ["", "a", "two", "three", "four", "five", "six"];

  const Sfx = {
    ctx: null,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    tone(f0, f1, dur, type, gain) { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); g.gain.setValueAtTime(gain || 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur); },
    noise(dur, gain, freq) { if (!this.ctx) return; const t = this.ctx.currentTime, b = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 1200; const g = this.ctx.createGain(); g.gain.setValueAtTime(gain || 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(this.ctx.destination); s.start(t); s.stop(t + dur); },
    grab() { this.tone(500, 820, 0.09, "sine", 0.12); },
    catch() { this.tone(720, 1050, 0.09, "triangle", 0.14); },
    serve() { [0, 90, 180].forEach((d, i) => setTimeout(() => this.tone(640 + i * 170, 1000 + i * 170, 0.13, "triangle", 0.15), d)); },
    bad() { this.tone(280, 120, 0.32, "sawtooth", 0.14); this.noise(0.12, 0.1, 600); },
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
      this.load.svg("bub", "assets/p_bubble.svg", { width: 40, height: 40 });
      this.load.svg("heart", "assets/heart.svg", { width: 44, height: 44 });
    }
    create() {
      this.time.removeAllEvents();
      this.order = 0; this.lives = LIVES; this.creatures = []; this.caught = 0; this.kind = null; this.target = 1; this.busy = false;
      this.playStarted = false; this.state = null; this.rewardDone = null;
      if (window.KMEAudio) { KMEAudio.setBase("assets/").stopAll(); const keys = ["ti_intro", "en_fish", "en_crab", "en_shell"]; KINDS.forEach((kd) => { for (let n = 1; n <= 6; n++) keys.push("there_" + n + "_" + kd.k); }); KMEAudio.register(keys); }

      this.buildBackdrop();
      this.tako = this.add.image(W / 2, H - 96, "tako").setScale(0.6).setDepth(20).setVisible(false);
      this.tentacle = this.add.graphics().setDepth(19);
      this.buildHud();

      const q = new URLSearchParams(location.search);
      if (q.has("cap")) { window.__it = this; this.markSeen(); this.tako.setVisible(true); this.startPlay(); }
      else this.showTitle();

      this.input.on("pointerdown", (p) => this.onTap(p));
    }

    buildBackdrop() {
      if (this.textures.exists("tankbg")) this.textures.remove("tankbg");
      const tex = this.textures.createCanvas("tankbg", W, H), cx = tex.getContext();
      const g = cx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#bfeeff"); g.addColorStop(0.5, "#4fb3e0"); g.addColorStop(1, "#0e3f63");
      cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      cx.globalAlpha = 0.10; cx.fillStyle = "#fff"; for (let i = 0; i < 4; i++) { const lx = 80 + i * 190; cx.beginPath(); cx.moveTo(lx, 0); cx.lineTo(lx + 70, 0); cx.lineTo(lx - 40, H); cx.lineTo(lx - 120, H); cx.closePath(); cx.fill(); }
      cx.globalAlpha = 1; cx.fillStyle = "#e6cf95"; cx.fillRect(0, H - 60, W, 60);
      cx.strokeStyle = "rgba(47,143,94,0.7)"; cx.lineWidth = 14; [70, 700].forEach((kx) => { cx.beginPath(); cx.moveTo(kx, H - 60); for (let y = H - 60; y > 360; y -= 40) cx.lineTo(kx + Math.sin(y * 0.02) * 24, y); cx.stroke(); });
      tex.refresh();
      this.add.image(0, 0, "tankbg").setOrigin(0, 0).setDepth(0);
      this.bubbles = []; for (let i = 0; i < 9; i++) { const b = this.add.image(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), "bub").setDepth(2).setAlpha(0.5).setScale(Phaser.Math.FloatBetween(0.4, 1)); b.vy = Phaser.Math.Between(20, 44); this.bubbles.push(b); }
      const v = this.add.graphics().setDepth(40); for (let i = 0; i < 46; i++) { v.lineStyle(2, 0x06243a, i / 46 * 0.16); v.strokeRect(i, i, W - 2 * i, H - 2 * i); }
    }

    buildHud() {
      this.hud = this.add.graphics().setDepth(30); this.hud.fillStyle(0x0a2d47, 0.82); this.hud.fillRoundedRect(8, 8, W - 16, 50, 16);
      this.orderNo = this.add.text(20, 17, "", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "22px", color: "#cdeeff", fontStyle: "800" }).setDepth(31);
      this.hearts = this.add.text(W - 20, 17, "", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "24px", color: "#ff5a7a" }).setOrigin(1, 0).setDepth(31);
      // the order (English there-is/are sentence) on a plate
      this.orderPlate = this.add.graphics().setDepth(30); this.orderPlate.fillStyle(0xffffff, 0.96); this.orderPlate.fillRoundedRect(W / 2 - 290, 70, 580, 76, 18); this.orderPlate.lineStyle(5, 0x7fd0ff, 1); this.orderPlate.strokeRoundedRect(W / 2 - 290, 70, 580, 76, 18);
      this.orderTx = this.add.text(W / 2, 100, "", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "32px", color: "#0a2d47", fontStyle: "800" }).setOrigin(0.5).setDepth(31);
      this.tallyTx = this.add.text(W / 2, 132, "", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "18px", color: "#2a6a90", fontStyle: "700" }).setOrigin(0.5).setDepth(31);
      this.orderPlate.setVisible(false); this.orderTx.setVisible(false); this.tallyTx.setVisible(false);
      this.updateHud();
    }
    updateHud() { this.orderNo.setText("ちゅうもん " + Math.min(this.order + 1, WIN) + "/" + WIN); this.hearts.setText("❤".repeat(Math.max(0, this.lives))); if (this.kind) this.tallyTx.setText("つかまえた: " + this.caught); }   // no /target: the number comes from READING the order (A2)

    startPlay() { if (this.playStarted) return; this.playStarted = true; this.state = "play"; this.hud.setVisible(true); this.orderPlate.setVisible(true); this.orderTx.setVisible(true); this.tallyTx.setVisible(true); this.newOrder(); }

    newOrder() {
      this.busy = false; this.caught = 0;
      const kd = KINDS[Phaser.Math.Between(0, KINDS.length - 1)]; this.kind = kd;
      const single = Phaser.Math.Between(0, 2) === 0;
      this.target = single ? 1 : Phaser.Math.Between(2, Math.min(6, 3 + Math.floor(this.order / 3)));
      const plural = kd.k === "fish" ? "fish" : kd.k + "s";
      const noun = this.target === 1 ? "a " + kd.k : NUM[this.target] + " " + plural;
      this.orderTx.setText("There " + (this.target === 1 ? "is " : "are ") + noun + ".").setScale(0.7);
      this.tweens.add({ targets: this.orderTx, scale: 1, duration: 200, ease: "Back.out" });
      this.updateHud();
      this.stockTank();
    }
    stockTank() {
      // keep a lively shoal: enough of the ordered kind + decoys of other kinds
      this.creatures.forEach((c) => { if (!c.grabbed) c.spr.destroy(); });
      this.creatures = [];
      const need = this.target + Phaser.Math.Between(1, 3);
      for (let i = 0; i < need; i++) this.spawnCreature(this.kind);
      const others = KINDS.filter((k) => k !== this.kind);
      for (let i = 0; i < this.target + 3; i++) this.spawnCreature(Phaser.Utils.Array.GetRandom(others));
    }
    spawnCreature(kd) {
      const x = Phaser.Math.Between(TANK.x0 + 30, TANK.x1 - 30), y = Phaser.Math.Between(TANK.y0 + 20, TANK.y1 - 20);
      const spr = this.add.image(x, y, kd.art).setScale(kd.sc).setDepth(12);
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2), s = Phaser.Math.Between(55, 100);
      this.tweens.add({ targets: spr, scaleY: kd.sc * 0.9, duration: 360, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.creatures.push({ spr, kind: kd.k, baseSc: kd.sc, vx: Math.cos(a) * s, vy: Math.sin(a) * s, grabbed: false });
    }

    onTap(p) {
      Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.state !== "play" || this.busy || this.grabbing) return;   // one grab at a time (no double-tap over-fill)
      let best = null, bd = 70 * 70;
      for (const c of this.creatures) { if (c.grabbed) continue; const dx = c.spr.x - p.x, dy = c.spr.y - p.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = c; } }
      if (!best) return;
      this.grab(best);
    }
    grab(c) {
      c.grabbed = true; this.grabbing = true; Sfx.grab();
      // tentacle whip from tako to the creature
      this.tweens.add({ targets: this.tako, scaleX: 0.56, scaleY: 0.66, duration: 110, yoyo: true });
      const correctKind = c.kind === this.kind.k;
      this.tweens.add({ targets: c.spr, x: this.tako.x, y: this.tako.y - 40, scale: c.baseSc * 0.5, duration: 240, ease: "Quad.in", onComplete: () => {
        c.spr.destroy(); this.creatures = this.creatures.filter((x) => x !== c); this.grabbing = false;
        if (correctKind) {
          Sfx.catch(); this.caught++; this.updateHud();
          this.spark(this.tako.x, this.tako.y - 40, 0x8affc0);
          if (this.caught >= this.target) this.serve();                     // order complete (lock prevents over-fill)
        } else {
          this.spoil("ちがう いきもの！");                                   // grabbed the wrong kind
        }
      } });
    }
    serve() {
      this.busy = true; Sfx.serve(); this.cameras.main.flash(160, 200, 240, 255);
      this.rewardDone = this.voice("there_" + this.target + "_" + this.kind.k);
      this.tweens.add({ targets: this.tako, scaleX: 0.7, scaleY: 0.7, duration: 160, yoyo: true, repeat: 2 });
      const t = this.add.text(W / 2, 200, this.orderTx.text + " ✓", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "30px", color: "#2fae5e", fontStyle: "800" }).setOrigin(0.5).setDepth(33).setStroke("#fff", 6).setScale(0.6);
      this.tweens.add({ targets: t, scale: 1, duration: 200, ease: "Back.out" }); this.time.delayedCall(1100, () => t.destroy());
      this.order++; this.updateHud();
      if (this.order >= WIN) { this.time.delayedCall(700, () => this.win()); return; }
      const reward = this.rewardDone || Promise.resolve(); this.rewardDone = null;
      Promise.all([reward, new Promise((r) => this.time.delayedCall(600, r))]).then(() => { if (this.state === "play") this.newOrder(); });
    }
    spoil(msg) {
      this.busy = true; Sfx.bad(); this.lives--; this.updateHud(); this.cameras.main.shake(180, 0.009);
      const t = this.add.text(W / 2, 200, msg, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "28px", color: "#ff7a6a", fontStyle: "800" }).setOrigin(0.5).setDepth(33).setStroke("#0a2d47", 5);
      this.tweens.add({ targets: t, y: t.y - 24, alpha: 0, duration: 900, onComplete: () => t.destroy() });
      if (this.lives <= 0) { this.time.delayedCall(600, () => this.lose()); return; }
      this.time.delayedCall(800, () => { if (this.state === "play") { this.caught = 0; this.updateHud(); this.stockTank(); this.busy = false; } });   // retry the same order
    }
    spark(x, y, color) { for (let i = 0; i < 8; i++) { const s = this.add.circle(x, y, Phaser.Math.Between(3, 6), color, 0.9).setDepth(24); const a = Math.random() * Math.PI * 2, d = Phaser.Math.Between(20, 60); this.tweens.add({ targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, duration: 400, onComplete: () => s.destroy() }); } }

    update(time, delta) {
      const dt = Math.min(0.033, delta / 1000);
      for (const b of this.bubbles) { b.y -= b.vy * dt; if (b.y < -20) { b.y = H + 20; b.x = Phaser.Math.Between(0, W); } }
      // tentacle line to nearest ungrabbed creature for readability
      this.tentacle.clear();
      if (this.state !== "play") return;
      for (const c of this.creatures) {
        if (c.grabbed) continue;
        c.spr.x += c.vx * dt; c.spr.y += c.vy * dt;
        if (c.spr.x < TANK.x0) { c.spr.x = TANK.x0; c.vx = Math.abs(c.vx); }
        if (c.spr.x > TANK.x1) { c.spr.x = TANK.x1; c.vx = -Math.abs(c.vx); }
        if (c.spr.y < TANK.y0) { c.spr.y = TANK.y0; c.vy = Math.abs(c.vy); }
        if (c.spr.y > TANK.y1) { c.spr.y = TANK.y1; c.vy = -Math.abs(c.vy); }
        c.spr.setFlipX(c.vx < 0);
      }
    }

    flash(color, alpha) { const f = this.add.rectangle(0, 0, W, H, color, alpha).setOrigin(0).setDepth(50); this.tweens.add({ targets: f, alpha: 0, duration: 240, onComplete: () => f.destroy() }); }
    win() { this.state = "over"; if (window.KMEFlow) KMEFlow.win(); Sfx.win(); this.flash(0xfff2c4, 0.5); this.tweens.add({ targets: this.tako, scaleX: 0.72, scaleY: 0.72, duration: 180, yoyo: true, repeat: 3 }); this.time.delayedCall(700, () => this.panel("まんぷく！", "YOU WIN!")); }
    lose() { this.state = "over"; Sfx.lose(); this.cameras.main.shake(280, 0.012); this.time.delayedCall(400, () => this.panel("もういちど！", "GAME OVER")); }
    panel(jp, big) {
      const p = this.add.graphics().setDepth(60); p.fillStyle(0x0a2d47, 0.95); p.fillRoundedRect(W / 2 - 200, H / 2 - 150, 400, 300, 28); p.lineStyle(6, 0x7fd0ff, 1); p.strokeRoundedRect(W / 2 - 200, H / 2 - 150, 400, 300, 28);
      this.add.image(W / 2, H / 2 - 80, "tako").setScale(0.4).setDepth(61);
      this.add.text(W / 2, H / 2 - 2, big, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "44px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5).setDepth(61).setStroke("#0a2d47", 6);
      this.add.text(W / 2, H / 2 + 44, jp, { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "26px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(61);
      const bw = 240, bh = 72, by = H / 2 + 108;
      const bg = this.add.graphics().setDepth(61); bg.fillStyle(0x3DBE6A, 1); bg.fillRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, 20); bg.lineStyle(5, 0x1F8A4C, 1); bg.strokeRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, 20);
      this.add.text(W / 2, by, "もう いちど ▶", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "26px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#1F5A30", 5);
      this.add.zone(W / 2, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(63).on("pointerdown", () => this.scene.restart());
      this.tweens.add({ targets: bg, alpha: 0.65, duration: 700, yoyo: true, repeat: -1 });
    }

    // ---------- title / intro / voice ----------
    introNeeded() { try { return !localStorage.getItem("it_intro_seen_v3"); } catch (e) { return true; } }
    markSeen() { try { localStorage.setItem("it_intro_seen_v3", "1"); } catch (e) {} }
    voice(key, onEnd) { const p = window.KMEAudio ? KMEAudio.play(key) : Promise.resolve(); if (onEnd) p.then(onEnd); return p; }
    showTitle() {
      this.state = "title"; this.titleStarted = false;
      const dim = this.add.graphics().setDepth(60); dim.fillStyle(0x06243a, 0.5); dim.fillRect(0, 0, W, H);
      const host = this.add.image(W / 2, H * 0.34, "tako").setScale(0.9).setDepth(62);
      this.titleBob = this.tweens.add({ targets: host, y: H * 0.34 - 16, duration: 950, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.add.text(W / 2, H * 0.56, "タコ の すいそう", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "40px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5).setDepth(62).setStroke("#06243a", 7);
      this.add.text(W / 2, H * 0.56 + 44, "Tako's Tank", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "24px", color: "#bdeaff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#06243a", 5);
      const bw = 300, bh = 92, bx = W / 2, by = H * 0.73;
      const bg = this.add.graphics().setDepth(62); bg.fillStyle(0x2aa9d8, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26); bg.lineStyle(6, 0x16708f, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26);
      this.add.triangle(bx - 58, by, 0, 0, 26, 16, 0, 32, 0xffffff).setDepth(63);
      this.add.text(bx + 14, by, "あそぶ", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "34px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(63).setStroke("#0a3a4a", 5);
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
      this.introBig = this.add.image(W / 2, H * 0.34, "tako").setScale(0.85).setDepth(47);
      this.introBob = this.tweens.add({ targets: this.introBig, y: H * 0.34 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const bx = W / 2, by = H * 0.62;
      this.introBg = this.add.graphics().setDepth(46); this.introBg.fillStyle(0xffffff, 0.97); this.introBg.fillRoundedRect(bx - 332, by - 104, 664, 208, 24); this.introBg.lineStyle(5, 0x0a2d47, 1); this.introBg.strokeRoundedRect(bx - 332, by - 104, 664, 208, 24);
      this.introText = this.add.text(bx, by, "まいど！ ワシ の すいそう や！\nちゅうもん を よんでや。 「There is a fish」 やったら\nさかな 1ぴき、 「There are three crabs」 やったら\nカニ 3びき を、 タップ して つかまえるんや！\nちがう いきもの や とりすぎ は あかんで！", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "22px", color: "#0a2d47", fontStyle: "700", align: "center", lineSpacing: 7 }).setOrigin(0.5).setDepth(47);
      this.skipBtn = this.add.text(W - 56, 92, "スキップ", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "24px", color: "#bdeaff", fontStyle: "700" }).setOrigin(1, 0.5).setDepth(48).setInteractive({ useHandCursor: true }).setStroke("#06243a", 5);
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
      this.tweens.add({ targets: this.introBig, x: W / 2, y: H - 96, scaleX: 0.6, scaleY: 0.6, duration: 600, ease: "Cubic.inOut", onComplete: () => { if (this.introBig) { this.introBig.destroy(); this.introBig = null; } this.tako.setVisible(true); } });
      this.time.delayedCall(700, () => this.startPlay());
    }
  }

  let booted = false;
  function boot() { if (booted) return; booted = true; new Phaser.Game({ type: Phaser.CANVAS, parent: "game", backgroundColor: "#0e3f63", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: [Play] }); }
  if (document.fonts && document.fonts.load) { Promise.all([document.fonts.load('800 30px "Baloo 2"'), document.fonts.load('700 22px "Zen Maru Gothic"')]).then(boot, boot); setTimeout(boot, 1500); } else boot();
})();
