/* FlightRadar Card loader / registration shim for Home Assistant. */
(function () {
  if (window.__FLIGHTRADAR_CARD_LOADED__) return;
  window.__FLIGHTRADAR_CARD_LOADED__ = true;

  const sourceUrl = "/flightradar_card/flightradar-card.js?v=0.8.3";

  fetch(sourceUrl, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`FlightRadar Card HTTP ${response.status}`);
      return response.text();
    })
    .then((source) => {
      const registration = `\nif (typeof FlightRadarCard !== "undefined" && !customElements.get("flightradar-card")) {\n  customElements.define("flightradar-card", FlightRadarCard);\n}\n`;
      const blob = new Blob([source, registration], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      return import(url).finally(() => URL.revokeObjectURL(url));
    })
    .catch((error) => {
      console.error("[FlightRadar Card] Failed to load card:", error);
    });
})();
