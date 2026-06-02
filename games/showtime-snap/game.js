// Showtime Snap (present continuous -ing) - Phaser 3. A Pokemon-Snap photo game. tral the
// opera director runs a stage of creatures, each doing a different -ing action (sleeping,
// eating, singing, crying, jumping, dancing, running). tral calls one in ENGLISH ("is
// dancing"); PAN the camera across the stage, frame that creature in the viewfinder, and tap
// the SHUTTER. Right action photographed = a great shot; wrong = blurry. The English -ing verb
// is the only cue, so reading it is the game. Japanese is tral's how-to / flair only (A2).
"use strict";
(function () {
  const W = 760, H = 1200, STAGEW = 1560;
  const FLOORY = 742, RETX = W / 2, RETY = 624, RHW = 116, RHH = 132;   // reticle box (half w/h)
  const CAMMAX = STAGEW - W;             // max camX
  const WIN = 6, LIVES = 3;
  const CREATURES = ["cat", "dog", "bird", "fish", "mouse", "sheep"];
  const NAMES = { cat: "cat", dog: "dog", bird: "bird", fish: "fish", mouse: "mouse", sheep: "sheep" };
  const ACTIONS = ["sleeping", "eating", "singing", "crying", "jumping", "dancing", "running",
    "laughing", "smiling", "thinking", "drinking", "studying", "talking", "playing", "cooking"];
  const SPOTS = [400, 660, 920, 1180];   // 4 stage marks, each reachable by the centre reticle across the pan
  const SWITCH_MIN = 2400, SWITCH_MAX = 4200;   // a performer changes its action every few seconds

  const Sfx = {
    ctx: null,
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    tone(f0, f1, dur, type, gain) { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); g.gain.setValueAtTime(gain || 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur); },
    noise(dur, gain, freq) { if (!this.ctx) return; const t = this.ctx.currentTime, b = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq || 1200; const g = this.ctx.createGain(); g.gain.setValueAtTime(gain || 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f).connect(g).connect(this.ctx.destination); s.start(t); s.stop(t + dur); },
    shutter() { this.noise(0.05, 0.18, 5000); this.tone(900, 500, 0.05, "square", 0.06); },
    good() { [0, 90, 180].forEach((d, i) => setTimeout(() => this.tone(620 + i * 180, 980 + i * 180, 0.16, "triangle", 0.16), d)); },
    bad() { this.tone(360, 130, 0.32, "square", 0.14); },
    win() { [0, 120, 240, 380].forEach((d, i) => setTimeout(() => this.tone(620 + i * 160, 980 + i * 160, 0.2, "triangle", 0.16), d)); },
    lose() { this.tone(420, 110, 0.5, "sawtooth", 0.16); }
  };

  class Play extends Phaser.Scene {
    constructor() { super("play"); }
    preload() {
      CREATURES.forEach((k) => this.load.svg(k, "assets/" + k + ".svg", { width: 150, height: 155 }));
      this.load.svg("tral", "assets/tral.svg", { width: 150, height: 134 });
      this.load.svg("heart", "assets/heart.svg", { width: 46, height: 42 });
      ["zzz", "note", "tear", "onigiri", "jumparrow", "laugh", "smile", "think", "cup", "book", "speech", "ball", "pot"].forEach((k) => this.load.svg(k, "assets/" + k + ".svg", { width: 54, height: 54 }));
      ["p_spark", "p_star", "p_puff"].forEach((k) => this.load.svg(k, "assets/" + k + ".svg", { width: 46, height: 46 }));
    }
    create() {
      this.cleared = 0; this.lives = LIVES; this.voices = {}; this.playStarted = false; this.actors = []; this.cur = null;
      if (window.KMEAudio) { KMEAudio.setBase("assets/").stopAll(); KMEAudio.register(ACTIONS.map((a) => "en_" + a).concat(["ts_intro"])); }
      this.camX = 0; this.panning = false; this.busy = false; this.shotsAllowed = true;

      this.buildBackdrop();
      this.stage = this.add.container(0, 0).setDepth(5);
      this.buildStageArt();
      this.buildMotes();
      this.buildViewfinder();
      this.buildHud();
      this.tral = this.add.image(92, 92, "tral").setScale(0.62).setDepth(40).setVisible(false);
      this.buildShutter();

      this.input.on("pointerdown", (p) => { Sfx.init(); if (this.state === "play" && !this.overShutter(p) && !this.busy) { this.panning = true; this.panSX = p.x; this.panC0 = this.camX; } });
      this.input.on("pointermove", (p) => { if (this.panning) { this.camX = Phaser.Math.Clamp(this.panC0 - (p.x - this.panSX), 0, CAMMAX); this.stage.x = -this.camX; } });
      this.input.on("pointerup", () => { this.panning = false; });

      const q = new URLSearchParams(location.search);
      if (q.has("cap")) { this.cap = true; this.markSeen(); this.tral.setVisible(true); this.capSetup(q); }
      else this.showTitle();
    }

    buildBackdrop() {
      if (!this.textures.exists("ssbg")) {
        const tex = this.textures.createCanvas("ssbg", W, H), cx = tex.getContext();
        const g = cx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#3a1430"); g.addColorStop(0.5, "#2a0f26"); g.addColorStop(1, "#160817");
        cx.fillStyle = g; cx.fillRect(0, 0, W, H);
        cx.globalAlpha = 1; const v = cx.createRadialGradient(W / 2, H * 0.4, H * 0.2, W / 2, H * 0.4, H * 0.62); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(8,2,10,0.5)"); cx.fillStyle = v; cx.fillRect(0, 0, W, H);
        tex.refresh();
      }
      if (!this.textures.exists("glow")) {
        const t = this.textures.createCanvas("glow", 128, 128), c = t.getContext();
        const rg = c.createRadialGradient(64, 64, 0, 64, 64, 64); rg.addColorStop(0, "rgba(255,232,168,0.95)"); rg.addColorStop(0.45, "rgba(255,212,120,0.4)"); rg.addColorStop(1, "rgba(255,200,110,0)");
        c.fillStyle = rg; c.fillRect(0, 0, 128, 128); t.refresh();
      }
      this.add.image(0, 0, "ssbg").setOrigin(0).setDepth(0);
    }
    buildStageArt() {
      // a wide theatre that scrolls with the camera: draped curtain swags, layered back wall, wood floor, glowing footlights
      const g = this.add.graphics(); this.stage.add(g);
      g.fillStyle(0x231126, 1); g.fillRect(0, 0, STAGEW, FLOORY);                                  // far wall
      g.fillStyle(0x301736, 1); g.fillRect(0, 150, STAGEW, FLOORY - 150);                           // nearer wall band (depth)
      // a few soft spotlight pools high on the back wall
      for (let x = 240; x < STAGEW; x += 360) { const sp = this.add.image(x, 230, "glow").setScale(2.2, 1.4).setAlpha(0.16).setBlendMode(Phaser.BlendModes.ADD); this.stage.add(sp); }
      g.fillStyle(0x7a1c30, 1); g.fillRect(0, 0, STAGEW, 38);                                       // curtain rail
      const SW = 152, R = 92;                                                                       // draped swags along the rail
      for (let cx = 0; cx <= STAGEW + SW; cx += SW) {
        g.fillStyle(0x5a1626, 1); g.slice(cx, 36, R, 0, Math.PI, false); g.fillPath();
        g.fillStyle(0x7c2036, 1); g.slice(cx, 30, R * 0.88, 0, Math.PI, false); g.fillPath();
        g.fillStyle(0x9c2c46, 1); g.slice(cx, 24, R * 0.74, 0, Math.PI, false); g.fillPath();
        g.fillStyle(0xbc4060, 0.5); g.slice(cx, 16, R * 0.46, 0, Math.PI, false); g.fillPath();     // fold highlight
      }
      for (let x = SW / 2; x <= STAGEW; x += SW) {                                                  // gold tassels at the swag seams
        const ta = this.add.graphics(); ta.fillStyle(0xffd24d, 1); ta.fillCircle(x, 118, 7); ta.fillStyle(0xffe9a0, 1); ta.fillCircle(x - 2, 116, 3); ta.fillStyle(0xb88a14, 1); ta.fillRect(x - 2, 122, 4, 14); this.stage.add(ta);
      }
      // festoon string-lights strung below the valance: a warm row across the dark upper stage
      const wire = this.add.graphics(); this.stage.add(wire); const hang = 150, span = 176, sag = 34;
      wire.lineStyle(3, 0x180c12, 0.9);
      for (let x = -span; x < STAGEW + span; x += span) { wire.beginPath(); wire.moveTo(x, hang); wire.lineTo(x + span / 2, hang + sag); wire.lineTo(x + span, hang); wire.strokePath(); }
      const bulbCols = [0xffd86a, 0xff9a6a, 0x8ad2ff, 0xff9ad2]; let bi = 0;
      for (let x = 0; x < STAGEW; x += span / 4) {
        const seg = ((x % span) + span) % span / span, ly = hang + sag * (1 - Math.abs(seg - 0.5) * 2) + 9, col = bulbCols[bi % bulbCols.length];
        const b = this.add.graphics(); b.fillStyle(col, 1); b.fillCircle(x, ly, 6); b.fillStyle(0xffffff, 0.55); b.fillCircle(x - 2, ly - 2, 2.2); this.stage.add(b);
        if (bi % 2 === 0) { const gl = this.add.image(x, ly, "glow").setScale(0.42).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setTint(col); this.stage.add(gl); }
        bi++;
      }
      const floor = this.add.graphics(); this.stage.add(floor);
      floor.fillStyle(0x5a3a26, 1); floor.fillRect(0, FLOORY, STAGEW, H - FLOORY);
      floor.fillStyle(0x6e4a30, 1); floor.fillRect(0, FLOORY, STAGEW, 12);
      floor.fillStyle(0x8a6442, 0.5); floor.fillRect(0, FLOORY, STAGEW, 3);                          // lit lip
      for (let x = 0; x < STAGEW; x += 130) { floor.lineStyle(2, 0x3f2818, 0.6); floor.lineBetween(x, FLOORY, x, H); }
      for (let x = 60; x < STAGEW; x += 130) {                                                       // footlights: warm glow rising off the lip, housings below
        const gl = this.add.image(x, FLOORY - 26, "glow").setScale(0.95, 1.15).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD); this.stage.add(gl);
        const hz = this.add.graphics(); hz.fillStyle(0x2a1a16, 1); hz.fillRoundedRect(x - 13, FLOORY - 7, 26, 13, 4); hz.fillStyle(0xffe6a0, 1); hz.fillCircle(x, FLOORY - 1, 4); this.stage.add(hz);
      }
    }
    buildMotes() {
      // slow warm dust drifting through the stage air (ambient depth, screen-fixed)
      for (let i = 0; i < 11; i++) {
        const m = this.add.image(Phaser.Math.Between(20, W - 20), Phaser.Math.Between(180, 560), "glow").setScale(Phaser.Math.FloatBetween(0.08, 0.2)).setAlpha(Phaser.Math.FloatBetween(0.12, 0.26)).setBlendMode(Phaser.BlendModes.ADD).setDepth(6).setTint(0xffe6b0);
        this.tweens.add({ targets: m, y: m.y - Phaser.Math.Between(40, 100), x: m.x + Phaser.Math.Between(-34, 34), alpha: 0.04, duration: Phaser.Math.Between(4200, 8200), delay: Phaser.Math.Between(0, 2600), repeat: -1, yoyo: true, ease: "Sine.inOut" });
      }
    }
    buildViewfinder() {
      this.vf = this.add.graphics().setDepth(30);
      this.vf.fillStyle(0x000000, 0.28);   // dim outside the frame; performers stay readable so you can watch for the action
      this.vf.fillRect(0, 0, W, RETY - RHH); this.vf.fillRect(0, RETY + RHH, W, H - (RETY + RHH));
      this.vf.fillRect(0, RETY - RHH, RETX - RHW, RHH * 2); this.vf.fillRect(RETX + RHW, RETY - RHH, W - (RETX + RHW), RHH * 2);
      const L = 40;
      this.vf.lineStyle(8, 0x10060f, 0.45);   // bracket shadow
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => { const cx = RETX + sx * RHW + 2, cy = RETY + sy * RHH + 2; this.vf.lineBetween(cx, cy, cx - sx * L, cy); this.vf.lineBetween(cx, cy, cx, cy - sy * L); });
      this.vf.lineStyle(7, 0xffffff, 0.98);   // bright corner brackets
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => { const cx = RETX + sx * RHW, cy = RETY + sy * RHH; this.vf.lineBetween(cx, cy, cx - sx * L, cy); this.vf.lineBetween(cx, cy, cx, cy - sy * L); });
      this.vf.lineStyle(3, 0xff6a6a, 0.85); this.vf.strokeCircle(RETX, RETY, 26);   // focus ring + ticks + dot
      this.vf.lineStyle(2.5, 0xff6a6a, 0.9); this.vf.lineBetween(RETX - 22, RETY, RETX - 9, RETY); this.vf.lineBetween(RETX + 9, RETY, RETX + 22, RETY); this.vf.lineBetween(RETX, RETY - 22, RETX, RETY - 9); this.vf.lineBetween(RETX, RETY + 9, RETX, RETY + 22);
      this.vf.fillStyle(0xff6a6a, 0.9); this.vf.fillCircle(RETX, RETY, 3);
    }
    buildHud() {
      const bar = this.add.graphics().setDepth(31); bar.fillStyle(0x160817, 0.85); bar.fillRoundedRect(8, 8, W - 16, 50, 16);
      this.hud = this.add.text(20, 17, "", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "23px", color: "#ffe08a", fontStyle: "700" }).setDepth(32);
      this.hearts = []; for (let i = 0; i < LIVES; i++) this.hearts.push(this.add.image(W - 30 - i * 46, 33, "heart").setOrigin(1, 0.5).setDepth(32));
      const pw = 372, ph = 66, py = 156;
      this.promptPlate = this.add.graphics().setDepth(32).setVisible(false);
      this.promptPlate.fillStyle(0x3a1430, 0.92); this.promptPlate.fillRoundedRect(W / 2 - pw / 2, py - ph / 2, pw, ph, 20);
      this.promptPlate.lineStyle(4, 0xffd24d, 1); this.promptPlate.strokeRoundedRect(W / 2 - pw / 2, py - ph / 2, pw, ph, 20);
      this.prompt = this.add.text(W / 2, py, "", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "46px", color: "#fff", fontStyle: "800" }).setOrigin(0.5).setDepth(33).setStroke("#3a1430", 6).setVisible(false);
      this.updateHud();
    }
    updateHud() { this.hud.setText("写真 " + this.cleared + " / " + WIN); this.hearts.forEach((h, i) => { const on = i < this.lives; h.setTint(on ? 0xffffff : 0x5a4a58).setAlpha(on ? 1 : 0.5); }); }
    buildShutter() {
      const x = W / 2, y = H - 92; this.shX = x; this.shY = y; this.shR = 56;
      const g = this.add.graphics().setDepth(34);
      g.fillStyle(0x10070f, 0.7); g.fillCircle(x, y + 6, this.shR + 12);     // drop shadow
      g.fillStyle(0xf3f3f6, 1); g.fillCircle(x, y, this.shR + 8);            // outer white ring
      g.fillStyle(0xcdcdd6, 1); g.fillCircle(x, y, this.shR - 1);            // recessed ring shade
      g.fillStyle(0xd83a4e, 1); g.fillCircle(x, y, this.shR - 12);          // red base
      g.fillStyle(0xff6676, 1); g.fillCircle(x, y - 4, this.shR - 18);       // lighter top (fake gradient)
      g.fillStyle(0xffffff, 0.85); g.fillCircle(x - 14, y - 16, 8);          // hotspot
      this.add.text(x, y + this.shR + 22, "シャッター", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "18px", color: "#ffd2ec", fontStyle: "700" }).setOrigin(0.5).setDepth(34);
      this.shutterBtn = g;
      this.add.zone(x, y, (this.shR + 12) * 2, (this.shR + 12) * 2).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(35).on("pointerdown", () => this.snap());
    }
    overShutter(p) { return Math.hypot(p.x - this.shX, p.y - this.shY) < this.shR + 16; }

    // ---------- scene / actors ----------
    clearScene() {
      this.actors.forEach((a) => { if (a.switchEv) a.switchEv.remove(); this.tweens.killTweensOf(a.spr); a.fx.forEach((f) => { this.tweens.killTweensOf(f); f.destroy(); }); a.spr.destroy(); });
      this.actors = [];
    }
    genScene() {
      this.clearScene();
      const acts = Phaser.Utils.Array.Shuffle(ACTIONS.slice()).slice(0, SPOTS.length);
      const crs = Phaser.Utils.Array.Shuffle(CREATURES.slice());
      SPOTS.forEach((wx, i) => this.makeActor(wx, crs[i % crs.length], acts[i]));
      this.camX = 0; this.stage.x = 0; this.busy = false; this.lastCur = null; this.rewardDone = null;
      this.newPrompt();
    }
    makeActor(wx, ck, action) {
      const spr = this.add.image(wx, FLOORY, ck).setOrigin(0.5, 1); this.stage.add(spr);
      const a = { spr, ck, action: null, wx, tw: [], fx: [], switchEv: null, inited: false };
      this.actors.push(a);
      this.setAction(a, action); a.inited = true;
      const sched = () => { a.switchEv = this.time.delayedCall(Phaser.Math.Between(SWITCH_MIN, SWITCH_MAX), () => { this.cycleActor(a); if (this.state === "play") sched(); }); };
      sched();
      return a;
    }
    anyDoing(action) { return this.actors.some((a) => a.action === action); }
    isFramed(a) { return Math.abs(a.wx - this.camX - RETX) < RHW; }   // performer sits inside the viewfinder box
    setAction(a, action) {
      this.tweens.killTweensOf(a.spr);
      a.fx.forEach((f) => { this.tweens.killTweensOf(f); f.destroy(); }); a.fx = []; a.tw = [];
      a.spr.setAngle(0).setScale(1).setPosition(a.wx, FLOORY);
      a.action = action; this.animate(a);
      if (a.inited) { a.spr.setAlpha(0.4); this.tweens.add({ targets: a.spr, alpha: 1, duration: 170, ease: "Quad.out" }); }   // brief blink as the performer changes
    }
    cycleActor(a) {
      if (this.state !== "play" || !this.cur) return;
      if (this.isFramed(a)) return;   // never change a performer the player is framing; it would yank the answer away mid-aim
      let next;
      if (!this.anyDoing(this.cur)) next = this.cur;   // keep the called action present on stage so it stays catchable
      else { do { next = ACTIONS[Phaser.Math.Between(0, ACTIONS.length - 1)]; } while (next === a.action); }
      this.setAction(a, next);
    }
    newPrompt() {
      let c; do { c = ACTIONS[Phaser.Math.Between(0, ACTIONS.length - 1)]; } while (c === this.lastCur);
      this.cur = c; this.lastCur = c;
      this.prompt.setText("is " + c).setVisible(true).setScale(0.6); this.promptPlate.setVisible(true);
      this.tweens.add({ targets: this.prompt, scale: 1, duration: 240, ease: "Back.out" });
      this.queueVoice("en_" + c);   // wait for the "The dog is eating!" reward line to finish before the next call
      // surface the called action promptly, then it comes and goes as performers keep cycling (watch for the moment)
      if (!this.anyDoing(c)) this.time.delayedCall(800, () => { if (this.state === "play" && !this.anyDoing(this.cur)) { const free = this.actors.filter((a) => !this.isFramed(a)), pool = free.length ? free : this.actors; this.setAction(pool[Phaser.Math.Between(0, pool.length - 1)], this.cur); } });
    }
    queueVoice(key) { this.voice(key); }   // the audio bus serializes, so this queues behind any reward line already playing
    animate(a) {
      const s = a.spr, x = a.wx, hy = FLOORY - 150;   // hy = top of the actor
      const cueSpr = (key, ox, oy, tint, sc) => { const c = this.add.image(x + ox, hy + oy, key).setScale(sc || 0.6); if (tint) c.setTint(tint); this.stage.add(c); a.fx.push(c); return c; };
      switch (a.action) {
        case "sleeping": {
          s.setAngle(12); a.tw.push(this.tweens.add({ targets: s, scaleY: 0.95, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          const z = cueSpr("zzz", 34, -12, null, 0.62); a.tw.push(this.tweens.add({ targets: z, y: z.y - 24, alpha: 0.35, duration: 1100, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          break;
        }
        case "eating": {
          const o = cueSpr("onigiri", 26, 86, null, 0.74); a.tw.push(this.tweens.add({ targets: s, scaleY: 0.9, duration: 230, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          a.tw.push(this.tweens.add({ targets: o, y: o.y - 7, duration: 230, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          break;
        }
        case "singing": {
          a.tw.push(this.tweens.add({ targets: s, y: FLOORY - 14, angle: 5, duration: 520, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          const n = cueSpr("note", 38, -2, null, 0.64); a.tw.push(this.tweens.add({ targets: n, y: n.y - 18, angle: 18, duration: 720, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          const n2 = cueSpr("note", -36, -20, null, 0.58); a.tw.push(this.tweens.add({ targets: n2, y: n2.y - 14, angle: -16, duration: 860, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          break;
        }
        case "crying": {
          a.tw.push(this.tweens.add({ targets: s, angle: 4, duration: 200, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          const t1 = cueSpr("tear", -24, 70, null, 0.5); a.tw.push(this.tweens.add({ targets: t1, y: t1.y + 36, alpha: 0.2, duration: 650, repeat: -1, ease: "Quad.in" }));
          const t2 = cueSpr("tear", 24, 66, null, 0.5); a.tw.push(this.tweens.add({ targets: t2, y: t2.y + 36, alpha: 0.2, duration: 650, delay: 320, repeat: -1, ease: "Quad.in" }));
          break;
        }
        case "jumping": {
          a.tw.push(this.tweens.add({ targets: s, y: FLOORY - 84, duration: 440, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          const ar = cueSpr("jumparrow", 0, -36, null, 0.6); a.tw.push(this.tweens.add({ targets: ar, y: ar.y - 22, alpha: 0.35, duration: 440, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          break;
        }
        case "dancing": {
          a.tw.push(this.tweens.add({ targets: s, angle: 16, duration: 420, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          a.tw.push(this.tweens.add({ targets: s, x: x + 16, duration: 420, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          const sp = cueSpr("p_star", 44, -8, 0xffd24d, 0.8); a.tw.push(this.tweens.add({ targets: sp, angle: 360, duration: 1100, repeat: -1, ease: "Linear" }));
          const sp2 = cueSpr("p_spark", -42, 8, 0x9be7ff, 0.58); a.tw.push(this.tweens.add({ targets: sp2, scale: 0.3, alpha: 0.5, duration: 520, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          break;
        }
        case "running": {
          s.setAngle(14); a.tw.push(this.tweens.add({ targets: s, y: FLOORY - 12, duration: 140, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          a.tw.push(this.tweens.add({ targets: s, x: x + 10, duration: 140, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          const d = cueSpr("p_puff", -52, 64, 0xe8d2a0, 0.82); a.tw.push(this.tweens.add({ targets: d, x: d.x - 22, scaleX: 1.1, alpha: 0.32, duration: 340, yoyo: true, repeat: -1, ease: "Quad.out" }));
          const d2 = cueSpr("p_puff", -40, 34, 0xe8d2a0, 0.55); a.tw.push(this.tweens.add({ targets: d2, x: d2.x - 26, alpha: 0.18, duration: 300, delay: 150, yoyo: true, repeat: -1, ease: "Quad.out" }));
          break;
        }
        case "laughing": {
          s.setAngle(-6); a.tw.push(this.tweens.add({ targets: s, y: FLOORY - 9, angle: 7, duration: 175, yoyo: true, repeat: -1, ease: "Sine.inOut" }));   // hearty belly-laugh rock
          const m = cueSpr("laugh", 40, -12, null, 0.9); a.tw.push(this.tweens.add({ targets: m, scale: 1.04, y: m.y - 8, duration: 220, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          break;
        }
        case "smiling": {
          a.tw.push(this.tweens.add({ targets: s, y: FLOORY - 6, duration: 950, yoyo: true, repeat: -1, ease: "Sine.inOut" }));   // content gentle bob
          const m = cueSpr("smile", 40, -10, null, 0.86); a.tw.push(this.tweens.add({ targets: m, scale: 0.74, duration: 740, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          break;
        }
        case "thinking": {
          a.tw.push(this.tweens.add({ targets: s, angle: 5, duration: 1300, yoyo: true, repeat: -1, ease: "Sine.inOut" }));   // slow contemplative sway
          const b = cueSpr("think", 42, -24, null, 0.8); a.tw.push(this.tweens.add({ targets: b, y: b.y - 10, duration: 1300, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          break;
        }
        case "drinking": {
          a.tw.push(this.tweens.add({ targets: s, angle: -9, duration: 760, yoyo: true, repeat: -1, ease: "Sine.inOut" }));   // tip back to sip
          const c = cueSpr("cup", 24, 32, null, 0.82); a.tw.push(this.tweens.add({ targets: c, y: c.y - 6, angle: -12, duration: 760, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          break;
        }
        case "studying": {
          a.tw.push(this.tweens.add({ targets: s, y: FLOORY - 6, angle: 3, duration: 620, yoyo: true, repeat: -1, ease: "Sine.inOut" }));   // reading nod
          const bk = cueSpr("book", 20, 64, null, 0.86); a.tw.push(this.tweens.add({ targets: bk, y: bk.y - 4, duration: 620, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          break;
        }
        case "talking": {
          a.tw.push(this.tweens.add({ targets: s, y: FLOORY - 8, duration: 360, yoyo: true, repeat: -1, ease: "Sine.inOut" }));   // chatty bob
          const sp = cueSpr("speech", 40, -16, null, 0.8); a.tw.push(this.tweens.add({ targets: sp, scaleX: 0.72, scaleY: 0.7, duration: 300, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          break;
        }
        case "playing": {
          a.tw.push(this.tweens.add({ targets: s, x: x + 12, duration: 300, yoyo: true, repeat: -1, ease: "Sine.inOut" }));   // playful side wiggle
          a.tw.push(this.tweens.add({ targets: s, angle: -8, duration: 300, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          const bl = cueSpr("ball", 42, 34, null, 0.7); a.tw.push(this.tweens.add({ targets: bl, y: bl.y - 44, duration: 420, yoyo: true, repeat: -1, ease: "Quad.out" }));
          a.tw.push(this.tweens.add({ targets: bl, angle: 16, duration: 210, yoyo: true, repeat: -1, ease: "Sine.inOut" }));
          break;
        }
        case "cooking": {
          a.tw.push(this.tweens.add({ targets: s, angle: 5, x: x + 6, duration: 380, yoyo: true, repeat: -1, ease: "Sine.inOut" }));   // stirring rock
          cueSpr("pot", 20, 66, null, 0.92);
          const st = cueSpr("p_puff", 22, 34, 0xffffff, 0.42); a.tw.push(this.tweens.add({ targets: st, y: st.y - 28, alpha: 0.08, scale: 0.62, duration: 920, repeat: -1, ease: "Quad.out" }));
          const st2 = cueSpr("p_puff", 8, 38, 0xffffff, 0.34); a.tw.push(this.tweens.add({ targets: st2, y: st2.y - 24, alpha: 0.06, scale: 0.5, duration: 1020, delay: 460, repeat: -1, ease: "Quad.out" }));
          break;
        }
      }
    }

    snap() {
      if (this.state !== "play" || this.busy || !this.shotsAllowed) return;
      this.shutterFx();
      // who is in the reticle? nearest actor to centre within the frame's half-width
      let best = null, bd = RHW;
      for (const a of this.actors) { const sx = a.spr.x + this.stage.x; if (Math.abs(sx - RETX) < bd) { bd = Math.abs(sx - RETX); best = a; } }
      if (!best) { this.flash(0xffffff, 0.25); this.toast("だれも いない！", "#cfeaff"); return; }   // empty frame: no penalty
      this.busy = true;
      if (best.action === this.cur) { this.correct(best); } else { this.wrong(best); }
    }
    shutterFx() { Sfx.shutter(); this.tweens.add({ targets: this.shutterBtn, scaleX: 0.9, scaleY: 0.9, duration: 70, yoyo: true }); }
    flash(color, alpha) { const f = this.add.rectangle(0, 0, W, H, color, alpha).setOrigin(0).setDepth(45); this.tweens.add({ targets: f, alpha: 0, duration: 220, onComplete: () => f.destroy() }); }
    correct(a) {
      Sfx.good(); this.flash(0xffffff, 0.6); this.rewardDone = this.voice("full_" + a.ck + "_" + this.cur); this.cleared++; this.updateHud();
      if (this.tral) this.tweens.add({ targets: this.tral, scaleX: 0.7, scaleY: 0.7, duration: 140, yoyo: true });
      // a polaroid pops from the reticle and flies to the counter
      const sx = a.spr.x + this.stage.x;
      const photo = this.add.container(sx, RETY).setDepth(46);
      const fr = this.add.graphics(); fr.fillStyle(0xffffff, 1); fr.fillRoundedRect(-56, -56, 112, 128, 8); photo.add(fr);
      const pic = this.add.image(0, -16, a.spr.texture.key).setScale(0.48); photo.add(pic);
      const star = this.add.text(0, 46, "The " + NAMES[a.ck] + "\nis " + this.cur + "!", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "15px", color: "#3a1430", fontStyle: "800", align: "center", lineSpacing: 2 }).setOrigin(0.5); photo.add(star);
      this.toast("ベリッシモ！", "#ffd24d");
      this.tweens.add({ targets: photo, x: W - 80, y: 30, scale: 0.3, angle: 12, duration: 620, ease: "Cubic.in", onComplete: () => {
        photo.destroy();
        if (this.cleared >= WIN) return this.win();
        // hold the next prompt until "The dog is eating!" has finished playing
        const reward = this.rewardDone || Promise.resolve(); this.rewardDone = null;
        const beat = new Promise((r) => this.time.delayedCall(250, r));
        Promise.all([reward, beat]).then(() => { if (this.state === "play") { this.busy = false; this.newPrompt(); } });
      } });
    }
    wrong(a) {
      Sfx.bad(); this.flash(0xffffff, 0.5); this.cameras.main.shake(180, 0.01); this.lives--; this.updateHud();
      this.toast("ブレてる！", "#ff8a8a");
      this.time.delayedCall(700, () => { if (this.lives <= 0) this.lose(); else { this.busy = false; } });   // keep the same scene; try again
    }
    toast(txt, color) { const t = this.add.text(W / 2, RETY - RHH - 26, txt, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "34px", color: color, fontStyle: "800" }).setOrigin(0.5).setDepth(47).setStroke("#160817", 6).setScale(0.6); this.tweens.add({ targets: t, scale: 1, duration: 200, ease: "Back.out", yoyo: true, hold: 600, onComplete: () => t.destroy() }); }

    // ---------- title / intro / voice ----------
    introNeeded() { try { return !localStorage.getItem("ss_intro_seen"); } catch (e) { return true; } }
    markSeen() { try { localStorage.setItem("ss_intro_seen", "1"); } catch (e) {} }
    showTitle() {
      this.state = "title"; this.titleStarted = false;
      const dim = this.add.graphics().setDepth(60); dim.fillStyle(0x160817, 0.55); dim.fillRect(0, 0, W, H);
      const host = this.add.image(W / 2, H * 0.34, "tral").setScale(1.4).setDepth(62);
      this.titleBob = this.tweens.add({ targets: host, y: H * 0.34 - 14, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const t1 = this.add.text(W / 2, H * 0.55, "ショータイム スナップ", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "40px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5).setDepth(62).setStroke("#3a1430", 7);
      const t2 = this.add.text(W / 2, H * 0.55 + 44, "Showtime Snap", { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "26px", color: "#ffd2ec", fontStyle: "700" }).setOrigin(0.5).setDepth(62).setStroke("#3a1430", 5);
      const bw = 300, bh = 92, bx = W / 2, by = H * 0.72;
      const bg = this.add.graphics().setDepth(62); bg.fillStyle(0xff5a8a, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26); bg.lineStyle(6, 0xb52e63, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 26);
      const tri = this.add.triangle(bx - 58, by, 0, 0, 26, 16, 0, 32, 0xffffff).setDepth(63);
      this.add.text(bx + 14, by, "あそぶ", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "34px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(63).setStroke("#3a1430", 5);
      this.titlePulse = this.tweens.add({ targets: bg, alpha: 0.7, duration: 650, yoyo: true, repeat: -1 });
      this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(64).on("pointerdown", () => this.startFromTitle());
    }
    startFromTitle() {
      if (this.titleStarted) return; this.titleStarted = true; Sfx.init(); if (window.KMEAudio) KMEAudio.unlock();
      if (this.titleBob) this.titleBob.stop(); if (this.titlePulse) this.titlePulse.stop();
      this.children.list.filter((o) => o.depth >= 60 && o.depth < 65).forEach((o) => o.destroy());
      if (this.introNeeded()) this.startIntro(); else { this.markSeen(); this.tral.setVisible(true); this.startPlay(); }
    }
    startIntro() {
      this.state = "intro";
      this.introDim = this.add.graphics().setDepth(45); this.introDim.fillStyle(0x160817, 0.64); this.introDim.fillRect(0, 0, W, H);
      this.introBig = this.add.image(W / 2, H * 0.38, "tral").setScale(1.5).setDepth(47);
      this.introBob = this.tweens.add({ targets: this.introBig, y: H * 0.38 - 16, duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      const bx = W / 2, by = H * 0.64;
      this.introBg = this.add.graphics().setDepth(46); this.introBg.fillStyle(0xffffff, 0.97); this.introBg.fillRoundedRect(bx - 332, by - 104, 664, 208, 24); this.introBg.lineStyle(5, 0xb52e63, 1); this.introBg.strokeRoundedRect(bx - 332, by - 104, 664, 208, 24); this.introBg.fillTriangle(bx - 18, by + 102, bx + 18, by + 102, bx, by + 132);
      this.introText = this.add.text(bx, by, "チャオ！ えんしゅつか の トララ だ！\nみんな つぎつぎ うごき を かえる ぞ！\nわし が いう うごき の コ を ねらって\nファインダー に いれて シャッター！ ベリッシモ！", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "24px", color: "#3a1430", fontStyle: "700", align: "center", lineSpacing: 8 }).setOrigin(0.5).setDepth(47);
      this.skipBtn = this.add.text(W - 56, 92, "スキップ", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "24px", color: "#ffd2ec", fontStyle: "700" }).setOrigin(1, 0.5).setDepth(48).setInteractive({ useHandCursor: true }).setStroke("#160817", 5);
      this.skipChev = this.add.triangle(W - 34, 92, 0, 0, 18, 11, 0, 22, 0xffd24d).setDepth(48).setInteractive({ useHandCursor: true });
      let advanced = false; this.advIntro = () => { if (advanced) return; advanced = true; this.endIntro(); };
      this.skipBtn.on("pointerdown", this.advIntro); this.skipChev.on("pointerdown", this.advIntro);
      this.voice("ts_intro", this.advIntro);   // advances when the clip actually ends
      this.time.delayedCall(20000, this.advIntro);   // safety net if audio is blocked
      this.time.delayedCall(18000, this.advIntro);
    }
    endIntro() {
      this.markSeen();
      if (window.KMEAudio) KMEAudio.stopAll();
      [this.skipBtn, this.skipChev].forEach((o) => { if (o) o.destroy(); }); this.skipBtn = null; this.skipChev = null;
      if (this.introBob) this.introBob.stop();
      this.tweens.add({ targets: [this.introDim, this.introBg, this.introText], alpha: 0, duration: 420, onComplete: () => { [this.introDim, this.introBg, this.introText].forEach((o) => { if (o) o.destroy(); }); } });
      this.tweens.add({ targets: this.introBig, x: 92, y: 92, scaleX: 0.62, scaleY: 0.62, duration: 600, ease: "Cubic.inOut", onComplete: () => { if (this.introBig) { this.introBig.destroy(); this.introBig = null; } this.tral.setVisible(true); } });
      this.time.delayedCall(700, () => this.startPlay());
    }
    voice(key, onEnd) {
      const p = window.KMEAudio ? KMEAudio.play(key) : Promise.resolve();
      if (onEnd) p.then(onEnd);
      return p;
    }
    startPlay() { if (this.playStarted) return; this.playStarted = true; this.state = "play"; this.genScene(); }

    win() {
      this.state = "over"; if (window.KMEFlow) KMEFlow.win(); Sfx.win(); this.flash(0xfff2c4, 0.5);
      this.tweens.add({ targets: this.tral, scaleX: 0.74, scaleY: 0.74, duration: 180, yoyo: true, repeat: 3 });
      this.time.delayedCall(700, () => this.panel("ベリッシモ！", "YOU WIN!"));
    }
    lose() { this.state = "over"; Sfx.lose(); this.cameras.main.shake(300, 0.012); this.time.delayedCall(500, () => this.panel("マンマミーア！", "GAME OVER")); }
    panel(titleJp, big) {
      const cy = H * 0.42;
      const p = this.add.graphics().setDepth(70); p.fillStyle(0x160817, 0.96); p.fillRoundedRect(W / 2 - 230, cy - 140, 460, 320, 28); p.lineStyle(6, 0xffd24d, 1); p.strokeRoundedRect(W / 2 - 230, cy - 140, 460, 320, 28);
      this.add.text(W / 2, cy - 76, titleJp, { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "38px", color: "#fff7f0", fontStyle: "700" }).setOrigin(0.5).setDepth(71).setStroke("#160817", 7);
      this.add.text(W / 2, cy + 2, big, { fontFamily: '"Baloo 2", "Arial Black", sans-serif', fontSize: "52px", color: "#ffd24d", fontStyle: "800" }).setOrigin(0.5).setDepth(71).setStroke("#160817", 7);
      const bw = 280, bh = 80, bx = W / 2, by = cy + 100;
      const bg = this.add.graphics().setDepth(71); bg.fillStyle(0xff5a8a, 1); bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 24); bg.lineStyle(5, 0xb52e63, 1); bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, 24);
      this.add.text(bx - 16, by, "もう いちど", { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: "30px", color: "#fff", fontStyle: "700" }).setOrigin(0.5).setDepth(72).setStroke("#160817", 5);
      this.add.triangle(bx + 88, by, 0, 0, 20, 12, 0, 24, 0xffffff).setDepth(72);
      this.add.zone(bx, by, bw, bh).setInteractive({ useHandCursor: true }).setDepth(73).on("pointerdown", () => this.scene.restart());
      this.tweens.add({ targets: bg, alpha: 0.7, duration: 700, yoyo: true, repeat: -1 });
    }

    capSetup(q) {
      this.state = "play"; this.playStarted = true; this.genScene();
      if (q.get("acts")) { q.get("acts").split(",").forEach((v, i) => { if (this.actors[i] && ACTIONS.indexOf(v) >= 0) this.setAction(this.actors[i], v); }); }
      if (q.get("cam")) { this.camX = Phaser.Math.Clamp(parseInt(q.get("cam")), 0, CAMMAX); this.stage.x = -this.camX; }
    }
  }

  let booted = false;
  function boot() { if (booted) return; booted = true; new Phaser.Game({ type: Phaser.CANVAS, parent: "game", backgroundColor: "#160817", audio: { disableWebAudio: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, scene: [Play] }); }
  if (document.fonts && document.fonts.load) { Promise.all([document.fonts.load('800 44px "Baloo 2"'), document.fonts.load('700 24px "Zen Maru Gothic"')]).then(boot, boot); setTimeout(boot, 1800); } else boot();
})();
