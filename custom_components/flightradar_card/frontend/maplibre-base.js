/* Waymorphic/OpenStreetMap vector basemap adapter for FlightRadar Card.
 * Uses the provider's official iframe embed, avoiding a browser-side MapLibre
 * dependency while keeping the card's own aircraft projection and controls.
 */
(function () {
  const Card = customElements.get("flightradar-card");
  if (!Card || Card.__FLIGHTRADAR_WAYMORPHIC__) return;

  const ensureBase = host => {
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
        background: "#b7c2c6",
        pointerEvents: "auto"
      });
      host.insertBefore(base, host.firstChild);
    }

    let frame = base.querySelector("iframe.waymorphic-map");
    if (!frame) {
      frame = document.createElement("iframe");
      frame.className = "waymorphic-map";
      frame.title = "OpenStreetMap basemap";
      frame.setAttribute("loading", "eager");
      frame.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
      Object.assign(frame.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        border: "0",
        pointerEvents: "none"
      });
      base.appendChild(frame);
    }
    return { base, frame };
  };

  Card.prototype._waymorphicUrl = function () {
    const a = this._airport();
    const z = Math.max(3, Math.min(14, Number(this._map?.zoom) || 7));
    return "https://map.waymorphic.com/#embed&style=liberty&map=" +
      z + "/" + Number(this._map?.centerLat ?? a.lat).toFixed(5) +
      "/" + Number(this._map?.centerLon ?? a.lon).toFixed(5);
  };

  Card.prototype._initWaymorphic = function () {
    const host = this.shadowRoot?.querySelector(".map");
    if (!host) return;
    const { base, frame } = ensureBase(host);

    if (frame.dataset.url !== this._waymorphicUrl()) {
      frame.src = this._waymorphicUrl();
      frame.dataset.url = frame.src;
    }

    // Never allow the embedded map to pan independently of the airport-centred
    // card. Zoom is controlled by the card below.
    frame.style.pointerEvents = "none";
    base.style.pointerEvents = "auto";

    if (base.dataset.controlsBound === "true") return;
    base.dataset.controlsBound = "true";

    const clampZoom = value => Math.max(3, Math.min(14, Number(value) || 7));
    const update = () => {
      const url = this._waymorphicUrl();
      if (frame.dataset.url === url) return;
      frame.src = url;
      frame.dataset.url = frame.src;
    };

    base.addEventListener("wheel", event => {
      event.preventDefault();
      this._map.zoom = clampZoom(this._map.zoom + (event.deltaY < 0 ? 1 : -1));
      update();
      this._drawMap();
    }, { passive: false });

    base.addEventListener("dblclick", event => {
      event.preventDefault();
      this._map.zoom = clampZoom(this._map.zoom + 1);
      update();
      this._drawMap();
    });

    let pinchDistance = null;
    base.addEventListener("touchstart", event => {
      if (event.touches.length >= 2) {
        const a = event.touches[0], b = event.touches[1];
        pinchDistance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      }
    }, { passive: true });

    base.addEventListener("touchmove", event => {
      if (event.touches.length < 2 || !pinchDistance) return;
      event.preventDefault();
      const a = event.touches[0], b = event.touches[1];
      const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      if (distance > pinchDistance * 1.18 || distance < pinchDistance * 0.84) {
        this._map.zoom = clampZoom(this._map.zoom + (distance > pinchDistance ? 1 : -1));
        pinchDistance = distance;
        update();
        this._drawMap();
      }
    }, { passive: false });

    const clearPinch = () => { pinchDistance = null; };
    base.addEventListener("touchend", clearPinch, { passive: true });
    base.addEventListener("touchcancel", clearPinch, { passive: true });
  };

  const originalDrawMap = Card.prototype._drawMap;
  Card.prototype._drawMap = function () {
    const map = this.shadowRoot?.querySelector(".map");
    if (!map) return;

    const { base } = ensureBase(map);
    this._initWaymorphic();

    // The old raster tile renderer must never be allowed to make requests.
    const tiles = this.shadowRoot?.getElementById("tiles");
    if (tiles) {
      tiles.innerHTML = "";
      tiles.style.display = "none";
    }

    if (this._mode === "WINDY") {
      base.style.display = "none";
    } else {
      base.style.display = "block";
    }

    const rect = map.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;

    map.querySelectorAll(".aircraft").forEach(e => e.remove());
    map.querySelector(".airport-marker")?.remove();

    if (this._mode !== "FR24") {
      if (typeof this._drawTrail === "function") this._drawTrail(rect, 0, 0);
      return;
    }

    // The Waymorphic embed uses the standard Web Mercator projection. Reuse the
    // card's exact same projection so aircraft remain geographically anchored.
    const center = this._project(this._map.centerLat, this._map.centerLon);
    const left = center.x - rect.width / 2;
    const top = center.y - rect.height / 2;

    this._flights.forEach(f => {
      const lat = Number(f.lat), lon = Number(f.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const q = this._project(lat, lon);
      const x = q.x - left, y = q.y - top;
      if (x < -60 || x > rect.width + 60 || y < -60 || y > rect.height + 60) return;

      const el = document.createElement("div");
      const selected = this._selected && this._id(f) === this._id(this._selected);
      el.className = "aircraft" + (selected ? " aircraft-selected" : "");
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.innerHTML = aircraftSvg(f, selected);
      el.title = (f.flight || f.callsign || f.registration || f.hex || "Aircraft") +
        " · " + (f.type || f.aircraft_code || "");
      el.addEventListener("click", event => {
        event.stopPropagation();
        this._selectAircraft(f, false);
      });
      map.appendChild(el);
    });

    const airport = this._airport();
    const ap = this._project(airport.lat, airport.lon);
    if (ap.x - left >= -20 && ap.x - left <= rect.width + 20 &&
        ap.y - top >= -20 && ap.y - top <= rect.height + 20) {
      const marker = document.createElement("div");
      marker.className = "airport airport-marker";
      marker.style.left = ap.x - left + "px";
      marker.style.top = ap.y - top + "px";
      marker.title = airport.code + " · " + airport.name;
      map.appendChild(marker);
    }

    if (typeof this._drawTrail === "function") this._drawTrail(rect, left, top);
  };

  const originalSetMode = Card.prototype._setMode;
  Card.prototype._setMode = function (mode) {
    originalSetMode.call(this, mode);
    this._initWaymorphic();
    const base = this.shadowRoot?.querySelector(".maplibre-base");
    if (base) base.style.display = mode === "WINDY" ? "none" : "block";
    this._drawMap();
  };

  Card.__FLIGHTRADAR_WAYMORPHIC__ = true;
})();
