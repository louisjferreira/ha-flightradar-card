/* FlightRadar Card loader / registration shim for Home Assistant. */
(function () {
  if (window.__FLIGHTRADAR_CARD_LOADED__) return;
  window.__FLIGHTRADAR_CARD_LOADED__ = true;
  const version = "0.9.8";
  const loadScript = async (path) => {
    const response = await fetch(`${path}?v=${version}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`FlightRadar Card HTTP ${response.status}`);
    const source = await response.text();
    const blob = new Blob([source], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    try { await import(url); } finally { URL.revokeObjectURL(url); }
  };
  (async () => {
    try {
      await loadScript("/flightradar_card/flightradar-card.js");
      await loadScript("/flightradar_card/card-fix.js");
    } catch (error) { console.error("[FlightRadar Card] Failed to load card:", error); }
  })();
})();
