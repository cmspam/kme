// Liar Basketball (can / can't) - Phaser 3. A creature brags an ability in ENGLISH
// ("I can fly!"). Judge it: swipe UP to dunk a LIAR into the big centered glass うそつきばこ,
// or swipe SIDEWAYS to chuck an HONEST one off the edge and set it free. The up-swipe sets the
// dunk trajectory (aim into the rim; a clean miss is harmless). A wrong call (an honest one
// dunked in, or a liar let loose) shatters the jail and you lose. Dunk 5 liars to win. Host
// tral (opera shark) gives a spoken, skippable, first-play-only intro in Japanese. English-only
// test prompt (A2); the Japanese never reveals which creature is lying.
"use strict";
(function () {
  const W = 760, H = 1180, GROUND = 800, DECKY = 980;
  const CRX = 380, CRY = GROUND, GRAV = 1400, K = 5.0;
  const CJX = W / 2;                          // ONE big centered glass jail: dunk liars up into it
  const BY = 346;                             // hoop rim height
  const JTOP = 372, JBOT = 556, JW = 320;     // glass jail tank (centered, bigger)
  const WIN = 5;

  const CLAIMS = [
    { a: "bird", v: "fly", can: true }, { a: "penguin", v: "fly", can: false },
    { a: "fish", v: "swim", can: true }, { a: "dog", v: "run", can: true },
    { a: "bird", v: "swim", can: false }, { a: "dog", v: "swim", can: true },
    { a: "fish", v: "walk", can: false }, { a: "penguin", v: "swim", can: true },
    { a: "dog", v: "fly", can: false }, { a: "bird", v: "sing", can: true },
    { a: "penguin", v: "walk", can: true }, { a: "fish", v: "fly", can: false },
    { a: "dog", v: "jump", can: true }, { a: "fish", v: "jump", can: false },
    { a: "bird", v: "jump", can: true }, { a: "dog", v: "dance", can: true },
    { a: "penguin", v: "dance", can: true }, { a: "fish", v: "dance", can: false },
    { a: "dog", v: "play", can: true }, { a: "bird", v: "play", can: true },
    { a: "penguin", v: "play", can: true }, { a: "dog", v: "talk", can: false },
    { a: "bird", v: "talk", can: false }, { a: "fish", v: "read", can: false },
    { a: "dog", v: "read", can: false }, { a: "penguin", v: "cook", can: false },
    { a: "bird", v: "walk", can: true }, { a: "dog", v: "walk", can: true }
  ];
  const LIES = [
    "せかい は たいら だ！", "サンタ は ぼく の ともだち！", "そら は みどり いろ だ！", "ぼく は 1000さい！",
    "つき は チーズ だ！", "やさい は あまい！", "ぼく は そら を とべる！", "あした は きのう だ！",
    "ねこ は ワンワン なく！", "さかな は あるく！", "ぞう は アリ より ちいさい！", "ひ は つめたい！",
    "こおり は あつい！", "ぼく は きょうりゅう だ！", "たいよう は よる に でる！", "バナナ は あおい！",
    "ぼく は うちゅうじん だ！", "あめ は した から ふる！", "ぼく は おうさま だ！", "さとう は からい！",
    "きのう くじら と およいだ！", "ぼく は てんさい だ！", "いし は ふわふわ だ！", "ぼく は みらい から きた！",
    "とり は およぐ の が とくい！", "ぼく は ねむらない！", "みず は かわいてる！", "ぼく は ライオン より つよい！",
    "チョコ は やさい だ！", "ぼく は かべ を ぬけられる！", "くも は たべられる！", "ぼく は あし が 8ほん！",
    "ぼく は そうり大臣 だ！", "ゆき は あつい！", "ぼく は おと より はやい！", "たまご は しかくい！",
    "ぼく は まほうつかい だ！", "おにぎり は そら を とぶ！", "きょう は 13がつ だ！", "さかな は き に のぼる！",
    "ぼく は せかい一 せ が たかい！", "くつした は たべもの だ！", "ぼく は ゆめ を うっている！",
    "つき を まいばん たべてる！", "ぼく は うそ を ついた こと が ない！", "とけい は ぎゃく に まわる！",
    "ぼく は 100ねん ねた！", "あり は ぞう を もちあげる！", "ぼく は にじ を のんだ！", "いぬ は そら から ふる！"
  ];

  const Sfx = {
    ctx: null,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    tone(f0, f1, dur, type, gain) { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); g.gain.setValueAtTime(gain || 0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur); },
    noise(dur, gain, freq) { if (!this.ctx) return; const t = this.ctx.currentTime, b = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 800; const g = this.ctx.createGain(); g.gain.setValueAtTime(gain || 0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(this.ctx.destination); s.start(t); s.stop(t + dur); },
    whoosh() { this.tone(500, 1100, 0.18, "sine", 0.08); this.noise(0.12, 0.05, 1600); },
    swish() { this.noise(0.16, 0.1, 2200); this.tone(900, 1300, 0.1, "triangle", 0.14); },
    slide() { this.tone(400, 900, 0.3, "sine", 0.1); },
    good() { this.tone(680, 1020, 0.12, "triangle", 0.18); },
    smash() { this.noise(0.4, 0.4, 3000); this.noise(0.5, 0.3, 900); this.tone(300, 80, 0.4, "sawtooth", 0.18); },
    pop() { this.tone(700, 500, 0.06, "square", 0.08); }
  };

  class Play extends Phaser.Scene {
    constructor() { super("play"); }
    preload() {
      this.load.svg("tral", "assets/tral.svg", { width: 200, height: 178 });
      ["bird", "penguin", "fish", "dog"].forEach((a) => this.load.svg(a, "assets/" + a + ".svg", { width: 124, height: 116 }));
    }
    create() {
      this.idx = 0; this.caught = 0; this.state = "boot"; this.jailed = []; this.creature = null; this.cur = null; this.voices = {};
      this.playStarted = false; this.flyC = null; this.flyDone = false;   // restart-safe: scene.restart() reuses the instance
      if (window.KMEAudio) { KMEAudio.setBase("assets/").stopAll(); KMEAudio.register(["en_fly", "en_swim", "en_run", "en_walk", "en_sing", "en_jump", "en_dance", "en_talk", "en_play", "en_read", "en_cook", "tral_intro", "tral_caught", "tral_win", "tral_lose"]); }
      this.queue = Phaser.Utils.Array.Shuffle(CLAIMS.slice());
      this.dragging = false; this.dragSX = 0; this.dragSY = 0;
      this.buildBackground(); this.buildArena();
      this.tral = this.add.image(W / 2, 150, "tral").setScale(0.7).setDepth(16).setVisible(false);
      this.tralHome = { x: W / 2, y: 150, s: 0.7 };
      this.bubbleG = this.add.graphics().setDepth(13);
      this.bubbleT = this.add.text(CRX, CRY - 250, "", { fontFamily: '"Baloo 2"', fontSize: "40px", color: "#1E1233", fontStyle: "800", align: "center" }).setOrigin(0.5).setDepth(14);
      this.buildHud(); this.buildDeck();
      this.input.on("pointerdown", (p) => { Sfx.init(); this.onDown(p); });
      this.input.on("pointerup", (p) => this.onUp(p));

      const q = new URLSearchParams(location.search);
      if (q.has("cap")) { this.playStarted = true; this.state = "play"; this.tral.setVisible(true); if (q.get("jail")) { for (let i = 0; i < (parseInt(q.get("jail")) || 2); i++) this.addToJail(this.add.image(0, 0, "penguin")); } this.cur = { a: q.get("a") || "penguin", v: q.get("v") || "fly", can: false }; this.creature = this.add.image(CRX, CRY, this.cur.a).setOrigin(0.5, 1).setDepth(12); this.drawBubble(); }
      else this.showTitle();   // PLAY button: its tap unlocks audio so tral speaks on the intro
    }

    buildBackground() {
      if (!this.textures.exists("bg")) {
        const tex = this.textures.createCanvas("bg", W, H), cx = tex.getContext();
        const g = cx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#3a2c6e"); g.addColorStop(0.5, "#241b48"); g.addColorStop(1, "#120c26");
        cx.fillStyle = g; cx.fillRect(0, 0, W, H);
        cx.globalAlpha = 0.07; cx.fillStyle = "#9fd0ff"; for (let i = 0; i < 5; i++) { cx.beginPath(); const lx = 80 + i * 150; cx.moveTo(lx, 120); cx.lineTo(lx + 60, 120); cx.lineTo(lx - 30, DECKY); cx.lineTo(lx - 80, DECKY); cx.closePath(); cx.fill(); }
        cx.globalAlpha = 1; const v = cx.createRadialGradient(W / 2, GROUND / 2, H * 0.2, W / 2, GROUND / 2, H * 0.6); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(8,6,18,0.55)"); cx.fillStyle = v; cx.fillRect(0, 0, W, DECKY); tex.refresh();
      }
      this.add.image(0, 0, "bg").setOrigin(0).setDepth(0);
      const fl = this.add.graphics().setDepth(2); fl.fillStyle(0x2a2150, 1); fl.fillRect(0, GROUND, W, DECKY - GROUND); fl.fillStyle(0x35295e, 1); fl.fillRect(0, GROUND, W, 10);
      const dk = this.add.graphics().setDepth(17); dk.fillStyle(0x1a142e, 1); dk.fillRect(0, DECKY, W, H - DECKY); dk.lineStyle(4, 0x6a4a9a, 1); dk.lineBetween(0, DECKY, W, DECKY);
      this.dust = this.add.group(); for (let i = 0; i < 8; i++) { const d = this.add.circle(Phaser.Math.Between(20, W - 20), Phaser.Math.Between(140, GROUND), Phaser.Math.Between(2, 5), 0xbfe0ff, 0.18).setDepth(3); d.vy = Phaser.Math.FloatBetween(5, 13); this.dust.add(d); }
    }

    hoop(x, color) { // a backboard + rim + net at (x, BY)
      const bb = this.add.graphics().setDepth(6); bb.fillStyle(0xf3eee0, 1); bb.fillRoundedRect(x - 60, BY - 110, 120, 80, 10); bb.lineStyle(6, 0x8a3a2a, 1); bb.strokeRoundedRect(x - 60, BY - 110, 120, 80, 10); bb.lineStyle(5, color, 1); bb.strokeRect(x - 30, BY - 90, 60, 44);
      const rim = this.add.graphics().setDepth(13); rim.lineStyle(8, color, 1); rim.strokeEllipse(x, BY, 100, 26);
      const net = this.add.graphics().setDepth(7); net.lineStyle(2, 0xffffff, 0.7); for (let i = -4; i <= 4; i++) net.lineBetween(x + i * 11, BY + 4, x + i * 5, BY + 46); for (let r = 1; r <= 3; r++) net.strokeEllipse(x, BY + r * 15, 92 - r * 22, 20 - r * 5);
    }
    buildArena() {
      // ONE big centered glass jail (うそつき ばこ): dunk liars UP into it
      this.jailG = this.add.graphics().setDepth(5); this.drawJail(false);
      this.jailGloss = this.add.graphics().setDepth(15); this.jailGloss.fillStyle(0xffffff, 0.10); this.jailGloss.fillRoundedRect(CJX - JW / 2 + 12, JTOP + 10, 42, JBOT - JTOP - 20, 12);
      this.hoop(CJX, 0xff7a3a);
      this.jailLabel = this.add.text(CJX, JTOP - 34, "うそつき ばこ", { fontFamily: '"Zen Maru Gothic"', fontSize: "24px", color: "#bfe0ff", fontStyle: "800" }).setOrigin(0.5).setDepth(15).setStroke("#0a0818", 5);
      // honest creatures get chucked off either side (cues point outward)
      this.add.text(60, BY + 170, "← ホント\nは そと へ", { fontFamily: '"Zen Maru Gothic"', fontSize: "20px", color: "#9ff0bf", fontStyle: "700", align: "center", lineSpacing: 4 }).setOrigin(0.5).setDepth(8).setAlpha(0.7);
      this.add.text(W - 60, BY + 170, "ホント →\nは そと へ", { fontFamily: '"Zen Maru Gothic"', fontSize: "20px", color: "#9ff0bf", fontStyle: "700", align: "center", lineSpacing: 4 }).setOrigin(0.5).setDepth(8).setAlpha(0.7);
    }
    drawJail(broken) { this.jailG.clear(); if (broken) return; this.jailG.fillStyle(0x6aa0d8, 0.16); this.jailG.fillRoundedRect(CJX - JW / 2, JTOP, JW, JBOT - JTOP, 16); this.jailG.lineStyle(7, 0x9fc6ec, 0.85); this.jailG.strokeRoundedRect(CJX - JW / 2, JTOP, JW, JBOT - JTOP, 16); this.jailG.fillStyle(0x3a4a7a, 0.5); this.jailG.fillRoundedRect(CJX - JW / 2, JBOT - 18, JW, 18, 7); }

    buildHud() {
      const bar = this.add.graphics().setDepth(29); bar.fillStyle(0x1a142e, 0.9); bar.fillRoundedRect(8, 8, W - 16, 54, 16);
      this.hud = this.add.text(20, 18, "", { fontFamily: '"Baloo 2"', fontSize: "27px", color: "#FFCF4D", fontStyle: "800" }).setDepth(30);
      this.updateHud();
    }
    updateHud() { this.hud.setText("つかまえた  " + this.caught + " / " + WIN); }
    buildDeck() {
      const my = (DECKY + H) / 2;
      this.add.text(W / 2, my, "ウソつき は うえ へ シュート！ ↑\nホント の こ は よこ へ ポイっ →", { fontFamily: '"Zen Maru Gothic"', fontSize: "23px", color: "#cfe0ff", fontStyle: "700", align: "center", lineSpacing: 8 }).setOrigin(0.5).setDepth(19);
    }

    // ---------- INTRO (first play only, auto-talks, smooth) ----------
    introNeeded() { try { return !localStorage.getItem("lb_intro_seen"); } catch (e) { return true; } }
    markSeen() { try { localStorage.setItem("lb_intro_seen", "1"); } catch (e) {} }
    startIntro() {
      this.state = "intro";
      this.introDim = this.add.graphics().setDepth(45); this.introDim.fillStyle(0x0a0818, 0.62); this.introDim.fillRect(0, 0, W, H);
      this.introBig = this.add.image(W / 2, H * 0.40, "tral").setScale(1.6).setDepth(47);
      this.introBob = this.tweens.add({ targets: this.introBig, y: H * 0.40 - 16, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const bx = W / 2, by = H * 0.62;
      this.introBg = this.add.graphics().setDepth(46); this.introBg.fillStyle(0xffffff, 0.97); this.introBg.fillRoundedRect(bx - 322, by - 96, 644, 192, 24); this.introBg.lineStyle(5, 0x1E1233, 1); this.introBg.strokeRoundedRect(bx - 322, by - 96, 644, 192, 24);
      this.introText = this.add.text(bx, by, "チャオ！ ウソつき は うえ の はこ に\nシュート で たいほ だ！ ホント の こ は\nよこ へ ポイっ と にがして やれ！\nウソつき を 5ひき つかまえたら かち だ ぞ！", { fontFamily: '"Zen Maru Gothic"', fontSize: "25px", color: "#1E1233", fontStyle: "700", align: "center", lineSpacing: 8 }).setOrigin(0.5).setDepth(47);
      this.skipBtn = this.add.text(W - 24, 80, "スキップ ▶", { fontFamily: '"Zen Maru Gothic"', fontSize: "24px", color: "#cfe0ff", fontStyle: "700" }).setOrigin(1, 0).setDepth(48).setInteractive({ useHandCursor: true }).setStroke("#0a0818", 5);
      let advanced = false; this.advIntro = () => { if (advanced) return; advanced = true; this.endIntro(); };
      this.skipBtn.on("pointerdown", this.advIntro);
      this.voice("tral_intro", this.advIntro);   // advances when the clip actually ends
      this.time.delayedCall(20000, this.advIntro);   // safety net if audio is blocked
    }
    endIntro() {
      this.markSeen();
      if (window.KMEAudio) KMEAudio.stopAll();
      if (this.skipBtn) { this.skipBtn.destroy(); this.skipBtn = null; }
      this.tweens.add({ targets: [this.introDim, this.introBg, this.introText], alpha: 0, duration: 450, onComplete: () => { [this.introDim, this.introBg, this.introText].forEach((o) => { if (o) o.destroy(); }); } });
      if (this.introBob) this.introBob.stop();
      this.tweens.add({ targets: this.introBig, x: this.tralHome.x, y: this.tralHome.y, scaleX: this.tralHome.s, scaleY: this.tralHome.s, duration: 600, ease: "Cubic.inOut", onComplete: () => { if (this.introBig) { this.introBig.destroy(); this.introBig = null; } this.tral.setVisible(true); } });
      this.time.delayedCall(680, () => this.startPlay());
    }

    voice(key, onEnd) {
      const p = window.KMEAudio ? KMEAudio.play(key) : Promise.resolve();
      if (onEnd) p.then(onEnd);
      return p;
    }
    playSafe(key) { this.voice(key); }

    showTitle() {
      this.state = "title"; this.titleStarted = false;
      const dim = this.add.graphics().setDepth(60); dim.fillStyle(0x0a0818, 0.52); dim.fillRect(0, 0, W, H);
      const host = this.add.image(W / 2, H * 0.36, "tral").setScale(1.5).setDepth(62);
      this.titleBob = this.tweens.add({ targets: host, y: H * 0.36 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const t1 = this.add.text(W / 2, H * 0.57, "ウソつき バスケット", { fontFamily: '"Baloo 2"', fontSize: "42px", color: "#9ff0bf", fontStyle: "800" }).setOrigin(0.5).setDepth(62).setStroke("#0a0818", 7);
      const t2 = this.add.text(W / 2, H * 0.57 + 44, "Liar Basketball", { fontFamily: '"Baloo 2"', fontSize: "26px", color: "#cfe0ff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#0a0818", 5);
      const bw = 300, bh = 92, bx = W / 2, by = H * 0.73;
      const bg = this.add.graphics().setDepth(62); bg.fillStyle(0x3DBE6A, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26); bg.lineStyle(6, 0x1F8A4C, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26);
      const tri = this.add.triangle(bx - 58, by, 0, 0, 26, 16, 0, 32, 0xffffff).setDepth(63);
      const bt = this.add.text(bx + 14, by, "あそぶ", { fontFamily: '"Zen Maru Gothic"', fontSize: "34px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(63).setStroke("#0a2818", 5);
      this.titlePulse = this.tweens.add({ targets: bg, alpha: 0.7, duration: 650, yoyo: true, repeat: -1 });
      const zone = this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(64).on("pointerdown", () => this.startFromTitle());
      this.titleObjs = [dim, host, t1, t2, bg, tri, bt, zone];
    }
    startFromTitle() {
      if (this.titleStarted) return; this.titleStarted = true; Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();   // gesture unlocks audio for the session
      if (this.titleBob) this.titleBob.stop(); if (this.titlePulse) this.titlePulse.stop();
      (this.titleObjs || []).forEach((o) => { if (o && o.destroy) o.destroy(); });
      if (this.introNeeded()) this.startIntro(); else { this.markSeen(); this.tral.setVisible(true); this.startPlay(); }
    }
    startPlay() { if (this.playStarted) return; this.playStarted = true; this.state = "play"; this.nextRound(); this.jailTimer = this.time.addEvent({ delay: 2600, loop: true, callback: () => this.jailLie() }); }

    nextRound() {
      if (this.idx >= this.queue.length) { this.queue = Phaser.Utils.Array.Shuffle(CLAIMS.slice()); this.idx = 0; }
      this.cur = this.queue[this.idx];
      this.creature = this.add.image(W + 120, CRY, this.cur.a).setOrigin(0.5, 1).setDepth(12);
      this.creShadow = this.add.ellipse(W + 120, GROUND + 6, 110, 20, 0x000000, 0.22).setDepth(11);
      this.bubbleG.clear(); this.bubbleT.setText("");
      this.tweens.add({ targets: this.creature, x: CRX, duration: 460, ease: "Back.out", onComplete: () => { this.drawBubble(); this.bob = this.tweens.add({ targets: this.creature, y: CRY - 12, duration: 520, yoyo: true, repeat: -1, ease: "Sine.inOut" }); } });
    }
    drawBubble() {
      this.bubbleT.setText("I can " + this.cur.v + "!");
      const tw = Math.max(220, this.bubbleT.width + 60), th = 88, bx = CRX, by = CRY - 175;
      this.bubbleG.clear(); this.bubbleG.fillStyle(0xffffff, 1); this.bubbleG.lineStyle(5, 0x1E1233, 1);
      this.bubbleG.fillRoundedRect(bx - tw / 2, by - th / 2, tw, th, 20); this.bubbleG.strokeRoundedRect(bx - tw / 2, by - th / 2, tw, th, 20);
      this.bubbleG.fillTriangle(bx - 16, by + th / 2 - 2, bx + 16, by + th / 2 - 2, bx, by + th / 2 + 30);
      this.bubbleT.setPosition(bx, by);
      this.voice("en_" + this.cur.v); // the kid HEARS the English claim
    }
    clearBubble() { this.bubbleG.clear(); this.bubbleT.setText(""); if (this.bob) this.bob.stop(); if (this.creShadow) { this.creShadow.destroy(); this.creShadow = null; } }

    onDown(p) { if (this.state === "play" && this.creature && Phaser.Math.Distance.Between(p.worldX, p.worldY, this.creature.x, this.creature.y - 50) < 170) { this.dragging = true; this.dragSX = p.worldX; this.dragSY = p.worldY; } }
    onUp(p) {
      if (!this.dragging) return; this.dragging = false;
      if (this.state !== "play" || !this.creature) return;
      const dx = p.worldX - this.dragSX, dy = p.worldY - this.dragSY;
      if (Math.hypot(dx, dy) < 60) return;   // too small a flick: ignore, keep bobbing
      if (dy < -55 && Math.abs(dy) > Math.abs(dx) * 0.7) {                       // UP = shoot into the jail
        this.shoot(Phaser.Math.Clamp(dx * K, -900, 900), Phaser.Math.Clamp(dy * K, -2100, -760), "dunk");
      } else if (Math.abs(dx) > 60) {                                            // SIDE = chuck away (free)
        this.shoot((dx < 0 ? -1 : 1) * 1180, -360, "chuck");
      }
    }
    shoot(vx, vy, mode) {
      this.state = "flying"; this.clearBubble(); Sfx.whoosh();
      this.creature.setOrigin(0.5, 0.5);
      this.flyC = this.creature; this.flyVx = vx; this.flyVy = vy; this.flyLiar = !this.cur.can; this.flyMode = mode; this.flyDone = false;
    }

    update(time, delta) {
      const dt = Math.min(0.033, delta / 1000);
      if (this.dust) this.dust.children.iterate((d) => { if (!d) return; d.y -= d.vy * dt; if (d.y < 130) { d.y = GROUND; d.x = Phaser.Math.Between(20, W - 20); } });
      if (this.creShadow && this.creature && this.state === "play") this.creShadow.x = this.creature.x;
      if (this.state === "flying" && this.flyC && !this.flyDone) {
        const c = this.flyC;
        if (this.flyMode === "dunk") {
          // gentle aim-assist toward the centered rim as the shot descends, so a good throw drops in
          if (c.y > BY - 240 && c.y < BY + 40 && Math.abs(c.x - CJX) < 190) this.flyVx += (CJX - c.x) * 3.2 * dt;
          this.flyVy += GRAV * dt; c.x += this.flyVx * dt; c.y += this.flyVy * dt; c.angle += 420 * dt; c.setScale(Math.max(0.42, c.scaleX - dt * 0.18));
          if (this.flyVy > 0 && c.y >= BY - 14 && c.y <= BY + 70 && Math.abs(c.x - CJX) < 150) { this.flyDone = true; return this.intoJail(c); }
          if (c.y > GROUND + 90) { this.flyDone = true; return this.miss(c); }
        } else {   // chuck off the side
          this.flyVy += GRAV * 0.5 * dt; c.x += this.flyVx * dt; c.y += this.flyVy * dt; c.angle += 300 * dt;
          if (c.x < -150 || c.x > W + 150) { this.flyDone = true; return this.chuckedOut(c); }
          if (c.y > GROUND + 90) { this.flyDone = true; return this.miss(c); }
        }
      }
    }

    intoJail(c) { if (this.flyLiar) this.catchLiar(c); else this.smash("jailed-innocent", c); }   // honest dunked in = wrong
    chuckedOut(c) { if (!this.flyLiar) this.honestOut(c); else this.smash("freed-liar", c); }       // liar set free = wrong
    catchLiar(c) {
      Sfx.swish(); this.playSafe("tral_caught"); this.burst(CJX, BY, 0xFFCF4D, 16); this.cameras.main.shake(90, 0.006); this.flyC = null;
      this.tweens.add({ targets: c, y: this.jailSlotY(), x: this.jailSlotX(), scale: 0.42, angle: 0, duration: 380, ease: "Bounce.out", onComplete: () => { c.setOrigin(0.5, 1); this.jailed.push(c); this.caught++; this.updateHud(); this.creature = null; if (this.caught >= WIN) return this.win(); this.idx++; this.nextRound(); this.state = "play"; } });
    }
    honestOut(c) {
      Sfx.good(); this.flyC = null;
      const t = this.add.text(c.x, GROUND - 120, "ホント！", { fontFamily: '"Baloo 2"', fontSize: "30px", color: "#6ee29a", fontStyle: "800" }).setOrigin(0.5).setDepth(20).setStroke("#0a2818", 5);
      this.tweens.add({ targets: t, y: t.y - 34, alpha: 0, duration: 650, onComplete: () => t.destroy() });
      this.tweens.add({ targets: c, x: c.x < W / 2 ? -140 : W + 140, y: GROUND - 8, angle: 0, scale: 0.62, duration: 380, ease: "Quad.in", onComplete: () => { c.destroy(); this.creature = null; this.idx++; this.nextRound(); this.state = "play"; } });
    }
    miss(c) { // a dunk that missed the rim: drops and scurries off, no score, no penalty
      Sfx.pop();
      this.tweens.add({ targets: c, y: GROUND - 10, angle: 0, scale: 0.7, duration: 300, ease: "Bounce.out", onComplete: () => { this.tweens.add({ targets: c, x: c.x < W / 2 ? -120 : W + 120, duration: 500, ease: "Quad.in", onComplete: () => { c.destroy(); this.creature = null; this.idx++; this.nextRound(); this.state = "play"; } }); } });
    }

    jailSlotX() { return CJX - JW / 2 + 50 + (this.caught % 4) * 72 + Phaser.Math.Between(-6, 6); }
    jailSlotY() { return JBOT - 18 - Math.floor(this.caught / 4) * 58; }
    addToJail(spr) { spr.setOrigin(0.5, 1).setDepth(8).setScale(0.4).setPosition(this.jailSlotX(), this.jailSlotY()); this.jailed.push(spr); this.caught++; this.updateHud(); }
    jailLie() {
      if (this.state !== "play" || !this.jailed.length) return;
      const j = Phaser.Utils.Array.GetRandom(this.jailed); if (!j || !j.active) return;
      const lie = Phaser.Utils.Array.GetRandom(LIES);
      const g = this.add.graphics().setDepth(18); const t = this.add.text(j.x, j.y - 58, lie, { fontFamily: '"Zen Maru Gothic"', fontSize: "16px", color: "#1E1233", fontStyle: "700" }).setOrigin(0.5).setDepth(19);
      const tw = t.width + 20; g.fillStyle(0xffffff, 0.96); g.fillRoundedRect(j.x - tw / 2, j.y - 74, tw, 34, 10); g.lineStyle(3, 0x1E1233, 1); g.strokeRoundedRect(j.x - tw / 2, j.y - 74, tw, 34, 10);
      t.setPosition(j.x, j.y - 57); Sfx.pop();
      this.time.delayedCall(1500, () => { g.destroy(); t.destroy(); });
    }

    smash(reason, c) {
      this.state = "over"; if (this.jailTimer) this.jailTimer.remove();
      Sfx.smash(); this.playSafe("tral_lose"); this.cameras.main.shake(420, 0.02); this.cameras.main.flash(220, 230, 80, 80);
      this.drawJail(true); if (this.jailGloss) this.jailGloss.clear();
      for (let i = 0; i < 24; i++) { const s = this.add.rectangle(CJX + Phaser.Math.Between(-150, 150), JTOP + Phaser.Math.Between(0, 170), Phaser.Math.Between(6, 16), Phaser.Math.Between(6, 16), 0xbfe0ff, 0.7).setDepth(30); this.tweens.add({ targets: s, x: s.x + Phaser.Math.Between(-180, 180), y: s.y + Phaser.Math.Between(120, 320), angle: Phaser.Math.Between(-180, 180), alpha: 0, duration: 800, ease: "Quad.in", onComplete: () => s.destroy() }); }
      this.jailed.concat(c ? [c] : []).forEach((L, i) => { if (!L || !L.active) return; this.tweens.add({ targets: L, x: Phaser.Math.Between(-100, W + 100), y: GROUND, angle: Phaser.Math.Between(-30, 30), scale: 0.7, duration: 700, delay: i * 40, ease: "Quad.out" }); });
      const msg = reason === "jailed-innocent" ? "むじつ だよ！" : "にげられた！";   // innocent jailed / a liar got away
      this.time.delayedCall(1300, () => this.panel(msg, "GAME OVER"));
    }
    win() {
      this.state = "over"; if (window.KMEFlow) KMEFlow.win(); if (this.jailTimer) this.jailTimer.remove(); this.playSafe("tral_win"); this.cameras.main.flash(240, 255, 220, 120);
      this.tweens.add({ targets: this.tral, scaleX: this.tralHome.s * 1.18, scaleY: this.tralHome.s * 1.18, duration: 160, yoyo: true, repeat: 2 });
      this.jailed.forEach((L, i) => this.time.delayedCall(i * 120, () => { const lie = LIES[i % LIES.length]; const t = this.add.text(L.x, L.y - 54, lie, { fontFamily: '"Zen Maru Gothic"', fontSize: "15px", color: "#1E1233", fontStyle: "700", backgroundColor: "#ffffff", padding: { x: 6, y: 3 } }).setOrigin(0.5).setDepth(19); this.time.delayedCall(1800, () => t.destroy()); }));
      this.time.delayedCall(1400, () => this.panel("ぜんいん たいほ！", "YOU WIN!"));
    }

    burst(x, y, color, n) { for (let i = 0; i < n; i++) { const c = this.add.circle(x, y, Phaser.Math.Between(3, 8), color, 0.9).setDepth(25); const a = Math.random() * Math.PI * 2, d = Phaser.Math.Between(24, 80); this.tweens.add({ targets: c, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.2, duration: 480, ease: "Quad.out", onComplete: () => c.destroy() }); } }

    panel(titleJp, big) {
      const p = this.add.graphics().setDepth(50); p.fillStyle(0x1a142e, 0.96); p.fillRoundedRect(W / 2 - 220, GROUND / 2 - 130, 440, 300, 26); p.lineStyle(6, 0xFFCF4D, 1); p.strokeRoundedRect(W / 2 - 220, GROUND / 2 - 130, 440, 300, 26);
      this.add.text(W / 2, GROUND / 2 - 70, titleJp, { fontFamily: '"Zen Maru Gothic"', fontSize: "40px", color: "#FFF7F0", fontStyle: "700" }).setOrigin(0.5).setDepth(51).setStroke("#0a0818", 7);
      this.add.text(W / 2, GROUND / 2 + 2, big, { fontFamily: '"Baloo 2"', fontSize: "50px", color: "#FFCF4D", fontStyle: "800" }).setOrigin(0.5).setDepth(51).setStroke("#0a0818", 7);
      const bw = 270, bh = 78, bx = W / 2, by = GROUND / 2 + 96;
      const bg = this.add.graphics().setDepth(51); bg.fillStyle(0x3DBE6A, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 22); bg.lineStyle(5, 0x1F8A4C, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 22);
      this.add.text(bx, by, "もう いちど ▶", { fontFamily: '"Zen Maru Gothic"', fontSize: "30px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(52).setStroke("#0a0818", 5);
      this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(53).on("pointerdown", () => this.scene.restart());
      this.tweens.add({ targets: bg, alpha: 0.65, duration: 700, yoyo: true, repeat: -1 });
    }
  }

  let booted = false;
  function boot() { if (booted) return; booted = true; new Phaser.Game({ type: Phaser.CANVAS, parent: "game", backgroundColor: "#10131f", audio: { disableWebAudio: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: [Play] }); }
  if (document.fonts && document.fonts.load) { Promise.all([document.fonts.load('800 40px "Baloo 2"'), document.fonts.load('700 26px "Zen Maru Gothic"')]).then(boot, boot); setTimeout(boot, 1800); } else boot();
})();
