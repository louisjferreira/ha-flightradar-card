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
        const defaults = { airport: "HRE", radius_nm: 150, refresh_interval: 60, zoom: 7, full_screen: true };
        for (const item of form.schema || []) {
          if (Object.prototype.hasOwnProperty.call(defaults, item.name)) item.default = defaults[item.name];
        }
        return form;
      };
    }

    // The FR24 backend now returns origin/destination with every aircraft, so
    // the traffic board can be derived from the same live aircraft snapshot.
    // This avoids extra API calls and makes the board agree with the map.
    Card.prototype._updateTraffic = function () {
      const panel = this.shadowRoot?.getElementById("trafficPanel");
      if (!panel) return;
      const airport = this._airport?.() || { code: this._config?.airport || "HRE" };
      const flights = Array.isArray(this._flights) ? this._flights : [];
      const tab = this._activityTab || "ALL";
      const code = String(airport.code || "").toUpperCase();

      const iata = value => String(value || "").toUpperCase();
      const isArrival = f => iata(f.destination) === code || iata(f.destination_icao) === iata(airport.icao);
      const isDeparture = f => iata(f.origin) === code || iata(f.origin_icao) === iata(airport.icao);
      const filtered = tab === "ARRIVALS" ? flights.filter(isArrival) : tab === "DEPARTURES" ? flights.filter(isDeparture) : flights;

      const esc = value => String(value ?? "").replace(/[&<>\"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
      const route = f => {
        const origin = f.origin || f.origin_icao || "—";
        const destination = f.destination || f.destination_icao || "—";
        return `${origin} → ${destination}`;
      };
      const altitude = f => f.altitude == null ? "—" : `${Math.round(Number(f.altitude)).toLocaleString()} ft`;
      const call = f => f.flight || f.callsign || f.registration || f.hex || "—";

      panel.innerHTML = `
        <div class="traffic-head">
          <span>${esc(code)} · Live Air Traffic</span>
          <span class="traffic-sub">FlightRadar24</span>
        </div>
        <div class="tabs">
          ${["ALL", "ARRIVALS", "DEPARTURES"].map(t => `<button class="tab ${tab === t ? "active" : ""}" data-tab="${t}">${t}</button>`).join("")}
        </div>
        <div class="traffic-list">
          ${filtered.length ? filtered.slice(0, 20).map(f => `
            <div class="traffic-row" data-id="${esc(f.fr24_id || f.hex || f.registration || f.flight)}">
              <span>${tab === "ARRIVALS" ? "ARR" : tab === "DEPARTURES" ? "DEP" : (isArrival(f) ? "ARR" : isDeparture(f) ? "DEP" : "LIVE")}</span>
              <span class="callsign">${esc(call(f))}</span>
              <span>${esc(route(f))}</span>
              <span>${esc(altitude(f))}</span>
            </div>`).join("") : `<div class="empty">No ${tab === "ALL" ? "live" : tab.toLowerCase()} aircraft in the current area.</div>`}
        </div>`;

      panel.querySelectorAll(".tab").forEach(button => button.addEventListener("click", () => {
        this._activityTab = button.dataset.tab;
        this._updateTraffic();
      }));

      panel.querySelectorAll(".traffic-row").forEach(row => row.addEventListener("click", () => {
        const id = row.dataset.id;
        const flight = flights.find(f => String(f.fr24_id || f.hex || f.registration || f.flight) === id);
        if (!flight) return;
        this._selected = flight;
        this._photo = null;
        this._photoHex = null;
        this._loadPhoto?.(flight);
        this._updateSelected?.();
        this._renderMap?.(false);
      }));
    };

    Card.__FLIGHTRADAR_DEFAULTS_PATCHED__ = true;
  };

  if (customElements.get("flightradar-card")) boot();
  else customElements.whenDefined("flightradar-card").then(boot);
})();
