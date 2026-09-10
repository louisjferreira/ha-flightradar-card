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
      const isAircraftTarget = target => Boolean(
        target?.closest?.(".aircraft-icon, .aircraft, [data-aircraft-id]")
      );

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
        const newCenterX = newWorldPoint.x - (clientX - rect.left - rect.width / 2);
        const newCenterY = newWorldPoint.y - (clientY - rect.top - rect.height / 2);
        const newCenter = this._unproject(newCenterX, newCenterY, newZoom);
        this._map.centerLat = newCenter.lat;
        this._map.centerLon = normalizeLon(newCenter.lon);
        this._drawMap();
      };

      const getTouchDistance = touches => {
        if (touches.length < 2) return null;
        const a = touches[0];
        const b = touches[1];
        return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      };

      const getTouchCenter = touches => {
        if (touches.length < 2) return null;
        return {
          x: (touches[0].clientX + touches[1].clientX) / 2,
          y: (touches[0].clientY + touches[1].clientY) / 2,
        };
      };

      map.addEventListener("pointerdown", event => {
        // Aircraft markers must receive the complete pointer sequence so a
        // click can select them. Never let the map capture the pointer when
        // the gesture starts on an aircraft icon or its image.
        if (isAircraftTarget(event.target)) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        dragging = true;
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        startCenter = projectCenter();
        map.setPointerCapture?.(pointerId);
      });

      map.addEventListener("pointermove", event => {
        if (!dragging || event.pointerId !== pointerId) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        panBy(dx, dy);
      });

      const endPointer = event => {
        if (event.pointerId !== pointerId) return;
        dragging = false;
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
        const direction = event.deltaY < 0 ? 1 : -1;
        zoomAt(this._map.zoom + direction, event.clientX, event.clientY);
      }, { passive: false });

      map.addEventListener("touchstart", event => {
        if (event.touches.length < 2) return;
        pinchDistance = getTouchDistance(event.touches);
        pinchCenter = getTouchCenter(event.touches);
      }, { passive: true });

      map.addEventListener("touchmove", event => {
        if (event.touches.length < 2 || !pinchDistance || !pinchCenter) return;
        event.preventDefault();
        const distance = getTouchDistance(event.touches);
        const center = getTouchCenter(event.touches);
        if (!distance || !center) return;
        const ratio = distance / pinchDistance;
        if (ratio > 1.18 || ratio < 0.84) {
          zoomAt(this._map.zoom + (ratio > 1 ? 1 : -1), center.x, center.y);
          pinchDistance = distance;
          pinchCenter = center;
        }
      }, { passive: false });

      const endPinch = () => {
        pinchDistance = null;
        pinchCenter = null;
      };
      map.addEventListener("touchend", endPinch, { passive: true });
      map.addEventListener("touchcancel", endPinch, { passive: true });

      map.addEventListener("dblclick", event => {
        event.preventDefault();
        zoomAt(this._map.zoom + 1, event.clientX, event.clientY);
      });
    };

    Card.__FLIGHTRADAR_MAP_CONTROLS__ = true;

    document.querySelectorAll("flightradar-card").forEach(card => {
      try { card._enableMapControls(); } catch (error) {
        console.warn("[FlightRadar Card] Map controls initialisation failed:", error);
      }
    });
  };

  if (customElements.get("flightradar-card")) boot();
  else customElements.whenDefined("flightradar-card").then(boot);
})();
