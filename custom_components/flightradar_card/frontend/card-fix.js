/* FlightRadar Card layout fix. Loaded after the card definition. */
(function () {
  const boot = () => {
    const Card = customElements.get("flightradar-card");
    if (!Card) return;

    // Supply sensible defaults in Home Assistant's graphical editor.
    const originalForm = Card.getConfigForm;
    if (originalForm && !Card.__FLIGHTRADAR_DEFAULTS_PATCHED__) {
      const original = originalForm.bind(Card);
      Card.getConfigForm = function () {
        const form = original();
        const defaults = { airport: "HRE", radius_nm: 250, refresh_interval: 15, zoom: 7, full_screen: true };
        for (const item of form.schema || []) {
          if (Object.prototype.hasOwnProperty.call(defaults, item.name)) item.default = defaults[item.name];
        }
        return form;
      };
      Card.__FLIGHTRADAR_DEFAULTS_PATCHED__ = true;
    }

    // The map is initially rendered while the card preview/dashboard is still sizing.
    // Re-render whenever the host size changes so the tile grid covers the whole card.
    const installObserver = (el) => {
      if (el.__FLIGHTRADAR_RESIZE_OBSERVER__) return;
      const observer = new ResizeObserver(() => {
        if (el._render && el._config) {
          window.requestAnimationFrame(() => el._render());
        }
      });
      observer.observe(el);
      el.__FLIGHTRADAR_RESIZE_OBSERVER__ = observer;
      window.setTimeout(() => el._render && el._render(), 100);
    };

    document.querySelectorAll("flightradar-card").forEach(installObserver);
    if (!window.__FLIGHTRADAR_ELEMENT_OBSERVER__) {
      const elements = new MutationObserver(() => {
        document.querySelectorAll("flightradar-card").forEach(installObserver);
      });
      elements.observe(document.body, { childList: true, subtree: true });
      window.__FLIGHTRADAR_ELEMENT_OBSERVER__ = elements;
    }
  };

  if (customElements.get("flightradar-card")) boot();
  else customElements.whenDefined("flightradar-card").then(boot);
})();
