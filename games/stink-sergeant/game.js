// Stink Sergeant (imperatives) - Phaser 3. Host: unko, the boot-camp drill
// sergeant. unko barks an English command and a countdown ring shrinks. If it is
// a real order ("Jump!", "Run!"), OBEY by tapping (the squad performs). If it
// starts with "Don't" ("Don't run!"), you must FREEZE and wait it out; obeying a
// "Don't" sets off a stink bomb. Reading the imperative (and spotting "Don't") is
// the grammar. English-only command (A2): a JP translation of the order would
// give away the "Don't", so the in-game command is never glossed.
"use strict";
(function () {
  const W = 760, H = 1200, TARGET = 12, LIVES = 3;

  const POS = [
    { en: "Stand up!", k: "stand" }, { en: "Sit down!", k: "sit" }, { en: "Jump!", k: "jump" },
    { en: "Run!", k: "run" }, { en: "Clap your hands!", k: "clap" }, { en: "Turn around!", k: "turn" },
    { en: "Touch your nose!", k: "touch" }, { en: "Raise your hand!", k: "raise" }
  ];
  const NEG = [
    { en: "Don't run!", k: "dont_run" }, { en: "Don't jump!", k: "dont_jump" },
    { en: "Don't shout!", k: "dont_shout" }, { en: "Don't sit down!", k: "dont_sit" },
    { en: "Don't move!", k: "dont_move" }
  ];

  const Sfx = {
    ctx: null,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    tone(f0, f1, dur, type, gain) { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); g.gain.setValueAtTime(gain || 0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur); },
    noise(dur, gain, freq) { if (!this.ctx) return; const t = this.ctx.currentTime, b = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 900; const g = this.ctx.createGain(); g.gain.setValueAtTime(gain || 0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(this.ctx.destination); s.start(t); s.stop(t + dur); },
    obey() { this.tone(620, 940, 0.1, "triangle", 0.16); },
    good() { [0, 90].forEach((d, i) => setTimeout(() => this.tone(660 + i * 180, 1000 + i * 180, 0.12, "triangle", 0.15), d)); },
    stink() { this.noise(0.5, 0.24, 500); this.tone(220, 90, 0.5, "sawtooth", 0.14); },
    scold() { this.tone(300, 160, 0.22, "square", 0.12); },
    win() { [0, 120, 240, 380].forEach((d, i) => setTimeout(() => this.tone(560 + i * 150, 940 + i * 150, 0.2, "triangle", 0.16), d)); },
    lose() { this.tone(420, 100, 0.5, "sawtooth", 0.16); }
  };

  class Play extends Phaser.Scene {
    constructor() { super("play"); }
    preload() {
      this.load.svg("unko", "assets/unko.svg", { width: 280, height: 240 });
      this.load.svg("recruit", "assets/recruit.svg", { width: 120, height: 120 });
      this.load.svg("stink", "assets/stink.svg", { width: 160, height: 160 });
      this.load.svg("heart", "assets/heart.svg", { width: 44, height: 44 });
    }
    create() {
      this.time.removeAllEvents();
      this.score = 0; this.lives = LIVES; this.combo = 0; this.awaiting = false; this.acted = false; this.busy = false; this.playStarted = false; this.state = null; this.cur = null;
      if (window.KMEAudio) { KMEAudio.setBase("assets/").stopAll(); KMEAudio.register(["ss_intro"].concat(POS.map((c) => "c_" + c.k)).concat(NEG.map((c) => "c_" + c.k))); }

      this.buildBackdrop();
      this.unko = this.add.image(140, 250, "unko").setScale(0.62).setDepth(20).setVisible(false);
      this.recruits = [];
      for (let i = 0; i < 3; i++) { const r = this.add.image(W / 2 - 180 + i * 180, H - 230, "recruit").setScale(0.9).setDepth(12).setVisible(false); r.baseY = r.y; this.recruits.push(r); }
      this.buildHud();

      const q = new URLSearchParams(location.search);
      if (q.has("cap")) { window.__ss = this; this.markSeen(); this.showSquad(); this.unko.setVisible(true); this.startPlay(); }
      else this.showTitle();

      this.input.on("pointerdown", (p) => this.onTap(p));
    }

    showSquad() { this.recruits.forEach((r) => r.setVisible(true)); }

    buildBackdrop() {
      if (this.textures.exists("campbg")) this.textures.remove("campbg");
      const tex = this.textures.createCanvas("campbg", W, H), cx = tex.getContext();
      const g = cx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#9fb98a"); g.addColorStop(0.5, "#7a9466"); g.addColorStop(1, "#5a7048");
      cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      cx.strokeStyle = "rgba(255,255,255,0.10)"; cx.lineWidth = 3;   // parade-ground lines
      for (let y = 300; y < H; y += 90) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y + 30); cx.stroke(); }
      tex.refresh();
      this.add.image(0, 0, "campbg").setOrigin(0, 0).setDepth(0);
      const fl = this.add.graphics().setDepth(1); fl.fillStyle(0x4a5c3a, 1); fl.fillRect(0, H - 150, W, 150);
      const v = this.add.graphics().setDepth(40); for (let i = 0; i < 46; i++) { v.lineStyle(2, 0x2a3a1e, i / 46 * 0.18); v.strokeRect(i, i, W - 2 * i, H - 2 * i); }
    }

    buildHud() {
      this.hud = this.add.graphics().setDepth(30); this.hud.fillStyle(0x2a3a1e, 0.8); this.hud.fillRoundedRect(8, 8, W - 16, 54, 16);
      this.scoreTx = this.add.text(20, 18, "", { fontFamily: '"Baloo 2"', fontSize: "24px", color: "#eaf6d8", fontStyle: "800" }).setDepth(31);
      this.hearts = this.add.text(W - 20, 18, "", { fontFamily: '"Baloo 2"', fontSize: "26px", color: "#ff5a7a" }).setOrigin(1, 0).setDepth(31);
      // command plate + ring
      this.cmdPlate = this.add.graphics().setDepth(30);
      this.cmdTx = this.add.text(W / 2, 150, "", { fontFamily: '"Baloo 2"', fontSize: "52px", color: "#fff", fontStyle: "800" }).setOrigin(0.5).setDepth(32).setStroke("#2a3a1e", 8);
      this.ring = this.add.graphics().setDepth(31);
      this.hintTx = this.add.text(W / 2, H - 70, "OBEY = タップ / Don't = うごくな", { fontFamily: '"Zen Maru Gothic"', fontSize: "20px", color: "#eaf6d8", fontStyle: "700" }).setOrigin(0.5).setDepth(31).setVisible(false);
      this.updateHud();
    }
    updateHud() { this.scoreTx.setText("れんぞく " + this.score + "/" + TARGET); this.hearts.setText("❤".repeat(Math.max(0, this.lives))); }

    startPlay() { if (this.playStarted) return; this.playStarted = true; this.state = "play"; this.hud.setVisible(true); this.hintTx.setVisible(true); this.showSquad(); this.time.delayedCall(500, () => this.newCommand()); }

    newCommand() {
      if (this.state !== "play") return;
      this.acted = false; this.awaiting = true; this.busy = false;
      const neg = Phaser.Math.Between(0, 99) < 42;
      this.cur = neg ? Phaser.Utils.Array.GetRandom(NEG) : Phaser.Utils.Array.GetRandom(POS);
      this.cur.neg = neg;
      // plate
      // Uniform plate for both kinds: the player must READ the command (spot "Don't"), not its colour (A2).
      this.cmdPlate.clear(); this.cmdPlate.fillStyle(0x3a4f24, 0.95); this.cmdPlate.fillRoundedRect(W / 2 - 320, 100, 640, 100, 22); this.cmdPlate.lineStyle(5, 0xffe08a, 0.9); this.cmdPlate.strokeRoundedRect(W / 2 - 320, 100, 640, 100, 22);
      this.cmdTx.setText(this.cur.en).setScale(0.6); this.tweens.add({ targets: this.cmdTx, scale: 1, duration: 200, ease: "Back.out" });
      this.voice("c_" + this.cur.k);
      // shrinking ring = the window
      const dur = Math.max(900, 1700 - this.score * 60);
      this.ringT = 1;
      this.ringTween = this.tweens.add({ targets: this, ringT: 0, duration: dur, ease: "Linear", onUpdate: () => this.drawRing(), onComplete: () => { if (this.awaiting && !this.acted) this.resolve("wait"); } });
      // unko bark
      this.tweens.add({ targets: this.unko, scaleX: 0.66, scaleY: 0.58, duration: 120, yoyo: true });
    }
    drawRing() {
      this.ring.clear(); const cx = W / 2, cy = 150, r = 250;
      this.ring.lineStyle(8, 0xffffff, 0.85);
      this.ring.beginPath(); this.ring.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.ringT, false); this.ring.strokePath();
    }

    onTap(p) {
      Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.state !== "play" || !this.awaiting || this.acted) return;
      this.acted = true; this.resolve("go");
    }

    resolve(action) {
      if (!this.awaiting) return; this.awaiting = false; this.busy = true;
      if (this.ringTween) this.ringTween.stop(); this.ring.clear();
      const neg = this.cur.neg;
      const correct = neg ? (action === "wait") : (action === "go");
      if (correct) {
        if (neg) { Sfx.good(); this.flash(0x6fcf8a, 0.25); this.squadFreeze(); }
        else { Sfx.obey(); this.squadPerform(); }
        this.score++; this.combo++; this.updateHud();
        if (this.score >= TARGET) { this.time.delayedCall(500, () => this.win()); return; }
        this.time.delayedCall(620, () => this.newCommand());
      } else {
        this.combo = 0;
        if (neg && action === "go") { Sfx.stink(); this.stinkBomb(); this.lives--; this.updateHud(); this.cameras.main.shake(280, 0.012); }
        else { Sfx.scold(); this.scold(); }   // missed a positive: scolded, no life lost
        if (this.lives <= 0) { this.time.delayedCall(700, () => this.lose()); return; }
        this.time.delayedCall(900, () => this.newCommand());
      }
    }

    squadPerform() { this.recruits.forEach((r, i) => this.time.delayedCall(i * 70, () => { this.tweens.add({ targets: r, y: r.baseY - 70, duration: 180, yoyo: true, ease: "Quad.out" }); this.tweens.add({ targets: r, angle: 12, duration: 120, yoyo: true }); })); }
    squadFreeze() { this.recruits.forEach((r) => { const f = this.add.text(r.x, r.y - 80, "❄", { fontSize: "34px" }).setOrigin(0.5).setDepth(15); this.tweens.add({ targets: f, alpha: 0, y: f.y - 20, duration: 600, onComplete: () => f.destroy() }); }); }
    stinkBomb() {
      this.recruits.forEach((r, i) => { const s = this.add.image(r.x, r.y - 30, "stink").setScale(0.2).setDepth(16).setAlpha(0.95); this.tweens.add({ targets: s, scale: 1.2, alpha: 0, duration: 900, ease: "Quad.out", onComplete: () => s.destroy() }); this.tweens.add({ targets: r, angle: i % 2 ? 24 : -24, y: r.baseY + 14, duration: 160, yoyo: true }); });
      const t = this.add.text(W / 2, H / 2, "くさ〜い！", { fontFamily: '"Baloo 2"', fontSize: "46px", color: "#b6d96a", fontStyle: "800" }).setOrigin(0.5).setDepth(33).setStroke("#2a3a1e", 7).setScale(0.6); this.tweens.add({ targets: t, scale: 1.1, alpha: 0, duration: 900, onComplete: () => t.destroy() });
    }
    scold() { const t = this.add.text(W / 2, H / 2, "おそい！", { fontFamily: '"Baloo 2"', fontSize: "40px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5).setDepth(33).setStroke("#2a3a1e", 6).setScale(0.6); this.tweens.add({ targets: t, scale: 1, alpha: 0, y: t.y - 30, duration: 700, onComplete: () => t.destroy() }); this.tweens.add({ targets: this.unko, angle: 8, duration: 60, yoyo: true, repeat: 3 }); }

    flash(color, alpha) { const f = this.add.rectangle(0, 0, W, H, color, alpha).setOrigin(0).setDepth(50); this.tweens.add({ targets: f, alpha: 0, duration: 240, onComplete: () => f.destroy() }); }
    win() { this.state = "over"; if (window.KMEFlow) KMEFlow.win(); Sfx.win(); this.flash(0xfff2c4, 0.5); this.tweens.add({ targets: this.unko, scaleX: 0.72, scaleY: 0.72, duration: 180, yoyo: true, repeat: 3 }); this.time.delayedCall(700, () => this.panel("ごうかく へいし！", "YOU WIN!")); }
    lose() { this.state = "over"; Sfx.lose(); this.cameras.main.shake(280, 0.012); this.time.delayedCall(400, () => this.panel("もういちど！", "GAME OVER")); }
    panel(jp, big) {
      const p = this.add.graphics().setDepth(60); p.fillStyle(0x2a3a1e, 0.95); p.fillRoundedRect(W / 2 - 200, H / 2 - 150, 400, 300, 28); p.lineStyle(6, 0xb6d96a, 1); p.strokeRoundedRect(W / 2 - 200, H / 2 - 150, 400, 300, 28);
      this.add.image(W / 2, H / 2 - 80, "unko").setScale(0.42).setDepth(61);
      this.add.text(W / 2, H / 2 - 2, big, { fontFamily: '"Baloo 2"', fontSize: "44px", color: "#b6d96a", fontStyle: "800" }).setOrigin(0.5).setDepth(61).setStroke("#2a3a1e", 6);
      this.add.text(W / 2, H / 2 + 44, jp, { fontFamily: '"Zen Maru Gothic"', fontSize: "26px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(61);
      const bw = 240, bh = 72, by = H / 2 + 108;
      const bg = this.add.graphics().setDepth(61); bg.fillStyle(0x3DBE6A, 1); bg.fillRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, 20); bg.lineStyle(5, 0x1F8A4C, 1); bg.strokeRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, 20);
      this.add.text(W / 2, by, "もう いちど ▶", { fontFamily: '"Zen Maru Gothic"', fontSize: "26px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#1F5A30", 5);
      this.add.zone(W / 2, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(63).on("pointerdown", () => this.scene.restart());
      this.tweens.add({ targets: bg, alpha: 0.65, duration: 700, yoyo: true, repeat: -1 });
    }

    // ---------- title / intro / voice ----------
    introNeeded() { try { return !localStorage.getItem("ss_intro_seen"); } catch (e) { return true; } }
    markSeen() { try { localStorage.setItem("ss_intro_seen", "1"); } catch (e) {} }
    voice(key, onEnd) { const p = window.KMEAudio ? KMEAudio.play(key) : Promise.resolve(); if (onEnd) p.then(onEnd); return p; }
    showTitle() {
      this.state = "title"; this.titleStarted = false;
      const dim = this.add.graphics().setDepth(60); dim.fillStyle(0x2a3a1e, 0.45); dim.fillRect(0, 0, W, H);
      const host = this.add.image(W / 2, H * 0.34, "unko").setScale(0.95).setDepth(62);
      this.titleBob = this.tweens.add({ targets: host, y: H * 0.34 - 16, duration: 950, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.add.text(W / 2, H * 0.56, "スティンク サージェント", { fontFamily: '"Baloo 2"', fontSize: "34px", color: "#d8f08a", fontStyle: "800" }).setOrigin(0.5).setDepth(62).setStroke("#2a3a1e", 7);
      this.add.text(W / 2, H * 0.56 + 42, "Stink Sergeant", { fontFamily: '"Baloo 2"', fontSize: "26px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#2a3a1e", 5);
      const bw = 300, bh = 92, bx = W / 2, by = H * 0.73;
      const bg = this.add.graphics().setDepth(62); bg.fillStyle(0x6a8a3e, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26); bg.lineStyle(6, 0x47611f, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26);
      this.add.triangle(bx - 58, by, 0, 0, 26, 16, 0, 32, 0xffffff).setDepth(63);
      this.add.text(bx + 14, by, "あそぶ", { fontFamily: '"Zen Maru Gothic"', fontSize: "34px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(63).setStroke("#2a3a1e", 5);
      this.titlePulse = this.tweens.add({ targets: bg, alpha: 0.7, duration: 650, yoyo: true, repeat: -1 });
      this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(64).on("pointerdown", () => this.startFromTitle());
    }
    startFromTitle() {
      if (this.titleStarted) return; this.titleStarted = true; Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.titleBob) this.titleBob.stop(); if (this.titlePulse) this.titlePulse.stop();
      this.children.list.filter((o) => o.depth >= 60 && o.depth < 65).forEach((o) => o.destroy());
      if (this.introNeeded()) this.startIntro(); else { this.markSeen(); this.unko.setVisible(true); this.showSquad(); this.startPlay(); }
    }
    startIntro() {
      this.state = "intro";
      this.introDim = this.add.graphics().setDepth(45); this.introDim.fillStyle(0x2a3a1e, 0.62); this.introDim.fillRect(0, 0, W, H);
      this.introBig = this.add.image(W / 2, H * 0.34, "unko").setScale(0.9).setDepth(47);
      this.introBob = this.tweens.add({ targets: this.introBig, y: H * 0.34 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const bx = W / 2, by = H * 0.62;
      this.introBg = this.add.graphics().setDepth(46); this.introBg.fillStyle(0xffffff, 0.97); this.introBg.fillRoundedRect(bx - 332, by - 104, 664, 208, 24); this.introBg.lineStyle(5, 0x2a3a1e, 1); this.introBg.strokeRoundedRect(bx - 332, by - 104, 664, 208, 24);
      this.introText = this.add.text(bx, by, "ワシ は スティンク ぐんそう だ！\nめいれい を よく きけ！\n「Jump!」 みたいな めいれい なら、\nタップ して したがえ！\nでも 「Don't」 が ついたら… うごくな！\nうごいたら クサい バクダン だ ぞ！", { fontFamily: '"Zen Maru Gothic"', fontSize: "22px", color: "#2a3a1e", fontStyle: "700", align: "center", lineSpacing: 6 }).setOrigin(0.5).setDepth(47);
      this.skipBtn = this.add.text(W - 56, 92, "スキップ", { fontFamily: '"Zen Maru Gothic"', fontSize: "24px", color: "#d8f08a", fontStyle: "700" }).setOrigin(1, 0.5).setDepth(48).setInteractive({ useHandCursor: true }).setStroke("#2a3a1e", 5);
      this.skipChev = this.add.triangle(W - 34, 92, 0, 0, 18, 11, 0, 22, 0xb6d96a).setDepth(48).setInteractive({ useHandCursor: true });
      let advanced = false; this.advIntro = () => { if (advanced) return; advanced = true; this.endIntro(); };
      this.skipBtn.on("pointerdown", this.advIntro); this.skipChev.on("pointerdown", this.advIntro);
      this.voice("ss_intro", this.advIntro);
      this.time.delayedCall(20000, this.advIntro);
    }
    endIntro() {
      this.markSeen();
      if (window.KMEAudio) KMEAudio.stopAll();
      [this.skipBtn, this.skipChev].forEach((o) => { if (o) o.destroy(); }); this.skipBtn = null; this.skipChev = null;
      if (this.introBob) this.introBob.stop();
      this.tweens.add({ targets: [this.introDim, this.introBg, this.introText], alpha: 0, duration: 420, onComplete: () => { [this.introDim, this.introBg, this.introText].forEach((o) => { if (o) o.destroy(); }); } });
      this.tweens.add({ targets: this.introBig, x: 140, y: 250, scaleX: 0.62, scaleY: 0.62, duration: 600, ease: "Cubic.inOut", onComplete: () => { if (this.introBig) { this.introBig.destroy(); this.introBig = null; } this.unko.setVisible(true); this.showSquad(); } });
      this.time.delayedCall(700, () => this.startPlay());
    }
  }

  let booted = false;
  function boot() { if (booted) return; booted = true; new Phaser.Game({ type: Phaser.CANVAS, parent: "game", backgroundColor: "#7a9466", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: [Play] }); }
  if (document.fonts && document.fonts.load) { Promise.all([document.fonts.load('800 30px "Baloo 2"'), document.fonts.load('700 22px "Zen Maru Gothic"')]).then(boot, boot); setTimeout(boot, 1500); } else boot();
})();
