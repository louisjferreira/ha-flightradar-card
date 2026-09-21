/* MapLibre/OpenFreeMap basemap adapter for FlightRadar Card. */
(async function () {
  const version = "1.1.0-dev.5";
  try {
    const mod = await import("https://unpkg.com/maplibre-gl@6.10.0/dist/maplibre-gl.mjs");
    const maplibregl = mod;
    const Card = customElements.get("flightradar-card");
    if (!Card || Card.__FLIGHTRADAR_MAPLIBRE__) return;

    const originalDraw = Card.prototype._drawMap;
    const originalSetMode = Card.prototype._setMode;

    Card.prototype._initMapLibre = async function () {
      if (this._mapLibre || this._mapLibreLoading) return this._mapLibre;
      const host = this.shadowRoot?.querySelector(".map");
      if (!host) return null;
      this._mapLibreLoading = true;

      let base = host.querySelector(".maplibre-base");
      if (!base) {
        base = document.createElement("div");
        base.className = "maplibre-base";
        Object.assign(base.style, {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          zIndex: "1",
          overflow: "hidden",
          background: "#b7c2c6"
        });
        host.insertBefore(base, host.firstChild);
      }

      try {
        const airport = this._airport();
        const map = new maplibregl.Map({
          container: base,
          style: "https://tiles.openfreemap.org/styles/liberty",
          center: [airport.lon, airport.lat],
          zoom: Number(this._map?.zoom) || 7,
          attributionControl: true,
          dragPan: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          cooperativeGestures: false
        });

        this._mapLibre = map;
        map.dragPan.disable();
        map.dragRotate.disable();
        map.touchZoomRotate.enable();
        map.doubleClickZoom.enable();
        map.scrollZoom.enable();
        map.boxZoom.disable();
        map.keyboard.disable();

        map.on("load", () => {
          base.style.pointerEvents = this._mode === "WINDY" ? "none" : "auto";
          this._mapLibreReady = true;
          this._drawMap();
        });

        map.on("zoom", () => {
          if (this._mapLibreSyncing) return;
          this._map.zoom = Math.max(3, Math.min(12, map.getZoom()));
          this._drawMap();
        });

        map.on("resize", () => this._drawMap());

        map.on("error", event => {
          if (event?.error) console.warn("[FlightRadar Card] MapLibre/OpenFreeMap:", event.error);
        });

        return map;
      } catch (error) {
        console.error("[FlightRadar Card] Failed to initialize MapLibre:", error);
        this._mapLibre = null;
        return null;
      } finally {
        this._mapLibreLoading = false;
      }
    };

    Card.prototype._drawMap = function (initial = false) {
      const map = this.shadowRoot?.querySelector(".map");
      if (!map) return;

      let base = map.querySelector(".maplibre-base");
      if (!base) {
        base = document.createElement("div");
        base.className = "maplibre-base";
        Object.assign(base.style, {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          zIndex: "1",
          overflow: "hidden",
          background: "#b7c2c6"
        });
        map.insertBefore(base, map.firstChild);
      }

      const drawAircraft = () => {
        const rect = map.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) return;

        const z = Number(this._map?.zoom) || 7;
        const center = this._project(this._map.centerLat, this._map.centerLon);
        const left = center.x - rect.width / 2;
        const top = center.y - rect.height / 2;

        map.querySelectorAll(".aircraft").forEach(e => e.remove());

        if (this._mode === "FR24") {
          this._flights.forEach(f => {
            const q = this._project(Number(f.lat), Number(f.lon));
            const x = q.x - left;
            const y = q.y - top;
            if (x < -60 || x > rect.width + 60 || y < -60 || y > rect.height + 60) return;

            const el = document.createElement("div");
            const selected = this._selected && this._id(f) === this._id(this._selected);
            el.className = "aircraft" + (selected ? " aircraft-selected" : "");
            el.style.left = x + "px";
            el.style.top = y + "px";
            el.innerHTML = aircraftSvg(f, selected);
            el.title = (f.flight || f.callsign || f.registration || f.hex || "Aircraft") +
              " · " + (f.type || f.aircraft_code || "");
            el.addEventListener("click", e => {
              e.stopPropagation();
              this._selectAircraft(f, false);
            });
            map.appendChild(el);
          });

          const a = this._airport();
          const ap = this._project(a.lat, a.lon);
          map.querySelector(".airport-marker")?.remove();
          if (ap.x - left >= -20 && ap.x - left <= rect.width + 20 &&
              ap.y - top >= -20 && ap.y - top <= rect.height + 20) {
            const mark = document.createElement("div");
            mark.className = "airport airport-marker";
            mark.style.left = ap.x - left + "px";
            mark.style.top = ap.y - top + "px";
            mark.title = a.code + " · " + a.name;
            map.appendChild(mark);
          }
        }

        if (typeof this._drawTrail === "function") this._drawTrail(rect, left, top);
      };

      if (!this._mapLibre) {
        this._initMapLibre().then(() => this._drawMap());
        return;
      }

      if (this._mapLibreReady) {
        const base = map.querySelector(".maplibre-base");
        if (base) {
          base.style.display = this._mode === "WINDY" ? "none" : "block";
          base.style.pointerEvents = this._mode === "WINDY" ? "none" : "auto";
        }

        this._mapLibreSyncing = true;
        try {
          this._mapLibre.resize();
          const targetZoom = Math.max(3, Math.min(12, Number(this._map.zoom) || 7));
          const targetCenter = [Number(this._map.centerLon) || 0, Number(this._map.centerLat) || 0];
          const current = this._mapLibre.getCenter();
          if (Math.abs(this._mapLibre.getZoom() - targetZoom) > 0.001 ||
              Math.abs(current.lng - targetCenter[0]) > 0.0001 ||
              Math.abs(current.lat - targetCenter[1]) > 0.0001) {
            this._mapLibre.jumpTo({center: targetCenter, zoom: targetZoom});
          }
        } finally {
          this._mapLibreSyncing = false;
        }
      }

      drawAircraft();
    };

    Card.prototype._setMode = function (mode) {
      originalSetMode.call(this, mode);
      if (this._mapLibre) {
        const base = this.shadowRoot?.querySelector(".maplibre-base");
        if (base) {
          base.style.display = mode === "WINDY" ? "none" : "block";
          base.style.pointerEvents = mode === "WINDY" ? "none" : "auto";
        }
        this._drawMap();
      }
    };

    Card.prototype._destroyMapLibre = function () {
      if (this._mapLibre) {
        try { this._mapLibre.remove(); } catch (_) {}
      }
      this._mapLibre = null;
      this._mapLibreReady = false;
      this._mapLibreLoading = false;
    };

    Card.__FLIGHTRADAR_MAPLIBRE__ = true;

    const style = document.createElement("style");
    style.textContent = `
      .maplibre-base .maplibregl-map,
      .maplibre-base .maplibregl-canvas-container,
      .maplibre-base .maplibregl-canvas {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
      }
      .maplibre-base .maplibregl-canvas {
        display: block !important;
      }
      .maplibre-base .maplibregl-control-container {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  } catch (error) {
    console.error("[FlightRadar Card] MapLibre adapter failed to load:", error);
  }
})();
