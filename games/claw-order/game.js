// Claw & Order (prepositions in/on/under/by) - Phaser 3. A real UFO-catcher: BUTTONS to
// move the claw (left/right) and LOWER it; you must PICK UP the apple, then place it
// IN / ON / UNDER / BY a reconfiguring box. Scored by resting position, not a label.
// "in" requires dropping through the open mouth (landing on the lid = "on"). Host catcherski.
// Per game-designs/g5-redesign.md + art-bible.md + pre-flight-qa.md (+ critic-gate fixes).
"use strict";
(function () {
  const W = 760, H = 1180, FLOORY = 920, DECKY = 944;
  const BOXX = 380, BOXW = 240, BOXL = BOXX - BOXW / 2, BOXR = BOXX + BOXW / 2;
  const RIM = 146, LEGGAP = 120, BESIDE = 120, APPLER = 42, MOUTHIN = 40;
  const TIP = 96, CARRY = 84;
  const MOVESPD = 380, LOWERSPD = 540, LIFTSPD = 760, GRAV = 2600;
  const CLAWMINY = 210, CLAWMINX = 80, CLAWMAXX = W - 80, FLOORTIP = FLOORY - 18;
  const PICKX = 150;

  const ROUNDS = [
    { prep: "in", jp: "なか" }, { prep: "on", jp: "うえ" }, { prep: "by", jp: "よこ" },
    { prep: "under", jp: "した" }, { prep: "on", jp: "うえ" }, { prep: "in", jp: "なか" }
  ];

  const Sfx = {
    ctx: null,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    tone(f0, f1, dur, type, gain) { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); g.gain.setValueAtTime(gain || 0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur); },
    noise(dur, gain, freq) { if (!this.ctx) return; const t = this.ctx.currentTime, b = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 800; const g = this.ctx.createGain(); g.gain.setValueAtTime(gain || 0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(this.ctx.destination); s.start(t); s.stop(t + dur); },
    beep() { this.tone(900, 1300, 0.07, "square", 0.12); },
    motor() { this.tone(160, 150, 0.1, "sawtooth", 0.04); },
    clunk() { this.noise(0.12, 0.2, 400); this.tone(180, 110, 0.14, "sawtooth", 0.12); },
    grab() { this.tone(520, 760, 0.1, "square", 0.12); this.noise(0.06, 0.1, 1200); },
    miss() { this.tone(300, 180, 0.16, "sawtooth", 0.1); },
    landFor(type) { if (type === "in") this.tone(300, 150, 0.16, "sine", 0.16); else if (type === "on") { this.noise(0.07, 0.18, 900); this.tone(260, 180, 0.08, "square", 0.1); } else if (type === "under") this.noise(0.18, 0.12, 1500); else this.tone(900, 700, 0.05, "square", 0.1); },
    good() { this.tone(660, 990, 0.12, "triangle", 0.2); this.tone(990, 1320, 0.12, "triangle", 0.12); },
    coins() { for (let i = 0; i < 6; i++) setTimeout(() => this.tone(1200 + i * 80, 1600, 0.06, "square", 0.08), i * 45); },
    bad() { this.noise(0.2, 0.28, 480); this.tone(200, 90, 0.25, "sawtooth", 0.16); }
  };

  class Play extends Phaser.Scene {
    constructor() { super("play"); }
    preload() {
      this.load.svg("bear", "assets/bear.svg", { width: 106, height: 89 });
      this.load.svg("claw", "assets/claw.svg", { width: 138, height: 115 });
      this.load.svg("crate", "assets/crate.svg", { width: BOXW + 30, height: (BOXW + 30) * 200 / 260 });
      this.load.svg("lid", "assets/lid.svg", { width: BOXW + 30, height: (BOXW + 30) * 86 / 260 });
      this.load.svg("heart", "assets/heart.svg", { width: 38, height: 36 });
      this.load.svg("catcherski", "assets/catcherski.svg", { width: 152, height: 128 });
    }
    create() {
      this.lives = 3; this.round = 0; this.score = 0;
      this.state = "ready"; this.clawX = W / 2; this.clawY = CLAWMINY;
      this.moveDir = 0; this.lowering = false; this.carrying = false; this.maxTip = FLOORTIP;
      this.apple = null; this.appleVy = 0; this.appleFalling = false; this.rest = null; this.voices = {};
      if (window.KMEAudio) { KMEAudio.setBase("assets/").stopAll(); KMEAudio.register(["en_in", "en_on", "en_under", "en_by", "co_intro"]); }
      this.makeLegTexture();
      this.buildBackground();
      this.host = this.textures.exists("catcherski") ? this.add.image(W - 82, 116, "catcherski").setDepth(20).setAlpha(0.95) : null;

      this.legShadowL = this.add.ellipse(BOXL + 38, FLOORY + 4, 40, 14, 0x000000, 0.22).setDepth(4).setVisible(false);
      this.legShadowR = this.add.ellipse(BOXR - 38, FLOORY + 4, 40, 14, 0x000000, 0.22).setDepth(4).setVisible(false);
      this.legL = this.add.image(BOXL + 38, FLOORY, "legtex").setOrigin(0.5, 1).setDepth(5).setVisible(false);
      this.legR = this.add.image(BOXR - 38, FLOORY, "legtex").setOrigin(0.5, 1).setDepth(5).setVisible(false);
      this.crateShadow = this.add.ellipse(BOXX, FLOORY + 8, BOXW + 60, 28, 0x000000, 0.24).setDepth(5);
      this.crate = this.add.image(BOXX, FLOORY, "crate").setOrigin(0.5, 1).setDepth(6);
      this.lid = this.add.image(BOXX, 0, "lid").setOrigin(0.5, 1).setDepth(9);

      this.rail = this.add.rectangle(W / 2, 150, W - 56, 14, 0xb9c4d8).setDepth(15).setStrokeStyle(3, 0x5d6678);
      this.cable = this.add.rectangle(this.clawX, 156, 5, 60, 0xcfd8e6).setOrigin(0.5, 0).setDepth(15);
      this.claw = this.add.image(this.clawX, this.clawY, "claw").setOrigin(0.5, 0.1).setDepth(16);
      this.halo = this.add.circle(0, 0, 58, 0xffe7a8, 0.0).setDepth(8);
      this.held = null;
      this.bedApple = null;
      this.guide = this.add.graphics().setDepth(4);

      this.buildHud();
      this.buildButtons();
      if (location.search.includes("cap")) this.readyOverlay(); else this.showTitle();   // PLAY button first (unlocks audio), then the host intro
      this.configBox(ROUNDS[0].prep, true);
      this.spawnApple();
      this.showInstruction();

      this.input.on("pointerdown", () => { Sfx.init(); if (this.state === "ready") this.startPlay(); });

      const q = new URLSearchParams(location.search);
      if (q.has("cap")) {
        this.startPlay(); const prep = q.get("prep") || "in"; this.round = 0; this.cur = { prep: prep, jp: "x" }; this.configBox(prep, true); this.showInstruction();
        // simulate: grab apple, carry to target X + depth, drop
        this.carrying = true; if (this.bedApple) this.bedApple.destroy(); this.bedApple = null;
        const spot = { in: [BOXX, false], on: [BOXX, false], by: [BOXR + 70, false], under: [BOXX, true] }[prep];
        this.clawX = spot[0]; this.clawY = spot[1] ? (FLOORY - LEGGAP + 40) : 360;
        this.held = this.add.image(this.clawX, this.clawY + CARRY, "bear").setDepth(15);
        this.placeDrop();
        const n = parseInt(q.get("cap")) || 46; for (let i = 0; i < n; i++) this.stepDrop(1 / 60);
        this.claw.y = CLAWMINY; this.cable.height = CLAWMINY - 96; this.guide.clear();
      }
    }

    makeLegTexture() { if (this.textures.exists("legtex")) return; const t = this.textures.createCanvas("legtex", 30, 160), c = t.getContext(); const g = c.createLinearGradient(0, 0, 30, 0); g.addColorStop(0, "#c9a05a"); g.addColorStop(0.5, "#dca85e"); g.addColorStop(1, "#9c6c2e"); c.fillStyle = g; c.fillRect(4, 0, 22, 160); c.strokeStyle = "#7a4f1c"; c.lineWidth = 5; c.strokeRect(5, -2, 20, 162); t.refresh(); }

    buildBackground() {
      if (!this.textures.exists("bg")) {
        const tex = this.textures.createCanvas("bg", W, H), cx = tex.getContext();
        const g = cx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#2b3870"); g.addColorStop(0.5, "#18203f"); g.addColorStop(1, "#0b1024");
        cx.fillStyle = g; cx.fillRect(0, 0, W, H);
        cx.globalAlpha = 0.06; cx.fillStyle = "#bfe0ff"; cx.beginPath(); cx.moveTo(90, 130); cx.lineTo(180, 130); cx.lineTo(60, DECKY); cx.lineTo(-40, DECKY); cx.closePath(); cx.fill();
        cx.beginPath(); cx.moveTo(W - 220, 130); cx.lineTo(W - 150, 130); cx.lineTo(W - 250, DECKY); cx.lineTo(W - 330, DECKY); cx.closePath(); cx.fill();
        cx.globalAlpha = 1; const v = cx.createRadialGradient(W / 2, FLOORY / 2 + 100, H * 0.22, W / 2, FLOORY / 2 + 100, H * 0.6); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(4,8,20,0.5)"); cx.fillStyle = v; cx.fillRect(0, 0, W, DECKY); tex.refresh();
      }
      this.add.image(0, 0, "bg").setOrigin(0).setDepth(0);
      const mid = this.add.graphics().setDepth(1); mid.fillStyle(0x222c52, 0.5); mid.fillRoundedRect(40, FLOORY - 70, W - 80, 80, 26);
      const fr = this.add.graphics().setDepth(2); fr.lineStyle(11, 0x3a4a8a, 1); fr.strokeRoundedRect(16, 128, W - 32, FLOORY - 60, 24);
      const fl = this.add.graphics().setDepth(2); fl.fillStyle(0x283156, 1); fl.fillRoundedRect(8, FLOORY, W - 16, DECKY - FLOORY + 14, 18);
      for (let x = 30; x < W; x += 64) { fl.fillStyle(0x344070, 1); fl.fillCircle(x, FLOORY + 12, 26); fl.fillStyle(0x3e4c84, 1); fl.fillCircle(x - 6, FLOORY + 6, 17); }
      this.dust = this.add.group();
      for (let i = 0; i < 9; i++) { const d = this.add.circle(Phaser.Math.Between(30, W - 30), Phaser.Math.Between(160, FLOORY), Phaser.Math.Between(2, 5), 0xbfe0ff, 0.18).setDepth(3); d.vy = Phaser.Math.FloatBetween(5, 16); this.dust.add(d); }
      // control deck panel
      const dk = this.add.graphics().setDepth(17); dk.fillStyle(0x1a2140, 1); dk.fillRect(0, DECKY, W, H - DECKY); dk.lineStyle(4, 0x3a4a8a, 1); dk.lineBetween(0, DECKY, W, DECKY);
    }

    buildHud() {
      const bar = this.add.graphics().setDepth(29); bar.fillStyle(0x12183a, 0.92); bar.fillRoundedRect(8, 8, W - 16, 54, 16);
      this.roundText = this.add.text(20, 20, "", { fontFamily: '"Baloo 2"', fontSize: "25px", color: "#cfe0ff", fontStyle: "800" }).setDepth(30);
      this.heartIcons = []; for (let i = 0; i < 3; i++) this.heartIcons.push(this.add.image(W - 30 - i * 42, 35, "heart").setDepth(30));
      this.tokenG = this.add.graphics().setDepth(29);
      this.sPre = this.add.text(0, 0, "", { fontFamily: '"Baloo 2"', fontSize: "29px", color: "#FFF7F0", fontStyle: "600" }).setOrigin(0, 0.5).setDepth(31).setStroke("#0a1a2a", 4);
      this.sMid = this.add.text(0, 0, "", { fontFamily: '"Baloo 2"', fontSize: "44px", color: "#1E1233", fontStyle: "800" }).setOrigin(0, 0.5).setDepth(31);
      this.sPost = this.add.text(0, 0, "", { fontFamily: '"Baloo 2"', fontSize: "29px", color: "#FFF7F0", fontStyle: "600" }).setOrigin(0, 0.5).setDepth(31).setStroke("#0a1a2a", 4);
      this.tokenJp = this.add.text(0, 0, "", { fontFamily: '"Zen Maru Gothic"', fontSize: "22px", color: "#FFF7F0", fontStyle: "700" }).setOrigin(0.5).setDepth(31).setStroke("#0a1a2a", 5);
    }
    drawHearts() { for (let i = 0; i < 3; i++) this.heartIcons[i].setAlpha(i < this.lives ? 1 : 0.22).setTint(i < this.lives ? 0xffffff : 0x556677); }

    buildButtons() {
      const my = (DECKY + H) / 2;
      this.btnL = this.makeBtn(140, my, 170, 150, "◀", 0x3a4a8a);
      this.btnR = this.makeBtn(W - 140, my, 170, 150, "▶", 0x3a4a8a);
      this.btnD = this.makeBtn(W / 2, my, 250, 150, "おろす", 0x3DBE6A);
      this.btnL.zone.on("pointerdown", () => { if (this.state === "aim") { this.moveDir = -1; this.press(this.btnL); Sfx.motor(); } });
      this.btnR.zone.on("pointerdown", () => { if (this.state === "aim") { this.moveDir = 1; this.press(this.btnR); Sfx.motor(); } });
      ["pointerup", "pointerout"].forEach((e) => { this.btnL.zone.on(e, () => { if (this.moveDir < 0) this.moveDir = 0; this.unpress(this.btnL); }); this.btnR.zone.on(e, () => { if (this.moveDir > 0) this.moveDir = 0; this.unpress(this.btnR); }); });
      this.btnD.zone.on("pointerdown", () => { if (this.state === "aim") this.beginLower(); this.press(this.btnD); });
      ["pointerup", "pointerout"].forEach((e) => this.btnD.zone.on(e, () => { if (this.state === "lowering") this.act(); this.unpress(this.btnD); }));
    }
    makeBtn(x, y, w, h, label, color) {
      const g = this.add.graphics().setDepth(18); g.fillStyle(color, 1); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 22); g.lineStyle(5, 0x0a1226, 0.6); g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 22);
      const t = this.add.text(x, y, label, { fontFamily: '"Zen Maru Gothic"', fontSize: label.length > 1 ? "38px" : "56px", color: "#ffffff", fontStyle: "700" }).setOrigin(0.5).setDepth(19).setStroke("#0a1226", 5);
      const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(20);
      return { g: g, t: t, zone: zone, x: x, y: y, w: w, h: h, color: color };
    }
    press(b) { b.t.setScale(0.92); }
    unpress(b) { b.t.setScale(1); }

    readyOverlay() {
      this.readyG = this.add.graphics().setDepth(45); this.readyG.fillStyle(0x06101f, 0.5); this.readyG.fillRect(0, 0, W, H);
      this.readyT = this.add.text(W / 2, FLOORY * 0.56, "ボタン で クレーン を うごかして\nくま を ひろって おく ナリ！", { fontFamily: '"Zen Maru Gothic"', fontSize: "30px", color: "#FFF7F0", fontStyle: "700", align: "center" }).setOrigin(0.5).setDepth(46).setStroke("#0a1a2a", 8);
      this.readyT2 = this.add.text(W / 2, FLOORY * 0.56 + 74, "MOVE, LOWER, GRAB, PLACE", { fontFamily: '"Baloo 2"', fontSize: "22px", color: "#FFCF4D", fontStyle: "800" }).setOrigin(0.5).setDepth(46).setStroke("#0a1a2a", 5);
      this.tweens.add({ targets: [this.readyT, this.readyT2], alpha: 0.45, duration: 600, yoyo: true, repeat: -1 });
    }
    startPlay() { if (this.readyG) { this.readyG.destroy(); this.readyT.destroy(); this.readyT2.destroy(); this.readyG = null; } this.state = "aim"; this.playStarted = true; if (this.cur) this.voice("en_" + this.cur.prep); }
    introNeeded() { try { return !localStorage.getItem("co_intro_seen"); } catch (e) { return true; } }
    markSeen() { try { localStorage.setItem("co_intro_seen", "1"); } catch (e) {} }
    voice(key, onEnd) { const p = window.KMEAudio ? KMEAudio.play(key) : Promise.resolve(); if (onEnd) p.then(onEnd); return p; }
    showTitle() {
      this.state = "title"; this.titleStarted = false; if (this.host) this.host.setVisible(false);
      this.titleG = this.add.graphics().setDepth(50); this.titleG.fillStyle(0x06101f, 0.55); this.titleG.fillRect(0, 0, W, H);
      this.titleHost = this.add.image(W / 2, H * 0.32, "catcherski").setScale(1.5).setDepth(52);
      this.titleBob2 = this.tweens.add({ targets: this.titleHost, y: H * 0.32 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.t1 = this.add.text(W / 2, H * 0.54, "クレーノフ の しわざ", { fontFamily: '"Baloo 2"', fontSize: "36px", color: "#FFCF4D", fontStyle: "800" }).setOrigin(0.5).setDepth(52).setStroke("#1E1233", 7);
      this.t2 = this.add.text(W / 2, H * 0.54 + 44, "Claw & Order", { fontFamily: '"Baloo 2"', fontSize: "24px", color: "#cfe0ff", fontStyle: "700" }).setOrigin(0.5).setDepth(52).setStroke("#1E1233", 5);
      const bw = 300, bh = 92, bx = W / 2, by = H * 0.72;
      this.tbg = this.add.graphics().setDepth(52); this.tbg.fillStyle(0xff8a3d, 1); this.tbg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26); this.tbg.lineStyle(6, 0xb85a18, 1); this.tbg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26);
      this.ttri = this.add.triangle(bx - 58, by, 0, 0, 26, 16, 0, 32, 0xffffff).setDepth(53);
      this.tplay = this.add.text(bx + 14, by, "あそぶ", { fontFamily: '"Zen Maru Gothic"', fontSize: "34px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(53).setStroke("#5a2a08", 5);
      this.tpulse = this.tweens.add({ targets: this.tbg, alpha: 0.7, duration: 650, yoyo: true, repeat: -1 });
      this.tzone = this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(54).on("pointerdown", () => this.startFromTitle());
    }
    startFromTitle() {
      if (this.titleStarted) return; this.titleStarted = true; Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.titleBob2) this.titleBob2.stop(); if (this.tpulse) this.tpulse.stop();
      [this.titleG, this.titleHost, this.t1, this.t2, this.tbg, this.ttri, this.tplay, this.tzone].forEach((o) => o && o.destroy());
      if (this.introNeeded()) this.startIntro(); else { this.state = "ready"; if (this.host) this.host.setVisible(true); this.readyOverlay(); }
    }
    startIntro() {
      this.state = "intro"; if (this.host) this.host.setVisible(false);
      this.introDim = this.add.graphics().setDepth(45); this.introDim.fillStyle(0x06101f, 0.6); this.introDim.fillRect(0, 0, W, H);
      this.introBig = this.textures.exists("catcherski") ? this.add.image(W / 2, H * 0.32, "catcherski").setScale(1.5).setDepth(47) : null;
      if (this.introBig) this.introBob = this.tweens.add({ targets: this.introBig, y: H * 0.32 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const bx = W / 2, by = H * 0.56;
      this.introBg = this.add.graphics().setDepth(46); this.introBg.fillStyle(0xffffff, 0.97); this.introBg.fillRoundedRect(bx - 322, by - 92, 644, 184, 24); this.introBg.lineStyle(5, 0x1E1233, 1); this.introBg.strokeRoundedRect(bx - 322, by - 92, 644, 184, 24);
      this.introText = this.add.text(bx, by, "ピッ！ クマ を つかんで、 えいご の とおり に\nはこ に おく ナリ！ ボタン で うごかして、\n「おろす」 で つかむ・おとす ナリ！", { fontFamily: '"Zen Maru Gothic"', fontSize: "25px", color: "#1E1233", fontStyle: "700", align: "center", lineSpacing: 8 }).setOrigin(0.5).setDepth(47);
      this.skipBtn = this.add.text(W - 22, 70, "スキップ ▶", { fontFamily: '"Zen Maru Gothic"', fontSize: "23px", color: "#cfe0ff", fontStyle: "700" }).setOrigin(1, 0).setDepth(48).setInteractive({ useHandCursor: true }).setStroke("#06101f", 5);
      let advanced = false; const adv = () => { if (advanced) return; advanced = true; this.endIntro(); };
      this.skipBtn.on("pointerdown", adv);
      this.voice("co_intro", adv);   // advances when the clip actually ends
      this.time.delayedCall(20000, adv);   // safety net if audio is blocked
    }
    endIntro() {
      this.markSeen(); this.state = "ready";
      if (window.KMEAudio) KMEAudio.stopAll();
      if (this.skipBtn) { this.skipBtn.destroy(); this.skipBtn = null; }
      if (this.introBob) this.introBob.stop();
      const objs = [this.introDim, this.introBg, this.introText, this.introBig];
      this.tweens.add({ targets: objs.filter(Boolean), alpha: 0, duration: 450, onComplete: () => { objs.forEach((o) => { if (o) o.destroy(); }); if (this.host) this.host.setVisible(true); this.readyOverlay(); } });
    }

    configBox(prep, instant) {
      const raised = prep === "under"; const bodyBottom = raised ? FLOORY - LEGGAP : FLOORY;
      this.bodyBottom = bodyBottom; this.lidTopY = bodyBottom - RIM;
      this.crate.y = bodyBottom; this.crateShadow.y = FLOORY + 8;
      [this.legL, this.legR].forEach((lg) => { lg.setVisible(raised); lg.displayHeight = LEGGAP + 8; });
      [this.legShadowL, this.legShadowR].forEach((s) => s.setVisible(raised));
      this.lid.setVisible(prep !== "in"); this.lid.x = BOXX; this.lid.y = this.lidTopY + 10;
      if (!instant) Sfx.clunk();
    }
    spawnApple() {
      this.carrying = false;
      this.bedApple = this.add.image(PICKX, FLOORY - APPLER + 6, "bear").setDepth(7).setAlpha(0);
      this.add.ellipse(PICKX, FLOORY + 2, 60, 14, 0x000000, 0.22).setDepth(6);
      this.tweens.add({ targets: this.bedApple, alpha: 1, duration: 250 });
    }
    showInstruction() {
      this.cur = this.cur || ROUNDS[this.round];
      this.roundText.setText("ステージ " + (this.round + 1) + " / " + ROUNDS.length);
      const y = 104, gap = 16;
      this.sPre.setText("Put the bear"); this.sMid.setText(this.cur.prep); this.sPost.setText("the box.");
      const total = this.sPre.width + gap + this.sMid.width + gap + this.sPost.width;
      let x = W / 2 - total / 2;
      this.sPre.setPosition(x, y); x += this.sPre.width + gap;
      this.tokenG.clear(); this.tokenG.fillStyle(0xFFCF4D, 1); this.tokenG.fillRoundedRect(x - 12, y - 30, this.sMid.width + 24, 60, 16); this.tokenG.lineStyle(5, 0xE8851A, 1); this.tokenG.strokeRoundedRect(x - 12, y - 30, this.sMid.width + 24, 60, 16);
      this.sMid.setPosition(x, y); x += this.sMid.width + gap;
      this.sPost.setPosition(x, y);
      this.tokenJp.setText("どこ に おく ナリ？").setPosition(W / 2, y + 52); // never translate the answer in a test
      Sfx.beep();
      if (this.playStarted) this.voice("en_" + this.cur.prep); // speak the English sentence (kids hear it)
    }

    beginLower() {
      this.state = "lowering"; Sfx.motor();
      // how low the claw tip can go at this X (collision)
      const footprint = this.clawX >= BOXL && this.clawX <= BOXR;
      const inMouth = this.clawX >= BOXL + MOUTHIN && this.clawX <= BOXR - MOUTHIN;
      if (!this.carrying) { this.maxTip = FLOORTIP; }
      else if (this.cur.prep === "in") { this.maxTip = inMouth ? this.bodyBottom - 20 : (footprint ? this.lidTopY - 4 : FLOORTIP); }
      else if (this.cur.prep === "under") { this.maxTip = FLOORTIP; }
      else { this.maxTip = footprint ? this.lidTopY - 4 : FLOORTIP; } // on/by: stop on closed box
    }

    act() {
      if (this.state !== "lowering") return;
      if (!this.carrying) { // pickup attempt
        if (this.bedApple && Math.abs(this.clawX - PICKX) < 85 && this.clawY + TIP > FLOORY - APPLER - 30) {
          this.carrying = true; Sfx.grab();
          this.held = this.bedApple; this.bedApple = null; this.held.setDepth(15);
          this.tweens.add({ targets: this.halo, alpha: 0.16 });
        } else { Sfx.miss(); }
        this.state = "lifting";
      } else { this.placeDrop(); }
    }

    placeDrop() {
      Sfx.motor();
      this.rest = this.classify(this.clawX, this.clawY + TIP, this.cur.prep);
      this.apple = this.held; this.held = null; this.appleFalling = true; this.appleVy = 0;
      this.apple.setDepth(this.rest.type === "under" ? 4 : this.rest.type === "in" ? 7 : 12);
      if (this.rest.type === "in") this.apple.setScale(0.86);
      this.state = "lifting"; this.guide.clear();
      this.tweens.add({ targets: this.halo, alpha: 0 });
    }

    classify(cx, tipY, prep) {
      const footprint = cx >= BOXL && cx <= BOXR;
      const inMouth = cx >= BOXL + MOUTHIN && cx <= BOXR - MOUTHIN;
      if (prep === "in") {
        if (inMouth) return { type: "in", rx: Phaser.Math.Clamp(cx, BOXL + MOUTHIN, BOXR - MOUTHIN), ry: this.lidTopY + 6 };
        if (footprint) return { type: "on", rx: cx, ry: this.lidTopY - APPLER + 10 }; // landed on the rim, not in
        return this.beside(cx);
      }
      if (prep === "under") {
        if (footprint && tipY > this.bodyBottom + 4) return { type: "under", rx: Phaser.Math.Clamp(cx, BOXL + 26, BOXR - 26), ry: FLOORY - APPLER };
        if (footprint) return { type: "on", rx: cx, ry: this.lidTopY - APPLER + 10 }; // released too high = on the raised box
        return this.beside(cx);
      }
      if (footprint) return { type: "on", rx: cx, ry: this.lidTopY - APPLER + 10 };
      return this.beside(cx);
    }
    beside(cx) {
      if (cx >= BOXL - BESIDE && cx < BOXL) return { type: "by", rx: BOXL - APPLER - 4, ry: FLOORY - APPLER };
      if (cx > BOXR && cx <= BOXR + BESIDE) return { type: "by", rx: BOXR + APPLER + 4, ry: FLOORY - APPLER };
      return { type: "miss", rx: Phaser.Math.Clamp(cx, 70, W - 70), ry: FLOORY - APPLER };
    }

    stepDrop(dt) {
      if (!this.appleFalling || !this.apple) return;
      this.appleVy += GRAV * dt; this.apple.y += this.appleVy * dt;
      this.apple.x += (this.rest.rx - this.apple.x) * Math.min(1, dt * 7); this.apple.rotation += dt * 1.4;
      if (this.apple.y >= this.rest.ry) { this.apple.y = this.rest.ry; this.apple.x = this.rest.rx; this.apple.rotation = 0; this.appleFalling = false; this.settle(); }
    }
    settle() {
      Sfx.landFor(this.rest.type);
      this.time.delayedCall(80, () => {
        this.cameras.main.shake(90, 0.006); this.burst(this.apple.x, this.apple.y, 0xcaa05c, 7);
        this.tweens.add({ targets: this.apple, scaleX: this.apple.scaleX * 1.2, scaleY: this.apple.scaleY * 0.82, duration: 90, yoyo: true });
        if (this.rest.type !== "in") this.add.ellipse(this.apple.x, this.rest.type === "on" ? this.lidTopY + 6 : FLOORY + 2, 56, 14, 0x000000, 0.22).setDepth(this.apple.depth - 1);
        this.time.delayedCall(340, () => this.resolve());
      });
    }
    resolve() {
      const ok = this.rest.type === this.cur.prep;
      if (ok) { this.score++; Sfx.good(); Sfx.coins(); this.cameras.main.flash(160, 90, 220, 130); this.burst(this.apple.x, this.apple.y - 20, 0xFFCF4D, 16); if (this.host) this.tweens.add({ targets: this.host, scaleX: this.host.scaleX * 1.12, scaleY: this.host.scaleY * 1.12, duration: 140, yoyo: true }); }
      else { this.lives--; this.drawHearts(); Sfx.bad(); this.cameras.main.flash(170, 230, 60, 60); this.cameras.main.shake(220, 0.012); if (this.host) this.tweens.add({ targets: this.host, angle: 6, duration: 60, yoyo: true, repeat: 3 }); this.showGhost(); }
      this.time.delayedCall(ok ? 1100 : 1900, () => { if (this.lives <= 0) return this.gameOver(); this.round++; (this.round >= ROUNDS.length) ? this.win() : this.nextRound(); });
    }
    showGhost() {
      const target = this.correctSpot(this.cur.prep);
      const g = this.add.image(this.apple.x, this.apple.y, "bear").setAlpha(0.5).setDepth(13).setScale(0.85);
      this.tweens.add({ targets: g, x: target[0], y: target[1], duration: 650, ease: "Cubic.out", onComplete: () => this.tweens.add({ targets: g, alpha: 0, duration: 400, delay: 350, onComplete: () => g.destroy() }) });
    }
    correctSpot(prep) { if (prep === "in") return [BOXX, this.lidTopY + 6]; if (prep === "on") return [BOXX, this.lidTopY - APPLER + 10]; if (prep === "under") return [BOXX, FLOORY - APPLER]; return [BOXR + APPLER + 4, FLOORY - APPLER]; }

    nextRound() {
      this.cur = ROUNDS[this.round]; this.appleVy = 0; this.appleFalling = false;
      if (this.apple) { const old = this.apple; this.tweens.add({ targets: old, alpha: 0, y: old.y + 30, duration: 300, onComplete: () => old.destroy() }); this.apple = null; }
      this.clawX = W / 2; this.clawY = CLAWMINY; this.moveDir = 0;
      this.configBox(this.cur.prep, false); this.spawnApple(); this.showInstruction();
      this.state = "aim";
    }
    burst(x, y, color, n) { for (let i = 0; i < n; i++) { const c = this.add.circle(x, y, Phaser.Math.Between(3, 7), color, 0.9).setDepth(25); const a = Math.random() * Math.PI * 2, d = Phaser.Math.Between(20, 70); this.tweens.add({ targets: c, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.2, duration: 460, ease: "Quad.out", onComplete: () => c.destroy() }); } }

    update(time, delta) {
      const dt = Math.min(0.033, delta / 1000);
      this.dust.children.iterate((d) => { if (!d) return; d.y -= d.vy * dt; if (d.y < 150) { d.y = FLOORY; d.x = Phaser.Math.Between(30, W - 30); } });
      if (this.state === "aim" && this.moveDir) { this.clawX = Phaser.Math.Clamp(this.clawX + this.moveDir * MOVESPD * dt, CLAWMINX, CLAWMAXX); }
      if (this.state === "lowering") { this.clawY += LOWERSPD * dt; if (this.clawY + TIP >= this.maxTip) { this.clawY = this.maxTip - TIP; } }
      if (this.state === "lifting") { this.clawY -= LIFTSPD * dt; if (this.clawY <= CLAWMINY) { this.clawY = CLAWMINY; if (!this.appleFalling) this.state = "aim"; } }
      // draw claw + cable + carried apple
      this.claw.x = this.clawX; this.claw.y = this.clawY; this.cable.x = this.clawX; this.cable.height = Math.max(10, this.clawY - 96);
      if (this.held) { this.held.x = this.clawX; this.held.y = this.clawY + CARRY; this.halo.x = this.clawX; this.halo.y = this.clawY + CARRY; }
      // aim guide (only while aiming, shows the drop column)
      this.guide.clear();
      if (this.state === "aim" || this.state === "lowering") { for (let yy = this.clawY + 110; yy < FLOORY; yy += 30) this.guide.fillStyle(0xffe7a8, 0.3).fillCircle(this.clawX, yy, 4); }
      if (this.appleFalling) this.stepDrop(dt);
    }

    panel(titleJp, big) {
      const p = this.add.graphics().setDepth(50); p.fillStyle(0x12183a, 0.96); p.fillRoundedRect(W / 2 - 210, FLOORY / 2 - 120, 420, 300, 26); p.lineStyle(6, 0xFFCF4D, 1); p.strokeRoundedRect(W / 2 - 210, FLOORY / 2 - 120, 420, 300, 26);
      this.add.text(W / 2, FLOORY / 2 - 64, titleJp, { fontFamily: '"Zen Maru Gothic"', fontSize: "40px", color: "#FFF7F0", fontStyle: "700" }).setOrigin(0.5).setDepth(51).setStroke("#0a1a2a", 7);
      this.add.text(W / 2, FLOORY / 2 + 14, big, { fontFamily: '"Baloo 2"', fontSize: "54px", color: "#FFCF4D", fontStyle: "800" }).setOrigin(0.5).setDepth(51).setStroke("#0a1a2a", 7);
      const bw = 260, bh = 78, bx = W / 2, by = FLOORY / 2 + 110;
      const bg = this.add.graphics().setDepth(51); bg.fillStyle(0x3DBE6A, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 22); bg.lineStyle(5, 0x1F8A4C, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 22);
      this.add.text(bx, by, "もう いちど ▶", { fontFamily: '"Zen Maru Gothic"', fontSize: "30px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(52).setStroke("#0a1a2a", 5);
      this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(53).on("pointerdown", () => this.scene.restart());
      this.tweens.add({ targets: bg, alpha: 0.65, duration: 700, yoyo: true, repeat: -1 });
      this.state = "over";
    }
    gameOver() { Sfx.bad(); this.panel("ゲームオーバー", this.score + " / " + ROUNDS.length); }
    win() { if (window.KMEFlow) KMEFlow.win(); Sfx.coins(); this.cameras.main.flash(240, 255, 220, 120); this.panel("クリア ナリ！", this.score + " / " + ROUNDS.length); }
  }

  let booted = false;
  function boot() { if (booted) return; booted = true; new Phaser.Game({ type: Phaser.CANVAS, parent: "game", backgroundColor: "#0a0f1f", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: [Play] }); }
  if (document.fonts && document.fonts.load) { Promise.all([document.fonts.load('800 46px "Baloo 2"'), document.fonts.load('700 24px "Zen Maru Gothic"')]).then(boot, boot); setTimeout(boot, 1800); } else boot();
})();
