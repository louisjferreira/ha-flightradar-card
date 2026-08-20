/* FlightRadar Card compatibility fixes for Home Assistant. */
(function () {
  const boot = () => {
    const Card = customElements.get("flightradar-card");
    if (!Card || Card.__FLIGHTRADAR_DEFAULTS_PATCHED__) return;
    const originalForm = Card.getConfigForm;
    if (originalForm) {
      const original = originalForm.bind(Card);
      Card.getConfigForm = function () {
        const form = original();
        const defaults = { airport: "HRE", radius_nm: 250, refresh_interval: 10, zoom: 7, full_screen: true };
        for (const item of form.schema || []) if (Object.prototype.hasOwnProperty.call(defaults, item.name)) item.default = defaults[item.name];
        return form;
      };
    }
    Card.__FLIGHTRADAR_DEFAULTS_PATCHED__ = true;
  };
  if (customElements.get("flightradar-card")) boot();
  else customElements.whenDefined("flightradar-card").then(boot);
})();
