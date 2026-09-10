/* FlightRadar Card map interaction controls. */
(function () {
  const boot = () => {
    const Card = customElements.get("flightradar-card");
    if (!Card || Card.__FLIGHTRADAR_MAP_CONTROLS__) return;

    Card.prototype._unproject = function (x, y, zoom = this._map?.zoom ?? 7) {
      const world = 256 * Math.pow(2, zoom);
      const lon = (x / world) * 360 - 180;
      const n = Math.PI - (2 * Math.PI * y) / world;
      const lat = 180 / Math.PI * Math.atan(Math.sinh(n));
      return { lat: Math.max(-85.05112878, Math.min(85.05112878, lat)), lon };
    };

    const originalDrawMap = Card.prototype._drawMap;
    if (originalDrawMap) {
      const aircraftAsset = f => {
        const code = String(f?.aircraft_code || f?.type || "").toUpperCase();
        const cat = String(f?.aircraft_category || "").toLowerCase();
        if (cat.includes("helicopter") || /H60|H47|H53|H57|H58|H64|H125|H135|H145|H160|H175|S76|S92|B06|B205|B206|B212|B214|B412|B429|B430|B505|EC|AS|AW|R22|R44|R4[0-9]/.test(code)) return ["chopper.svg", .72];
        if (/AT4|AT7|AT72|AT43|AT45|AT46|AT75|AT76|DH8|Q4|SF3|F50/.test(code) || cat.includes("turboprop")) return ["twin-prop-small.svg", .88];
        if (cat.includes("light") || /C1[0-9]|C2[0-9]|C3[0-9]|PA[0-9]|SR2[0-9]|DA[0-9]|TB[0-9]/.test(code)) return ["single-prop-small.svg", .72];
        if (/A380|A340|A350|A330|A310|A300|B747|B767|B777|B787|B788|B789/.test(code)) return ["plane-large.svg", 1.16];
        return ["plane-medium-large.svg", /E17|E18|E19|E2|CRJ|ERJ|ARJ|RJ/.test(code) ? .88 : 1];
      };

      Card.prototype._drawMap = function () {
        originalDrawMap.apply(this, arguments);
        if (this._mode !== "WINDY") return;
        const root = this.shadowRoot;
        const map = root?.querySelector(".map");
        if (!map) return;
        const rect = map.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) return;
        const center = this._project(this._map.centerLat, this._map.centerLon);
        const left = center.x - rect.width / 2;
        const top = center.y - rect.height / 2;
        root.querySelectorAll(".aircraft").forEach(e => e.remove());
        this._flights.forEach(f => {
          const lat = Number(f.lat), lon = Number(f.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
          const q = this._project(lat, lon), x = q.x - left, y = q.y - top;
          if (x < -60 || x > rect.width + 60 || y < -60 || y > rect.height + 60) return;
          const [asset, scale] = aircraftAsset(f);
          const el = document.createElement("div");
          const selected = this._selected && this._id(f) === this._id(this._selected);
          el.className = "aircraft" + (selected ? " aircraft-selected" : "");
          el.style.left = x + "px";
          el.style.top = y + "px";
          el.style.transition = "none";
          el.style.pointerEvents = "auto";
          el.innerHTML = '<div class="aircraft-icon asset-icon"><img src="/flightradar_card/assets/' + asset + '" alt="Aircraft" draggable="false"></div>';
          const icon = el.querySelector(".aircraft-icon");
          const rotation = Number(f.track ?? f.heading ?? 0) || 0;
          icon.style.transform = "translate(-50%,-50%) rotate(" + rotation + "deg) scale(" + scale + ")";
          el.title = (f.flight || f.callsign || f.registration || f.hex || "Aircraft") + " · " + (f.type || f.aircraft_code || "");
          el.addEventListener("pointerdown", e => e.stopPropagation());
          el.addEventListener("click", e => { e.stopPropagation(); this._selectAircraft(f, true); });
          map.appendChild(el);
        });
      };
    }

    Card.prototype._enableMapControls = function () {
      const map = this.shadowRoot?.querySelector(".map");
      if (!map || map.dataset.controlsBound === "true") return;
      map.dataset.controlsBound = "true";

      let dragging = false;
      let pointerId = null;
      let startX = 0;
      let startY = 0;
      let startCenter = null;
      let pinchDistance = null;
      let pinchCenter = null;

      const clampZoom = value => Math.max(3, Math.min(12, Number(value) || 7));
      const normalizeLon = lon => ((lon + 540) % 360) - 180;
      const projectCenter = () => this._project(this._map.centerLat, this._map.centerLon);
      const isAircraftTarget = target => Boolean(target?.closest?.(".aircraft-icon, .aircraft, [data-aircraft-id]"));

      const setDragging = value => {
        dragging = value;
        map.classList.toggle("map-dragging", value);
      };

      const panBy = (dx, dy) => {
        const center = startCenter || projectCenter();
        const p = this._unproject(center.x - dx, center.y - dy, this._map.zoom);
        this._map.centerLat = p.lat;
        this._map.centerLon = normalizeLon(p.lon);
        this._drawMap();
      };

      const zoomAt = (newZoom, clientX, clientY) => {
        const rect = map.getBoundingClientRect();
        const oldZoom = this._map.zoom;
        newZoom = clampZoom(newZoom);
        if (newZoom === oldZoom) return;
        const oldCenter = this._project(this._map.centerLat, this._map.centerLon);
        const worldPointX = oldCenter.x + (clientX - rect.left - rect.width / 2);
        const worldPointY = oldCenter.y + (clientY - rect.top - rect.height / 2);
        const geo = this._unproject(worldPointX, worldPointY, oldZoom);
        this._map.zoom = newZoom;
        const newWorldPoint = this._project(geo.lat, geo.lon);
        const newCenter = this._unproject(newWorldPoint.x - (clientX - rect.left - rect.width / 2), newWorldPoint.y - (clientY - rect.top - rect.height / 2), newZoom);
        this._map.centerLat = newCenter.lat;
        this._map.centerLon = normalizeLon(newCenter.lon);
        this._drawMap();
      };

      map.addEventListener("pointerdown", event => {
        if (isAircraftTarget(event.target)) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        setDragging(true);
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        startCenter = projectCenter();
        map.setPointerCapture?.(pointerId);
      });

      map.addEventListener("pointermove", event => {
        if (!dragging || event.pointerId !== pointerId) return;
        panBy(event.clientX - startX, event.clientY - startY);
      });

      const endPointer = event => {
        if (event.pointerId !== pointerId) return;
        setDragging(false);
        pointerId = null;
        startCenter = null;
        map.releasePointerCapture?.(event.pointerId);
      };
      map.addEventListener("pointerup", endPointer);
      map.addEventListener("pointercancel", endPointer);
      map.addEventListener("pointerleave", event => {
        if (event.pointerType === "mouse" && dragging) endPointer(event);
      });

      map.addEventListener("wheel", event => {
        event.preventDefault();
        zoomAt(this._map.zoom + (event.deltaY < 0 ? 1 : -1), event.clientX, event.clientY);
      }, { passive: false });

      const getTouchDistance = t => t.length < 2 ? null : Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY);
      const getTouchCenter = t => t.length < 2 ? null : { x:(t[0].clientX+t[1].clientX)/2, y:(t[0].clientY+t[1].clientY)/2 };
      map.addEventListener("touchstart", event => { if (event.touches.length >= 2) { pinchDistance=getTouchDistance(event.touches); pinchCenter=getTouchCenter(event.touches); } }, {passive:true});
      map.addEventListener("touchmove", event => {
        if (event.touches.length < 2 || !pinchDistance) return;
        event.preventDefault();
        const distance=getTouchDistance(event.touches), center=getTouchCenter(event.touches), ratio=distance/pinchDistance;
        if (ratio>1.18 || ratio<.84) { zoomAt(this._map.zoom+(ratio>1?1:-1),center.x,center.y); pinchDistance=distance; pinchCenter=center; }
      }, {passive:false});
      map.addEventListener("touchend", () => { pinchDistance=null; pinchCenter=null; }, {passive:true});
      map.addEventListener("touchcancel", () => { pinchDistance=null; pinchCenter=null; }, {passive:true});
      map.addEventListener("dblclick", event => { event.preventDefault(); zoomAt(this._map.zoom+1,event.clientX,event.clientY); });
    };

    Card.__FLIGHTRADAR_MAP_CONTROLS__ = true;
  };

  if (customElements.get("flightradar-card")) boot();
  else customElements.whenDefined("flightradar-card").then(boot);
})();
