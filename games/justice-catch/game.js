// Justice Catch (Wh- / How many / What time) - Phaser 3. Host: anpan, the justice
// hero. Answer cards float up; a Wh-question sits at the top. PUNCH (tap) the
// answers of the RIGHT TYPE for the question (a time for "What time?", a number for
// "How many?", a place for "Where?", a colour for "What colour?", a person for
// "Who?", a thing for "What?"); punching the wrong type is junk and costs a life.
// Matching the question word to the answer TYPE is the grammar. English-only test
// (A2): cards are uniform (no colour/type tell), the JP only glosses the question.
"use strict";
(function () {
  const W = 760, H = 1200, TARGET = 12, LIVES = 3;

  // Answer pools by type. The kid punches the type the question wants.
  const POOL = {
    time: ["3:00", "seven o'clock", "noon", "8:30", "ten o'clock"],
    number: ["three", "five", "ten", "two", "eight"],
    place: ["in the box", "on the desk", "under the bed", "at school", "by the door"],
    color: ["red", "blue", "green", "yellow", "pink"],
    person: ["my dad", "Ken", "the teacher", "my sister", "Mr. Sato"],
    thing: ["a book", "an apple", "a dog", "a pen", "a cat"]
  };
  const QUESTIONS = [
    { key: "time", q: "What time is it?", jp: "いま なんじ？", say: "What time is it?" },
    { key: "number", q: "How many dogs?", jp: "いぬ は なんびき？", say: "How many dogs are there?" },
    { key: "place", q: "Where is the cat?", jp: "ねこ は どこ？", say: "Where is the cat?" },
    { key: "color", q: "What color is it?", jp: "なにいろ？", say: "What color is it?" },
    { key: "person", q: "Who is he?", jp: "かれ は だれ？", say: "Who is he?" },
    { key: "thing", q: "What is it?", jp: "これ は なに？", say: "What is it?" }
  ];
  const TYPES = Object.keys(POOL);

  const Sfx = {
    ctx: null,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    tone(f0, f1, dur, type, gain) { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); g.gain.setValueAtTime(gain || 0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur); },
    noise(dur, gain, freq) { if (!this.ctx) return; const t = this.ctx.currentTime, b = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 1200; const g = this.ctx.createGain(); g.gain.setValueAtTime(gain || 0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(this.ctx.destination); s.start(t); s.stop(t + dur); },
    pow() { this.noise(0.14, 0.22, 1800); this.tone(520, 900, 0.1, "square", 0.14); },
    ow() { this.tone(280, 120, 0.34, "sawtooth", 0.16); this.noise(0.16, 0.12, 500); },
    whoosh() { this.noise(0.1, 0.08, 2400); },
    win() { [0, 120, 240, 380].forEach((d, i) => setTimeout(() => this.tone(560 + i * 150, 940 + i * 150, 0.2, "triangle", 0.16), d)); },
    lose() { this.tone(420, 100, 0.5, "sawtooth", 0.16); }
  };

  class Play extends Phaser.Scene {
    constructor() { super("play"); }
    preload() {
      this.load.svg("anpan", "assets/anpan.svg", { width: 300, height: 252 });
      this.load.svg("fist", "assets/fist.svg", { width: 96, height: 96 });
      this.load.svg("heart", "assets/heart.svg", { width: 44, height: 44 });
    }
    create() {
      this.time.removeAllEvents();
      this.score = 0; this.lives = LIVES; this.cards = []; this.busy = false; this.playStarted = false; this.state = null; this.cur = null;
      if (window.KMEAudio) { KMEAudio.setBase("assets/").stopAll(); KMEAudio.register(["jc_intro"].concat(QUESTIONS.map((q) => "q_" + q.key))); }

      this.buildBackdrop();
      this.anpan = this.add.image(W / 2, H - 96, "anpan").setScale(0.62).setDepth(20).setVisible(false);
      this.buildHud();

      const q = new URLSearchParams(location.search);
      if (q.has("cap")) { window.__jc = this; this.markSeen(); this.anpan.setVisible(true); this.startPlay(); }
      else this.showTitle();

      this.input.on("pointerdown", (p) => this.onTap(p));
    }

    buildBackdrop() {
      if (this.textures.exists("skybg")) this.textures.remove("skybg");
      const tex = this.textures.createCanvas("skybg", W, H), cx = tex.getContext();
      const g = cx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#fcd9a3"); g.addColorStop(0.5, "#f7a85c"); g.addColorStop(1, "#e8743b");
      cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      // sunburst rays from bottom center
      cx.save(); cx.translate(W / 2, H); cx.globalAlpha = 0.08; cx.fillStyle = "#ffffff";
      for (let i = 0; i < 16; i++) { cx.rotate(Math.PI / 16); cx.beginPath(); cx.moveTo(-40, 0); cx.lineTo(40, 0); cx.lineTo(0, -H * 1.2); cx.closePath(); cx.fill(); }
      cx.restore(); cx.globalAlpha = 1; tex.refresh();
      this.add.image(0, 0, "skybg").setOrigin(0, 0).setDepth(0);
      // city rooftops
      const fl = this.add.graphics().setDepth(1); fl.fillStyle(0x6b4a8f, 1);
      for (let x = -10; x < W + 40; x += 90) { const h = 60 + ((x * 37) % 70); fl.fillRect(x, H - h - 60, 70, h + 80); }
      fl.fillStyle(0x553a73, 1); fl.fillRect(-20, H - 60, W + 40, 80);
      const v = this.add.graphics().setDepth(40); for (let i = 0; i < 46; i++) { v.lineStyle(2, 0x5a2c12, i / 46 * 0.16); v.strokeRect(i, i, W - 2 * i, H - 2 * i); }
    }

    buildHud() {
      this.hud = this.add.graphics().setDepth(30); this.hud.fillStyle(0x4a2a16, 0.78); this.hud.fillRoundedRect(8, 8, W - 16, 54, 16);
      this.scoreTx = this.add.text(20, 18, "", { fontFamily: '"Baloo 2"', fontSize: "24px", color: "#ffe9c7", fontStyle: "800" }).setDepth(31);
      this.hearts = this.add.text(W - 20, 18, "", { fontFamily: '"Baloo 2"', fontSize: "26px", color: "#ff5a7a" }).setOrigin(1, 0).setDepth(31);
      // question plate
      this.qPlate = this.add.graphics().setDepth(30); this.qPlate.fillStyle(0xffffff, 0.95); this.qPlate.fillRoundedRect(W / 2 - 320, 78, 640, 96, 20); this.qPlate.lineStyle(5, 0xe2762f, 1); this.qPlate.strokeRoundedRect(W / 2 - 320, 78, 640, 96, 20);
      this.qTx = this.add.text(W / 2, 108, "", { fontFamily: '"Baloo 2"', fontSize: "36px", color: "#b5360f", fontStyle: "800" }).setOrigin(0.5).setDepth(31);
      this.qJp = this.add.text(W / 2, 148, "", { fontFamily: '"Zen Maru Gothic"', fontSize: "20px", color: "#6b4a2a", fontStyle: "700" }).setOrigin(0.5).setDepth(31);
      this.qPlate.setVisible(false); this.updateHud();
    }
    updateHud() { this.scoreTx.setText("せいかい " + this.score + "/" + TARGET); this.hearts.setText("❤".repeat(Math.max(0, this.lives))); }

    startPlay() { if (this.playStarted) return; this.playStarted = true; this.state = "play"; this.hud.setVisible(true); this.qPlate.setVisible(true); this.nextQuestion(); this.spawnTimer = this.time.addEvent({ delay: 1100, loop: true, callback: () => this.maybeSpawn() }); }

    nextQuestion() {
      this.cur = Phaser.Utils.Array.GetRandom(QUESTIONS);
      this.qTx.setText(this.cur.q).setScale(0.7); this.tweens.add({ targets: this.qTx, scale: 1, duration: 200, ease: "Back.out" });
      this.qJp.setText(this.cur.jp);
      this.voice("q_" + this.cur.key);
    }

    maybeSpawn() {
      if (this.state !== "play") return;
      if (this.cards.length >= 5) return;
      // bias: ~45% right-type so the kid has clear targets but must discriminate
      const wantRight = Phaser.Math.Between(0, 99) < 45;
      let type = this.cur.key;
      if (!wantRight) { do { type = Phaser.Utils.Array.GetRandom(TYPES); } while (type === this.cur.key); }
      this.spawnCard(type);
    }

    spawnCard(type) {
      const text = Phaser.Utils.Array.GetRandom(POOL[type]);
      const x = Phaser.Math.Between(110, W - 110), y = H - 150;
      const cont = this.add.container(x, y).setDepth(12);
      const wdt = Math.max(150, text.length * 15 + 44);
      const bg = this.add.graphics(); bg.fillStyle(0xfff6e9, 1); bg.fillRoundedRect(-wdt / 2, -34, wdt, 68, 16); bg.lineStyle(4, 0xcf8a4a, 1); bg.strokeRoundedRect(-wdt / 2, -34, wdt, 68, 16);
      const tx = this.add.text(0, 0, text, { fontFamily: '"Baloo 2"', fontSize: "27px", color: "#3a2410", fontStyle: "800" }).setOrigin(0.5);
      cont.add([bg, tx]);
      cont.setScale(0.4); this.tweens.add({ targets: cont, scale: 1, duration: 180, ease: "Back.out" });
      const c = { cont, type, vy: -(70 + Phaser.Math.Between(0, 40) + this.score * 3), wdt, dead: false };
      this.cards.push(c);
    }

    onTap(p) {
      Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.state !== "play") return;
      // topmost card under the tap
      let hit = null;
      for (let i = this.cards.length - 1; i >= 0; i--) { const c = this.cards[i]; if (c.dead) continue; const dx = Math.abs(c.cont.x - p.x), dy = Math.abs(c.cont.y - p.y); if (dx < c.wdt / 2 + 8 && dy < 42) { hit = c; break; } }
      if (!hit) return;
      this.punch(hit);
    }

    punch(c) {
      c.dead = true;
      const right = c.type === this.cur.key;
      // anpan throws a fist at the card
      const fist = this.add.image(this.anpan.x, this.anpan.y - 70, "fist").setScale(0.5).setDepth(22);
      Sfx.whoosh();
      this.tweens.add({ targets: this.anpan, scaleX: 0.66, scaleY: 0.58, duration: 90, yoyo: true });
      this.tweens.add({ targets: fist, x: c.cont.x, y: c.cont.y, scale: 1, duration: 150, ease: "Quad.in", onComplete: () => {
        fist.destroy();
        if (right) {
          Sfx.pow(); this.score++; this.updateHud();
          this.pow(c.cont.x, c.cont.y, "POW!", 0x3DBE6A);
          this.tweens.add({ targets: c.cont, scale: 1.4, alpha: 0, angle: 20, duration: 220, onComplete: () => { c.cont.destroy(); } });
          this.cards = this.cards.filter((x) => x !== c);
          if (this.score >= TARGET) this.win();
          else if (this.score % 3 === 0) this.nextQuestion();   // fresh question every few points
        } else {
          Sfx.ow(); this.lives--; this.updateHud();
          this.cameras.main.shake(160, 0.009);
          this.tweens.add({ targets: this.anpan, angle: -10, duration: 70, yoyo: true, repeat: 2 });
          this.pow(c.cont.x, c.cont.y, "ジャンク！", 0xe23b3b);
          this.tweens.add({ targets: c.cont, scale: 0.6, alpha: 0, duration: 220, onComplete: () => { c.cont.destroy(); } });
          this.cards = this.cards.filter((x) => x !== c);
          if (this.lives <= 0) this.lose();
        }
      } });
    }

    pow(x, y, label, color) {
      const t = this.add.text(x, y, label, { fontFamily: '"Baloo 2"', fontSize: "40px", color: "#fff", fontStyle: "800" }).setOrigin(0.5).setDepth(30).setStroke(Phaser.Display.Color.IntegerToColor(color).rgba, 8).setScale(0.5);
      this.tweens.add({ targets: t, scale: 1.2, y: y - 40, alpha: 0, duration: 600, ease: "Quad.out", onComplete: () => t.destroy() });
    }

    update(time, delta) {
      const dt = Math.min(0.033, delta / 1000);
      if (this.state !== "play") return;
      for (const c of this.cards) {
        if (c.dead) continue;
        c.cont.y += c.vy * dt;
        if (c.cont.y < 200) { c.dead = true; this.tweens.add({ targets: c.cont, alpha: 0, duration: 200, onComplete: () => c.cont.destroy() }); }   // floats off the top, no penalty
      }
      this.cards = this.cards.filter((c) => !c.dead || c.cont.active);
    }

    flash(color, alpha) { const f = this.add.rectangle(0, 0, W, H, color, alpha).setOrigin(0).setDepth(50); this.tweens.add({ targets: f, alpha: 0, duration: 240, onComplete: () => f.destroy() }); }
    win() { this.state = "over"; if (this.spawnTimer) this.spawnTimer.remove(); if (window.KMEFlow) KMEFlow.win(); Sfx.win(); this.flash(0xfff2c4, 0.5); this.tweens.add({ targets: this.anpan, scaleX: 0.72, scaleY: 0.72, duration: 180, yoyo: true, repeat: 3 }); this.time.delayedCall(700, () => this.panel("せいぎ の しょうり！", "YOU WIN!")); }
    lose() { this.state = "over"; if (this.spawnTimer) this.spawnTimer.remove(); Sfx.lose(); this.cameras.main.shake(280, 0.012); this.time.delayedCall(500, () => this.panel("もういちど！", "GAME OVER")); }
    panel(jp, big) {
      const p = this.add.graphics().setDepth(60); p.fillStyle(0x4a2a16, 0.95); p.fillRoundedRect(W / 2 - 200, H / 2 - 150, 400, 300, 28); p.lineStyle(6, 0xffcf4d, 1); p.strokeRoundedRect(W / 2 - 200, H / 2 - 150, 400, 300, 28);
      this.add.image(W / 2, H / 2 - 80, "anpan").setScale(0.4).setDepth(61);
      this.add.text(W / 2, H / 2 - 2, big, { fontFamily: '"Baloo 2"', fontSize: "44px", color: "#ffcf4d", fontStyle: "800" }).setOrigin(0.5).setDepth(61).setStroke("#4a2a16", 6);
      this.add.text(W / 2, H / 2 + 44, jp, { fontFamily: '"Zen Maru Gothic"', fontSize: "26px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(61);
      const bw = 240, bh = 72, by = H / 2 + 108;
      const bg = this.add.graphics().setDepth(61); bg.fillStyle(0x3DBE6A, 1); bg.fillRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, 20); bg.lineStyle(5, 0x1F8A4C, 1); bg.strokeRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, 20);
      this.add.text(W / 2, by, "もう いちど ▶", { fontFamily: '"Zen Maru Gothic"', fontSize: "26px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#1F5A30", 5);
      this.add.zone(W / 2, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(63).on("pointerdown", () => this.scene.restart());
      this.tweens.add({ targets: bg, alpha: 0.65, duration: 700, yoyo: true, repeat: -1 });
    }

    // ---------- title / intro / voice ----------
    introNeeded() { try { return !localStorage.getItem("jc_intro_seen"); } catch (e) { return true; } }
    markSeen() { try { localStorage.setItem("jc_intro_seen", "1"); } catch (e) {} }
    voice(key, onEnd) { const p = window.KMEAudio ? KMEAudio.play(key) : Promise.resolve(); if (onEnd) p.then(onEnd); return p; }
    showTitle() {
      this.state = "title"; this.titleStarted = false;
      const dim = this.add.graphics().setDepth(60); dim.fillStyle(0x5a2c12, 0.45); dim.fillRect(0, 0, W, H);
      const host = this.add.image(W / 2, H * 0.34, "anpan").setScale(0.95).setDepth(62);
      this.titleBob = this.tweens.add({ targets: host, y: H * 0.34 - 16, duration: 950, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.add.text(W / 2, H * 0.56, "ジャスティス キャッチ", { fontFamily: '"Baloo 2"', fontSize: "40px", color: "#ffcf4d", fontStyle: "800" }).setOrigin(0.5).setDepth(62).setStroke("#5a2c12", 7);
      this.add.text(W / 2, H * 0.56 + 44, "Justice Catch", { fontFamily: '"Baloo 2"', fontSize: "26px", color: "#fff0d8", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#5a2c12", 5);
      const bw = 300, bh = 92, bx = W / 2, by = H * 0.73;
      const bg = this.add.graphics().setDepth(62); bg.fillStyle(0xe2762f, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26); bg.lineStyle(6, 0xa8501a, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26);
      this.add.triangle(bx - 58, by, 0, 0, 26, 16, 0, 32, 0xffffff).setDepth(63);
      this.add.text(bx + 14, by, "あそぶ", { fontFamily: '"Zen Maru Gothic"', fontSize: "34px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(63).setStroke("#7a3a12", 5);
      this.titlePulse = this.tweens.add({ targets: bg, alpha: 0.7, duration: 650, yoyo: true, repeat: -1 });
      this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(64).on("pointerdown", () => this.startFromTitle());
    }
    startFromTitle() {
      if (this.titleStarted) return; this.titleStarted = true; Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.titleBob) this.titleBob.stop(); if (this.titlePulse) this.titlePulse.stop();
      this.children.list.filter((o) => o.depth >= 60 && o.depth < 65).forEach((o) => o.destroy());
      if (this.introNeeded()) this.startIntro(); else { this.markSeen(); this.anpan.setVisible(true); this.startPlay(); }
    }
    startIntro() {
      this.state = "intro";
      this.introDim = this.add.graphics().setDepth(45); this.introDim.fillStyle(0x5a2c12, 0.6); this.introDim.fillRect(0, 0, W, H);
      this.introBig = this.add.image(W / 2, H * 0.34, "anpan").setScale(0.9).setDepth(47);
      this.introBob = this.tweens.add({ targets: this.introBig, y: H * 0.34 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const bx = W / 2, by = H * 0.62;
      this.introBg = this.add.graphics().setDepth(46); this.introBg.fillStyle(0xffffff, 0.97); this.introBg.fillRoundedRect(bx - 332, by - 104, 664, 208, 24); this.introBg.lineStyle(5, 0x5a2c12, 1); this.introBg.strokeRoundedRect(bx - 332, by - 104, 664, 208, 24);
      this.introText = this.add.text(bx, by, "せいぎ の ヒーロー、 アンパン さんじょう！\nうえ の しつもん を よんで、\nただしい こたえ の カード だけ を パンチ するんだ！\n「What time?」 は じかん、「How many?」 は かず、\nちがう しゅるい を なぐると… ジャンク だ！", { fontFamily: '"Zen Maru Gothic"', fontSize: "22px", color: "#4a2a16", fontStyle: "700", align: "center", lineSpacing: 7 }).setOrigin(0.5).setDepth(47);
      this.skipBtn = this.add.text(W - 56, 92, "スキップ", { fontFamily: '"Zen Maru Gothic"', fontSize: "24px", color: "#fff0d8", fontStyle: "700" }).setOrigin(1, 0.5).setDepth(48).setInteractive({ useHandCursor: true }).setStroke("#5a2c12", 5);
      this.skipChev = this.add.triangle(W - 34, 92, 0, 0, 18, 11, 0, 22, 0xffcf4d).setDepth(48).setInteractive({ useHandCursor: true });
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
      this.tweens.add({ targets: this.introBig, x: W / 2, y: H - 96, scaleX: 0.62, scaleY: 0.62, duration: 600, ease: "Cubic.inOut", onComplete: () => { if (this.introBig) { this.introBig.destroy(); this.introBig = null; } this.anpan.setVisible(true); } });
      this.time.delayedCall(700, () => this.startPlay());
    }
  }

  let booted = false;
  function boot() { if (booted) return; booted = true; new Phaser.Game({ type: Phaser.CANVAS, parent: "game", backgroundColor: "#e8743b", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: [Play] }); }
  if (document.fonts && document.fonts.load) { Promise.all([document.fonts.load('800 30px "Baloo 2"'), document.fonts.load('700 22px "Zen Maru Gothic"')]).then(boot, boot); setTimeout(boot, 1500); } else boot();
})();
