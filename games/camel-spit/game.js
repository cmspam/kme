// Camel Spit (present simple + 3rd-person -s) - Phaser 3. Host: temee, the Gobi
// camel. A subject + bare verb is shown ("She" / "run"). temee holds a spit-glob
// carrying the verb; you AIM an arc (drag to set angle + power, dashed preview)
// and SPIT it into one of two hoops: the "+s" hoop (the verb takes -s) or the
// bare hoop (no -s). 3rd-person singular (he/she/it/a single noun) needs -s;
// I/you/we/they/plural stay bare. Choosing the hoop is the grammar; the arc aim
// is the skill. English-only (A2): the subject is English, no JP gloss of the verb.
"use strict";
(function () {
  const W = 760, H = 1200, G = 1500, WIN = 10, LIVES = 3;
  const TEEX = 130, TEEY = H - 150;                 // temee spit origin
  const HOOP_Y = 360, HOOP_R = 92;                  // hoop centres
  const HOOP_S = { x: 250, label: "+ s" };          // adds -s
  const HOOP_B = { x: 560, label: "—" };            // stays bare

  const SUBJ_S = ["He", "She", "It", "The dog", "Tom", "My mom", "The cat"];     // need -s
  const SUBJ_B = ["I", "You", "We", "They", "The dogs", "My friends", "You and I"]; // bare
  const VERBS = ["run", "eat", "play", "read", "swim", "sing", "walk", "jump"];

  const Sfx = {
    ctx: null,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    tone(f0, f1, dur, type, gain) { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); g.gain.setValueAtTime(gain || 0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur); },
    noise(dur, gain, freq) { if (!this.ctx) return; const t = this.ctx.currentTime, b = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 1200; const g = this.ctx.createGain(); g.gain.setValueAtTime(gain || 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(this.ctx.destination); s.start(t); s.stop(t + dur); },
    spit() { this.noise(0.12, 0.14, 1400); this.tone(360, 200, 0.12, "sine", 0.1); },
    good() { [0, 90].forEach((d, i) => setTimeout(() => this.tone(640 + i * 170, 1000 + i * 170, 0.13, "triangle", 0.15), d)); },
    bad() { this.tone(300, 130, 0.32, "sawtooth", 0.14); },
    miss() { this.noise(0.1, 0.06, 700); },
    win() { [0, 120, 240, 380].forEach((d, i) => setTimeout(() => this.tone(560 + i * 150, 940 + i * 150, 0.2, "triangle", 0.16), d)); },
    lose() { this.tone(420, 100, 0.5, "sawtooth", 0.16); }
  };

  class Play extends Phaser.Scene {
    constructor() { super("play"); }
    preload() {
      this.load.svg("temee", "assets/temee.svg", { width: 240, height: 240 });
      this.load.svg("glob", "assets/glob.svg", { width: 70, height: 70 });
      this.load.svg("heart", "assets/heart.svg", { width: 44, height: 44 });
      this.load.svg("star", "assets/star.svg", { width: 40, height: 40 });
    }
    create() {
      this.time.removeAllEvents();
      this.score = 0; this.lives = LIVES; this.playStarted = false; this.state = null; this.cur = null;
      this.aiming = false; this.flying = false; this.busy = false;
      if (window.KMEAudio) { KMEAudio.setBase("assets/").stopAll(); const keys = ["cs_intro"]; VERBS.forEach((v) => { keys.push("v_" + v); keys.push("v_" + v + "s"); }); KMEAudio.register(keys); }

      this.buildBackdrop();
      this.buildHoops();
      this.temee = this.add.image(TEEX, TEEY, "temee").setScale(0.62).setDepth(20).setVisible(false);
      this.glob = this.add.image(TEEX + 40, TEEY - 40, "glob").setScale(0.9).setDepth(21).setVisible(false);
      this.globTx = this.add.text(TEEX + 40, TEEY - 40, "", { fontFamily: '"Baloo 2"', fontSize: "22px", color: "#fff", fontStyle: "800" }).setOrigin(0.5).setDepth(22).setStroke("#3a2410", 4).setVisible(false);
      this.aimG = this.add.graphics().setDepth(19);
      this.buildHud();

      const q = new URLSearchParams(location.search);
      if (q.has("cap")) { window.__cs = this; this.markSeen(); this.temee.setVisible(true); this.startPlay(); }
      else this.showTitle();

      this.input.on("pointerdown", (p) => this.aimStart(p));
      this.input.on("pointermove", (p) => this.aimMove(p));
      this.input.on("pointerup", () => this.aimRelease());
    }

    buildBackdrop() {
      if (this.textures.exists("dunebg")) this.textures.remove("dunebg");
      const tex = this.textures.createCanvas("dunebg", W, H), cx = tex.getContext();
      const g = cx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#ffe3a8"); g.addColorStop(0.5, "#f3b15e"); g.addColorStop(1, "#c97c38");
      cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      cx.fillStyle = "rgba(255,255,255,0.25)"; cx.beginPath(); cx.arc(W - 150, 150, 70, 0, Math.PI * 2); cx.fill();
      tex.refresh();
      this.add.image(0, 0, "dunebg").setOrigin(0, 0).setDepth(0);
      const d = this.add.graphics().setDepth(1); d.fillStyle(0xe0a85a, 1);
      d.beginPath(); d.moveTo(0, H - 120); for (let x = 0; x <= W; x += 60) d.lineTo(x, H - 120 - 30 * Math.abs(Math.sin(x * 0.01))); d.lineTo(W, H); d.lineTo(0, H); d.closePath(); d.fillPath();
      d.fillStyle(0xcf8f44, 1); d.fillRect(0, H - 60, W, 60);
      const v = this.add.graphics().setDepth(40); for (let i = 0; i < 46; i++) { v.lineStyle(2, 0x6a3f12, i / 46 * 0.14); v.strokeRect(i, i, W - 2 * i, H - 2 * i); }
    }

    buildHoops() {
      this.hoopG = this.add.graphics().setDepth(8);
      [HOOP_S, HOOP_B].forEach((hp) => {
        this.hoopG.lineStyle(12, 0x8a5a2a, 1); this.hoopG.strokeCircle(hp.x, HOOP_Y, HOOP_R);
        this.hoopG.lineStyle(6, 0xffe3a8, 0.9); this.hoopG.strokeCircle(hp.x, HOOP_Y, HOOP_R - 8);
      });
      this.add.text(HOOP_S.x, HOOP_Y, HOOP_S.label, { fontFamily: '"Baloo 2"', fontSize: "44px", color: "#2f7d46", fontStyle: "800" }).setOrigin(0.5).setDepth(9).setStroke("#fff", 6);
      this.add.text(HOOP_B.x, HOOP_Y, HOOP_B.label, { fontFamily: '"Baloo 2"', fontSize: "44px", color: "#b5360f", fontStyle: "800" }).setOrigin(0.5).setDepth(9).setStroke("#fff", 6);
      this.add.text(HOOP_S.x, HOOP_Y + HOOP_R + 22, "add -s", { fontFamily: '"Baloo 2"', fontSize: "20px", color: "#5a3a1a", fontStyle: "700" }).setOrigin(0.5).setDepth(9);
      this.add.text(HOOP_B.x, HOOP_Y + HOOP_R + 22, "no -s", { fontFamily: '"Baloo 2"', fontSize: "20px", color: "#5a3a1a", fontStyle: "700" }).setOrigin(0.5).setDepth(9);
    }

    buildHud() {
      this.hud = this.add.graphics().setDepth(30); this.hud.fillStyle(0x5a3a1a, 0.8); this.hud.fillRoundedRect(8, 8, W - 16, 54, 16);
      this.scoreTx = this.add.text(20, 18, "", { fontFamily: '"Baloo 2"', fontSize: "24px", color: "#ffe9c7", fontStyle: "800" }).setDepth(31);
      this.hearts = this.add.text(W - 20, 18, "", { fontFamily: '"Baloo 2"', fontSize: "26px", color: "#ff5a7a" }).setOrigin(1, 0).setDepth(31);
      this.subjPlate = this.add.graphics().setDepth(30); this.subjPlate.fillStyle(0xffffff, 0.95); this.subjPlate.fillRoundedRect(W / 2 - 280, 540, 560, 92, 18); this.subjPlate.lineStyle(4, 0x8a5a2a, 1); this.subjPlate.strokeRoundedRect(W / 2 - 280, 540, 560, 92, 18);
      this.subjTx = this.add.text(W / 2, 586, "", { fontFamily: '"Baloo 2"', fontSize: "34px", color: "#3a2410", fontStyle: "800" }).setOrigin(0.5).setDepth(31);
      this.subjPlate.setVisible(false); this.subjTx.setVisible(false);
      this.updateHud();
    }
    updateHud() { this.scoreTx.setText("せいかい " + this.score + "/" + WIN); this.hearts.setText("❤".repeat(Math.max(0, this.lives))); }

    startPlay() { if (this.playStarted) return; this.playStarted = true; this.state = "play"; this.hud.setVisible(true); this.subjPlate.setVisible(true); this.subjTx.setVisible(true); this.loadNext(); }

    loadNext() {
      this.busy = false; this.flying = false;
      const needS = Phaser.Math.Between(0, 1) === 0;
      this.cur = { needS, subj: Phaser.Utils.Array.GetRandom(needS ? SUBJ_S : SUBJ_B), verb: Phaser.Utils.Array.GetRandom(VERBS) };
      this.subjTx.setText(this.cur.subj + "  +  " + this.cur.verb).setScale(0.7);
      this.tweens.add({ targets: this.subjTx, scale: 1, duration: 200, ease: "Back.out" });
      // load the glob on temee with the bare verb
      this.glob.setPosition(TEEX + 40, TEEY - 40).setVisible(true).setScale(0.9);
      this.globTx.setText(this.cur.verb).setPosition(TEEX + 40, TEEY - 40).setVisible(true).setScale(1);
    }

    aimStart(p) {
      Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.state !== "play" || this.flying || this.busy) return;
      this.aiming = true; this.aimMove(p);
    }
    aimMove(p) {
      if (!this.aiming) return;
      const dx = p.x - (TEEX + 40), dy = p.y - (TEEY - 40);
      const ang = Math.atan2(dy, dx);
      const power = Math.min(1, Math.hypot(dx, dy) / 360);
      this.aimVx = Math.cos(ang) * (300 + power * 900);
      this.aimVy = Math.sin(ang) * (300 + power * 900);
      this.drawAim();
    }
    drawAim() {
      this.aimG.clear(); if (!this.aiming) return;
      this.aimG.fillStyle(0xffffff, 0.8);
      let x = TEEX + 40, y = TEEY - 40, vx = this.aimVx, vy = this.aimVy, dt = 0.04;
      for (let i = 0; i < 28; i++) { x += vx * dt; vy += G * dt; y += vy * dt; if (y > H || x < 0 || x > W) break; if (i % 2 === 0) this.aimG.fillCircle(x, y, 5); }
    }
    aimRelease() {
      if (!this.aiming) return; this.aiming = false; this.aimG.clear();
      if (this.state !== "play" || this.flying || !this.cur) return;
      this.flying = true; Sfx.spit();
      this.tweens.add({ targets: this.temee, scaleX: 0.56, scaleY: 0.68, duration: 110, yoyo: true });
      this.gx = TEEX + 40; this.gy = TEEY - 40; this.gvx = this.aimVx || 600; this.gvy = this.aimVy || -900; this.landed = false;
    }

    update(time, delta) {
      if (!this.flying) return;
      const dt = Math.min(0.033, delta / 1000);
      this.gvy += G * dt; this.gx += this.gvx * dt; this.gy += this.gvy * dt;
      this.glob.setPosition(this.gx, this.gy); this.globTx.setPosition(this.gx, this.gy);
      if (this.gx % 6 < 2) { const s = this.add.image(this.gx, this.gy, "star").setScale(0.3).setTint(0x9ad6ff).setDepth(20).setAlpha(0.7); this.tweens.add({ targets: s, alpha: 0, scale: 0.1, duration: 300, onComplete: () => s.destroy() }); }
      // hoop check near hoop plane
      if (this.gvy > 0 && Math.abs(this.gy - HOOP_Y) < 40) {
        if (Math.abs(this.gx - HOOP_S.x) < HOOP_R) return this.land(true);
        if (Math.abs(this.gx - HOOP_B.x) < HOOP_R) return this.land(false);
      }
      if (this.gy > H + 60 || this.gx < -60 || this.gx > W + 60) { this.flying = false; this.missShot(); }
    }

    land(intoS) {
      this.flying = false;
      const correct = (intoS === this.cur.needS);
      this.glob.setVisible(false); this.globTx.setVisible(false);
      const hx = intoS ? HOOP_S.x : HOOP_B.x;
      if (correct) {
        Sfx.good(); this.score++; this.updateHud();
        const form = this.cur.verb + (this.cur.needS ? "s" : "");
        const rewardDone = this.voice("v_" + form);
        this.burst(hx, HOOP_Y, 0x2fae5e);
        const t = this.add.text(W / 2, 470, this.cur.subj + " " + form + ".", { fontFamily: '"Baloo 2"', fontSize: "34px", color: "#2f7d46", fontStyle: "800" }).setOrigin(0.5).setDepth(33).setStroke("#fff", 6).setScale(0.6);
        this.tweens.add({ targets: t, scale: 1, duration: 200, ease: "Back.out" }); this.time.delayedCall(1100, () => t.destroy());
        if (this.score >= WIN) { rewardDone.then(() => this.time.delayedCall(300, () => this.win())); return; }
        // hold the next prompt until the verb-form review has finished
        const beat = new Promise((r) => this.time.delayedCall(500, r));
        Promise.all([rewardDone, beat]).then(() => { if (this.state === "play") this.loadNext(); });
      } else {
        Sfx.bad(); this.lives--; this.updateHud(); this.cameras.main.shake(180, 0.009);
        this.burst(hx, HOOP_Y, 0xc0392b);
        const t = this.add.text(W / 2, 470, this.cur.needS ? "-s が いる！" : "-s は いらない！", { fontFamily: '"Baloo 2"', fontSize: "30px", color: "#b5360f", fontStyle: "800" }).setOrigin(0.5).setDepth(33).setStroke("#fff", 6);
        this.time.delayedCall(1200, () => t.destroy());
        if (this.lives <= 0) { this.time.delayedCall(700, () => this.lose()); return; }
        this.time.delayedCall(1100, () => this.loadNext());
      }
    }
    missShot() { Sfx.miss(); this.glob.setVisible(false); this.globTx.setVisible(false); const t = this.add.text(W / 2, 470, "もういちど！", { fontFamily: '"Zen Maru Gothic"', fontSize: "24px", color: "#5a3a1a", fontStyle: "700" }).setOrigin(0.5).setDepth(33); this.time.delayedCall(700, () => { t.destroy(); this.loadNext(); }); }

    burst(x, y, color) { for (let i = 0; i < 10; i++) { const s = this.add.image(x, y, "star").setScale(Phaser.Math.FloatBetween(0.3, 0.8)).setTint(color).setDepth(22); const a = Math.random() * Math.PI * 2, d = Phaser.Math.Between(40, 120); this.tweens.add({ targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.1, duration: 480, ease: "Quad.out", onComplete: () => s.destroy() }); } }

    flash(color, alpha) { const f = this.add.rectangle(0, 0, W, H, color, alpha).setOrigin(0).setDepth(50); this.tweens.add({ targets: f, alpha: 0, duration: 240, onComplete: () => f.destroy() }); }
    win() { this.state = "over"; if (window.KMEFlow) KMEFlow.win(); Sfx.win(); this.flash(0xfff2c4, 0.5); this.tweens.add({ targets: this.temee, scaleX: 0.7, scaleY: 0.7, duration: 180, yoyo: true, repeat: 3 }); this.time.delayedCall(700, () => this.panel("みごと じゃ！", "YOU WIN!")); }
    lose() { this.state = "over"; Sfx.lose(); this.cameras.main.shake(280, 0.012); this.time.delayedCall(400, () => this.panel("もういちど！", "GAME OVER")); }
    panel(jp, big) {
      const p = this.add.graphics().setDepth(60); p.fillStyle(0x5a3a1a, 0.95); p.fillRoundedRect(W / 2 - 200, H / 2 - 150, 400, 300, 28); p.lineStyle(6, 0xffcf4d, 1); p.strokeRoundedRect(W / 2 - 200, H / 2 - 150, 400, 300, 28);
      this.add.image(W / 2, H / 2 - 78, "temee").setScale(0.4).setDepth(61);
      this.add.text(W / 2, H / 2 - 2, big, { fontFamily: '"Baloo 2"', fontSize: "44px", color: "#ffcf4d", fontStyle: "800" }).setOrigin(0.5).setDepth(61).setStroke("#5a3a1a", 6);
      this.add.text(W / 2, H / 2 + 44, jp, { fontFamily: '"Zen Maru Gothic"', fontSize: "26px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(61);
      const bw = 240, bh = 72, by = H / 2 + 108;
      const bg = this.add.graphics().setDepth(61); bg.fillStyle(0x3DBE6A, 1); bg.fillRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, 20); bg.lineStyle(5, 0x1F8A4C, 1); bg.strokeRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, 20);
      this.add.text(W / 2, by, "もう いちど ▶", { fontFamily: '"Zen Maru Gothic"', fontSize: "26px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#1F5A30", 5);
      this.add.zone(W / 2, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(63).on("pointerdown", () => this.scene.restart());
      this.tweens.add({ targets: bg, alpha: 0.65, duration: 700, yoyo: true, repeat: -1 });
    }

    // ---------- title / intro / voice ----------
    introNeeded() { try { return !localStorage.getItem("cs_intro_seen"); } catch (e) { return true; } }
    markSeen() { try { localStorage.setItem("cs_intro_seen", "1"); } catch (e) {} }
    voice(key, onEnd) { const p = window.KMEAudio ? KMEAudio.play(key) : Promise.resolve(); if (onEnd) p.then(onEnd); return p; }
    showTitle() {
      this.state = "title"; this.titleStarted = false;
      const dim = this.add.graphics().setDepth(60); dim.fillStyle(0x6a3f12, 0.4); dim.fillRect(0, 0, W, H);
      const host = this.add.image(W / 2, H * 0.34, "temee").setScale(0.95).setDepth(62);
      this.titleBob = this.tweens.add({ targets: host, y: H * 0.34 - 16, duration: 950, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.add.text(W / 2, H * 0.56, "キャメル スピット", { fontFamily: '"Baloo 2"', fontSize: "40px", color: "#fff5d8", fontStyle: "800" }).setOrigin(0.5).setDepth(62).setStroke("#6a3f12", 7);
      this.add.text(W / 2, H * 0.56 + 44, "Camel Spit", { fontFamily: '"Baloo 2"', fontSize: "26px", color: "#5a3a1a", fontStyle: "700" }).setOrigin(0.5).setDepth(62);
      const bw = 300, bh = 92, bx = W / 2, by = H * 0.73;
      const bg = this.add.graphics().setDepth(62); bg.fillStyle(0xcf8f44, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26); bg.lineStyle(6, 0x8a5a2a, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26);
      this.add.triangle(bx - 58, by, 0, 0, 26, 16, 0, 32, 0xffffff).setDepth(63);
      this.add.text(bx + 14, by, "あそぶ", { fontFamily: '"Zen Maru Gothic"', fontSize: "34px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(63).setStroke("#6a3f12", 5);
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
      this.introDim = this.add.graphics().setDepth(45); this.introDim.fillStyle(0x6a3f12, 0.6); this.introDim.fillRect(0, 0, W, H);
      this.introBig = this.add.image(W / 2, H * 0.34, "temee").setScale(0.9).setDepth(47);
      this.introBob = this.tweens.add({ targets: this.introBig, y: H * 0.34 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const bx = W / 2, by = H * 0.62;
      this.introBg = this.add.graphics().setDepth(46); this.introBg.fillStyle(0xffffff, 0.97); this.introBg.fillRoundedRect(bx - 332, by - 104, 664, 208, 24); this.introBg.lineStyle(5, 0x6a3f12, 1); this.introBg.strokeRoundedRect(bx - 332, by - 104, 664, 208, 24);
      this.introText = this.add.text(bx, by, "ほっほ！ ツバ で あそぶ ぞい。\nしゅご を みて、どうし に -s が いるか きめるんじゃ。\nhe・she・it や ひとり なら -s を つける！\nねらって ツバ を 「+s」 の わ に スピット！\nI・you・we・they なら そのまま、「—」 の わ じゃ！", { fontFamily: '"Zen Maru Gothic"', fontSize: "22px", color: "#3a2410", fontStyle: "700", align: "center", lineSpacing: 6 }).setOrigin(0.5).setDepth(47);
      this.skipBtn = this.add.text(W - 56, 92, "スキップ", { fontFamily: '"Zen Maru Gothic"', fontSize: "24px", color: "#fff5d8", fontStyle: "700" }).setOrigin(1, 0.5).setDepth(48).setInteractive({ useHandCursor: true }).setStroke("#6a3f12", 5);
      this.skipChev = this.add.triangle(W - 34, 92, 0, 0, 18, 11, 0, 22, 0xffcf4d).setDepth(48).setInteractive({ useHandCursor: true });
      let advanced = false; this.advIntro = () => { if (advanced) return; advanced = true; this.endIntro(); };
      this.skipBtn.on("pointerdown", this.advIntro); this.skipChev.on("pointerdown", this.advIntro);
      this.voice("cs_intro", this.advIntro);
      this.time.delayedCall(20000, this.advIntro);
    }
    endIntro() {
      this.markSeen();
      if (window.KMEAudio) KMEAudio.stopAll();
      [this.skipBtn, this.skipChev].forEach((o) => { if (o) o.destroy(); }); this.skipBtn = null; this.skipChev = null;
      if (this.introBob) this.introBob.stop();
      this.tweens.add({ targets: [this.introDim, this.introBg, this.introText], alpha: 0, duration: 420, onComplete: () => { [this.introDim, this.introBg, this.introText].forEach((o) => { if (o) o.destroy(); }); } });
      this.tweens.add({ targets: this.introBig, x: TEEX, y: TEEY, scaleX: 0.62, scaleY: 0.62, duration: 600, ease: "Cubic.inOut", onComplete: () => { if (this.introBig) { this.introBig.destroy(); this.introBig = null; } this.temee.setVisible(true); } });
      this.time.delayedCall(700, () => this.startPlay());
    }
  }

  let booted = false;
  function boot() { if (booted) return; booted = true; new Phaser.Game({ type: Phaser.CANVAS, parent: "game", backgroundColor: "#f3b15e", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: [Play] }); }
  if (document.fonts && document.fonts.load) { Promise.all([document.fonts.load('800 30px "Baloo 2"'), document.fonts.load('700 22px "Zen Maru Gothic"')]).then(boot, boot); setTimeout(boot, 1500); } else boot();
})();
