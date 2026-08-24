/* FlightRadar Card compatibility and visual fixes. */
(function () {
  const boot = () => {
    const Card = customElements.get("flightradar-card");
    if (!Card || Card.__FLIGHTRADAR_VISUAL_PATCHED__) return;

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

    const modelKind = f => {
      const code = String(f?.aircraft_code || f?.type || "").toUpperCase();
      const cat = String(f?.aircraft_category || "").toLowerCase();
      if (/HELI|H60|H70|H80|H90|EC|AS|AW|B06|R22|R44/.test(code) || cat.includes("helicopter")) return "heli";
      if (/AT4|AT7|AT72|DH8|Q4|SF3|F50|BE/.test(code) || cat.includes("turboprop")) return "turboprop";
      if (/A3[0-9]|A220|B7[0-9]|B38|B39|E17|E19|CRJ|ERJ/.test(code)) return "jet";
      return "generic";
    };

    const modelScale = f => {
      const code = String(f?.aircraft_code || f?.type || "").toUpperCase();
      if (/A380|B747|B777|B787/.test(code)) return 1.25;
      if (/A330|A340|A350|B767/.test(code)) return 1.12;
      if (/AT4|AT7|DH8|Q4|SF3|F50/.test(code)) return .92;
      if (/H60|H70|H80|H90|EC|AS|AW|R22|R44/.test(code)) return .78;
      return 1;
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
          style.textContent = `.aircraft-icon{width:34px!important;height:34px!important;display:block!important;position:absolute!important;pointer-events:auto!important;transform-origin:50% 50%!important;filter:drop-shadow(0 2px 3px rgba(0,0,0,.75))}.aircraft-icon svg{width:100%!important;height:100%!important;display:block!important;overflow:visible!important}`;
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

    Card.__FLIGHTRADAR_VISUAL_PATCHED__ = true;
  };

  if (customElements.get("flightradar-card")) boot();
  else customElements.whenDefined("flightradar-card").then(boot);
})();
