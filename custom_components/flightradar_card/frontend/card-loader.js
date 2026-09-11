/* FlightRadar Card loader / registration shim for Home Assistant. */
(function () {
  if (window.__FLIGHTRADAR_CARD_LOADED__) return;
  window.__FLIGHTRADAR_CARD_LOADED__ = true;
  const version = "1.1.0-dev.5";
  (async () => {
    try {
      await import(`/flightradar_card/flightradar-card.js?v=${version}`);
      await import(`/flightradar_card/card-fix.js?v=${version}`);
      await import(`/flightradar_card/map-controls.js?v=${version}`);

      // Keep the map locked to the selected airport when an aircraft is selected.
      // The card uses the second argument to _selectAircraft() to request panning
      // to the aircraft. For the airport traffic monitor we deliberately suppress
      // that behaviour while preserving aircraft selection/details.
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
