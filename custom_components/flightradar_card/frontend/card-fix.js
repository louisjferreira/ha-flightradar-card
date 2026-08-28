/* FlightRadar Card compatibility, visual and airport-board fixes. */
(function () {
  const boot = () => {
    const Card = customElements.get("flightradar-card");
    if (!Card || Card.__FLIGHTRADAR_VISUAL_PATCHED__) return;
    const esc = v => String(v ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));

    const originalForm = Card.getConfigForm;
    if (originalForm) {
      const original = originalForm.bind(Card);
      Card.getConfigForm = function () {
        const form = original();
        const originalComputeLabel = form.computeLabel;
        const defaults = { airport: "HRE", radius_nm: 150, refresh_interval: 60, zoom: 7, full_screen: true, airport_activity_hours: 5 };
        for (const item of form.schema || []) {
          if (Object.prototype.hasOwnProperty.call(defaults, item.name)) item.default = defaults[item.name];
        }
        if (!(form.schema || []).some(item => item.name === "airport_activity_hours")) {
          form.schema.push({
            name: "airport_activity_hours",
            selector: { number: { min: 1, max: 72, step: 1, mode: "box" } },
          });
        }
        form.computeLabel = s => s.name === "airport_activity_hours"
          ? "Airport activity timeframe (hours)"
          : (originalComputeLabel ? originalComputeLabel(s) : s.name);
        return form;
      };
    }

    const originalSetConfig = Card.prototype.setConfig;
    if (originalSetConfig) {
      Card.prototype.setConfig = function (c = {}) {
        const hours = Number(c.airport_activity_hours ?? c.airport_activity?.hours ?? 5);
        this._airportActivityHours = Math.min(72, Math.max(1, Number.isFinite(hours) ? hours : 5));
        originalSetConfig.call(this, c);
      };
    }

    // Use the supplied aircraft silhouettes. They are intentionally simple and
    // readable at map zoom levels, while retaining different proportions for
    // large jets, medium/regional jets, turboprops and light aircraft.
    const iconFor = f => {
      const code = String(f?.aircraft_code || f?.type || "").toUpperCase();
      const cat = String(f?.aircraft_category || "").toLowerCase();
      if (/AT4|AT7|AT72|AT43|AT45|AT46|AT75|AT76|DH8|Q4|SF3|F50/.test(code) || cat.includes("turboprop")) {
        return { src: "/flightradar_card/assets/twin-prop-small.svg", scale: 0.88, kind: "twin-prop" };
      }
      if (cat.includes("helicopter") || /H60|H47|H53|H57|H58|H64|H125|H135|H145|H160|H175|S76|S92|B06|B205|B206|B212|B214|B412|B429|B430|B505|EC|AS|AW|R22|R44|R4[0-9]/.test(code)) {
        return { src: "/flightradar_card/assets/chopper.svg", scale: 0.72, kind: "helicopter" };
      }
      if (cat.includes("light") || /C1[0-9]|C2[0-9]|C3[0-9]|PA[0-9]|SR2[0-9]|DA[0-9]|TB[0-9]/.test(code)) {
        return { src: "/flightradar_card/assets/single-prop-small.svg", scale: 0.72, kind: "single-prop" };
      }
      if (/A380|A340|A350|A330|A310|A300|B747|B767|B777|B787|B788|B789/.test(code)) {
        return { src: "/flightradar_card/assets/plane-large.svg", scale: 1.16, kind: "large" };
      }
      return { src: "/flightradar_card/assets/plane-medium-large.svg", scale: /E17|E18|E19|E2|CRJ|ERJ|ARJ|RJ/.test(code) ? 0.88 : 1.0, kind: "medium" };
    };

    const modelScale = f => iconFor(f).scale;

    const originalDrawMap = Card.prototype._drawMap;
    if (originalDrawMap) {
      Card.prototype._drawMap = function () {
        originalDrawMap.apply(this, arguments);
        const root = this.shadowRoot;
        if (!root) return;
        let style = root.getElementById("fr24-icon-fix");
        if (!style) {
          style = document.createElement("style");
          style.id = "fr24-icon-fix";
          style.textContent = `.aircraft-icon{width:42px!important;height:42px!important;display:block!important;position:absolute!important;pointer-events:auto!important;transform-origin:50% 50%!important;filter:drop-shadow(0 2px 3px rgba(0,0,0,.75))}.aircraft-icon img{width:100%!important;height:100%!important;display:block!important;object-fit:contain!important;overflow:visible!important}.aircraft-icon.is-selected img{filter:hue-rotate(205deg) saturate(1.35) brightness(1.15) drop-shadow(0 0 3px rgba(255,210,45,.95))}.traffic{width:max-content!important;min-width:0!important;max-width:calc(100% - 24px)!important;box-sizing:border-box!important}.traffic-row{grid-template-columns:max-content max-content max-content max-content max-content!important;white-space:nowrap!important;cursor:pointer!important}.traffic-row:hover{background:#2b333a!important}`;
          root.appendChild(style);
        }
        const icons = [...root.querySelectorAll(".aircraft-icon")];
        const flights = Array.isArray(this._flights) ? this._flights : [];
        const selectedId = this._id ? this._id(this._selected) : null;
        icons.forEach((icon, index) => {
          const f = flights[index];
          if (!f) return;
          const id = this._id ? this._id(f) : (f.hex || f.flight || f.registration);
          const selected = id && selectedId && id === selectedId;
          const asset = iconFor(f);
          const rotation = Number(f.track ?? f.heading ?? 0) || 0;
          icon.classList.toggle("is-selected", Boolean(selected));
          icon.innerHTML = `<img src="${asset.src}" alt="${esc(f?.type || f?.aircraft_code || "Aircraft")}" draggable="false">`;
          icon.style.width = "42px";
          icon.style.height = "42px";
          icon.style.transform = `translate(-50%,-50%) rotate(${rotation}deg) scale(${modelScale(f)})`;
          icon.title = `${f.type || f.aircraft_code || "Aircraft"} · ${f.flight || f.callsign || f.registration || ""}`;
        });
      };
    }

    const activityTime = f => {
      const keys = f?.direction === "ARRIVAL"
        ? ["estimated_arrival", "scheduled_arrival", "real_arrival"]
        : ["estimated_departure", "scheduled_departure", "real_departure"];
      for (const key of keys) {
        const value = Number(f?.[key]);
        if (Number.isFinite(value) && value > 0) return value;
      }
      return Number.MAX_SAFE_INTEGER;
    };

    Card.prototype._activityTime = activityTime;
    Card.prototype._combineActivity = function (arr, dep) {
      return [
        ...(Array.isArray(arr) ? arr.map(f => ({ ...f, direction: "ARRIVAL" })) : []),
        ...(Array.isArray(dep) ? dep.map(f => ({ ...f, direction: "DEPARTURE" })) : []),
      ].sort((a, b) => activityTime(a) - activityTime(b));
    };

    Card.prototype._selectActivityFlight = async function (flight) {
      const value = v => String(v ?? "").trim().toUpperCase();
      const candidates = [flight?.flight, flight?.callsign, flight?.registration, flight?.hex].map(value).filter(Boolean);
      const live = Array.isArray(this._flights) ? this._flights.find(f => {
        const values = [f?.flight, f?.callsign, f?.registration, f?.hex].map(value);
        return candidates.some(candidate => values.includes(candidate));
      }) : null;

      if (live) {
        this._selected = live;
        this._photo = null;
        this._photoHex = null;
        if (typeof this._loadPhoto === "function") this._loadPhoto(live);
        this._updateSelected();
        this._drawMap();
        return;
      }

      const query = flight?.flight || flight?.callsign || flight?.registration || flight?.hex;
      if (query && typeof this._search === "function") await this._search(query);
    };

    Card.prototype._updateTraffic = function () {
      const p = this.shadowRoot?.getElementById("trafficPanel");
      if (!p) return;
      const airport = String(this._airport()?.code || "").toUpperCase();
      const now = Date.now() / 1000;
      const hours = Math.min(72, Math.max(1, Number(this._airportActivityHours) || 5));
      const horizon = now + hours * 3600;
      let list = Array.isArray(this._activity) ? this._activity.slice() : [];
      list = list.filter(f => {
        const origin = String(f?.origin || "").toUpperCase();
        const destination = String(f?.destination || "").toUpperCase();
        const airportMatch = f?.direction === "ARRIVAL" ? destination === airport : origin === airport;
        if (!airportMatch) return false;
        const t = activityTime(f);
        return t !== Number.MAX_SAFE_INTEGER && t >= now && t <= horizon;
      });
      list.sort((a, b) => activityTime(a) - activityTime(b));
      list = list.slice(0, 100);

      const rows = list.map((f, index) => {
        const timeValue = activityTime(f);
        const time = Number.isFinite(timeValue) && timeValue < Number.MAX_SAFE_INTEGER
          ? new Date(timeValue * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "--:--";
        const arrival = f.direction === "ARRIVAL";
        return `<div class="traffic-row" data-activity-index="${index}" title="Click to select this aircraft"><span>${time}</span><span class="${arrival ? "dir-arr" : "dir-dep"}">${arrival ? "ARR" : "DEP"}</span><span class="callsign">${esc(f.flight || f.callsign || "—")}</span><span class="route-code">${esc(f.origin || "—")} → ${esc(f.destination || "—")}</span><span>${esc(f.type || f.aircraft_code || "—")}</span></div>`;
      }).join("");

      p.innerHTML = `<div class="traffic-head"><span>${esc(airport)} · Airport Activity</span><span class="traffic-sub">Next ${hours}h · ${list.length} flights</span></div>${rows || `<div class="empty">${this._error ? esc(this._error) : `No airport activity in the next ${hours} hours`}</div>`}`;
      p.querySelectorAll(".traffic-row").forEach(row => {
        row.addEventListener("click", () => {
          const index = Number(row.dataset.activityIndex);
          const flight = list[index];
          if (flight) this._selectActivityFlight(flight);
        });
      });
    };

    Card.__FLIGHTRADAR_VISUAL_PATCHED__ = true;
  };

  if (customElements.get("flightradar-card")) boot();
  else customElements.whenDefined("flightradar-card").then(boot);
})();
