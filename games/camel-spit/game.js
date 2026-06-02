// Camel Spit (present simple + 3rd-person -s) - Phaser 3. Host: temee, the Gobi
// camel, flying a desert star-cruiser. A GRADIUS-style side-scrolling shooter:
// the HUD shows a SUBJECT (He / They / The dog / My friends). Verb-aliens stream
// in from the right carrying bare verbs (run, eat, play). temee has TWO cannons:
// the +S cannon and the BARE cannon. Line temee up with a verb-alien (drag up/down)
// and fire with the cannon that makes the RIGHT conjugation for the subject:
// he/she/it/single noun -> +S (runs), I/you/we/they/plural -> bare (run). Wrong
// cannon = the alien shrugs it off and rushes you. Choosing the conjugation IS the
// weapon. English-only (A2): the subject is English, verbs are English.
"use strict";
(function () {
  const W = 760, H = 1200, TARGET = 12, LIVES = 3;
  const SHIPX = 150, BANDY0 = 150, BANDY1 = H - 230, LANE = 80;

  // subject -> key (for the spoken full-sentence clip cs_<key>_<verb>). Kept to a
  // tight set so every "He runs." / "They run." sentence is pre-rendered.
  const SUBJ_S = [["He", "he"], ["She", "she"], ["It", "it"], ["The dog", "the_dog"]];   // need -s
  const SUBJ_B = [["They", "they"], ["We", "we"], ["You", "you"], ["I", "i"]];           // bare
  const VERBS = ["run", "eat", "play", "read", "swim", "sing", "walk", "jump"];

  const Sfx = {
    ctx: null,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    tone(f0, f1, dur, type, gain) { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); g.gain.setValueAtTime(gain || 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur); },
    noise(dur, gain, freq) { if (!this.ctx) return; const t = this.ctx.currentTime, b = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 1400; const g = this.ctx.createGain(); g.gain.setValueAtTime(gain || 0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(this.ctx.destination); s.start(t); s.stop(t + dur); },
    laser() { this.tone(900, 1500, 0.08, "square", 0.08); },
    boom() { this.noise(0.14, 0.18, 1600); this.tone(500, 160, 0.14, "sawtooth", 0.1); },
    nope() { this.tone(240, 120, 0.2, "sawtooth", 0.12); },
    hurt() { this.tone(300, 90, 0.3, "sawtooth", 0.16); this.noise(0.16, 0.12, 500); },
    wave() { [0, 90].forEach((d, i) => setTimeout(() => this.tone(620 + i * 160, 980 + i * 160, 0.12, "triangle", 0.14), d)); },
    win() { [0, 120, 240, 380].forEach((d, i) => setTimeout(() => this.tone(620 + i * 160, 980 + i * 160, 0.2, "triangle", 0.16), d)); },
    lose() { this.tone(420, 100, 0.5, "sawtooth", 0.16); }
  };

  class Play extends Phaser.Scene {
    constructor() { super("play"); }
    preload() {
      this.load.svg("temee", "assets/temee.svg", { width: 200, height: 200 });
      this.load.svg("pod", "assets/pod.svg", { width: 130, height: 114 });
      this.load.svg("glob", "assets/glob.svg", { width: 64, height: 64 });
      this.load.svg("star", "assets/star.svg", { width: 40, height: 40 });
      this.load.svg("heart", "assets/heart.svg", { width: 44, height: 44 });
    }
    create() {
      this.time.removeAllEvents();
      this.score = 0; this.lives = LIVES; this.pods = []; this.shots = []; this.playStarted = false; this.state = null;
      this.subj = null; this.needS = false; this.spawnLeft = 0; this.rewardDone = null; this.shots = []; this.hazards = []; this.invuln = 0; this.hazClock = 0;
      if (window.KMEAudio) { KMEAudio.setBase("assets/").stopAll(); const keys = ["cs_intro"]; SUBJ_S.concat(SUBJ_B).forEach((sp) => VERBS.forEach((v) => keys.push("cs_" + sp[1] + "_" + v))); KMEAudio.register(keys); }

      this.buildBackdrop();
      this.ship = this.add.image(SHIPX, H / 2, "temee").setScale(0.5).setFlipX(true).setDepth(20).setVisible(false);   // face RIGHT (toward the enemies it spits at)
      this.thruster = this.add.graphics().setDepth(19);
      this.buildHud();
      this.buildCannons();

      const q = new URLSearchParams(location.search);
      if (q.has("cap")) { window.__cs = this; this.markSeen(); this.ship.setVisible(true); this.startPlay(); }
      else this.showTitle();

      this.input.on("pointermove", (p) => { if (this.state === "play" && p.isDown && p.y < BANDY1 + 30) this.ship.y = Phaser.Math.Clamp(p.y, BANDY0, BANDY1); });
    }

    buildBackdrop() {
      if (this.textures.exists("spacebg")) this.textures.remove("spacebg");
      const tex = this.textures.createCanvas("spacebg", W, H), cx = tex.getContext();
      const g = cx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#2a1745"); g.addColorStop(0.5, "#3a1e35"); g.addColorStop(1, "#5a2e1a");
      cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      cx.fillStyle = "rgba(255,220,160,0.5)"; for (let i = 0; i < 70; i++) cx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
      // a distant dune horizon
      cx.fillStyle = "rgba(180,110,60,0.5)"; cx.beginPath(); cx.moveTo(0, H - 90); for (let x = 0; x <= W; x += 50) cx.lineTo(x, H - 90 - 26 * Math.abs(Math.sin(x * 0.01))); cx.lineTo(W, H); cx.lineTo(0, H); cx.fill();
      tex.refresh();
      this.add.image(0, 0, "spacebg").setOrigin(0, 0).setDepth(0);
      // scrolling starfield
      this.stars2 = []; for (let i = 0; i < 26; i++) { const s = this.add.circle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), Phaser.Math.Between(1, 3), 0xffffff, Phaser.Math.FloatBetween(0.3, 0.9)).setDepth(1); s.sp = Phaser.Math.Between(60, 200); this.stars2.push(s); }
      const v = this.add.graphics().setDepth(40); for (let i = 0; i < 46; i++) { v.lineStyle(2, 0x140a22, i / 46 * 0.18); v.strokeRect(i, i, W - 2 * i, H - 2 * i); }
    }

    buildHud() {
      this.hud = this.add.graphics().setDepth(30); this.hud.fillStyle(0x140a22, 0.82); this.hud.fillRoundedRect(8, 8, W - 16, 84, 16);
      this.subjTx = this.add.text(20, 24, "しゅご を よんで、ただしい キャノン で うて！", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "17px", color: "#cdb6ff", fontStyle: "700" }).setDepth(31);
      this.scoreTx = this.add.text(W - 20, 16, "", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "22px", color: "#eaf0ff", fontStyle: "800" }).setOrigin(1, 0).setDepth(31);
      this.hearts = this.add.text(W - 20, 50, "", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "26px", color: "#ff5a7a" }).setOrigin(1, 0).setDepth(31);
      this.updateHud();
    }
    updateHud() { this.scoreTx.setText("たおした " + this.score + "/" + TARGET); this.hearts.setText("❤".repeat(Math.max(0, this.lives))); }

    buildCannons() {
      const by = H - 100, bw = 320, bh = 96;
      const mk = (cx, label, sub, val, color, line) => {
        const bg = this.add.graphics().setDepth(34); bg.fillStyle(color, 1); bg.fillRoundedRect(cx - bw / 2, by - bh / 2, bw, bh, 22); bg.lineStyle(5, line, 1); bg.strokeRoundedRect(cx - bw / 2, by - bh / 2, bw, bh, 22);
        const t1 = this.add.text(cx, by - 12, label, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "38px", color: "#fff", fontStyle: "800" }).setOrigin(0.5).setDepth(35).setStroke("#140a22", 5);
        const t2 = this.add.text(cx, by + 24, sub, { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "15px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(35).setAlpha(0.9);
        const z = this.add.zone(cx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(36).on("pointerdown", () => this.fire(val));
        return [bg, t1, t2, z];
      };
      this.cannonObjs = [].concat(
        mk(W / 2 - 175, "+S", "he / she / it", "s", 0x2f7d46, 0x6fd08a),
        mk(W / 2 + 175, "—", "I / you / we / they", "bare", 0x8a3b8a, 0xd07fd0)
      );
      this.cannonObjs.forEach((o) => o.setVisible(false));
    }

    startPlay() { if (this.playStarted) return; this.playStarted = true; this.state = "play"; this.hud.setVisible(true); this.cannonObjs.forEach((o) => o.setVisible(true)); this.nextWave(); }

    nextWave() {
      this.updateHud();
      Sfx.wave();
      this.spawnLeft = Phaser.Math.Between(4, 6);   // each pod brings its own subject
      this.scheduleSpawn(400);
    }
    scheduleSpawn(delay) { if (this.state !== "play") return; this.spawnEv = this.time.delayedCall(delay, () => { if (this.state !== "play") return; if (this.spawnLeft > 0) { this.spawnPod(); this.spawnLeft--; this.scheduleSpawn(Phaser.Math.Between(700, 1100)); } }); }

    spawnPod(verb) {
      verb = verb || Phaser.Utils.Array.GetRandom(VERBS);
      // EACH pod carries its OWN subject, so every shot is a fresh he/they decision
      const needS = Phaser.Math.Between(0, 1) === 0;
      const pair = Phaser.Utils.Array.GetRandom(needS ? SUBJ_S : SUBJ_B);
      const subj = pair[0], subjKey = pair[1];
      const y = Phaser.Math.Between(BANDY0 + 40, BANDY1 - 20);
      const cont = this.add.container(W + 90, y).setDepth(14);
      const spr = this.add.image(0, 0, "pod").setScale(0.92);
      const tx = this.add.text(0, 4, verb, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "24px", color: "#0c2c1c", fontStyle: "800" }).setOrigin(0.5);
      const sw = Math.max(70, subj.length * 12 + 20);
      const sbg = this.add.graphics(); sbg.fillStyle(0x140a22, 0.92); sbg.fillRoundedRect(-sw / 2, -64, sw, 32, 10); sbg.lineStyle(2, 0xffd24d, 1); sbg.strokeRoundedRect(-sw / 2, -64, sw, 32, 10);
      const stx = this.add.text(0, -48, subj, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "19px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5);
      cont.add([spr, tx, sbg, stx]);
      const p = { cont, spr, tx, verb, subj, subjKey, needS, vx: -(56 + this.score * 4 + Phaser.Math.Between(0, 26)), dead: false, wobN: Phaser.Math.FloatBetween(0, 6) };
      this.pods.push(p);
    }

    fire(cannon) {
      Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.state !== "play") return;
      Sfx.laser();
      // SPIT a real glob straight ahead: you AIM by moving temee up/down; it flies
      // right and hits whatever alien is in its path (no auto-aim).
      const tint = cannon === "s" ? 0x9be06a : 0xc89aff;
      const sx = this.ship.x + 56, sy = this.ship.y - 4;
      const glob = this.add.image(sx, sy, "glob").setScale(0.5).setTint(tint).setDepth(18);
      glob.cannon = cannon; glob.live = true; glob.gy = sy;
      this.shots.push(glob);
      for (let i = 0; i < 4; i++) { const d = this.add.circle(sx, sy + Phaser.Math.Between(-8, 8), Phaser.Math.Between(3, 6), tint, 0.85).setDepth(17); this.tweens.add({ targets: d, x: sx + Phaser.Math.Between(30, 90), y: d.y + Phaser.Math.Between(10, 28), alpha: 0, duration: 300, onComplete: () => d.destroy() }); }
      this.tweens.add({ targets: this.ship, x: SHIPX - 14, duration: 70, yoyo: true });   // recoil
    }
    spitSplat(x, y, tint) { for (let i = 0; i < 8; i++) { const d = this.add.circle(x, y, Phaser.Math.Between(3, 8), tint, 0.85).setDepth(23); const a = Math.random() * Math.PI * 2, dist = Phaser.Math.Between(16, 54); this.tweens.add({ targets: d, x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist, alpha: 0, scale: 0.2, duration: 360, onComplete: () => d.destroy() }); } }

    killPod(p, cannon) {
      p.dead = true; Sfx.boom();
      const form = p.verb + (p.needS ? "s" : "");
      this.rewardDone = this.voice("cs_" + p.subjKey + "_" + p.verb);   // speaks the FULL "He runs."
      this.score++; this.updateHud();
      this.burst(p.cont.x, p.cont.y, p.needS ? 0x6fd08a : 0xd07fd0);
      const ft = this.add.text(p.cont.x, p.cont.y - 6, p.subj + " " + form + ".", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "26px", color: "#fff", fontStyle: "800" }).setOrigin(0.5).setDepth(25).setStroke(p.needS ? "#2f7d46" : "#8a3b8a", 6);
      this.tweens.add({ targets: ft, y: ft.y - 34, alpha: 0, duration: 900, onComplete: () => ft.destroy() });
      this.tweens.add({ targets: p.cont, scale: 1.4, alpha: 0, duration: 220, onComplete: () => p.cont.destroy() });
      this.pods = this.pods.filter((x) => x !== p);
      if (this.score >= TARGET) { this.time.delayedCall(500, () => this.win()); return; }
      if (this.pods.length === 0 && this.spawnLeft === 0) { const reward = this.rewardDone || Promise.resolve(); this.rewardDone = null; Promise.all([reward, new Promise((r) => this.time.delayedCall(500, r))]).then(() => { if (this.state === "play") this.nextWave(); }); }
    }
    bouncePod(p) {
      Sfx.nope(); p.vx -= 80;   // shrugs it off and speeds up
      p.spr.setTint(0xff8080); this.time.delayedCall(220, () => p.spr.clearTint());
      const x = this.add.text(p.cont.x, p.cont.y - 40, p.needS ? "+s が いる！" : "そのまま！", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "22px", color: "#ff9a6a", fontStyle: "800" }).setOrigin(0.5).setDepth(25).setStroke("#140a22", 5);
      this.tweens.add({ targets: x, y: x.y - 24, alpha: 0, duration: 700, onComplete: () => x.destroy() });
    }
    burst(x, y, color) { for (let i = 0; i < 10; i++) { const s = this.add.image(x, y, "star").setScale(Phaser.Math.FloatBetween(0.3, 0.8)).setTint(color).setDepth(22); const a = Math.random() * Math.PI * 2, d = Phaser.Math.Between(40, 120); this.tweens.add({ targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.1, duration: 460, ease: "Quad.out", onComplete: () => s.destroy() }); } }

    update(time, delta) {
      const dt = Math.min(0.033, delta / 1000);
      for (const s of this.stars2) { s.x -= s.sp * dt; if (s.x < -4) { s.x = W + 4; s.y = Phaser.Math.Between(0, H); } }
      // thruster flame
      this.thruster.clear(); if (this.ship.visible) { const fy = this.ship.y; this.thruster.fillStyle(0xffd24d, 0.8); this.thruster.fillTriangle(this.ship.x - 36, fy - 10, this.ship.x - 36, fy + 10, this.ship.x - 36 - (12 + Math.random() * 14), fy); }
      if (this.state !== "play") return;
      if (this.invuln > 0) { this.invuln -= dt; this.ship.setAlpha(Math.floor(time / 80) % 2 ? 0.4 : 1); } else this.ship.setAlpha(1);
      for (const p of this.pods) {
        if (p.dead) continue;
        p.cont.x += p.vx * dt; p.cont.y += Math.sin(time / 300 + p.wobN) * 0.4;
        if (p.cont.x < this.ship.x + 30) { p.dead = true; this.podHit(p); }
      }
      this.pods = this.pods.filter((p) => !p.dead || (p.cont && p.cont.active));
      // player shots fly straight right and hit whatever alien they cross
      for (const g of this.shots) {
        if (!g.live) continue;
        g.x += 1200 * dt; g.angle += 16;
        for (const p of this.pods) { if (p.dead) continue; if (Math.abs(p.cont.y - g.gy) < 46 && g.x >= p.cont.x - 30 && g.x <= p.cont.x + 56) { g.live = false; this.spitSplat(p.cont.x, p.cont.y, g.cannon === "s" ? 0x9be06a : 0xc89aff); if ((g.cannon === "s") === p.needS) this.killPod(p, g.cannon); else this.bouncePod(p); break; } }
        if (g.live && g.x > W + 50) g.live = false;
        if (!g.live) g.destroy();
      }
      this.shots = this.shots.filter((g) => g.live && g.active);
      // aliens occasionally spit a hazard back; dodge it
      this.hazClock -= dt;
      if (this.hazClock <= 0 && this.pods.length) { this.hazClock = Math.max(0.7, 1.6 - this.score * 0.04); const p = Phaser.Utils.Array.GetRandom(this.pods.filter((x) => !x.dead && x.cont.x > this.ship.x + 120)); if (p) { const h = this.add.circle(p.cont.x - 20, p.cont.y, 11, 0x6a3b9a, 0.95).setStrokeStyle(3, 0xc89aff).setDepth(16); h.live = true; this.hazards.push(h); } }
      for (const h of this.hazards) {
        if (!h.live) continue;
        h.x -= 360 * dt;
        if (this.invuln <= 0 && Math.abs(h.y - this.ship.y) < 40 && h.x <= this.ship.x + 34 && h.x > this.ship.x - 40) { h.live = false; this.hazardHit(); }
        if (h.live && h.x < -40) h.live = false;
        if (!h.live) h.destroy();
      }
      this.hazards = this.hazards.filter((h) => h.live && h.active);
    }
    hazardHit() {
      this.invuln = 1.0; Sfx.hurt(); this.lives--; this.updateHud(); this.cameras.main.shake(180, 0.01); this.cameras.main.flash(140, 200, 60, 60);
      this.tweens.add({ targets: this.ship, angle: 14, duration: 80, yoyo: true, repeat: 2 });
      if (this.lives <= 0) this.time.delayedCall(500, () => this.lose());
    }
    podHit(p) {
      if (this.invuln > 0) { this.pods = this.pods.filter((x) => x !== p); if (p.cont) p.cont.destroy(); return; }
      this.invuln = 1.0; Sfx.hurt(); this.lives--; this.updateHud(); this.cameras.main.shake(180, 0.01); this.cameras.main.flash(140, 200, 60, 60);
      this.tweens.add({ targets: this.ship, angle: -14, duration: 80, yoyo: true, repeat: 2 });
      if (p.cont) this.tweens.add({ targets: p.cont, alpha: 0, scale: 1.3, duration: 200, onComplete: () => p.cont.destroy() });
      this.pods = this.pods.filter((x) => x !== p);
      if (this.lives <= 0) { this.time.delayedCall(500, () => this.lose()); return; }
      if (this.pods.length === 0 && this.spawnLeft === 0) this.time.delayedCall(600, () => { if (this.state === "play") this.nextWave(); });
    }

    flash(color, alpha) { const f = this.add.rectangle(0, 0, W, H, color, alpha).setOrigin(0).setDepth(50); this.tweens.add({ targets: f, alpha: 0, duration: 240, onComplete: () => f.destroy() }); }
    win() { this.state = "over"; if (this.spawnEv) this.spawnEv.remove(); if (window.KMEFlow) KMEFlow.win(); Sfx.win(); this.flash(0xfff2c4, 0.5); this.tweens.add({ targets: this.ship, x: W + 200, duration: 700, ease: "Back.in" }); this.time.delayedCall(700, () => this.panel("クリア じゃ！", "YOU WIN!")); }
    lose() { this.state = "over"; if (this.spawnEv) this.spawnEv.remove(); Sfx.lose(); this.cameras.main.shake(280, 0.012); this.time.delayedCall(400, () => this.panel("もういちど！", "GAME OVER")); }
    panel(jp, big) {
      const p = this.add.graphics().setDepth(60); p.fillStyle(0x140a22, 0.95); p.fillRoundedRect(W / 2 - 200, H / 2 - 150, 400, 300, 28); p.lineStyle(6, 0xffcf4d, 1); p.strokeRoundedRect(W / 2 - 200, H / 2 - 150, 400, 300, 28);
      this.add.image(W / 2, H / 2 - 80, "temee").setScale(0.34).setDepth(61);
      this.add.text(W / 2, H / 2 - 2, big, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "44px", color: "#ffcf4d", fontStyle: "800" }).setOrigin(0.5).setDepth(61).setStroke("#140a22", 6);
      this.add.text(W / 2, H / 2 + 44, jp, { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "26px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(61);
      const bw = 240, bh = 72, by = H / 2 + 108;
      const bg = this.add.graphics().setDepth(61); bg.fillStyle(0x3DBE6A, 1); bg.fillRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, 20); bg.lineStyle(5, 0x1F8A4C, 1); bg.strokeRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, 20);
      this.add.text(W / 2, by, "もう いちど ▶", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "26px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#1F5A30", 5);
      this.add.zone(W / 2, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(63).on("pointerdown", () => this.scene.restart());
      this.tweens.add({ targets: bg, alpha: 0.65, duration: 700, yoyo: true, repeat: -1 });
    }

    // ---------- title / intro / voice ----------
    introNeeded() { try { return !localStorage.getItem("cs_intro_seen_v2"); } catch (e) { return true; } }
    markSeen() { try { localStorage.setItem("cs_intro_seen_v2", "1"); } catch (e) {} }
    voice(key, onEnd) { const p = window.KMEAudio ? KMEAudio.play(key) : Promise.resolve(); if (onEnd) p.then(onEnd); return p; }
    showTitle() {
      this.state = "title"; this.titleStarted = false;
      const dim = this.add.graphics().setDepth(60); dim.fillStyle(0x140a22, 0.5); dim.fillRect(0, 0, W, H);
      const host = this.add.image(W / 2, H * 0.34, "temee").setScale(0.7).setDepth(62);
      this.titleBob = this.tweens.add({ targets: host, y: H * 0.34 - 16, duration: 950, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.add.text(W / 2, H * 0.56, "キャメル スピット", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "40px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5).setDepth(62).setStroke("#140a22", 7);
      this.add.text(W / 2, H * 0.56 + 44, "Camel Cannon", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "24px", color: "#b9a6ff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#140a22", 5);
      const bw = 300, bh = 92, bx = W / 2, by = H * 0.73;
      const bg = this.add.graphics().setDepth(62); bg.fillStyle(0xcf8f44, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26); bg.lineStyle(6, 0x8a5a2a, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26);
      this.add.triangle(bx - 58, by, 0, 0, 26, 16, 0, 32, 0xffffff).setDepth(63);
      this.add.text(bx + 14, by, "あそぶ", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "34px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(63).setStroke("#6a3f12", 5);
      this.titlePulse = this.tweens.add({ targets: bg, alpha: 0.7, duration: 650, yoyo: true, repeat: -1 });
      this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(64).on("pointerdown", () => this.startFromTitle());
    }
    startFromTitle() {
      if (this.titleStarted) return; this.titleStarted = true; Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.titleBob) this.titleBob.stop(); if (this.titlePulse) this.titlePulse.stop();
      this.children.list.filter((o) => o.depth >= 60 && o.depth < 65).forEach((o) => o.destroy());
      if (this.introNeeded()) this.startIntro(); else { this.markSeen(); this.ship.setVisible(true); this.startPlay(); }
    }
    startIntro() {
      this.state = "intro";
      this.introDim = this.add.graphics().setDepth(45); this.introDim.fillStyle(0x140a22, 0.62); this.introDim.fillRect(0, 0, W, H);
      this.introBig = this.add.image(W / 2, H * 0.34, "temee").setScale(0.7).setDepth(47);
      this.introBob = this.tweens.add({ targets: this.introBig, y: H * 0.34 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const bx = W / 2, by = H * 0.62;
      this.introBg = this.add.graphics().setDepth(46); this.introBg.fillStyle(0xffffff, 0.97); this.introBg.fillRoundedRect(bx - 332, by - 110, 664, 220, 24); this.introBg.lineStyle(5, 0x140a22, 1); this.introBg.strokeRoundedRect(bx - 332, by - 110, 664, 220, 24);
      this.introText = this.add.text(bx, by, "ほっほ！ ワシの せんとうき で いくぞい！\nうえの しゅご を みて、てきの どうしを うて！\nhe・she・it や ひとり なら +S の キャノン！\nI・you・we・they なら そのままの キャノン！\nまちがえると てきが つっこんでくる ぞい！", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "22px", color: "#140a22", fontStyle: "700", align: "center", lineSpacing: 6 }).setOrigin(0.5).setDepth(47);
      this.skipBtn = this.add.text(W - 56, 92, "スキップ", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "24px", color: "#b9a6ff", fontStyle: "700" }).setOrigin(1, 0.5).setDepth(48).setInteractive({ useHandCursor: true }).setStroke("#140a22", 5);
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
      this.tweens.add({ targets: this.introBig, x: SHIPX, y: H / 2, scaleX: 0.5, scaleY: 0.5, duration: 600, ease: "Cubic.inOut", onComplete: () => { if (this.introBig) { this.introBig.destroy(); this.introBig = null; } this.ship.setVisible(true); } });
      this.time.delayedCall(700, () => this.startPlay());
    }
  }

  let booted = false;
  function boot() { if (booted) return; booted = true; new Phaser.Game({ type: Phaser.CANVAS, parent: "game", backgroundColor: "#2a1745", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: [Play] }); }
  if (document.fonts && document.fonts.load) { Promise.all([document.fonts.load('800 30px "Baloo 2"'), document.fonts.load('700 22px "Zen Maru Gothic"')]).then(boot, boot); setTimeout(boot, 1500); } else boot();
})();
