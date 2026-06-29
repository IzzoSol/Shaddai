/* SHADDAI PWA registration — tiny, silent on failure. */
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      try {
        navigator.serviceWorker.register('/sw.js').catch(function () {
          /* registration failed — ignore silently */
        });
      } catch (e) {
        /* serviceWorker unavailable — ignore silently */
      }
    });
  }
})();
