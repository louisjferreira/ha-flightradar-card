/* FlightRadar Card compatibility loader. */
(function () {
  const url = "/flightradar_card/card-loader.js?v=0.9.3";
  if (window.__FLIGHTRADAR_CARD_LOADER__) return;
  window.__FLIGHTRADAR_CARD_LOADER__ = true;
  const script = document.createElement("script");
  script.src = url;
  script.async = false;
  document.head.appendChild(script);
})();
