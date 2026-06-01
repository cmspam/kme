// Signals the embedding lesson flow (engine/game-launcher.js) that the game was
// cleared, so the next step in the course (the mock test) unlocks. A no-op when
// the game is opened on its own, so standalone play is unaffected.
(function () {
  "use strict";
  window.KMEFlow = {
    win: function (stars) {
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ kme: "win", stars: stars || 3 }, "*");
        }
      } catch (e) {}
    }
  };
})();
