// Kaiju Battle (Eiken 5 mock test) - Phaser 3. The capstone "test": tako the
// champion fights the brainrot kaiju by answering mixed Eiken 5 grammar questions
// (be, can, prepositions, plurals, this/that, a/an, present -s, present continuous,
// there is/are, imperatives, Wh-, pronouns). A correct answer = tako attacks and
// the kaiju loses HP; a wrong answer = the kaiju attacks tako. Drop the kaiju's HP
// to clear it (合格). Questions are reading MCQ (Eiken grammar format); a small JP
// gloss supports but never hands over the English answer.
"use strict";
(function () {
  const W = 760, H = 1200, PLAYER_HP = 5;

  // Mixed Eiken 5 bank. answer = index into options. jp is a light gloss.
  const BANK = [
    { jp: "わたしは がくせいです。", q: "I ___ a student.", o: ["am", "is", "are"], a: 0 },
    { jp: "かれは いそがしいです。", q: "He ___ busy.", o: ["am", "is", "are"], a: 1 },
    { jp: "その いぬたちは おおきいです。", q: "The dogs ___ big.", o: ["am", "is", "are"], a: 2 },
    { jp: "わたしは およげます。", q: "I ___ swim.", o: ["can", "cans", "am"], a: 0 },
    { jp: "かれは とべません。", q: "He ___ fly.", o: ["can't", "don't", "isn't"], a: 0 },
    { jp: "ねこは はこの なかに います。", q: "The cat is ___ the box.", o: ["in", "on", "under"], a: 0 },
    { jp: "ほんは つくえの うえに あります。", q: "The book is ___ the desk.", o: ["in", "on", "by"], a: 1 },
    { jp: "りんごが 3こ あります。", q: "I have three ___.", o: ["apple", "apples", "apple's"], a: 1 },
    { jp: "これは ねこです。", q: "I have one ___.", o: ["cats", "cat", "cates"], a: 1 },
    { jp: "これは りんごです。", q: "This is ___ apple.", o: ["a", "an", "the"], a: 1 },
    { jp: "あれは いぬです。", q: "That is ___ dog.", o: ["a", "an", "two"], a: 0 },
    { jp: "これは ペンです。(ちかく・1つ)", q: "___ is a pen.", o: ["This", "These", "That"], a: 0 },
    { jp: "あれらは とりです。(とおく・たくさん)", q: "___ are birds.", o: ["That", "Those", "This"], a: 1 },
    { jp: "かのじょは まいにち はしります。", q: "She ___ every day.", o: ["run", "runs", "running"], a: 1 },
    { jp: "かれらは サッカーを します。", q: "They ___ soccer.", o: ["plays", "play", "playing"], a: 1 },
    { jp: "わたしは いま たべています。", q: "I am ___ now.", o: ["eat", "eats", "eating"], a: 2 },
    { jp: "へやに ねこが 1ぴき います。", q: "There ___ a cat in the room.", o: ["is", "are", "am"], a: 0 },
    { jp: "つくえの うえに ほんが 3さつ あります。", q: "There ___ three books.", o: ["is", "are", "be"], a: 1 },
    { jp: "ドアを あけて。", q: "___ the door, please.", o: ["Open", "Opens", "Opening"], a: 0 },
    { jp: "いま なんじですか。", q: "___ time is it?", o: ["What", "Where", "Who"], a: 0 },
    { jp: "いぬは どこですか。", q: "___ is the dog?", o: ["What", "Where", "When"], a: 1 },
    { jp: "かれは わたしの ともだちです。", q: "___ is my friend.", o: ["He", "Him", "His"], a: 0 },
    { jp: "わたしは かれを しっています。", q: "I know ___.", o: ["he", "him", "his"], a: 1 },
    { jp: "これは かれの じてんしゃです。", q: "This is ___ bike.", o: ["he", "him", "his"], a: 2 }
  ];
  const N_QS = 12;   // questions per battle (kaiju HP)

  // The Eiken 5 mock also tests VOCABULARY, so the bank mixes in word questions
  // built from the vocab themes (see the JP meaning, pick the English word).
  function shuf(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function vocabQuestions(n) {
    const themes = window.VOCAB_THEMES || []; if (!themes.length) return [];
    const all = []; themes.forEach((t) => t.words.forEach((w) => { if (w.en && w.jp) all.push(w); }));
    shuf(all);
    const out = [];
    for (let i = 0; i < Math.min(n, all.length); i++) {
      const w = all[i];
      const decoys = shuf(all.filter((x) => x.en !== w.en)).slice(0, 2).map((x) => x.en);
      const opts = shuf([w.en].concat(decoys));
      out.push({ jp: w.pic + "  " + w.jp, q: "= ?", o: opts, a: opts.indexOf(w.en) });
    }
    return out;
  }
  const ALLQ = BANK.concat(vocabQuestions(14));

  const Sfx = {
    ctx: null,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    tone(f0, f1, dur, type, gain) { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); g.gain.setValueAtTime(gain || 0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur); },
    noise(dur, gain, freq) { if (!this.ctx) return; const t = this.ctx.currentTime, b = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 1000; const g = this.ctx.createGain(); g.gain.setValueAtTime(gain || 0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(this.ctx.destination); s.start(t); s.stop(t + dur); },
    hitBoss() { this.tone(700, 1100, 0.12, "square", 0.16); this.noise(0.12, 0.12, 2000); },
    hitYou() { this.tone(300, 120, 0.3, "sawtooth", 0.16); this.noise(0.18, 0.14, 500); },
    win() { [0, 120, 240, 380].forEach((d, i) => setTimeout(() => this.tone(560 + i * 150, 940 + i * 150, 0.22, "triangle", 0.16), d)); },
    lose() { this.tone(420, 90, 0.6, "sawtooth", 0.18); }
  };

  class Play extends Phaser.Scene {
    constructor() { super("play"); }
    preload() {
      this.load.svg("tako", "assets/tako.svg", { width: 200, height: 218 });
      this.load.svg("brainrot", "assets/brainrot.svg", { width: 420, height: 360 });
      this.load.svg("heart", "assets/heart.svg", { width: 48, height: 48 });
      this.load.svg("star", "assets/p_star.svg", { width: 46, height: 46 });
      this.load.svg("ink", "assets/ink_blob.svg", { width: 54, height: 54 });
    }
    create() {
      this.time.removeAllEvents();
      this.hp = PLAYER_HP; this.bossMax = N_QS; this.bossHp = N_QS; this.qi = 0; this.locked = false; this.playStarted = false; this.state = null;
      this.queue = Phaser.Utils.Array.Shuffle(ALLQ.slice()).slice(0, N_QS);
      if (window.KMEAudio) { KMEAudio.setBase("assets/").stopAll(); KMEAudio.register(["bk_intro"]); }

      this.buildBackdrop();
      this.boss = this.add.image(W / 2 + 10, 360, "brainrot").setScale(0.9).setDepth(12).setVisible(false);
      this.bossBob = this.tweens.add({ targets: this.boss, y: 348, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.inOut", paused: true });
      this.tako = this.add.image(150, H - 380, "tako").setScale(0.7).setDepth(12).setVisible(false);
      this.buildHud();
      this.buildQPanel();

      const q = new URLSearchParams(location.search);
      if (q.has("cap")) { window.__bk = this; this.markSeen(); this.startPlay(); }
      else this.showTitle();
    }

    buildBackdrop() {
      if (this.textures.exists("arenabg")) this.textures.remove("arenabg");
      const tex = this.textures.createCanvas("arenabg", W, H), cx = tex.getContext();
      const g = cx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#2a1340"); g.addColorStop(0.5, "#3c1d5c"); g.addColorStop(1, "#160a26");
      cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      cx.globalAlpha = 0.12; cx.fillStyle = "#ffffff"; for (let i = 0; i < 60; i++) cx.fillRect(Math.random() * W, Math.random() * H * 0.7, 2, 2);
      cx.globalAlpha = 1; tex.refresh();
      this.add.image(0, 0, "arenabg").setOrigin(0, 0).setDepth(0);
      const fl = this.add.graphics().setDepth(1); fl.fillStyle(0x241038, 1); fl.fillEllipse(W / 2, H - 360, W * 1.3, 220);   // boss platform
      fl.fillStyle(0x1a0c2c, 1); fl.fillRect(0, H - 200, W, 200);
      const v = this.add.graphics().setDepth(40); for (let i = 0; i < 46; i++) { v.lineStyle(2, 0x06020e, i / 46 * 0.2); v.strokeRect(i, i, W - 2 * i, H - 2 * i); }
    }

    buildHud() {
      // boss HP bar (top)
      this.add.text(W / 2, 92, "ブレインロット かいじゅう", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "22px", color: "#ffb0e0", fontStyle: "700" }).setOrigin(0.5).setDepth(31);
      this.bossBarBg = this.add.graphics().setDepth(31); this.bossBarBg.fillStyle(0x10081c, 0.9); this.bossBarBg.fillRoundedRect(60, 108, W - 120, 30, 12);
      this.bossBar = this.add.graphics().setDepth(32); this.drawBossBar();
      // player hearts (bottom-left)
      this.hearts = []; for (let i = 0; i < PLAYER_HP; i++) { const h = this.add.image(40 + i * 46, H - 56, "heart").setScale(0.7).setDepth(31); this.hearts.push(h); }
      this.gradeTx = this.add.text(W - 20, H - 64, "英検5級 もぎテスト", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "18px", color: "#cdb8ff", fontStyle: "700" }).setOrigin(1, 0.5).setDepth(31);
    }
    drawBossBar() {
      this.bossBar.clear(); const w = (W - 124) * Math.max(0, this.bossHp) / this.bossMax;
      this.bossBar.fillStyle(0xff4d7a, 1); this.bossBar.fillRoundedRect(62, 110, Math.max(0, w), 26, 10);
    }
    updateHearts() { this.hearts.forEach((h, i) => h.setAlpha(i < this.hp ? 1 : 0.2)); }

    buildQPanel() {
      this.qBg = this.add.graphics().setDepth(30); this.qBg.fillStyle(0xffffff, 0.97); this.qBg.fillRoundedRect(40, H - 330, W - 80, 150, 20); this.qBg.lineStyle(4, 0x7a4fae, 1); this.qBg.strokeRoundedRect(40, H - 330, W - 80, 150, 20);
      this.qJp = this.add.text(W / 2, H - 312, "", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "18px", color: "#6b4a9e", fontStyle: "700" }).setOrigin(0.5).setDepth(31);
      this.qEn = this.add.text(W / 2, H - 268, "", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "30px", color: "#2a1545", fontStyle: "800", align: "center", wordWrap: { width: W - 120 } }).setOrigin(0.5).setDepth(31);
      this.optZone = [];
      this.qBg.setVisible(false); this.qJp.setVisible(false); this.qEn.setVisible(false);
    }

    startPlay() { if (this.playStarted) return; this.playStarted = true; this.state = "play"; this.boss.setVisible(true); this.bossBob.resume(); this.tako.setVisible(true); this.qBg.setVisible(true); this.qJp.setVisible(true); this.qEn.setVisible(true); this.updateHearts(); this.nextQuestion(); }

    clearOpts() { if (this.opts) { this.opts.forEach((o) => o.destroy()); } this.opts = []; }
    nextQuestion() {
      this.locked = false;
      if (this.qi >= this.queue.length) { this.qi = 0; this.queue = Phaser.Utils.Array.Shuffle(ALLQ.slice()).slice(0, N_QS); }
      const item = this.queue[this.qi]; this.cur = item;
      this.qJp.setText(item.jp);
      this.qEn.setText(item.q);
      this.clearOpts();
      const n = item.o.length, bw = 200, bh = 64, gap = 16, totalW = n * bw + (n - 1) * gap, x0 = W / 2 - totalW / 2 + bw / 2, y = H - 150;
      item.o.forEach((opt, idx) => {
        const cx = x0 + idx * (bw + gap);
        const bg = this.add.graphics().setDepth(33); bg.fillStyle(0x5a3a8e, 1); bg.fillRoundedRect(cx - bw / 2, y - bh / 2, bw, bh, 16); bg.lineStyle(4, 0x9a78d0, 1); bg.strokeRoundedRect(cx - bw / 2, y - bh / 2, bw, bh, 16);
        const tx = this.add.text(cx, y, opt, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "30px", color: "#fff", fontStyle: "800" }).setOrigin(0.5).setDepth(34);
        const z = this.add.zone(cx, y, bw, bh).setInteractive({ useHandCursor: true }).setDepth(35).on("pointerdown", () => this.answer(idx, bg, cx, y, bw, bh));
        this.opts.push(bg, tx, z);
      });
    }

    answer(idx, bg, cx, y, bw, bh) {
      Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.locked || this.state !== "play") return; this.locked = true;
      const right = idx === this.cur.a;
      if (right) {
        bg.clear(); bg.fillStyle(0x2fae5e, 1); bg.fillRoundedRect(cx - bw / 2, y - bh / 2, bw, bh, 16);
        this.attackBoss();
      } else {
        bg.clear(); bg.fillStyle(0xc0392b, 1); bg.fillRoundedRect(cx - bw / 2, y - bh / 2, bw, bh, 16);
        // show the right one
        this.opts.forEach((o) => {});
        this.attackPlayer();
      }
    }

    attackBoss() {
      // tako lobs an ink shot at the kaiju
      const ink = this.add.image(this.tako.x, this.tako.y - 30, "ink").setScale(0.7).setDepth(20);
      this.tweens.add({ targets: this.tako, x: this.tako.x + 30, duration: 120, yoyo: true });
      Sfx.init();
      this.tweens.add({ targets: ink, x: this.boss.x, y: this.boss.y, scale: 1.1, duration: 260, ease: "Quad.in", onComplete: () => {
        ink.destroy(); Sfx.hitBoss(); this.bossHp--; this.drawBossBar();
        this.boss.setTint(0xff8080); this.cameras.main.shake(160, 0.008);
        this.tweens.add({ targets: this.boss, x: this.boss.x + 16, duration: 60, yoyo: true, repeat: 3, onComplete: () => this.boss.clearTint() });
        this.burst(this.boss.x, this.boss.y, 0xffd24d);
        this.qi++;
        if (this.bossHp <= 0) this.time.delayedCall(700, () => this.win());
        else this.time.delayedCall(820, () => this.nextQuestion());
      } });
    }
    attackPlayer() {
      this.time.delayedCall(380, () => {
        this.tweens.add({ targets: this.boss, y: this.boss.y + 30, scaleX: 0.96, duration: 140, yoyo: true });
        Sfx.hitYou(); this.hp--; this.updateHearts(); this.cameras.main.shake(220, 0.012); this.cameras.main.flash(160, 200, 40, 40);
        this.tako.setTint(0xff6060); this.tweens.add({ targets: this.tako, angle: -12, duration: 80, yoyo: true, repeat: 2, onComplete: () => this.tako.clearTint() });
        this.qi++;
        if (this.hp <= 0) this.time.delayedCall(600, () => this.lose());
        else this.time.delayedCall(900, () => this.nextQuestion());
      });
    }

    burst(x, y, color) { for (let i = 0; i < 10; i++) { const s = this.add.image(x, y, "star").setScale(Phaser.Math.FloatBetween(0.3, 0.8)).setTint(color).setDepth(22); const a = Math.random() * Math.PI * 2, d = Phaser.Math.Between(40, 130); this.tweens.add({ targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.1, duration: 500, ease: "Quad.out", onComplete: () => s.destroy() }); } }

    flash(color, alpha) { const f = this.add.rectangle(0, 0, W, H, color, alpha).setOrigin(0).setDepth(50); this.tweens.add({ targets: f, alpha: 0, duration: 260, onComplete: () => f.destroy() }); }
    win() {
      this.state = "over"; if (window.KMEFlow) KMEFlow.win(); Sfx.win(); this.flash(0xfff2c4, 0.6);
      this.tweens.add({ targets: this.boss, alpha: 0, y: this.boss.y + 60, angle: 30, duration: 700 });
      this.tweens.add({ targets: this.tako, scaleX: 0.8, scaleY: 0.8, duration: 200, yoyo: true, repeat: 4 });
      this.time.delayedCall(700, () => this.panel("合格[ごうかく]！", "YOU WIN!", "かいじゅう を たおした！"));
    }
    lose() { this.state = "over"; Sfx.lose(); this.cameras.main.shake(300, 0.014); this.time.delayedCall(400, () => this.panel("ざんねん！", "GAME OVER", "もういちど ちょうせん！")); }
    panel(jp, big, sub) {
      const p = this.add.graphics().setDepth(60); p.fillStyle(0x2a1545, 0.96); p.fillRoundedRect(W / 2 - 220, H / 2 - 170, 440, 340, 28); p.lineStyle(6, 0xffcf4d, 1); p.strokeRoundedRect(W / 2 - 220, H / 2 - 170, 440, 340, 28);
      this.add.text(W / 2, H / 2 - 96, big, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "48px", color: "#ffcf4d", fontStyle: "800" }).setOrigin(0.5).setDepth(61).setStroke("#2a1545", 6);
      this.add.text(W / 2, H / 2 - 36, jp, { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "32px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(61);
      this.add.text(W / 2, H / 2 + 16, sub, { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "20px", color: "#cdb8ff", fontStyle: "700" }).setOrigin(0.5).setDepth(61);
      const bw = 260, bh = 74, by = H / 2 + 100;
      const bg = this.add.graphics().setDepth(61); bg.fillStyle(0x3DBE6A, 1); bg.fillRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, 20); bg.lineStyle(5, 0x1F8A4C, 1); bg.strokeRoundedRect(W / 2 - bw / 2, by - bh / 2, bw, bh, 20);
      this.add.text(W / 2, by, "もう いちど ▶", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "26px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#1F5A30", 5);
      this.add.zone(W / 2, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(63).on("pointerdown", () => this.scene.restart());
      this.tweens.add({ targets: bg, alpha: 0.65, duration: 700, yoyo: true, repeat: -1 });
    }

    // ---------- title / intro / voice ----------
    introNeeded() { try { return !localStorage.getItem("bk_intro_seen"); } catch (e) { return true; } }
    markSeen() { try { localStorage.setItem("bk_intro_seen", "1"); } catch (e) {} }
    voice(key, onEnd) { const p = window.KMEAudio ? KMEAudio.play(key) : Promise.resolve(); if (onEnd) p.then(onEnd); return p; }
    showTitle() {
      this.state = "title"; this.titleStarted = false;
      const dim = this.add.graphics().setDepth(60); dim.fillStyle(0x160a26, 0.5); dim.fillRect(0, 0, W, H);
      const host = this.add.image(W / 2, H * 0.34, "brainrot").setScale(0.95).setDepth(62);
      this.titleBob = this.tweens.add({ targets: host, y: H * 0.34 - 16, duration: 1100, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.add.text(W / 2, H * 0.58, "かいじゅう バトル", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "42px", color: "#ff7ec0", fontStyle: "800" }).setOrigin(0.5).setDepth(62).setStroke("#160a26", 7);
      this.add.text(W / 2, H * 0.58 + 44, "英検5級 もぎテスト", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "24px", color: "#cdb8ff", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#160a26", 5);
      const bw = 320, bh = 92, bx = W / 2, by = H * 0.74;
      const bg = this.add.graphics().setDepth(62); bg.fillStyle(0xc0398e, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26); bg.lineStyle(6, 0x7e2060, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26);
      this.add.triangle(bx - 70, by, 0, 0, 26, 16, 0, 32, 0xffffff).setDepth(63);
      this.add.text(bx + 10, by, "たたかう", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "32px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(63).setStroke("#5a1244", 5);
      this.titlePulse = this.tweens.add({ targets: bg, alpha: 0.7, duration: 650, yoyo: true, repeat: -1 });
      this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(64).on("pointerdown", () => this.startFromTitle());
    }
    startFromTitle() {
      if (this.titleStarted) return; this.titleStarted = true; Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.titleBob) this.titleBob.stop(); if (this.titlePulse) this.titlePulse.stop();
      this.children.list.filter((o) => o.depth >= 60 && o.depth < 65).forEach((o) => o.destroy());
      if (this.introNeeded()) this.startIntro(); else { this.markSeen(); this.startPlay(); }
    }
    startIntro() {
      this.state = "intro";
      this.introDim = this.add.graphics().setDepth(45); this.introDim.fillStyle(0x160a26, 0.62); this.introDim.fillRect(0, 0, W, H);
      this.introBig = this.add.image(W / 2, H * 0.34, "brainrot").setScale(0.95).setDepth(47);
      this.introBob = this.tweens.add({ targets: this.introBig, y: H * 0.34 - 14, duration: 1000, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const bx = W / 2, by = H * 0.64;
      this.introBg = this.add.graphics().setDepth(46); this.introBg.fillStyle(0xffffff, 0.97); this.introBg.fillRoundedRect(bx - 332, by - 96, 664, 192, 24); this.introBg.lineStyle(5, 0x2a1545, 1); this.introBg.strokeRoundedRect(bx - 332, by - 96, 664, 192, 24);
      this.introText = this.add.text(bx, by, "グゥオオ！ ワレこそ ブレインロット！\nただしい えいご で こうげき してみろ！\nまちがえると… ワレが こうげき する ぞ！\nさあ、もぎテスト の はじまり だ！", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "23px", color: "#2a1545", fontStyle: "700", align: "center", lineSpacing: 7 }).setOrigin(0.5).setDepth(47);
      this.skipBtn = this.add.text(W - 56, 92, "スキップ", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "24px", color: "#cdb8ff", fontStyle: "700" }).setOrigin(1, 0.5).setDepth(48).setInteractive({ useHandCursor: true }).setStroke("#160a26", 5);
      this.skipChev = this.add.triangle(W - 34, 92, 0, 0, 18, 11, 0, 22, 0xff7ec0).setDepth(48).setInteractive({ useHandCursor: true });
      let advanced = false; this.advIntro = () => { if (advanced) return; advanced = true; this.endIntro(); };
      this.skipBtn.on("pointerdown", this.advIntro); this.skipChev.on("pointerdown", this.advIntro);
      this.voice("bk_intro", this.advIntro);
      this.time.delayedCall(18000, this.advIntro);
    }
    endIntro() {
      this.markSeen();
      if (window.KMEAudio) KMEAudio.stopAll();
      [this.skipBtn, this.skipChev].forEach((o) => { if (o) o.destroy(); }); this.skipBtn = null; this.skipChev = null;
      if (this.introBob) this.introBob.stop();
      this.tweens.add({ targets: [this.introDim, this.introBg, this.introText], alpha: 0, duration: 420, onComplete: () => { [this.introDim, this.introBg, this.introText].forEach((o) => { if (o) o.destroy(); }); } });
      this.tweens.add({ targets: this.introBig, x: W / 2 + 10, y: 360, scaleX: 0.9, scaleY: 0.9, duration: 600, ease: "Cubic.inOut", onComplete: () => { if (this.introBig) { this.introBig.destroy(); this.introBig = null; } this.startPlay(); } });
    }
  }

  let booted = false;
  function boot() { if (booted) return; booted = true; new Phaser.Game({ type: Phaser.CANVAS, parent: "game", backgroundColor: "#160a26", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: [Play] }); }
  if (document.fonts && document.fonts.load) { Promise.all([document.fonts.load('800 30px "Baloo 2"'), document.fonts.load('700 22px "Zen Maru Gothic"')]).then(boot, boot); setTimeout(boot, 1500); } else boot();
})();
