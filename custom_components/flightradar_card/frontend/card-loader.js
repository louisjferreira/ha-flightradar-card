/* FlightRadar Card loader / registration shim for Home Assistant. */
(function () {
  if (window.__FLIGHTRADAR_CARD_LOADED__) return;
  window.__FLIGHTRADAR_CARD_LOADED__ = true;
  const version = "1.1.0-dev.7";
  (async () => {
    try {
      await import(`/flightradar_card/flightradar-card.js?v=${version}`);
      await import(`/flightradar_card/maplibre-base.js?v=${version}`);
      await import(`/flightradar_card/card-fix.js?v=${version}`);

      const Card = customElements.get("flightradar-card");
      if (Card?.prototype?._selectAircraft && !Card.__FLIGHTRADAR_AIRPORT_LOCK__) {
        const originalSelectAircraft = Card.prototype._selectAircraft;
        Card.prototype._selectAircraft = function (aircraft, _pan) {
          return originalSelectAircraft.call(this, aircraft, false);
        };
        Card.__FLIGHTRADAR_AIRPORT_LOCK__ = true;
      }
    } catch (error) {
      console.error("[FlightRadar Card] Failed to load card:", error);
    }
  })();
})();
