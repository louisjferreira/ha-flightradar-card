/* FlightRadar Card loader / registration shim for Home Assistant. */
(function () {
  if (window.__FLIGHTRADAR_CARD_LOADED__) return;
  window.__FLIGHTRADAR_CARD_LOADED__ = true;
  const version = "1.1.0-dev";
  (async () => {
    try {
      await import(`/flightradar_card/flightradar-card.js?v=${version}`);
      await import(`/flightradar_card/card-fix.js?v=${version}`);
      await import(`/flightradar_card/map-controls.js?v=${version}`);
    } catch (error) {
      console.error("[FlightRadar Card] Failed to load card:", error);
    }
  })();
})();
