// Justice Catch (Wh- / How many / What time) - Phaser 3. Host: catcherski, the
// arcade robot, running a coin-toss booth. A Wh-question lights up; answer
// balloons drift across the top, each carrying an answer of a TYPE (time / number /
// place / colour / person / thing). Drag to aim, release
// to throw, and POP the balloons whose TYPE matches the question word - a time for
// "What time?", a number for "How many?", a place for "Where?". Pop a wrong-type
// balloon and the booth buzzes (lose a life). Matching the Wh-word to the answer
// TYPE is the game. English-only (A2): the question is English, balloons English.
"use strict";
(function () {
  const W = 760, H = 1200, TARGET = 12, LIVES = 3;
  const CANX = W / 2, CANY = H - 150;   // cannon pivot

  const POOL = {
    time: ["3:00", "seven o'clock", "noon", "8:30", "ten o'clock"],
    number: ["three", "five", "ten", "two", "eight"],
    place: ["in the box", "on the desk", "under the bed", "at school", "by the door"],
    color: ["red", "blue", "green", "yellow", "pink"],
    person: ["my dad", "Ken", "the teacher", "my sister", "Mr. Sato"],
    thing: ["a book", "an apple", "a dog", "a pen", "a cat"]
  };
  const QUESTIONS = [
    { key: "time", q: "What time is it?", jp: "いま なんじ？" },
    { key: "number", q: "How many dogs?", jp: "いぬ は なんびき？" },
    { key: "place", q: "Where is the cat?", jp: "ねこ は どこ？" },
    { key: "color", q: "What color is it?", jp: "なにいろ？" },
    { key: "person", q: "Who is he?", jp: "かれ は だれ？" },
    { key: "thing", q: "What is it?", jp: "これ は なに？" }
  ];
  const TYPES = Object.keys(POOL);
  // Balloon colours are RANDOM, NOT keyed to answer type: you must READ the word
  // to know its type (no colour cheat-sheet). A2.
  const BALLOON_COLORS = [0xff6a8a, 0x6fc0ff, 0x9be08a, 0xffd24d, 0xc8a0ff, 0xffa05a, 0x7fe0d0, 0xff9ec7];

  const Sfx = {
    ctx: null,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    tone(f0, f1, dur, type, gain) { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); g.gain.setValueAtTime(gain || 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur); },
    noise(dur, gain, freq) { if (!this.ctx) return; const t = this.ctx.currentTime, b = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 1600; const g = this.ctx.createGain(); g.gain.setValueAtTime(gain || 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(this.ctx.destination); s.start(t); s.stop(t + dur); },
    throw() { this.noise(0.08, 0.07, 2200); },
    pop() { this.tone(700, 1100, 0.08, "square", 0.14); this.noise(0.06, 0.08, 2000); },
    buzz() { this.tone(240, 130, 0.3, "sawtooth", 0.14); },
    combo(n) { this.tone(720 + n * 40, 1150 + n * 40, 0.1, "triangle", 0.14); },
    win() { [0, 120, 240, 380].forEach((d, i) => setTimeout(() => this.tone(620 + i * 160, 980 + i * 160, 0.2, "triangle", 0.16), d)); },
    lose() { this.tone(420, 100, 0.5, "sawtooth", 0.16); }
  };

  class Play extends Phaser.Scene {
    constructor() { super("play"); }
    preload() {
      this.load.svg("catcherski", "assets/catcherski.svg", { width: 150, height: 168 });
      this.load.svg("balloon", "assets/balloon.svg", { width: 100, height: 130 });
      this.load.svg("coin", "assets/coin.svg", { width: 84, height: 84 });
      this.load.svg("star", "assets/star.svg", { width: 40, height: 40 });
      this.load.svg("heart", "assets/heart.svg", { width: 44, height: 44 });
    }
    create() {
      this.time.removeAllEvents();
      this.score = 0; this.lives = LIVES; this.combo = 0; this.balloons = []; this.playStarted = false; this.state = null; this.cur = null;
      this.aiming = false; this.aimAng = -Math.PI / 2; this.rewardDone = null;
      if (window.KMEAudio) { KMEAudio.setBase("assets/").stopAll(); KMEAudio.register(["jc_intro"].concat(QUESTIONS.map((q) => "q_" + q.key))); }

      this.buildBackdrop();
      this.cannonBase = this.add.image(CANX, CANY + 40, "catcherski").setScale(0.5).setDepth(20).setVisible(false);
      this.cannon = this.add.image(CANX, CANY - 6, "coin").setScale(0.7).setDepth(21).setVisible(false);   // a 100-yen coin at the ready (round = no facing issue)
      this.aimG = this.add.graphics().setDepth(15);
      this.buildHud();

      const q = new URLSearchParams(location.search);
      if (q.has("cap")) { window.__jc = this; this.markSeen(); this.reveal(); this.startPlay(); }
      else this.showTitle();

      this.input.on("pointerdown", (p) => this.aimStart(p));
      this.input.on("pointermove", (p) => this.aimMove(p));
      this.input.on("pointerup", () => this.aimRelease());
    }
    reveal() { this.cannonBase.setVisible(true); this.cannon.setVisible(true); }

    buildBackdrop() {
      if (this.textures.exists("boothbg")) this.textures.remove("boothbg");
      const tex = this.textures.createCanvas("boothbg", W, H), cx = tex.getContext();
      const g = cx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#3a1d6e"); g.addColorStop(0.5, "#5a2a8c"); g.addColorStop(1, "#2a1450");
      cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      // carnival stripes at the very top (tent)
      for (let i = 0; i < 16; i++) { cx.fillStyle = i % 2 ? "#ff5a7a" : "#ffd24d"; cx.beginPath(); cx.moveTo(i * (W / 16), 0); cx.lineTo((i + 1) * (W / 16), 0); cx.lineTo((i + 0.5) * (W / 16), 46); cx.closePath(); cx.fill(); }
      // bulbs
      cx.fillStyle = "#fff7c0"; for (let x = 20; x < W; x += 44) cx.fillRect(x, 50, 6, 6);
      tex.refresh();
      this.add.image(0, 0, "boothbg").setOrigin(0, 0).setDepth(0);
      const v = this.add.graphics().setDepth(40); for (let i = 0; i < 46; i++) { v.lineStyle(2, 0x140a28, i / 46 * 0.18); v.strokeRect(i, i, W - 2 * i, H - 2 * i); }
    }

    buildHud() {
      this.hud = this.add.graphics().setDepth(30); this.hud.fillStyle(0x140a28, 0.8); this.hud.fillRoundedRect(8, 60, W - 16, 50, 16);
      this.scoreTx = this.add.text(20, 70, "", { fontFamily: '"Baloo 2"', fontSize: "22px", color: "#ffe9c7", fontStyle: "800" }).setDepth(31);
      this.comboTx = this.add.text(W / 2, 84, "", { fontFamily: '"Baloo 2"', fontSize: "22px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5).setDepth(31).setStroke("#140a28", 4);
      this.hearts = this.add.text(W - 20, 70, "", { fontFamily: '"Baloo 2"', fontSize: "24px", color: "#ff5a7a" }).setOrigin(1, 0).setDepth(31);
      this.qPlate = this.add.graphics().setDepth(30); this.qPlate.fillStyle(0xffffff, 0.96); this.qPlate.fillRoundedRect(W / 2 - 300, 124, 600, 88, 20); this.qPlate.lineStyle(5, 0xffd24d, 1); this.qPlate.strokeRoundedRect(W / 2 - 300, 124, 600, 88, 20);
      this.qTx = this.add.text(W / 2, 152, "", { fontFamily: '"Baloo 2"', fontSize: "34px", color: "#5a2a8c", fontStyle: "800" }).setOrigin(0.5).setDepth(31);
      this.qJp = this.add.text(W / 2, 188, "", { fontFamily: '"Zen Maru Gothic"', fontSize: "18px", color: "#7a4ab0", fontStyle: "700" }).setOrigin(0.5).setDepth(31);
      this.qPlate.setVisible(false); this.updateHud();
    }
    updateHud() { this.scoreTx.setText("ポップ " + this.score + "/" + TARGET); this.hearts.setText("❤".repeat(Math.max(0, this.lives))); this.comboTx.setText(this.combo >= 2 ? this.combo + " コンボ！" : ""); }

    startPlay() { if (this.playStarted) return; this.playStarted = true; this.state = "play"; this.canFire = true; this.hud.setVisible(true); this.qPlate.setVisible(true); this.qTx.setVisible(true); this.qJp.setVisible(true); this.nextQuestion(); this.spawnEv = this.time.addEvent({ delay: 1300, loop: true, callback: () => this.maybeSpawn() }); for (let i = 0; i < 3; i++) this.spawnBalloon(); }

    nextQuestion() {
      this.cur = Phaser.Utils.Array.GetRandom(QUESTIONS);
      this.qTx.setText(this.cur.q).setScale(0.7); this.tweens.add({ targets: this.qTx, scale: 1, duration: 200, ease: "Back.out" });
      this.qJp.setText(this.cur.jp);
      this.voice("q_" + this.cur.key);
    }
    maybeSpawn() { if (this.state !== "play") return; if (this.balloons.length < 4) this.spawnBalloon(); }
    spawnBalloon(type) {
      // ~45% the wanted type so there are clear targets but real discrimination
      if (!type) {
        if (this.cur && Phaser.Math.Between(0, 99) < 45) type = this.cur.key;   // ensure clear correct-type targets
        else {
          // decoys avoid the AMBIGUOUS pair (a number could read as a time, etc.)
          const avoid = { time: "number", number: "time" };
          const pool = TYPES.filter((t) => t !== (this.cur && this.cur.key) && t !== (this.cur && avoid[this.cur.key]));
          type = Phaser.Utils.Array.GetRandom(pool.length ? pool : TYPES);
        }
      }
      const text = Phaser.Utils.Array.GetRandom(POOL[type]);
      const fromLeft = Math.random() < 0.5;
      const y = Phaser.Math.Between(250, 560);
      const cont = this.add.container(fromLeft ? -90 : W + 90, y).setDepth(12);
      const bal = this.add.image(0, 0, "balloon").setScale(1).setTint(Phaser.Utils.Array.GetRandom(BALLOON_COLORS));
      const wdt = Math.max(96, text.length * 13 + 26);
      const plate = this.add.graphics(); plate.fillStyle(0xffffff, 0.95); plate.fillRoundedRect(-wdt / 2, -14, wdt, 36, 10);
      const tx = this.add.text(0, 4, text, { fontFamily: '"Baloo 2"', fontSize: "21px", color: "#2a1545", fontStyle: "800" }).setOrigin(0.5);
      cont.add([bal, plate, tx]);
      const b = { cont, bal, type, vx: (fromLeft ? 1 : -1) * Phaser.Math.Between(45, 80), wob: Phaser.Math.FloatBetween(0, 6), y0: y, dead: false, r: 52 };
      this.balloons.push(b);
    }

    aimStart(p) { Sfx.init(); if (window.KMEAudio) KMEAudio.unlock(); if (this.state !== "play") return; this.aiming = true; this.aimMove(p); }
    aimMove(p) {
      if (!this.aiming) return;
      let a = Math.atan2(p.y - CANY, p.x - CANX);
      a = Phaser.Math.Clamp(a, -Math.PI + 0.35, -0.35);   // upward arc only
      this.aimAng = a;   // coin is round; aim shown by the dashed line
      this.aimG.clear(); this.aimG.lineStyle(4, 0xffffff, 0.5);
      this.aimG.beginPath(); this.aimG.moveTo(CANX + Math.cos(a) * 40, CANY + Math.sin(a) * 40);
      for (let d = 40; d < 1100; d += 26) { const x = CANX + Math.cos(a) * d, yy = CANY + Math.sin(a) * d; if (d % 52 < 26) this.aimG.lineTo(x, yy); else this.aimG.moveTo(x, yy); }
      this.aimG.strokePath();
    }
    aimRelease() {
      if (!this.aiming) return; this.aiming = false; this.aimG.clear();
      if (this.state !== "play") return;
      this.fire(this.aimAng);
    }
    fire(ang) {
      if (!this.canFire) return;
      this.canFire = false; this.time.delayedCall(420, () => { this.canFire = true; });   // reload: no spamming
      Sfx.throw();
      const dart = this.add.image(CANX + Math.cos(ang) * 40, CANY + Math.sin(ang) * 40, "coin").setScale(0.62).setDepth(22);
      this.tweens.add({ targets: this.cannon, scaleX: 0.55, duration: 60, yoyo: true });   // flick
      const vx = Math.cos(ang) * 1500, vy = Math.sin(ang) * 1500;
      dart.vx = vx; dart.vy = vy; dart.live = true; dart.spin = Phaser.Math.Between(18, 26) * (Math.random() < 0.5 ? 1 : -1);
      if (!this.darts) this.darts = []; this.darts.push(dart);
    }

    update(time, delta) {
      const dt = Math.min(0.033, delta / 1000);
      if (this.state !== "play" && !(this.darts && this.darts.length)) return;
      for (const b of this.balloons) {
        if (b.dead) continue;
        b.cont.x += b.vx * dt; b.cont.y = b.y0 + Math.sin(time / 500 + b.wob) * 14;
        if (b.cont.x < -130 || b.cont.x > W + 130) this.escape(b);
      }
      if (this.darts) for (const d of this.darts) {
        if (!d.live) continue;
        d.x += d.vx * dt; d.y += d.vy * dt; d.rotation += d.spin * dt;   // spinning coin
        // hit test
        for (const b of this.balloons) { if (b.dead) continue; if (Phaser.Math.Distance.Between(d.x, d.y, b.cont.x, b.cont.y) < b.r) { d.live = false; this.popBalloon(b, d); break; } }
        if (d.live && (d.y < -40 || d.x < -40 || d.x > W + 40)) { d.live = false; this.tweens.add({ targets: d, alpha: 0, duration: 120, onComplete: () => d.destroy() }); }
      }
      if (this.darts) this.darts = this.darts.filter((d) => d.live || d.active);
    }

    popBalloon(b, dart) {
      b.dead = true;
      const right = b.type === this.cur.key;
      if (dart) this.tweens.add({ targets: dart, x: b.cont.x, alpha: 0, duration: 80, onComplete: () => dart.destroy() });
      if (right) {
        Sfx.pop(); this.combo++; if (this.combo >= 3) Sfx.combo(this.combo); this.score++; this.updateHud();
        this.burst(b.cont.x, b.cont.y, 0xffd24d);
        this.tweens.add({ targets: b.cont, scale: 1.4, alpha: 0, duration: 180, onComplete: () => b.cont.destroy() });
        this.balloons = this.balloons.filter((x) => x !== b);
        if (this.score >= TARGET) { this.time.delayedCall(400, () => this.win()); return; }
        if (this.score % 4 === 0) this.nextQuestion();
      } else {
        // wrong type: a deliberate mis-pop = the real mistake -> lose a life
        Sfx.buzz(); this.combo = 0; this.lives--; this.updateHud(); this.cameras.main.shake(150, 0.008);
        const t = this.add.text(b.cont.x, b.cont.y, "ちがう しゅるい！", { fontFamily: '"Baloo 2"', fontSize: "22px", color: "#ff9a9a", fontStyle: "800" }).setOrigin(0.5).setDepth(26).setStroke("#140a28", 5);
        this.tweens.add({ targets: t, y: t.y - 28, alpha: 0, duration: 700, onComplete: () => t.destroy() });
        this.tweens.add({ targets: b.cont, scale: 0.5, alpha: 0, duration: 200, onComplete: () => b.cont.destroy() });
        this.balloons = this.balloons.filter((x) => x !== b);
        if (this.lives <= 0) this.time.delayedCall(300, () => this.lose());
      }
    }
    // a balloon left the screen: a missed wanted one only breaks the combo (no RNG life loss)
    escape(b) {
      b.dead = true;
      const wasWanted = this.state === "play" && this.cur && b.type === this.cur.key;
      this.balloons = this.balloons.filter((x) => x !== b);
      if (b.cont) b.cont.destroy();
      if (wasWanted) { this.combo = 0; this.updateHud(); }
    }
    burst(x, y, color) { for (let i = 0; i < 9; i++) { const s = this.add.image(x, y, "star").setScale(Phaser.Math.FloatBetween(0.3, 0.7)).setTint(color).setDepth(24); const a = Math.random() * Math.PI * 2, d = Phaser.Math.Between(30, 100); this.tweens.add({ targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.1, duration: 420, onComplete: () => s.destroy() }); } }

    flash(color, alpha) { const f = this.add.rectangle(0, 0, W, H, color, alpha).setOrigin(0).setDepth(50); this.tweens.add({ targets: f, alpha: 0, duration: 240, onComplete: () => f.destroy() }); }
    win() { this.state = "over"; if (this.spawnEv) this.spawnEv.remove(); if (window.KMEFlow) KMEFlow.win(); Sfx.win(); this.flash(0xfff2c4, 0.5); this.time.delayedCall(600, () => this.panel("パーフェクト！", "YOU WIN!")); }
    lose() { this.state = "over"; if (this.spawnEv) this.spawnEv.remove(); Sfx.lose(); this.cameras.main.shake(280, 0.012); this.time.delayedCall(400, () => this.panel("もういちど！", "GAME OVER")); }
    panel(jp, big) {
      const p = this.add.graphics().setDepth(60); p.fillStyle(0x2a1450, 0.95); p.fillRoundedRect(W / 2 - 200, H / 2 - 150, 400, 300, 28); p.lineStyle(6, 0xffcf4d, 1); p.strokeRoundedRect(W / 2 - 200, H / 2 - 150, 400, 300, 28);
      this.add.image(W / 2, H / 2 - 80, "catcherski").setScale(0.42).setDepth(61);
      this.add.text(W / 2, H / 2 - 2, big, { fontFamily: '"Baloo 2"', fontSize: "44px", color: "#ffcf4d", fontStyle: "800" }).setOrigin(0.5).setDepth(61).setStroke("#2a1450", 6);
      this.add.text(W / 2, H / 2 + 44, jp, { fontFamily: '"Zen Maru Gothic"', fontSize: "26px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(61);
      const bw = 240, bh = 72, by = H / 2 + 108;
      const bg = this.add.graphics().setDepth(61); bg.fillStyle(0x3DBE6A, 1); bg.fillRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, 20); bg.lineStyle(5, 0x1F8A4C, 1); bg.strokeRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, 20);
      this.add.text(W / 2, by, "もう いちど ▶", { fontFamily: '"Zen Maru Gothic"', fontSize: "26px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#1F5A30", 5);
      this.add.zone(W / 2, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(63).on("pointerdown", () => this.scene.restart());
      this.tweens.add({ targets: bg, alpha: 0.65, duration: 700, yoyo: true, repeat: -1 });
    }

    // ---------- title / intro / voice ----------
    introNeeded() { try { return !localStorage.getItem("jc_intro_seen_v2"); } catch (e) { return true; } }
    markSeen() { try { localStorage.setItem("jc_intro_seen_v2", "1"); } catch (e) {} }
    voice(key, onEnd) { const p = window.KMEAudio ? KMEAudio.play(key) : Promise.resolve(); if (onEnd) p.then(onEnd); return p; }
    showTitle() {
      this.state = "title"; this.titleStarted = false;
      const dim = this.add.graphics().setDepth(60); dim.fillStyle(0x140a28, 0.5); dim.fillRect(0, 0, W, H);
      const host = this.add.image(W / 2, H * 0.34, "catcherski").setScale(1.1).setDepth(62);
      this.titleBob = this.tweens.add({ targets: host, y: H * 0.34 - 16, duration: 950, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.add.text(W / 2, H * 0.56, "コイン トス", { fontFamily: '"Baloo 2"', fontSize: "40px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5).setDepth(62).setStroke("#140a28", 7);
      this.add.text(W / 2, H * 0.56 + 44, "Coin Toss", { fontFamily: '"Baloo 2"', fontSize: "24px", color: "#cdb6ff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#140a28", 5);
      const bw = 300, bh = 92, bx = W / 2, by = H * 0.73;
      const bg = this.add.graphics().setDepth(62); bg.fillStyle(0xff5aa0, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26); bg.lineStyle(6, 0xb52e6e, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26);
      this.add.triangle(bx - 58, by, 0, 0, 26, 16, 0, 32, 0xffffff).setDepth(63);
      this.add.text(bx + 14, by, "あそぶ", { fontFamily: '"Zen Maru Gothic"', fontSize: "34px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(63).setStroke("#5a1244", 5);
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
      this.introDim = this.add.graphics().setDepth(45); this.introDim.fillStyle(0x140a28, 0.62); this.introDim.fillRect(0, 0, W, H);
      this.introBig = this.add.image(W / 2, H * 0.34, "catcherski").setScale(1.05).setDepth(47);
      this.introBob = this.tweens.add({ targets: this.introBig, y: H * 0.34 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const bx = W / 2, by = H * 0.62;
      this.introBg = this.add.graphics().setDepth(46); this.introBg.fillStyle(0xffffff, 0.97); this.introBg.fillRoundedRect(bx - 332, by - 104, 664, 208, 24); this.introBg.lineStyle(5, 0x140a28, 1); this.introBg.strokeRoundedRect(bx - 332, by - 104, 664, 208, 24);
      this.introText = this.add.text(bx, by, "ピッ！ コイン ブース へ ようこそ！\nうえ の しつもん を よんで、\nただしい しゅるい の こたえ の ふうせん を\n100えんだま で わるのだ！ ねらって、はなせ！\nちがう しゅるい を わると… ブブー！ だ ぞ！", { fontFamily: '"Zen Maru Gothic"', fontSize: "22px", color: "#140a28", fontStyle: "700", align: "center", lineSpacing: 7 }).setOrigin(0.5).setDepth(47);
      this.skipBtn = this.add.text(W - 56, 92, "スキップ", { fontFamily: '"Zen Maru Gothic"', fontSize: "24px", color: "#cdb6ff", fontStyle: "700" }).setOrigin(1, 0.5).setDepth(48).setInteractive({ useHandCursor: true }).setStroke("#140a28", 5);
      this.skipChev = this.add.triangle(W - 34, 92, 0, 0, 18, 11, 0, 22, 0xffd24d).setDepth(48).setInteractive({ useHandCursor: true });
      let advanced = false; this.advIntro = () => { if (advanced) return; advanced = true; this.endIntro(); };
      this.skipBtn.on("pointerdown", this.advIntro); this.skipChev.on("pointerdown", this.advIntro);
      this.voice("jc_intro", this.advIntro);
      this.time.delayedCall(20000, this.advIntro);
    }
    endIntro() {
      this.markSeen();
      if (window.KMEAudio) KMEAudio.stopAll();
      [this.skipBtn, this.skipChev].forEach((o) => { if (o) o.destroy(); }); this.skipBtn = null; this.skipChev = null;
      if (this.introBob) this.introBob.stop();
      this.tweens.add({ targets: [this.introDim, this.introBg, this.introText], alpha: 0, duration: 420, onComplete: () => { [this.introDim, this.introBg, this.introText].forEach((o) => { if (o) o.destroy(); }); } });
      this.tweens.add({ targets: this.introBig, x: CANX, y: CANY + 40, scaleX: 0.5, scaleY: 0.5, duration: 600, ease: "Cubic.inOut", onComplete: () => { if (this.introBig) { this.introBig.destroy(); this.introBig = null; } this.reveal(); } });
      this.time.delayedCall(700, () => this.startPlay());
    }
  }

  let booted = false;
  function boot() { if (booted) return; booted = true; new Phaser.Game({ type: Phaser.CANVAS, parent: "game", backgroundColor: "#2a1450", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: [Play] }); }
  if (document.fonts && document.fonts.load) { Promise.all([document.fonts.load('800 30px "Baloo 2"'), document.fonts.load('700 22px "Zen Maru Gothic"')]).then(boot, boot); setTimeout(boot, 1500); } else boot();
})();
