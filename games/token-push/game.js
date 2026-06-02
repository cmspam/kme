// Token Push (subject / object / possessive pronouns) - Phaser 3. A coin-pusher. catcherski
// the hacked claw-machine robot "steals" a noun; you read the sentence + slot and DRAG the
// token whose pronoun FORM fits (he vs him vs his) into the machine. The pusher slides back
// and forth forever (real coin-pusher), so WHERE you drop (which lane) and WHEN (drop while it
// is retracted to ride the full stroke) both decide how many coins cascade off the ledge into
// the payout tray. Right form = a real gold coin + Aria says the sentence; wrong form = the
// machine spits it back (no payout). Goal: collect TARGET coins within TURNS drops; final score
// shown. The slot decides the form, so reading the English IS the game. catcherski JP = flavor (A2).
"use strict";
(function () {
  const W = 760, H = 1200, TURNS = 10, TARGET = 60;                    // collect TARGET coins within TURNS drops
  const SX0 = 110, SX1 = 650, BACKY = 300, EDGEY = 568, AMP = 232;     // shelf geometry
  const COIN_R = 21, CSC = 0.42;                                       // coin radius / sprite scale
  const TRAYY = 632, TRAY_CAP = 64, DECKY = 812, PUSH_MS = 2500;       // PUSH_MS = full back-and-forth period (slow, dramatic)

  // G5 pronoun bank. Every triad is ONE person's three cases (subject / object / possessive),
  // so CASE is the only axis and the wrong[] are same-person traps. The noun chip is the BARE
  // noun (no 's, no の): the case is recoverable ONLY from the slot in the English sentence (A2).
  // he-family and they-family both have three distinct forms and are "replace-a-noun".
  const ITEMS = [
    { pre: "", post: "is my friend.", noun: "Tom", jp: "トム", answer: "He", wrong: ["Him", "His"], say: "He is my friend.", tr: "かれ は ともだち。" },
    { pre: "I like", post: ".", noun: "Tom", jp: "トム", answer: "him", wrong: ["He", "His"], say: "I like him.", tr: "わたし は かれ が すき。" },
    { pre: "This is", post: "dog.", noun: "Tom", jp: "トム", answer: "his", wrong: ["He", "Him"], say: "This is his dog.", tr: "これ は かれ の いぬ。" },
    { pre: "", post: "is a teacher.", noun: "Mr. Sato", jp: "さとう せんせい", answer: "He", wrong: ["Him", "His"], say: "He is a teacher.", tr: "かれ は せんせい。" },
    { pre: "We know", post: ".", noun: "Ken", jp: "ケン", answer: "him", wrong: ["He", "His"], say: "We know him.", tr: "わたしたち は かれ を しっている。" },
    { pre: "That is", post: "bike.", noun: "Ken", jp: "ケン", answer: "his", wrong: ["He", "Him"], say: "That is his bike.", tr: "あれ は かれ の じてんしゃ。" },
    { pre: "", post: "are at school.", noun: "Tom and Mary", jp: "トムと メアリー", answer: "They", wrong: ["Them", "Their"], say: "They are at school.", tr: "かれら は がっこう に いる。" },
    { pre: "I know", post: ".", noun: "Tom and Mary", jp: "トムと メアリー", answer: "them", wrong: ["They", "Their"], say: "I know them.", tr: "わたし は かれら を しっている。" },
    { pre: "That is", post: "house.", noun: "Tom and Mary", jp: "トムと メアリー", answer: "their", wrong: ["They", "Them"], say: "That is their house.", tr: "あれ は かれら の いえ。" },
    { pre: "", post: "are my cats.", noun: "The cats", jp: "その ねこ", answer: "They", wrong: ["Them", "Their"], say: "They are my cats.", tr: "かれら は わたし の ねこ。" },
    { pre: "I feed", post: "every day.", noun: "the dogs", jp: "その いぬ", answer: "them", wrong: ["They", "Their"], say: "I feed them every day.", tr: "まいにち かれら に えさ を あげる。" },
    { pre: "Look at", post: "wings.", noun: "the birds", jp: "その とり", answer: "their", wrong: ["They", "Them"], say: "Look at their wings.", tr: "かれら の はね を みて。" }
  ];

  const Sfx = {
    ctx: null,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    tone(f0, f1, dur, type, gain) { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); g.gain.setValueAtTime(gain || 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur); },
    noise(dur, gain, freq) { if (!this.ctx) return; const t = this.ctx.currentTime, b = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 1400; const g = this.ctx.createGain(); g.gain.setValueAtTime(gain || 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(this.ctx.destination); s.start(t); s.stop(t + dur); },
    beep() { this.tone(720, 1180, 0.09, "square", 0.08); },              // catcherski "pi!"
    err() { this.tone(300, 150, 0.32, "sawtooth", 0.13); this.tone(220, 120, 0.32, "square", 0.07); },   // "BEEP" error
    clink() { this.tone(1200, 700, 0.06, "triangle", 0.1); this.noise(0.04, 0.05, 5000); },
    push() { this.noise(0.16, 0.12, 600); this.tone(160, 90, 0.18, "sawtooth", 0.06); },
    win() { [0, 120, 240, 380].forEach((d, i) => setTimeout(() => this.tone(560 + i * 150, 940 + i * 150, 0.2, "triangle", 0.16), d)); },
    lose() { this.tone(420, 100, 0.5, "sawtooth", 0.16); }
  };

  class Play extends Phaser.Scene {
    constructor() { super("play"); }
    preload() {
      this.load.svg("catcherski", "assets/catcherski.svg", { width: 150, height: 168 });
      this.load.svg("coin", "assets/coin.svg", { width: 96, height: 96 });
      ["p_star", "p_spark"].forEach((k) => this.load.svg(k, "assets/" + k + ".svg", { width: 46, height: 46 }));
    }
    create() {
      this.time.removeAllEvents();
      this.turn = 0; this.score = 0; this.voices = {}; this.playStarted = false; this.running = false; this.rewardDone = null;
      if (window.KMEAudio) { KMEAudio.setBase("assets/").stopAll(); KMEAudio.register(ITEMS.map((_, i) => "say_" + i).concat(["tp_intro"])); }
      this.pile = []; this.trayCoins = []; this.busy = false; this.pusherFace = BACKY; this.pusherPhase = 0; this.queue = []; this.item = null; this.aim = null;

      this.input.on("pointermove", (p) => this.aimMove(p));
      this.input.on("pointerup", () => this.dropAim());

      this.buildBackdrop();
      this.buildMachine();
      this.buildHud();
      this.buildPrompt();
      this.buildChooser();
      this.catcher = this.add.image(80, 130, "catcherski").setScale(0.46).setDepth(40).setVisible(false);

      const q = new URLSearchParams(location.search);
      if (q.has("cap")) { this.cap = true; window.__tp = this; this.markSeen(); this.catcher.setVisible(true); if (q.get("cap") === "intro") this.startIntro(); else this.capSetup(q); }
      else this.showTitle();
    }

    buildBackdrop() {
      if (!this.textures.exists("tpbg")) {
        const tex = this.textures.createCanvas("tpbg", W, H), cx = tex.getContext();
        const g = cx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#1a1140"); g.addColorStop(0.5, "#241a52"); g.addColorStop(1, "#0e0822");
        cx.fillStyle = g; cx.fillRect(0, 0, W, H);
        // far neon sign glows
        ["#ff5aa0", "#5ad6ff", "#ffd24d"].forEach((c, i) => { const gg = cx.createRadialGradient(W * (0.2 + i * 0.3), 120 + i * 30, 10, W * (0.2 + i * 0.3), 120 + i * 30, 240); gg.addColorStop(0, c + "33"); gg.addColorStop(1, c + "00"); cx.fillStyle = gg; cx.fillRect(0, 0, W, 320); });
        // mid layer: distant arcade-cabinet silhouettes along a back wall
        const FL = 250;
        for (let i = 0; i < 7; i++) { const x = i * 116 - 20, w = 96, h = 60 + (i % 3) * 18; cx.fillStyle = "#1c1442"; cx.fillRect(x, FL - h, w, h); cx.fillStyle = ["#ff5aa0", "#5ad6ff", "#ffd24d", "#7affc0"][i % 4] + "55"; cx.fillRect(x + 8, FL - h + 6, w - 16, 8); }
        // neon synthwave floor grid (fills the lower area; arcade depth)
        const HZ = 980;
        cx.strokeStyle = "rgba(122,90,220,0.5)"; cx.lineWidth = 2;
        for (let i = 0; i <= 14; i++) { const x = (i / 14) * W, vx = W / 2 + (x - W / 2) * 3.2; cx.beginPath(); cx.moveTo(W / 2 + (x - W / 2) * 0.18, HZ); cx.lineTo(vx, H); cx.stroke(); }
        for (let j = 0; j < 9; j++) { const y = HZ + Math.pow(j / 9, 1.8) * (H - HZ); cx.strokeStyle = "rgba(150,110,255," + (0.5 - j * 0.04) + ")"; cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
        // vignette
        const v = cx.createRadialGradient(W / 2, H * 0.46, H * 0.22, W / 2, H * 0.46, H * 0.62); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(6,3,16,0.6)"); cx.fillStyle = v; cx.fillRect(0, 0, W, H);
        tex.refresh();
      }
      if (!this.textures.exists("pusher")) {
        const t = this.textures.createCanvas("pusher", 600, 120), c = t.getContext();
        const g = c.createLinearGradient(0, 0, 0, 120); g.addColorStop(0, "#9aa6c0"); g.addColorStop(0.5, "#5e6a86"); g.addColorStop(1, "#39435c");
        c.fillStyle = g; c.fillRect(0, 0, 600, 120);
        c.fillStyle = "#2b3346"; c.fillRect(0, 100, 600, 20);
        c.fillStyle = "#c2ccdd"; c.fillRect(0, 0, 600, 8);
        for (let x = 24; x < 600; x += 60) { c.fillStyle = "#39435c"; c.beginPath(); c.arc(x, 60, 6, 0, 7); c.fill(); c.fillStyle = "#aab4c8"; c.beginPath(); c.arc(x - 1.5, 58, 2.2, 0, 7); c.fill(); }
        t.refresh();
      }
      this.add.image(0, 0, "tpbg").setOrigin(0).setDepth(0);
    }
    buildMachine() {
      const g = this.add.graphics().setDepth(2);
      // cabinet: beveled gradient body + neon frame + inner highlight
      g.fillGradientStyle(0x2c1e62, 0x241852, 0x150e36, 0x100a28, 1); g.fillRoundedRect(56, 252, W - 112, 764, 26);
      g.lineStyle(6, 0x7a5ae0, 1); g.strokeRoundedRect(56, 252, W - 112, 764, 26);
      g.lineStyle(2, 0xb59aff, 0.45); g.strokeRoundedRect(65, 261, W - 130, 746, 20);
      // interior well behind the shelf
      g.fillStyle(0x0c0820, 1); g.fillRoundedRect(78, 296, W - 156, 326, 12);
      // perspective shelf plane (back narrow -> front wide)
      const bx0 = 156, bx1 = W - 156, fx0 = 92, fx1 = W - 92, by = BACKY - 4, fy = EDGEY + 8;
      g.fillStyle(0x474c69, 1); g.fillPoints([{ x: bx0, y: by }, { x: bx1, y: by }, { x: fx1, y: fy }, { x: fx0, y: fy }], true);
      g.fillStyle(0x5c6286, 1); g.fillPoints([{ x: fx0 + 6, y: fy - 26 }, { x: fx1 - 6, y: fy - 26 }, { x: fx1, y: fy }, { x: fx0, y: fy }], true);  // lit front
      g.fillStyle(0xaab2d6, 0.55); g.fillRect(fx0, fy - 3, fx1 - fx0, 4);                    // front-lip highlight
      g.fillStyle(0x140e2c, 1); g.fillRect(fx0 - 4, fy + 1, fx1 - fx0 + 8, 12);              // shadow under the lip
      // pile contact shadow (under where coins cluster)
      g.fillStyle(0x0a0718, 0.5); g.fillEllipse(W / 2, EDGEY - 30, fx1 - fx0 - 40, 70);
      // glass payout tray
      g.fillStyle(0x0a1228, 0.72); g.fillRoundedRect(94, TRAYY, W - 188, 152, 14);
      g.lineStyle(4, 0x4a6abe, 1); g.strokeRoundedRect(94, TRAYY, W - 188, 152, 14);
      g.fillStyle(0xbfe0ff, 0.12); g.fillRoundedRect(104, TRAYY + 8, W - 208, 26, 10);       // glass reflection
      this.add.text(W / 2, TRAYY + 134, "PAYOUT", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "16px", color: "#9a86d8", fontStyle: "800" }).setOrigin(0.5).setDepth(3).setStroke("#0a0718", 4);
      // control deck (fills the lower area; the tokens sit on it)
      g.fillGradientStyle(0x3c2c72, 0x3c2c72, 0x201648, 0x201648, 1); g.fillRoundedRect(78, DECKY, W - 156, 192, 16);
      g.lineStyle(3, 0x6a4ad0, 1); g.strokeRoundedRect(78, DECKY, W - 156, 192, 16);
      g.fillStyle(0x9aa2c4, 0.18); g.fillRoundedRect(86, DECKY + 6, W - 172, 8, 4);
      g.fillStyle(0x120c2e, 1); g.fillRoundedRect(W / 2 - 76, DECKY + 168, 152, 14, 7);       // coin-return slot
      // pusher (origin bottom = its front face sits at pusherFace), seated in the well
      this.pusher = this.add.image(W / 2, this.pusherFace, "pusher").setOrigin(0.5, 1).setDepth(5).setDisplaySize(W - 196, 60);
    }
    buildHud() {
      const bar = this.add.graphics().setDepth(31); bar.fillStyle(0x0f0a26, 0.85); bar.fillRoundedRect(8, 8, W - 16, 50, 16);
      this.hud = this.add.text(20, 17, "", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "22px", color: "#ffe08a", fontStyle: "700" }).setDepth(32);
      this.coinIcon = this.add.image(W - 188, 33, "coin").setScale(0.34).setDepth(32);
      this.scoreTx = this.add.text(W - 166, 17, "", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "23px", color: "#ffd24d", fontStyle: "800" }).setDepth(32);
      this.hudObjs = [bar, this.hud, this.coinIcon, this.scoreTx];
      this.updateHud();
    }
    updateHud() { this.hud.setText("のこり " + Math.max(0, TURNS - this.turn) + " かい"); this.scoreTx.setText(this.score + " / " + TARGET); }

    buildPrompt() {
      const py = 150;
      this.promptBg = this.add.graphics().setDepth(20).setVisible(false);
      this.promptBg.fillStyle(0x2a1a52, 0.95); this.promptBg.fillRoundedRect(150, py - 70, W - 230, 152, 18);
      this.promptBg.lineStyle(4, 0x6a4ad0, 1); this.promptBg.strokeRoundedRect(150, py - 70, W - 230, 152, 18);
      // stolen-noun chip (catcherski grabbed it)
      this.nounChip = this.add.graphics().setDepth(21).setVisible(false);
      this.nounTx = this.add.text(0, 0, "", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "26px", color: "#2a1430", fontStyle: "800" }).setOrigin(0.5).setDepth(22).setVisible(false);
      this.nounJp = this.add.text(0, 0, "", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "16px", color: "#bda6ff", fontStyle: "700" }).setOrigin(0.5).setDepth(22).setVisible(false);
      this.sentence = this.add.text(W / 2 + 18, py + 2, "", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "28px", color: "#fff", fontStyle: "800", align: "center" }).setOrigin(0.5).setDepth(22).setVisible(false).setStroke("#2a1430", 5);
      this.trTx = this.add.text(W / 2 + 18, py + 40, "", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "17px", color: "#cdb6ff", fontStyle: "700" }).setOrigin(0.5).setDepth(22).setVisible(false);   // JP meaning (grammar game, not translation)
    }
    buildChooser() {
      const cy = 916, gap = 172;
      this.slots = [{ x: W / 2 - gap }, { x: W / 2 }, { x: W / 2 + gap }];
      this.tokens = [];
      this.slots.forEach((s) => {
        const c = this.add.image(s.x, cy, "coin").setScale(0).setDepth(34).setInteractive({ useHandCursor: true });
        const t = this.add.text(s.x, cy, "", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "30px", color: "#4a3008", fontStyle: "800" }).setOrigin(0.5).setDepth(35).setScale(0);
        c.on("pointerdown", () => { Sfx.init(); if (c.getData("word")) this.onToken(c.getData("word"), c, t); });
        this.tokens.push({ coin: c, txt: t, x: s.x, y: cy });
      });
      this.deckHint = this.add.text(W / 2, DECKY + 30, "ただしい コイン を マシン に おとせ！", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "19px", color: "#cdb6ff", fontStyle: "700" }).setOrigin(0.5).setDepth(34).setStroke("#1a1140", 4);
    }

    update(time, delta) {
      if (this.running) {   // pusher slides back and forth forever, like a real coin-pusher (slow + dramatic)
        this.pusherPhase += (delta || 16);
        this.pusherFace = BACKY + AMP * 0.5 * (1 - Math.cos(this.pusherPhase / PUSH_MS * Math.PI * 2));
      }
      if (this.pusher) this.pusher.y = this.pusherFace;
      if (this.state !== "play" || !this.pile.length) return;
      // continuous 2D coin-bed (no fixed lanes): the pusher PLOWS coins it catches up to, then a few
      // separation passes let them jostle apart in x and y like real coins; front coins tip off the edge.
      const fl = this.pusherFace + COIN_R, minX = SX0 + COIN_R, maxX = SX1 - COIN_R, D = COIN_R * 1.92;
      for (const c of this.pile) { if (c.y < fl) c.y += Math.min(fl - c.y, 7); }   // gentle plow = dramatic slide
      for (let it = 0; it < 3; it++) {
        for (let i = 0; i < this.pile.length; i++) {
          const a = this.pile[i];
          for (let j = i + 1; j < this.pile.length; j++) {
            const b = this.pile[j]; let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
            if (d === 0) { b.x += 1; dx = 1; d = 1; }
            if (d < D) { const push = (D - d) / 2, ux = dx / d, uy = dy / d; a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push; }
          }
          a.x = Phaser.Math.Clamp(a.x, minX, maxX); if (a.y < fl - 2) a.y = fl - 2;   // never pushed back behind the pusher face
        }
      }
      for (let i = this.pile.length - 1; i >= 0; i--) { const c = this.pile[i]; c.setPosition(c.x, c.y); if (c.y - COIN_R > EDGEY) { this.pile.splice(i, 1); this.cascade(c); } }
    }
    addCoin(x, y) {
      const c = this.add.image(Phaser.Math.Clamp(x, SX0 + COIN_R, SX1 - COIN_R), y, "coin").setScale(CSC * Phaser.Math.FloatBetween(0.9, 1.06)).setAngle(Phaser.Math.Between(-22, 22)).setDepth(7).setTint(0xffe7a0);
      this.pile.push(c); return c;
    }
    seedBed() {
      // a real coin-pusher is RAMMED with gold: pack the whole shelf so a push
      // shoves a WALL of coins off the lip (fixes the empty-shelf no-cascade bug).
      const cols = 11, dx = (SX1 - SX0 - 2 * COIN_R - 12) / (cols - 1), x0 = SX0 + COIN_R + 6;
      for (let r = 0; r < 7; r++) for (let col = 0; col < cols; col++) {
        const y = BACKY + 22 + r * 27 + Phaser.Math.Between(-5, 5);
        if (y > EDGEY - 104) continue;
        this.addCoin(x0 + col * dx + (r % 2) * (dx / 2) + Phaser.Math.Between(-5, 5), y);
      }
    }
    cascade(c) {
      c.setDepth(9); this.score++; this.updateHud();
      const tx = Phaser.Math.Between(SX0, SX1), ty = TRAYY + 64 + Phaser.Math.Between(-8, 66);
      this.tweens.add({ targets: c, x: tx, y: ty, angle: Phaser.Math.Between(-220, 220), duration: 640, ease: "Bounce.out", onComplete: () => { Sfx.clink(); } });
      this.trayCoins.push(c);
      if (this.trayCoins.length > TRAY_CAP) { const old = this.trayCoins.shift(); this.tweens.add({ targets: old, alpha: 0, duration: 300, onComplete: () => old.destroy() }); }
    }
    onToken(word, coin, txt) {
      if (this.state !== "play" || this.busy || this.aim) return;
      this.beginAim(coin, txt, word);   // grab ANY token; the answer is committed on release, where + when you drop it matters
    }
    beginAim(coin, txt, word) {
      this.aim = { coin: coin, txt: txt, word: word, hx: coin.x, hy: coin.y };
      coin.setDepth(37); txt.setDepth(38);
      this.aimRing = this.add.image(coin.x, this.pusherFace + 28, "p_spark").setScale(1.9).setAlpha(0).setDepth(6);
    }
    overShelf(x, y) { return y > BACKY - 24 && y < EDGEY + 30 && x > SX0 - 30 && x < SX1 + 30; }
    aimMove(p) {
      if (!this.aim) return;
      const x = Phaser.Math.Clamp(p.x, SX0 - 20, SX1 + 20), y = Phaser.Math.Clamp(p.y, BACKY - 16, H - 70);
      this.aim.coin.setPosition(x, y); this.aim.txt.setPosition(x, y);
      if (this.aimRing) {   // landing guide: which lane + green when the pusher is retracted (drop now to ride the full push)
        const on = this.overShelf(x, y), good = (this.pusherFace - BACKY) < AMP * 0.3;
        this.aimRing.setPosition(x, this.pusherFace + 28).setAlpha(on ? (good ? 0.75 : 0.3) : 0).setTint(good ? 0x8affc0 : 0xff9a6a);
      }
    }
    dropAim() {
      if (!this.aim) return;
      const a = this.aim, onShelf = this.overShelf(a.coin.x, a.coin.y), x = Phaser.Math.Clamp(a.coin.x, SX0, SX1);
      if (this.aimRing) { this.aimRing.destroy(); this.aimRing = null; }
      if (!onShelf) { this.aim = null; this.tweens.add({ targets: [a.coin, a.txt], x: a.hx, y: a.hy, duration: 170, ease: "Quad.out" }); return; }   // released off the machine = cancel
      this.aim = null; this.busy = true; this.turn++; this.updateHud();
      if (a.word === this.item.answer) this.correctDrop(a.coin, a.txt, x); else this.wrongDrop(a.coin, a.txt);
    }
    hideOthers(coin) { this.tokens.forEach((t) => { if (t.coin !== coin) this.tweens.add({ targets: [t.coin, t.txt], scale: 0, alpha: 0.3, duration: 160 }); }); }
    correctDrop(coin, txt, x) {
      Sfx.beep(); this.rewardDone = this.voice("say_" + this.item.idx);   // next turn waits for this sentence review to finish
      if (this.catcher) this.tweens.add({ targets: this.catcher, scaleX: 0.5, scaleY: 0.5, duration: 130, yoyo: true });
      const dropY = this.pusherFace + COIN_R + 6;   // lands just ahead of the pusher AT RELEASE: drop when retracted to ride the whole stroke
      this.tweens.add({ targets: [coin, txt], x: x, y: dropY, scale: CSC, duration: 190, ease: "Quad.in", onComplete: () => {
        coin.setVisible(false); txt.setVisible(false);
        this.addCoin(x, dropY);
        for (let k = 0; k < 2; k++) this.time.delayedCall(70 + k * 70, () => this.addCoin(x + Phaser.Math.Between(-26, 26), dropY - 4 - k * 5));
      } });
      this.hideOthers(coin); this.toast("ピッ！", "#8affc0");
      this.time.delayedCall(1050, () => this.afterDrop());
    }
    wrongDrop(coin, txt) {
      Sfx.err(); this.cameras.main.shake(150, 0.006);
      if (this.catcher) this.tweens.add({ targets: this.catcher, angle: 8, duration: 60, yoyo: true, repeat: 3 });
      coin.setTint(0xff7a7a);
      this.tweens.add({ targets: [coin, txt], y: coin.y + 96, alpha: 0, angle: 40, duration: 380, ease: "Quad.in", onComplete: () => { coin.setVisible(false); txt.setVisible(false); coin.setTint(0xffffff); } });
      this.hideOthers(coin); this.toast("БИП！ ちがう かたち", "#ff8a8a");
      this.time.delayedCall(950, () => this.afterDrop());
    }
    afterDrop() {
      if (this.turn >= TURNS) { this.time.delayedCall(1600, () => this.endGame()); return; }   // busy stays true; let final cascades land in the score
      // hold the next turn until the sentence review (say_*) has finished playing
      const reward = this.rewardDone || Promise.resolve(); this.rewardDone = null;
      const beat = new Promise((r) => this.time.delayedCall(300, r));
      Promise.all([reward, beat]).then(() => { if (this.state === "play") { this.busy = false; this.newTurn(); } });
    }
    toast(t, c) { const o = this.add.text(W / 2, 360, t, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "34px", color: c, fontStyle: "800" }).setOrigin(0.5).setDepth(47).setStroke("#140d30", 6).setScale(0.6); this.tweens.add({ targets: o, scale: 1, duration: 200, ease: "Back.out", yoyo: true, hold: 500, onComplete: () => o.destroy() }); }

    newTurn() {
      if (!this.queue.length) this.queue = Phaser.Utils.Array.Shuffle(ITEMS.map((_, i) => i));
      const idx = this.queue.shift(); const it = Object.assign({ idx }, ITEMS[idx]); this.item = it;
      // sentence with a glowing blank
      const blank = "[ ___ ]";
      this.sentence.setText((it.pre ? it.pre + " " : "") + blank + (it.post ? " " + it.post : "")).setVisible(true).setScale(0.7);
      this.tweens.add({ targets: this.sentence, scale: 1, duration: 200, ease: "Back.out" });
      this.trTx.setText(it.tr).setVisible(true);
      this.promptBg.setVisible(true);
      // stolen noun chip (top-left of the panel)
      const nx = 250, ny = 110; this.nounChip.clear().setVisible(true);
      const w = Math.max(96, it.noun.length * 15 + 34);
      this.nounChip.fillStyle(0xffd24d, 1); this.nounChip.fillRoundedRect(nx - w / 2, ny - 22, w, 44, 12);
      this.nounChip.lineStyle(3, 0xb98a14, 1); this.nounChip.strokeRoundedRect(nx - w / 2, ny - 22, w, 44, 12);
      this.nounTx.setText(it.noun).setPosition(nx, ny).setVisible(true);
      this.nounJp.setText(it.jp + " →").setPosition(nx, ny + 34).setVisible(true);
      // tokens: answer + wrongs, shuffled
      const words = Phaser.Utils.Array.Shuffle([it.answer].concat(it.wrong));
      this.tokens.forEach((t, i) => {
        t.coin.setData("word", words[i]).setScale(0).setAlpha(1).setVisible(true).setTint(0xffffff).setPosition(t.x, t.y).setAngle(0).setDepth(34);
        t.txt.setText(words[i]).setScale(0).setAlpha(1).setVisible(true).setPosition(t.x, t.y).setDepth(35);
        const dl = this.cap ? 0 : i * 60;   // staggered reveal in play; immediate in headless capture (delayed tweens do not advance under virtual-time)
        this.tweens.add({ targets: [t.coin], scale: 1.15, duration: 220, delay: dl, ease: "Back.out" });
        this.tweens.add({ targets: [t.txt], scale: 1, duration: 220, delay: dl, ease: "Back.out" });
      });
    }

    // ---------- title / intro / voice ----------
    introNeeded() { try { return !localStorage.getItem("tp_intro_seen_v2"); } catch (e) { return true; } }
    markSeen() { try { localStorage.setItem("tp_intro_seen_v2", "1"); } catch (e) {} }
    showTitle() {
      this.state = "title"; this.titleStarted = false;
      if (this.hudObjs) this.hudObjs.forEach((o) => o.setVisible(false));
      const dim = this.add.graphics().setDepth(60); dim.fillStyle(0x140d30, 0.55); dim.fillRect(0, 0, W, H);
      const host = this.add.image(W / 2, H * 0.32, "catcherski").setScale(1.2).setDepth(62);
      this.titleBob = this.tweens.add({ targets: host, y: H * 0.32 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.add.text(W / 2, H * 0.54, "トークン プッシュ", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "44px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5).setDepth(62).setStroke("#140d30", 7);
      this.add.text(W / 2, H * 0.54 + 46, "Token Push", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "26px", color: "#8ad6ff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#140d30", 5);
      const bw = 300, bh = 92, bx = W / 2, by = H * 0.72;
      const bg = this.add.graphics().setDepth(62); bg.fillStyle(0xff5aa0, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26); bg.lineStyle(6, 0xb52e6e, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26);
      this.add.triangle(bx - 58, by, 0, 0, 26, 16, 0, 32, 0xffffff).setDepth(63);
      this.add.text(bx + 14, by, "あそぶ", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "34px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(63).setStroke("#140d30", 5);
      this.titlePulse = this.tweens.add({ targets: bg, alpha: 0.7, duration: 650, yoyo: true, repeat: -1 });
      this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(64).on("pointerdown", () => this.startFromTitle());
    }
    startFromTitle() {
      if (this.titleStarted) return; this.titleStarted = true; Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.titleBob) this.titleBob.stop(); if (this.titlePulse) this.titlePulse.stop();
      this.children.list.filter((o) => o.depth >= 60 && o.depth < 65).forEach((o) => o.destroy());
      if (this.introNeeded()) this.startIntro(); else { this.markSeen(); this.catcher.setVisible(true); this.startPlay(); }
    }
    startIntro() {
      this.state = "intro";
      this.introDim = this.add.graphics().setDepth(45); this.introDim.fillStyle(0x140d30, 0.64); this.introDim.fillRect(0, 0, W, H);
      this.introBig = this.add.image(W / 2, H * 0.36, "catcherski").setScale(1.3).setDepth(47);
      this.introBob = this.tweens.add({ targets: this.introBig, y: H * 0.36 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const bx = W / 2, by = H * 0.63;
      this.introBg = this.add.graphics().setDepth(46); this.introBg.fillStyle(0xf3f0ff, 0.97); this.introBg.fillRoundedRect(bx - 336, by - 110, 672, 220, 24); this.introBg.lineStyle(5, 0xb52e6e, 1); this.introBg.strokeRoundedRect(bx - 336, by - 110, 672, 220, 24); this.introBg.fillTriangle(bx - 18, by + 108, bx + 18, by + 108, bx, by + 138);
      this.introText = this.add.text(bx, by, "ピッ！ ようこそ コインプッシャー へ！\nわし は キャッチャースキー、 こわれかけ の アームロボ だ。\nなまえ を ぬすんだ ぞ。 БИП。\nただしい だいめいし の コイン を おとして、\nコイン の やま を おしだせ！ まちがえる と… エラー だ！", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "22px", color: "#2a1430", fontStyle: "700", align: "center", lineSpacing: 7 }).setOrigin(0.5).setDepth(47);
      this.skipBtn = this.add.text(W - 56, 92, "スキップ", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "24px", color: "#8ad6ff", fontStyle: "700" }).setOrigin(1, 0.5).setDepth(48).setInteractive({ useHandCursor: true }).setStroke("#140d30", 5);
      this.skipChev = this.add.triangle(W - 34, 92, 0, 0, 18, 11, 0, 22, 0xffd24d).setDepth(48).setInteractive({ useHandCursor: true });
      let advanced = false; this.advIntro = () => { if (advanced) return; advanced = true; this.endIntro(); };
      this.skipBtn.on("pointerdown", this.advIntro); this.skipChev.on("pointerdown", this.advIntro);
      this.voice("tp_intro", this.advIntro);   // advances when the clip actually ends
      this.time.delayedCall(20000, this.advIntro);   // safety net if audio is blocked
    }
    endIntro() {
      this.markSeen();
      if (window.KMEAudio) KMEAudio.stopAll();
      [this.skipBtn, this.skipChev].forEach((o) => { if (o) o.destroy(); }); this.skipBtn = null; this.skipChev = null;
      if (this.introBob) this.introBob.stop();
      this.tweens.add({ targets: [this.introDim, this.introBg, this.introText], alpha: 0, duration: 420, onComplete: () => { [this.introDim, this.introBg, this.introText].forEach((o) => { if (o) o.destroy(); }); } });
      this.tweens.add({ targets: this.introBig, x: 80, y: 130, scaleX: 0.46, scaleY: 0.46, duration: 600, ease: "Cubic.inOut", onComplete: () => { if (this.introBig) { this.introBig.destroy(); this.introBig = null; } this.catcher.setVisible(true); } });
      this.time.delayedCall(700, () => this.startPlay());
    }
    voice(key, onEnd) {
      const p = window.KMEAudio ? KMEAudio.play(key) : Promise.resolve();
      if (onEnd) p.then(onEnd);
      return p;
    }
    startPlay() { if (this.playStarted) return; this.playStarted = true; this.state = "play"; this.running = true; if (this.hudObjs) this.hudObjs.forEach((o) => o.setVisible(true)); this.seedBed(); this.time.delayedCall(350, () => this.newTurn()); }

    flash(color, alpha) { const f = this.add.rectangle(0, 0, W, H, color, alpha).setOrigin(0).setDepth(50); this.tweens.add({ targets: f, alpha: 0, duration: 240, onComplete: () => f.destroy() }); }
    endGame() {
      this.state = "over"; this.running = false;
      const won = this.score >= TARGET;
      if (won && window.KMEFlow) KMEFlow.win();
      if (won) { Sfx.win(); this.flash(0xfff2c4, 0.5); if (this.catcher) this.tweens.add({ targets: this.catcher, scaleX: 0.52, scaleY: 0.52, duration: 180, yoyo: true, repeat: 3 }); }
      else { Sfx.lose(); this.cameras.main.shake(260, 0.01); }
      this.time.delayedCall(520, () => this.scorePanel(won));
    }
    scorePanel(won) {
      const cy = H * 0.4;
      const p = this.add.graphics().setDepth(70); p.fillStyle(0x140d30, 0.97); p.fillRoundedRect(W / 2 - 240, cy - 162, 480, 384, 28); p.lineStyle(6, 0xffd24d, 1); p.strokeRoundedRect(W / 2 - 240, cy - 162, 480, 384, 28);
      this.add.text(W / 2, cy - 104, won ? "ジャックポット！" : "ゲーム オーバー", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "34px", color: "#fff7f0", fontStyle: "700" }).setOrigin(0.5).setDepth(71).setStroke("#140d30", 7);
      this.add.image(W / 2 - 70, cy + 6, "coin").setScale(0.62).setDepth(71);
      this.add.text(W / 2 + 24, cy + 6, "" + this.score, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "74px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5).setDepth(71).setStroke("#140d30", 7);
      this.add.text(W / 2, cy + 64, "もくひょう " + TARGET + " コイン", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "22px", color: "#cdb6ff", fontStyle: "700" }).setOrigin(0.5).setDepth(71);
      this.add.text(W / 2, cy + 98, won ? "クリア！ ピッ ピッ！" : "おしい！ もう いちど！", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "21px", color: won ? "#8affc0" : "#ff9a9a", fontStyle: "700" }).setOrigin(0.5).setDepth(71).setStroke("#140d30", 4);
      const bw = 280, bh = 80, bx = W / 2, by = cy + 166;
      const bg = this.add.graphics().setDepth(71); bg.fillStyle(0xff5aa0, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 24); bg.lineStyle(5, 0xb52e6e, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 24);
      this.add.text(bx - 16, by, "もう いちど", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "30px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(72).setStroke("#140d30", 5);
      this.add.triangle(bx + 88, by, 0, 0, 20, 12, 0, 24, 0xffffff).setDepth(72);
      this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(73).on("pointerdown", () => this.scene.restart());
      this.tweens.add({ targets: bg, alpha: 0.7, duration: 700, yoyo: true, repeat: -1 });
    }
    capSetup(q) {
      this.state = "play"; this.playStarted = true; this.running = true; this.hudObjs.forEach((o) => o.setVisible(true));
      this.seedBed();
      this.newTurn();
      if (q.get("cap") === "auto") this.time.delayedCall(400, () => this.autoStep());
    }
    autoStep() {   // headless self-play: drive correct drops to verify the full 10-turn loop + scoring
      if (this.state !== "play") return;
      if (!this.busy && !this.aim && this.item) {
        const t = this.tokens.find((tt) => tt.coin.visible && tt.coin.getData("word") === this.item.answer);
        if (t) { this.beginAim(t.coin, t.txt, t.coin.getData("word")); this.aim.coin.setPosition(Phaser.Math.Between(SX0, SX1), 420); this.dropAim(); }
      }
      this.time.delayedCall(800, () => this.autoStep());
    }
  }

  let booted = false;
  function boot() { if (booted) return; booted = true; new Phaser.Game({ type: Phaser.CANVAS, parent: "game", backgroundColor: "#140d30", audio: { disableWebAudio: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: [Play] }); }
  if (document.fonts && document.fonts.load) { Promise.all([document.fonts.load('800 44px "Baloo 2"'), document.fonts.load('700 24px "Zen Maru Gothic"')]).then(boot, boot); setTimeout(boot, 1800); } else boot();
})();
