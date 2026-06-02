// Stink Sergeant (imperatives) - Phaser 3. Host: unko, the drill sergeant.
// A REAL Frogger: you freely hop the recruit up across lanes of LIVE traffic
// (cars actually hit you - time the gaps), reaching the far side. On top of that,
// unko barks ENGLISH ORDERS you must obey on the beat: "Jump!"/"Go left!"/"Go
// right!" force that exact hop, and "Stop!"/"Don't move!" mean FREEZE even as a
// car bears down. Obey for a combo + a safe push; disobey (or move on a "Don't")
// and you eat a stink-bomb. The grammar is obey-the-imperative; the game is dodge
// the traffic. English-only order (A2): the command is never glossed.
"use strict";
(function () {
  const W = 760, H = 1200, COLS = 5, GOAL = 12, LIVES = 3;
  const ROWH = 132, RECRUIT_Y = H * 0.64, COLW = W / COLS;
  const colX = (c) => COLW * (c + 0.5);

  const CMDS = {
    up: [{ en: "Jump!" }, { en: "Go!" }, { en: "Forward!" }, { en: "Hop!" }],
    left: [{ en: "Go left!" }, { en: "Left!" }, { en: "Jump left!" }],
    right: [{ en: "Go right!" }, { en: "Right!" }, { en: "Jump right!" }],
    stay: [{ en: "Stop!" }, { en: "Wait!" }, { en: "Don't move!" }, { en: "Freeze!" }]
  };

  const Sfx = {
    ctx: null,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    tone(f0, f1, dur, type, gain) { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); g.gain.setValueAtTime(gain || 0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur); },
    noise(dur, gain, freq) { if (!this.ctx) return; const t = this.ctx.currentTime, b = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 900; const g = this.ctx.createGain(); g.gain.setValueAtTime(gain || 0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(this.ctx.destination); s.start(t); s.stop(t + dur); },
    hop() { this.tone(420, 700, 0.09, "square", 0.1); },
    order() { this.tone(300, 520, 0.12, "sawtooth", 0.1); },
    obey() { this.tone(680, 1020, 0.1, "triangle", 0.14); },
    honk() { this.tone(300, 300, 0.16, "sawtooth", 0.16); this.tone(360, 360, 0.16, "square", 0.08); },
    splat() { this.noise(0.4, 0.24, 600); this.tone(220, 80, 0.4, "sawtooth", 0.14); },
    win() { [0, 120, 240, 380].forEach((d, i) => setTimeout(() => this.tone(560 + i * 150, 940 + i * 150, 0.2, "triangle", 0.16), d)); },
    lose() { this.tone(420, 100, 0.5, "sawtooth", 0.16); }
  };

  class Play extends Phaser.Scene {
    constructor() { super("play"); }
    preload() {
      this.load.svg("unko", "assets/unko.svg", { width: 200, height: 172 });
      this.load.svg("recruit", "assets/recruit.svg", { width: 96, height: 96 });
      this.load.svg("car", "assets/car.svg", { width: 140, height: 82 });
      this.load.svg("stink", "assets/stink.svg", { width: 150, height: 150 });
      this.load.svg("heart", "assets/heart.svg", { width: 44, height: 44 });
    }
    create() {
      this.time.removeAllEvents();
      this.lives = LIVES; this.combo = 0; this.row = 0; this.col = 2; this.rows = {}; this.invuln = 0;
      this.playStarted = false; this.state = null; this.order = null; this.orderActed = false; this.dead = false; this.rewardDone = null;
      if (window.KMEAudio) { KMEAudio.setBase("assets/").stopAll(); const keys = ["ss_intro"]; for (const g in CMDS) CMDS[g].forEach((c) => keys.push("c_" + this.key(c.en))); KMEAudio.register(keys); }

      this.buildBackdrop();
      for (let r = -1; r <= 10; r++) this.ensureRow(r);
      this.recruit = this.add.image(colX(this.col), RECRUIT_Y, "recruit").setScale(0.92).setDepth(20).setVisible(false);
      this.shadow = this.add.ellipse(colX(this.col), RECRUIT_Y + 40, 64, 16, 0x0a1a0a, 0.25).setDepth(19).setVisible(false);
      this.unko = this.add.image(96, 150, "unko").setScale(0.5).setDepth(31).setVisible(false);
      this.buildHud();

      const q = new URLSearchParams(location.search);
      if (q.has("cap")) { window.__ss = this; this.markSeen(); this.reveal(); this.startPlay(); }
      else this.showTitle();

      this.input.keyboard.on("keydown-UP", () => this.move("up"));
      this.input.keyboard.on("keydown-LEFT", () => this.move("left"));
      this.input.keyboard.on("keydown-RIGHT", () => this.move("right"));
      this.input.on("pointerdown", (p) => { this.swX = p.x; this.swY = p.y; });
      this.input.on("pointerup", (p) => { const dx = p.x - this.swX, dy = p.y - this.swY; if (Math.hypot(dx, dy) < 36) { this.move("up"); return; } if (Math.abs(dy) > Math.abs(dx)) { if (dy < 0) this.move("up"); } else this.move(dx < 0 ? "left" : "right"); });
    }
    reveal() { this.recruit.setVisible(true); this.shadow.setVisible(true); this.unko.setVisible(true); }
    key(s) { return s.toLowerCase().replace(/[^a-z]/g, ""); }

    buildBackdrop() {
      if (this.textures.exists("grassbg")) this.textures.remove("grassbg");
      const tex = this.textures.createCanvas("grassbg", W, H), cx = tex.getContext();
      cx.fillStyle = "#5f9a48"; cx.fillRect(0, 0, W, H); tex.refresh();
      this.add.image(0, 0, "grassbg").setOrigin(0, 0).setDepth(0);
      this.laneG = this.add.graphics().setDepth(1);
      this.v = this.add.graphics().setDepth(45); for (let i = 0; i < 46; i++) { this.v.lineStyle(2, 0x10210a, i / 46 * 0.16); this.v.strokeRect(i, i, W - 2 * i, H - 2 * i); }
    }
    rowScreenY(r) { return RECRUIT_Y - (r - this.row) * ROWH; }
    ensureRow(r) {
      if (this.rows[r]) return this.rows[r];
      // row 0 = start grass; goal row = grass; ~60% of the rest are roads
      const isRoad = r > 0 && r < GOAL && (r % 3 !== 0);
      const row = { r, isRoad, cars: [] };
      if (isRoad) {
        const dir = r % 2 ? 1 : -1, speed = 78 + Math.min(120, r * 9) + Phaser.Math.Between(0, 30);
        const gap = Phaser.Math.Between(320, 430), n = Math.ceil((W + 400) / gap);
        for (let i = 0; i < n; i++) row.cars.push({ x: i * gap + Phaser.Math.Between(0, 60), dir, speed, tint: [0xef5a3a, 0x4a90d9, 0xf2b035, 0x8a5cd0, 0x3ac06a][Phaser.Math.Between(0, 4)], spr: null });
      }
      this.rows[r] = row; return row;
    }

    buildHud() {
      this.hud = this.add.graphics().setDepth(30); this.hud.fillStyle(0x10210a, 0.78); this.hud.fillRoundedRect(8, 8, W - 16, 54, 16);
      this.progTx = this.add.text(20, 18, "", { fontFamily: '"Baloo 2"', fontSize: "22px", color: "#eaf6d8", fontStyle: "800" }).setDepth(31);
      this.comboTx = this.add.text(W / 2, 34, "", { fontFamily: '"Baloo 2"', fontSize: "22px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5).setDepth(31).setStroke("#10210a", 4);
      this.hearts = this.add.text(W - 20, 18, "", { fontFamily: '"Baloo 2"', fontSize: "26px", color: "#ff5a7a" }).setOrigin(1, 0).setDepth(31);
      this.orderPlate = this.add.graphics().setDepth(31);
      this.orderTx = this.add.text(W / 2, 110, "", { fontFamily: '"Baloo 2"', fontSize: "46px", color: "#fff", fontStyle: "800" }).setOrigin(0.5).setDepth(33).setStroke("#10210a", 7);
      this.hintTx = this.add.text(W / 2, H - 30, "うえ・ひだり・みぎ に スワイプ！ めいれい は まもれ！", { fontFamily: '"Zen Maru Gothic"', fontSize: "17px", color: "#d8f08a", fontStyle: "700" }).setOrigin(0.5).setDepth(31).setVisible(false);
      this.updateHud();
    }
    updateHud() { this.progTx.setText("ゴールまで " + Math.max(0, GOAL - this.row)); this.hearts.setText("❤".repeat(Math.max(0, this.lives))); this.comboTx.setText(this.combo >= 2 ? this.combo + " コンボ！" : ""); }

    startPlay() { if (this.playStarted) return; this.playStarted = true; this.state = "play"; this.hud.setVisible(true); this.hintTx.setVisible(true); this.scheduleOrder(2200); }

    scheduleOrder(delay) { if (this.state !== "play") return; this.time.delayedCall(delay, () => this.newOrder()); }
    newOrder() {
      if (this.state !== "play") return;
      const r = Phaser.Math.Between(0, 99);
      let grp = r < 46 ? "up" : r < 62 ? "left" : r < 78 ? "right" : "stay";
      if (grp === "stay" && this.carBearing()) grp = "up";   // never force a freeze with a car bearing down (no-win)
      this.order = Object.assign({ grp }, Phaser.Utils.Array.GetRandom(CMDS[grp])); this.orderActed = false;
      this.orderPlate.clear(); this.orderPlate.fillStyle(0x18301a, 0.95); this.orderPlate.fillRoundedRect(W / 2 - 280, 78, 560, 70, 20); this.orderPlate.lineStyle(4, 0xffe08a, 0.9); this.orderPlate.strokeRoundedRect(W / 2 - 280, 78, 560, 70, 20);
      this.orderTx.setText(this.order.en).setScale(0.6); this.tweens.add({ targets: this.orderTx, scale: 1, duration: 150, ease: "Back.out" });
      Sfx.order(); this.voice("c_" + this.key(this.order.en));
      this.tweens.add({ targets: this.unko, scaleX: 0.54, scaleY: 0.46, duration: 110, yoyo: true });
      this.orderEndT = this.time.now + 2000;
      this.orderTimer = this.time.delayedCall(2000, () => this.resolveOrder());
    }
    resolveOrder() {
      if (!this.order) return;
      const wasStay = this.order.grp === "stay";
      if (wasStay && !this.orderActed) { this.combo++; Sfx.obey(); this.popText("FREEZE OK!", "#d8f08a"); }   // correctly held still
      else if (!wasStay && !this.orderActed) { this.combo = 0; this.popText("おそい！", "#ffd24d"); }            // ignored a move order
      this.clearOrder();
      this.scheduleOrder(Phaser.Math.Between(900, 1500));
    }
    clearOrder() { this.order = null; this.orderTx.setText(""); this.orderPlate.clear(); if (this.orderTimer) this.orderTimer.remove(); }
    carBearing() {   // is a car approaching the recruit's current cell? (then a "freeze" order would be unfair)
      const row = this.ensureRow(this.row); if (!row.isRoad) return false;
      for (const c of row.cars) { const d = colX(this.col) - c.x; if (Math.sign(d) === c.dir && Math.abs(d) < 220) return true; }
      return false;
    }

    move(dir) {
      Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.state !== "play" || this.dead || this.hopping) return;
      // if an order is active, the move MUST match it
      if (this.order) {
        if (this.order.grp === "stay") { this.combo = 0; Sfx.splat(); this.popText("うごくな！", "#ff7a6a"); this.orderActed = true; this.clearOrder(); this.hit(); this.scheduleOrder(900); return; }
        if (dir !== this.order.grp) { this.combo = 0; Sfx.honk(); this.popText("ちがう めいれい！", "#ff7a6a"); this.orderActed = true; this.clearOrder(); this.scheduleOrder(900); return; }
        // correct obey -> unko's order shields you across (obeying is never punished by traffic)
        this.orderActed = true; this.combo++; Sfx.obey(); this.invuln = Math.max(this.invuln, 0.55); this.popText("はい！", "#d8f08a"); this.clearOrder(); this.scheduleOrder(Phaser.Math.Between(900, 1500));
      }
      this.hop(dir);
    }
    hop(dir) {
      let nc = this.col, nr = this.row;
      if (dir === "left") nc = Math.max(0, this.col - 1);
      else if (dir === "right") nc = Math.min(COLS - 1, this.col + 1);
      else nr = this.row + 1;
      this.hopping = true;
      this.col = nc; this.row = nr;
      Sfx.hop();
      const tx = colX(this.col);
      this.tweens.add({ targets: this.recruit, x: tx, scaleY: 1.18, scaleX: 0.86, duration: 110, yoyo: true, ease: "Quad.out", onYoyo: () => this.recruit.setScale(0.92) });
      this.shadow.x = tx;
      this.tweens.add({ targets: this, _scroll: 1, duration: 130, onComplete: () => { this.hopping = false; this.checkLand(); if (this.row >= GOAL) this.win(); } });
      this.updateHud();
      if (dir === "up") this.ensureRow(this.row + 8);
    }
    checkLand() {
      const row = this.ensureRow(this.row);
      if (!row.isRoad || this.invuln > 0) return;
      for (const c of row.cars) { if (Math.abs(c.x - colX(this.col)) < 70) { this.hit(); return; } }
    }

    update(time, delta) {
      const dt = Math.min(0.033, delta / 1000);
      if (this.invuln > 0) this.invuln -= dt;
      // draw lanes + move + render cars
      this.laneG.clear();
      for (const k in this.rows) {
        const row = this.rows[k], y = this.rowScreenY(row.r);
        if (y < -ROWH || y > H + ROWH) { row.cars.forEach((c) => { if (c.spr) { c.spr.setVisible(false); } }); continue; }
        if (row.isRoad) { this.laneG.fillStyle(0x3a3f4a, 1); this.laneG.fillRect(0, y - ROWH / 2, W, ROWH); this.laneG.lineStyle(4, 0xf2d24a, 0.6); for (let x = 14; x < W; x += 64) this.laneG.lineBetween(x, y, x + 34, y); }
        else { this.laneG.fillStyle(row.r >= GOAL ? 0x3aa05a : 0x6fb053, 0.5); this.laneG.fillRect(0, y - ROWH / 2, W, ROWH); }
      }
      if (this.state === "play" && !this.dead) {
        for (const k in this.rows) {
          const row = this.rows[k]; if (!row.isRoad) continue; const y = this.rowScreenY(row.r); const onScreen = y > -ROWH && y < H + ROWH;
          for (const c of row.cars) {
            c.x += c.dir * c.speed * dt;
            if (c.dir > 0 && c.x > W + 180) c.x -= (W + 360); if (c.dir < 0 && c.x < -180) c.x += (W + 360);
            if (onScreen) { if (!c.spr) { c.spr = this.add.image(0, 0, "car").setDepth(12); } c.spr.setVisible(true).setPosition(c.x, y).setFlipX(c.dir < 0).setTint(c.tint); }
            else if (c.spr) c.spr.setVisible(false);
            // run over the recruit if it stands in this row
            if (row.r === this.row && this.invuln <= 0 && !this.hopping && Math.abs(c.x - colX(this.col)) < 64) this.hit();
          }
        }
      }
      this.recruit.x = colX(this.col); this.shadow.x = colX(this.col);
      // order ring
      if (this.order && this.orderEndT) { const tleft = Math.max(0, (this.orderEndT - time) / 2000); /* visual handled by plate pulse */ }
    }

    hit() {
      if (this.dead || this.invuln > 0) return;
      this.invuln = 1.1; this.lives--; this.combo = 0; this.updateHud();
      Sfx.honk(); Sfx.splat(); this.cameras.main.shake(200, 0.012); this.cameras.main.flash(140, 200, 60, 60);
      const s = this.add.image(this.recruit.x, RECRUIT_Y, "stink").setScale(0.3).setDepth(24).setAlpha(0.95); this.tweens.add({ targets: s, scale: 1.1, alpha: 0, duration: 700, onComplete: () => s.destroy() });
      this.tweens.add({ targets: this.recruit, angle: 360, duration: 400, onComplete: () => this.recruit.setAngle(0) });
      // knock back down a row to safety
      if (this.row > 0) { this.row = Math.max(0, this.row - 1); this.updateHud(); }
      this.tweens.add({ targets: this.recruit, alpha: 0.4, duration: 120, yoyo: true, repeat: 4 });
      this.popText("ぺちゃ！", "#ff7a6a");
      if (this.lives <= 0) { this.dead = true; this.time.delayedCall(700, () => this.lose()); }
    }
    popText(t, c) { const o = this.add.text(this.recruit.x, RECRUIT_Y - 70, t, { fontFamily: '"Baloo 2"', fontSize: "28px", color: c, fontStyle: "800" }).setOrigin(0.5).setDepth(26).setStroke("#10210a", 5); this.tweens.add({ targets: o, y: o.y - 30, alpha: 0, duration: 700, onComplete: () => o.destroy() }); }

    flash(color, alpha) { const f = this.add.rectangle(0, 0, W, H, color, alpha).setOrigin(0).setDepth(50); this.tweens.add({ targets: f, alpha: 0, duration: 240, onComplete: () => f.destroy() }); }
    win() { if (this.state === "over") return; this.state = "over"; this.clearOrder(); if (window.KMEFlow) KMEFlow.win(); Sfx.win(); this.flash(0xfff2c4, 0.5); this.tweens.add({ targets: this.recruit, y: RECRUIT_Y - 50, scaleX: 1, scaleY: 1, duration: 300, yoyo: true, repeat: 2 }); this.time.delayedCall(700, () => this.panel("わたりきった！", "YOU WIN!")); }
    lose() { this.state = "over"; this.clearOrder(); Sfx.lose(); this.time.delayedCall(300, () => this.panel("もういちど！", "GAME OVER")); }
    panel(jp, big) {
      const p = this.add.graphics().setDepth(60); p.fillStyle(0x10210a, 0.95); p.fillRoundedRect(W / 2 - 200, H / 2 - 150, 400, 300, 28); p.lineStyle(6, 0xb6d96a, 1); p.strokeRoundedRect(W / 2 - 200, H / 2 - 150, 400, 300, 28);
      this.add.image(W / 2, H / 2 - 80, "unko").setScale(0.42).setDepth(61);
      this.add.text(W / 2, H / 2 - 2, big, { fontFamily: '"Baloo 2"', fontSize: "44px", color: "#b6d96a", fontStyle: "800" }).setOrigin(0.5).setDepth(61).setStroke("#10210a", 6);
      this.add.text(W / 2, H / 2 + 44, jp, { fontFamily: '"Zen Maru Gothic"', fontSize: "26px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(61);
      const bw = 240, bh = 72, by = H / 2 + 108;
      const bg = this.add.graphics().setDepth(61); bg.fillStyle(0x3DBE6A, 1); bg.fillRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, 20); bg.lineStyle(5, 0x1F8A4C, 1); bg.strokeRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, 20);
      this.add.text(W / 2, by, "もう いちど ▶", { fontFamily: '"Zen Maru Gothic"', fontSize: "26px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#1F5A30", 5);
      this.add.zone(W / 2, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(63).on("pointerdown", () => this.scene.restart());
      this.tweens.add({ targets: bg, alpha: 0.65, duration: 700, yoyo: true, repeat: -1 });
    }

    // ---------- title / intro / voice ----------
    introNeeded() { try { return !localStorage.getItem("ss_intro_seen_v3"); } catch (e) { return true; } }
    markSeen() { try { localStorage.setItem("ss_intro_seen_v3", "1"); } catch (e) {} }
    voice(key, onEnd) { const p = window.KMEAudio ? KMEAudio.play(key) : Promise.resolve(); if (onEnd) p.then(onEnd); return p; }
    showTitle() {
      this.state = "title"; this.titleStarted = false;
      const dim = this.add.graphics().setDepth(60); dim.fillStyle(0x10210a, 0.5); dim.fillRect(0, 0, W, H);
      const host = this.add.image(W / 2, H * 0.34, "unko").setScale(0.8).setDepth(62);
      this.titleBob = this.tweens.add({ targets: host, y: H * 0.34 - 16, duration: 950, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.add.text(W / 2, H * 0.56, "スティンク サージェント", { fontFamily: '"Baloo 2"', fontSize: "34px", color: "#d8f08a", fontStyle: "800" }).setOrigin(0.5).setDepth(62).setStroke("#10210a", 7);
      this.add.text(W / 2, H * 0.56 + 42, "Stink Crossing", { fontFamily: '"Baloo 2"', fontSize: "24px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#10210a", 5);
      const bw = 300, bh = 92, bx = W / 2, by = H * 0.73;
      const bg = this.add.graphics().setDepth(62); bg.fillStyle(0x6a8a3e, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26); bg.lineStyle(6, 0x47611f, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26);
      this.add.triangle(bx - 58, by, 0, 0, 26, 16, 0, 32, 0xffffff).setDepth(63);
      this.add.text(bx + 14, by, "あそぶ", { fontFamily: '"Zen Maru Gothic"', fontSize: "34px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(63).setStroke("#10210a", 5);
      this.titlePulse = this.tweens.add({ targets: bg, alpha: 0.7, duration: 650, yoyo: true, repeat: -1 });
      this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(64).on("pointerdown", () => this.startFromTitle());
    }
    startFromTitle() {
      if (this.titleStarted) return; this.titleStarted = true; Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.titleBob) this.titleBob.stop(); if (this.titlePulse) this.titlePulse.stop();
      this.children.list.filter((o) => o.depth >= 60 && o.depth < 65).forEach((o) => o.destroy());
      if (this.introNeeded()) this.startIntro(); else { this.markSeen(); this.reveal(); this.startPlay(); }
    }
    startIntro() {
      this.state = "intro";
      this.introDim = this.add.graphics().setDepth(45); this.introDim.fillStyle(0x10210a, 0.62); this.introDim.fillRect(0, 0, W, H);
      this.introBig = this.add.image(W / 2, H * 0.34, "unko").setScale(0.78).setDepth(47);
      this.introBob = this.tweens.add({ targets: this.introBig, y: H * 0.34 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const bx = W / 2, by = H * 0.62;
      this.introBg = this.add.graphics().setDepth(46); this.introBg.fillStyle(0xffffff, 0.97); this.introBg.fillRoundedRect(bx - 332, by - 110, 664, 220, 24); this.introBg.lineStyle(5, 0x10210a, 1); this.introBg.strokeRoundedRect(bx - 332, by - 110, 664, 220, 24);
      this.introText = this.add.text(bx, by, "ワシ は スティンク ぐんそう だ！\nどうろ を わたれ！ スワイプ で ぴょん と とべ。\nくるま に ぶつかる な よ！\nワシ が めいれい したら、 その とおり に うごけ。\nでも 「Don't move!」 の ときは… うごくな！ うごいたら バクダン だ ぞ！", { fontFamily: '"Zen Maru Gothic"', fontSize: "22px", color: "#10210a", fontStyle: "700", align: "center", lineSpacing: 6 }).setOrigin(0.5).setDepth(47);
      this.skipBtn = this.add.text(W - 56, 92, "スキップ", { fontFamily: '"Zen Maru Gothic"', fontSize: "24px", color: "#d8f08a", fontStyle: "700" }).setOrigin(1, 0.5).setDepth(48).setInteractive({ useHandCursor: true }).setStroke("#10210a", 5);
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
      this.tweens.add({ targets: this.introBig, x: 96, y: 150, scaleX: 0.5, scaleY: 0.5, duration: 600, ease: "Cubic.inOut", onComplete: () => { if (this.introBig) { this.introBig.destroy(); this.introBig = null; } this.reveal(); } });
      this.time.delayedCall(700, () => this.startPlay());
    }
  }

  let booted = false;
  function boot() { if (booted) return; booted = true; new Phaser.Game({ type: Phaser.CANVAS, parent: "game", backgroundColor: "#5f9a48", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: [Play] }); }
  if (document.fonts && document.fonts.load) { Promise.all([document.fonts.load('800 30px "Baloo 2"'), document.fonts.load('700 22px "Zen Maru Gothic"')]).then(boot, boot); setTimeout(boot, 1500); } else boot();
})();
