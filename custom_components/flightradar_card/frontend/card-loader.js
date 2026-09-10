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

      // This card is an airport traffic monitor, so keep the map locked to
      // the selected airport. Zoom remains available, and aircraft remain
      // clickable, but map dragging is disabled.
      const Card = customElements.get("flightradar-card");
      if (Card?.prototype?._enableMapControls && !Card.__FLIGHTRADAR_NO_DRAG__) {
        const originalEnable = Card.prototype._enableMapControls;
        Card.prototype._enableMapControls = function () {
          originalEnable.call(this);

          const map = this.shadowRoot?.querySelector(".map");
          if (!map || map.dataset.noDragBound === "true") return;
          map.dataset.noDragBound = "true";

          // map-controls.js installs its drag handler in the bubble phase.
          // Stop non-aircraft pointerdown events during capture so that drag
          // never starts, while leaving aircraft selection untouched.
          map.addEventListener("pointerdown", event => {
            const aircraft = event.target?.closest?.(
              ".aircraft-icon, .aircraft, [data-aircraft-id]"
            );
            if (!aircraft) event.stopImmediatePropagation();
          }, true);
        };
        Card.__FLIGHTRADAR_NO_DRAG__ = true;
      }
    } catch (error) {
      console.error("[FlightRadar Card] Failed to load card:", error);
    }
  })();
})();
