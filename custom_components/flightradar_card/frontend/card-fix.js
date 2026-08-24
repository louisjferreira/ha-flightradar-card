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
        form.computeLabel = s => ({
          ...(form.computeLabel ? {} : {}),
          airport_activity_hours: "Airport activity timeframe (hours)",
        }[s.name] || (form.computeLabel ? form.computeLabel(s) : s.name));
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

    const modelKind = f => {
      const code = String(f?.aircraft_code || f?.type || "").toUpperCase();
      const cat = String(f?.aircraft_category || "").toLowerCase();
      if (/HELI|H60|H70|H80|H90|EC|AS|AW|B06|R22|R44/.test(code) || cat.includes("helicopter")) return "heli";
      if (/AT4|AT7|AT72|DH8|Q4|SF3|F50|BE/.test(code) || cat.includes("turboprop")) return "turboprop";
      if (/A380|A340|A350|A330|A310|A300|B747|B767|B777|B787|B788|B789/.test(code)) return "widebody";
      if (/E17|E18|E19|E2|CRJ|ERJ|ARJ|RJ/.test(code)) return "regional";
      if (/A31|A32|A20|A21|A22|A23|A24|A25|A3[0-9]|B73|B37|B38|B39|B7[0-9]|MD8|MD9|DC9/.test(code)) return "narrowbody";
      return "generic";
    };

    const modelScale = f => {
      const code = String(f?.aircraft_code || f?.type || "").toUpperCase();
      if (/A380|B747/.test(code)) return 1.28;
      if (/A330|A340|A350|B767|B777|B787/.test(code)) return 1.16;
      if (/A31|A32|A20|A21|A22|A23|A24|A25|B73|B37|B38|B39|B7[0-9]/.test(code)) return 1.02;
      if (/E17|E18|E19|E2|CRJ|ERJ|ARJ|RJ/.test(code)) return .88;
      if (/AT4|AT7|AT72|DH8|Q4|SF3|F50/.test(code)) return .90;
      if (/H60|H70|H80|H90|EC|AS|AW|R22|R44/.test(code)) return .72;
      return .96;
    };

    const svgFor = (f, selected) => {
      const kind = modelKind(f);
      const fill = selected ? "#ffd33d" : "#ffffff";
      const stroke = selected ? "#fff0a0" : "#1d252d";
      let body;
      if (kind === "heli") {
        body = `<g fill="none" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round"><path d="M50 23v20M43 43h14M50 23l-7 6M50 23l7 6"/><path d="M15 13h70M50 13v10"/><path d="M50 43v9"/></g><ellipse cx="50" cy="25" rx="5" ry="8" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
      } else if (kind === "turboprop") {
        body = `<path d="M50 4c3 0 5 3 5 7v16l24 10v6L55 40v11h7v5H38v-5h7V40L21 43v-6l24-10V11c0-4 2-7 5-7z" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/><circle cx="17" cy="40" r="5" fill="none" stroke="${stroke}" stroke-width="2"/><circle cx="83" cy="40" r="5" fill="none" stroke="${stroke}" stroke-width="2"/>`;
      } else if (kind === "widebody") {
        body = `<path d="M50 2c5 0 8 5 8 12v13l34 15v8L58 45v11h10v7H32v-7h10V45L8 50v-8l34-15V14c0-7 3-12 8-12z" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/><path d="M38 28h24l-5-13h-5l-2 13z" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><circle cx="30" cy="44" r="3" fill="${stroke}"/><circle cx="70" cy="44" r="3" fill="${stroke}"/>`;
      } else if (kind === "regional") {
        body = `<path d="M50 4c4 0 6 4 6 9v15l23 10v6L56 41v13h8v6H36v-6h8V41L21 44v-6l23-10V13c0-5 2-9 6-9z" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/><path d="M44 26h12l-3-9h-6z" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
      } else {
        body = `<path d="M50 3c4 0 6 4 6 9v16l29 13v7L56 43v12h9v6H35v-6h9V43L15 48v-7l29-13V12c0-5 2-9 6-9z" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/><path d="M44 25h12l-3-10h-6z" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
      }
      return `<svg viewBox="0 0 100 70" aria-label="${String(f?.type || f?.aircraft_code || "Aircraft").replace(/"/g, "&quot;")}">${body}</svg>`;
    };

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
          style.textContent = `.aircraft-icon{width:34px!important;height:34px!important;display:block!important;position:absolute!important;pointer-events:auto!important;transform-origin:50% 50%!important;filter:drop-shadow(0 2px 3px rgba(0,0,0,.75))}.aircraft-icon svg{width:100%!important;height:100%!important;display:block!important;overflow:visible!important}.traffic-row{grid-template-columns:55px 48px 72px 1fr 72px!important}`;
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
          const scale = modelScale(f);
          const rotation = Number(f.track ?? f.heading ?? 0) || 0;
          icon.innerHTML = svgFor(f, selected);
          icon.style.width = "34px";
          icon.style.height = "34px";
          icon.style.transform = `translate(-50%,-50%) rotate(${rotation}deg) scale(${scale})`;
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

      const rows = list.map(f => {
        const timeValue = activityTime(f);
        const time = Number.isFinite(timeValue) && timeValue < Number.MAX_SAFE_INTEGER
          ? new Date(timeValue * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "--:--";
        const arrival = f.direction === "ARRIVAL";
        return `<div class="traffic-row"><span>${time}</span><span class="${arrival ? "dir-arr" : "dir-dep"}">${arrival ? "ARR" : "DEP"}</span><span class="callsign">${esc(f.flight || f.callsign || "—")}</span><span class="route-code">${esc(f.origin || "—")} → ${esc(f.destination || "—")}</span><span>${esc(f.type || f.aircraft_code || "—")}</span></div>`;
      }).join("");

      p.innerHTML = `<div class="traffic-head"><span>${esc(airport)} · Airport Activity</span><span class="traffic-sub">Next ${hours}h · ${list.length} flights</span></div>${rows || `<div class="empty">${this._error ? esc(this._error) : `No airport activity in the next ${hours} hours`}</div>`}`;
    };

    Card.__FLIGHTRADAR_VISUAL_PATCHED__ = true;
  };

  if (customElements.get("flightradar-card")) boot();
  else customElements.whenDefined("flightradar-card").then(boot);
})();
