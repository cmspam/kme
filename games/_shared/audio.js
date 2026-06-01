// Shared audio bus for all games.
//
// Why this exists: lazily creating an Audio element at play time decodes late,
// fire-and-forget playback lets two clips overlap, and mobile browsers block
// audio until a user gesture. This bus preloads every clip, plays them one at a
// time through a serial queue, blesses each element inside the first gesture so
// playback is allowed, and resolves play() only once the clip has actually
// finished. Gameplay awaits that promise, so a round never starts and a prompt
// never advances before the sound the player needs has been heard.

(function () {
  "use strict";

  var Bus = {
    base: "assets/",
    els: {},            // key -> HTMLAudioElement
    readyP: {},         // key -> Promise<boolean> (resolved when decodable)
    chain: Promise.resolve(),
    unlocked: false,
    muted: false,

    setBase: function (b) { this.base = b; return this; },

    _el: function (key) {
      var a = this.els[key];
      if (a) return a;
      a = new Audio();
      a.preload = "auto";
      a.src = this.base + key + ".opus";
      this.els[key] = a;
      this.readyP[key] = new Promise(function (res) {
        if (a.readyState >= 3) return res(true);
        var settle = function (v) {
          a.removeEventListener("canplaythrough", ok);
          a.removeEventListener("loadeddata", ok);
          a.removeEventListener("error", bad);
          res(v);
        };
        var ok = function () { settle(true); };
        var bad = function () { settle(false); };
        a.addEventListener("canplaythrough", ok, { once: true });
        a.addEventListener("loadeddata", ok, { once: true });
        a.addEventListener("error", bad, { once: true });
        setTimeout(function () { settle(a.readyState >= 2); }, 5000);
      });
      try { a.load(); } catch (e) {}
      return a;
    },

    // Preload a list of clip keys so they are decoded before first use.
    register: function (keys) {
      for (var i = 0; i < keys.length; i++) this._el(keys[i]);
      // If the gesture already happened, bless the new elements too.
      if (this.unlocked) this._bless(keys);
      return this;
    },

    // Resolves when the given keys (or all registered) are ready to play.
    ready: function (keys) {
      var self = this;
      var ks = keys || Object.keys(this.els);
      return Promise.all(ks.map(function (k) {
        self._el(k);
        return self.readyP[k];
      }));
    },

    _bless: function (keys) {
      var self = this;
      keys.forEach(function (k) {
        var a = self.els[k];
        if (!a || a.__blessed) return;
        a.__blessed = true;
        try {
          a.muted = true;
          var p = a.play();
          var quiet = function () { try { a.pause(); a.currentTime = 0; } catch (e) {} a.muted = false; };
          if (p && p.then) p.then(quiet).catch(function () { a.muted = false; });
          else quiet();
        } catch (e) { a.muted = false; }
      });
    },

    // Call inside a real user gesture (the PLAY button). Blesses every
    // registered element so later programmatic playback is permitted.
    unlock: function () {
      this.unlocked = true;
      this._bless(Object.keys(this.els));
      return this;
    },

    setMuted: function (m) { this.muted = !!m; return this; },

    // Serial play: queues behind whatever is already playing, so clips never
    // overlap. Returns a promise that resolves when this clip ends (or on a
    // safety timeout, so the game is never stuck waiting on a blocked clip).
    play: function (key, opts) {
      var self = this;
      var run = function () { return self._playOne(key, opts || {}); };
      this.chain = this.chain.then(run, run);
      return this.chain;
    },

    _playOne: function (key, opts) {
      var self = this;
      if (this.muted) return Promise.resolve();
      var a = this._el(key);
      var waitReady = opts.nowait ? Promise.resolve(true) : this.readyP[key];
      return waitReady.then(function () {
        return new Promise(function (resolve) {
          var done = false;
          var t = null;
          var finish = function () {
            if (done) return;
            done = true;
            a.removeEventListener("ended", finish);
            a.removeEventListener("error", finish);
            if (t) clearTimeout(t);
            resolve();
          };
          a.addEventListener("ended", finish, { once: true });
          a.addEventListener("error", finish, { once: true });
          try { a.currentTime = 0; } catch (e) {}
          var pr;
          try { pr = a.play(); } catch (e) { finish(); return; }
          var dur = (isFinite(a.duration) && a.duration > 0) ? a.duration : 6;
          t = setTimeout(finish, (dur + 0.6) * 1000);
          if (pr && pr.catch) pr.catch(function () { finish(); });
        });
      });
    },

    // Duration in seconds if known (after metadata loads), else 0.
    duration: function (key) {
      var a = this.els[key];
      return (a && isFinite(a.duration) && a.duration > 0) ? a.duration : 0;
    },

    // Stop everything and clear the queue. Call on scene create/restart so a
    // stale queued clip from a previous run cannot fire into the new one.
    stopAll: function () {
      var keys = Object.keys(this.els);
      for (var i = 0; i < keys.length; i++) {
        try { this.els[keys[i]].pause(); } catch (e) {}
      }
      this.chain = Promise.resolve();
      return this;
    }
  };

  window.KMEAudio = Bus;
})();
