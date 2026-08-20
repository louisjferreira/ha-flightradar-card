/*
 * FlightRadar Card for Home Assistant
 * Live ADS-B data via Airplanes.live.
 */

const CARD_VERSION = "0.6.0";
const TILE_SIZE = 256;
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const LIVE_API_BASE = "https://api.airplanes.live/v2";

const AIRPORTS = {
  HRE: { name: "Robert Gabriel Mugabe International", city: "Harare", country: "Zimbabwe", latitude: -17.9318, longitude: 31.0928, code: "HRE", icao: "FVHA" },
};

const AIRLINE_NAMES = {
  SAA: "South African Airways", BAW: "British Airways", CCA: "Air China", CPA: "Cathay Pacific",
  DLH: "Lufthansa", UAE: "Emirates", ET: "Ethiopian Airlines", KQ: "Kenya Airways",
  FA: "FlySafair", LM: "LAM Mozambique Airlines", RWD: "RwandAir", FDX: "FedEx", UPS: "UPS Airlines",
  AAL: "American Airlines", UAL: "United Airlines", DAL: "Delta Air Lines",
};

class FlightradarCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._selected = null;
    this._flights = [];
    this._loading = false;
    this._error = "";
    this._searchError = "";
    this._searchTimer = null;
    this._refreshTimer = null;
    this._resizeObserver = null;
    this._viewportHandler = () => this._updateViewportHeight();
    this._liveCenter = null;
  }

  setConfig(config) {
    this._config = { airport: "HRE", map: {}, appearance: {}, live: {}, refresh_interval: 15, ...config };
    this._render();
    this._startLiveUpdates();
  }

  set hass(hass) { this._hass = hass; }
  getCardSize() { return 7; }

  _airport() {
    const key = String(this._config.airport || "HRE").toUpperCase();
    return AIRPORTS[key] || AIRPORTS.HRE;
  }

  _project(lat, lon, zoom) {
    const n = Math.pow(2, zoom);
    const x = (lon + 180) / 360 * n * TILE_SIZE;
    const latRad = lat * Math.PI / 180;
    const y = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n * TILE_SIZE;
    return { x, y };
  }

  _tileX(x, n) { return ((x % n) + n) % n; }

  _mapCenter(airport) {
    if (this._liveCenter) return this._liveCenter;
    const map = this._config.map || {};
    if (map.center_on_airport !== false) return { latitude: airport.latitude, longitude: airport.longitude };
    return { latitude: Number(map.latitude ?? airport.latitude), longitude: Number(map.longitude ?? airport.longitude) };
  }

  _fullScreenHeight() {
    const viewport = window.visualViewport?.height || window.innerHeight;
    const top = Math.max(0, this.getBoundingClientRect().top);
    const bottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--safe-area-inset-bottom")) || 0;
    return Math.max(420, Math.round(viewport - top - bottom));
  }

  _updateViewportHeight() {
    const card = this.shadowRoot.querySelector(".card");
    if (!card) return;
    const appearance = this._config.appearance || {};
    const fullScreen = appearance.full_screen !== false;
    if (!fullScreen || appearance.height) return;
    const height = this._fullScreenHeight();
    card.style.height = `${height}px`;
    this.style.height = `${height}px`;
    this._renderMap();
  }

  _planeSvg() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.8 10.7 14 8.1V3.8c0-.9-.9-1.6-1.9-1.6s-1.9.7-1.9 1.6v4.3L2.2 10.7c-.7.2-1.2.9-1.2 1.6 0 .9.8 1.5 1.7 1.3l7.5-1.6v4.3l-2.5 1.5c-.4.2-.6.6-.6 1.1v.6l5-1.2 5 1.2v-.6c0-.5-.2-.9-.6-1.1L14 16.3V12l7.5 1.6c.9.2 1.7-.4 1.7-1.3 0-.7-.5-1.4-1.2-1.6Z"/></svg>`;
  }

  _airlineName(callsign) {
    const prefix = String(callsign || "").trim().split(/[0-9]/)[0].toUpperCase();
    return AIRLINE_NAMES[prefix] || "Unknown airline";
  }

  _formatAltitude(value) {
    if (value === undefined || value === null || value === "") return "—";
    if (value === "ground") return "GROUND";
    const n = Number(value);
    return Number.isFinite(n) ? `${Math.round(n).toLocaleString()} ft` : String(value);
  }

  _formatSpeed(knots) {
    const n = Number(knots);
    if (!Number.isFinite(n)) return "—";
    return `${Math.round(n * 1.852)} km/h`;
  }

  _aircraftType(ac) { return ac.t || ac.desc || "Aircraft"; }

  _photoForType(type) {
    const t = String(type || "").toUpperCase();
    if (t.includes("E190") || t.includes("E195")) return { url: "https://commons.wikimedia.org/wiki/Special:FilePath/EMBRAER_E-190.jpg?width=900", credit: "Wikimedia Commons · CC0" };
    if (t.includes("B787")) return { url: "https://commons.wikimedia.org/wiki/Special:FilePath/First_flight_of_Boeing_787-9_crop.jpg?width=900", credit: "Wikimedia Commons · Gordon Werner · CC BY 2.0" };
    return { url: "https://commons.wikimedia.org/wiki/Special:FilePath/Boeing_737_800_plane.jpg?width=900", credit: "Wikimedia Commons · public domain" };
  }

  _normalizeAircraft(ac) {
    const callsign = String(ac.flight || "").trim() || String(ac.r || ac.hex || "").trim().toUpperCase();
    const type = this._aircraftType(ac);
    const photo = this._photoForType(type);
    return {
      id: String(ac.hex || callsign), hex: String(ac.hex || "").toUpperCase(), flight: callsign || "UNKNOWN",
      airline: this._airlineName(callsign), registration: ac.r || "—", type,
      altitude: this._formatAltitude(ac.alt_baro ?? ac.alt_geom), speed: this._formatSpeed(ac.gs),
      lat: Number(ac.lat), lon: Number(ac.lon), heading: Number(ac.track ?? ac.true_heading ?? 0),
      onGround: ac.alt_baro === "ground" || ac.on_ground === true, photo: photo.url, photoCredit: photo.credit,
      seen: Number(ac.seen ?? 0), raw: ac,
    };
  }

  async _fetchJson(url) {
    const response = await fetch(url, { method: "GET", cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async _loadLiveAircraft() {
    if (this._loading) return;
    this._loading = true; this._error = ""; this._setStatus();
    try {
      const airport = this._airport();
      const live = this._config.live || {};
      const radius = Math.max(10, Math.min(250, Number(live.radius_nm ?? 250)));
      const data = await this._fetchJson(`${LIVE_API_BASE}/point/${airport.latitude}/${airport.longitude}/${radius}`);
      const aircraft = Array.isArray(data?.ac) ? data.ac : [];
      this._flights = aircraft.map(ac => this._normalizeAircraft(ac)).filter(ac => Number.isFinite(ac.lat) && Number.isFinite(ac.lon));
      if (this._selected) {
        const fresh = this._flights.find(f => f.id === this._selected.id || (f.flight && f.flight === this._selected.flight));
        if (fresh) this._selected = fresh;
      }
      if (!this._selected && this._flights.length) this._selected = this._flights[0];
      this._render();
    } catch (error) {
      console.warn("FlightRadar Card live data error", error);
      this._error = "Live data unavailable"; this._render();
    } finally { this._loading = false; this._setStatus(); }
  }

  async _searchFlight(query) {
    const q = String(query || "").trim().toUpperCase();
    if (!q) return;
    this._searchError = "Searching…"; this._setStatus();
    try {
      const encoded = encodeURIComponent(q);
      const endpoints = [`${LIVE_API_BASE}/callsign/${encoded}`, `${LIVE_API_BASE}/reg/${encoded}`, `${LIVE_API_BASE}/hex/${encoded}`];
      let found = null;
      for (const endpoint of endpoints) {
        try {
          const data = await this._fetchJson(endpoint);
          const ac = Array.isArray(data?.ac) ? data.ac : [];
          if (ac.length) { found = this._normalizeAircraft(ac[0]); break; }
        } catch (_) { /* Try the next exact-search endpoint. */ }
      }
      if (!found) { this._searchError = `No live aircraft found for ${q}`; this._setStatus(); return; }
      this._selected = found; this._liveCenter = { latitude: found.lat, longitude: found.lon };
      const existing = this._flights.findIndex(f => f.id === found.id);
      if (existing >= 0) this._flights[existing] = found; else this._flights = [found, ...this._flights];
      this._searchError = ""; this._render();
    } catch (error) {
      console.warn("FlightRadar Card search error", error); this._searchError = "Search failed"; this._setStatus();
    }
  }

  _startLiveUpdates() {
    this._stopLiveUpdates();
    const seconds = Math.max(5, Number(this._config.refresh_interval ?? 15));
    this._loadLiveAircraft();
    this._refreshTimer = window.setInterval(() => this._loadLiveAircraft(), seconds * 1000);
  }

  _stopLiveUpdates() {
    if (this._refreshTimer) window.clearInterval(this._refreshTimer);
    this._refreshTimer = null;
    if (this._searchTimer) window.clearTimeout(this._searchTimer);
    this._searchTimer = null;
  }

  _setStatus() {
    const status = this.shadowRoot.querySelector(".live-status");
    if (!status) return;
    if (this._loading) status.textContent = "UPDATING";
    else if (this._searchError) status.textContent = this._searchError;
    else if (this._error) status.textContent = this._error;
    else status.textContent = `${this._flights.length} aircraft · LIVE`;
  }

  _render() {
    const airport = this._airport();
    const appearance = this._config.appearance || {};
    const fullScreen = appearance.full_screen !== false;
    const explicitHeight = appearance.height;
    const height = explicitHeight || (fullScreen ? this._fullScreenHeight() : 520);
    const heightValue = typeof height === "number" ? `${height}px` : height;
    const selected = this._selected || this._flights[0] || {
      id: "none", flight: "—", airline: "Waiting for live data", registration: "—", type: "—", altitude: "—", speed: "—",
      lat: airport.latitude, lon: airport.longitude, heading: 0,
      photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Boeing_737_800_plane.jpg?width=900", photoCredit: "Aircraft photo · Wikimedia Commons"
    };
    this._selected = selected;
    const liveRows = this._flights.slice(0, 5);

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; color:#fff; font-family:var(--primary-font-family,Arial,sans-serif); } * { box-sizing:border-box; }
        .card { position:relative; overflow:hidden; width:100%; height:${heightValue}; min-height:${fullScreen ? "0" : "420px"}; border-radius:${fullScreen ? "0" : "18px"}; background:#111820; border:${fullScreen ? "0" : "1px solid rgba(255,255,255,.12)"}; box-shadow:${fullScreen ? "none" : "0 10px 30px rgba(0,0,0,.25)"}; }
        .map,.tile-layer { position:absolute; inset:0; overflow:hidden; } .map { background:#18232b; } .tile-layer { background:#26343d; }
        .tile { position:absolute; width:${TILE_SIZE}px; height:${TILE_SIZE}px; max-width:none; user-select:none; pointer-events:none; filter:saturate(.72) brightness(.72); }
        .shade { position:absolute; inset:0; background:linear-gradient(180deg,rgba(4,10,15,.18),rgba(4,10,15,.05) 45%,rgba(4,10,15,.45)); pointer-events:none; }
        .map-grid { position:absolute; inset:0; opacity:.05; pointer-events:none; background-image:linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px); background-size:80px 80px; }
        .aircraft-layer { position:absolute; inset:0; pointer-events:none; } .airport-marker { position:absolute; transform:translate(-50%,-50%); pointer-events:none; text-align:center; z-index:4; }
        .airport-dot { width:14px; height:14px; margin:auto; border-radius:50%; background:#fff; border:3px solid rgba(255,255,255,.28); box-shadow:0 0 0 5px rgba(255,255,255,.08),0 2px 8px rgba(0,0,0,.5); }
        .airport-label { margin-top:6px; padding:3px 6px; border-radius:5px; background:rgba(8,14,20,.76); color:#e7edf1; font-size:9px; letter-spacing:.08em; white-space:nowrap; }
        .panel { position:absolute; pointer-events:auto; background:rgba(8,14,20,.88); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,.14); border-radius:14px; box-shadow:0 8px 24px rgba(0,0,0,.28); z-index:10; }
        .search { left:50%; top:14px; transform:translateX(-50%); width:min(520px,calc(100% - 720px)); min-width:300px; padding:6px; z-index:15; }
        .search-form { display:flex; align-items:center; gap:6px; } .search-input { flex:1; min-width:0; border:0; outline:0; background:rgba(255,255,255,.08); color:#fff; border-radius:9px; padding:10px 12px; font:inherit; font-size:12px; }
        .search-input::placeholder { color:#8f9ca6; } .search-button { border:0; border-radius:9px; padding:10px 14px; background:#fff; color:#101820; font-weight:700; cursor:pointer; font-size:11px; }
        .search-button:disabled { opacity:.55; cursor:wait; }
        .selected { left:14px; top:14px; width:min(360px,calc(100% - 28px)); padding:0; overflow:hidden; }
        .photo-wrap { position:relative; height:128px; background:#202a31; overflow:hidden; } .photo { display:block; width:100%; height:100%; object-fit:cover; object-position:center; }
        .photo-shade { position:absolute; inset:0; background:linear-gradient(180deg,rgba(0,0,0,0) 35%,rgba(8,14,20,.78) 100%); pointer-events:none; }
        .photo-caption { position:absolute; left:10px; bottom:7px; right:10px; font-size:8px; color:rgba(255,255,255,.72); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .selected-body { padding:12px 14px 14px; } .eyebrow { font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:#9caab5; margin-bottom:4px; }
        .flight { font-size:23px; font-weight:700; line-height:1.1; } .airline { color:#c4cdd4; font-size:12px; margin-top:3px; }
        .route { display:flex; align-items:center; gap:8px; margin:12px 0; font-size:12px; } .route span:nth-child(2) { flex:1; height:1px; background:rgba(255,255,255,.2); } .route small { color:#8e9ca7; }
        .stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; } .stat { padding:8px; border-radius:9px; background:rgba(255,255,255,.06); }
        .stat-label { font-size:9px; color:#8e9ca7; text-transform:uppercase; } .stat-value { margin-top:2px; font-size:12px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .movements { right:14px; top:14px; width:min(330px,calc(100% - 28px)); padding:12px; } .movement-title { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
        .movement-title strong { font-size:13px; } .movement-title span { font-size:10px; color:#9caab5; } .rows { display:grid; gap:4px; max-height:235px; overflow:hidden; }
        .row { display:grid; grid-template-columns:34px 58px 1fr 42px; align-items:center; gap:5px; padding:7px 6px; border-radius:8px; background:rgba(255,255,255,.045); font-size:10px; }
        .kind { font-size:9px; font-weight:700; color:#82c9ff; } .row .route-name { color:#c8d0d6; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; } .row time { text-align:right; color:#fff; font-variant-numeric:tabular-nums; }
        .aircraft { position:absolute; transform:translate(-50%,-50%); pointer-events:auto; cursor:pointer; z-index:6; } .aircraft button { border:0; background:transparent; color:#fff; padding:5px; cursor:pointer; }
        .plane { display:block; width:28px; height:28px; transform-origin:center; filter:drop-shadow(0 2px 4px rgba(0,0,0,.8)); transition:transform .15s ease,color .15s ease; } .plane svg { display:block; width:100%; height:100%; fill:currentColor; }
        .aircraft:hover .plane { color:#d8f0ff; transform:scale(1.12); } .aircraft.selected-aircraft .plane { color:#ffcc66; transform:scale(1.32); filter:drop-shadow(0 0 7px rgba(255,204,102,.65)); }
        .tooltip { position:absolute; left:50%; top:36px; transform:translateX(-50%); white-space:nowrap; padding:4px 7px; border-radius:6px; background:rgba(0,0,0,.78); font-size:9px; opacity:0; transition:opacity .15s; pointer-events:none; }
        .aircraft:hover .tooltip,.aircraft.selected-aircraft .tooltip { opacity:1; } .footer { position:absolute; left:14px; right:14px; bottom:12px; display:flex; justify-content:space-between; align-items:center; pointer-events:none; z-index:12; }
        .badge { background:rgba(8,14,20,.82); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,.12); border-radius:9px; padding:7px 9px; font-size:10px; color:#dce3e8; }
        .live-status { max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .attribution { position:absolute; right:5px; bottom:2px; z-index:13; font-size:7px; color:rgba(255,255,255,.7); pointer-events:none; }
        @media(max-width:1000px) { .search { width:min(420px,calc(100% - 430px)); min-width:260px; } }
        @media(max-width:850px) { .search { top:14px; width:min(360px,calc(100% - 28px)); min-width:0; } .selected { top:72px; width:min(340px,calc(100% - 28px)); } .movements { width:min(310px,calc(100% - 28px)); } }
        @media(max-width:650px) { .search { width:calc(100% - 28px); } .selected { top:72px; width:calc(100% - 28px); } .photo-wrap { height:115px; } .movements { top:auto; bottom:54px; width:calc(100% - 28px); max-height:160px; } .rows { max-height:105px; } .footer { bottom:10px; } .footer .badge:first-child { max-width:55%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .live-status { max-width:45%; } }
      </style>
      <ha-card class="card">
        <div class="map"><div class="tile-layer"></div><div class="map-grid"></div><div class="shade"></div><div class="aircraft-layer"></div><div class="airport-marker"><div class="airport-dot"></div><div class="airport-label">${airport.code} · ${airport.city.toUpperCase()}</div></div></div>
        <section class="panel search"><form class="search-form"><input class="search-input" type="search" autocomplete="off" spellcheck="false" placeholder="Search flight / registration / ICAO…" aria-label="Search flight"><button class="search-button" type="submit">SEARCH</button></form></section>
        <section class="panel selected"><div class="photo-wrap"><img class="photo" src="${selected.photo}" alt="${selected.type}" loading="eager" referrerpolicy="no-referrer"><div class="photo-shade"></div><div class="photo-caption">${selected.photoCredit || "Aircraft photo"}</div></div><div class="selected-body"><div class="eyebrow">Selected aircraft</div><div class="flight">${selected.flight}</div><div class="airline">${selected.airline}</div><div class="route"><span>${selected.registration || "—"}</span><span></span><small>${selected.hex || "LIVE ADS-B"}</small></div><div class="stats"><div class="stat"><div class="stat-label">Aircraft</div><div class="stat-value">${selected.type}</div></div><div class="stat"><div class="stat-label">Altitude</div><div class="stat-value">${selected.altitude}</div></div><div class="stat"><div class="stat-label">Speed</div><div class="stat-value">${selected.speed}</div></div></div></div></section>
        <section class="panel movements"><div class="movement-title"><strong>${airport.code} · Live Traffic</strong><span>ADS-B</span></div><div class="rows">${liveRows.length ? liveRows.map(f => `<div class="row"><span class="kind">${f.onGround ? "GND" : "AIR"}</span><strong>${f.flight}</strong><span class="route-name">${f.type}</span><time>${f.altitude === "GROUND" ? "GROUND" : f.altitude.replace(" ft", "")}</time></div>`).join("") : `<div class="row"><span class="kind">—</span><strong>NO DATA</strong><span class="route-name">Waiting for ADS-B</span><time>—</time></div>`}</div></section>
        <div class="footer"><div class="badge">${airport.name}</div><div class="badge live-status">${this._flights.length} aircraft · LIVE</div></div><div class="attribution">ADS-B data: Airplanes.live · © OpenStreetMap contributors</div>
      </ha-card>`;

    this.style.height = `${typeof height === "number" ? height : this._fullScreenHeight()}px`;
    const form = this.shadowRoot.querySelector(".search-form");
    const input = this.shadowRoot.querySelector(".search-input");
    const button = this.shadowRoot.querySelector(".search-button");
    if (form && input && button) {
      form.addEventListener("submit", event => { event.preventDefault(); this._searchFlight(input.value); });
      input.addEventListener("input", () => {
        if (this._searchTimer) window.clearTimeout(this._searchTimer);
        this._searchTimer = window.setTimeout(() => { const value = input.value.trim(); if (value.length >= 3) this._searchFlight(value); }, 700);
      });
      button.disabled = this._loading;
    }
    if (this._resizeObserver) this._resizeObserver.disconnect();
    const mapEl = this.shadowRoot.querySelector(".map");
    if (mapEl && "ResizeObserver" in window) { this._resizeObserver = new ResizeObserver(() => this._renderMap()); this._resizeObserver.observe(mapEl); }
    window.removeEventListener("resize", this._viewportHandler); window.addEventListener("resize", this._viewportHandler, { passive: true });
    window.visualViewport?.removeEventListener("resize", this._viewportHandler); window.visualViewport?.addEventListener("resize", this._viewportHandler, { passive: true });
    requestAnimationFrame(() => this._renderMap());
    this._setStatus();
  }

  _renderMap() {
    const mapEl = this.shadowRoot.querySelector(".map");
    const tileLayer = this.shadowRoot.querySelector(".tile-layer");
    const aircraftLayer = this.shadowRoot.querySelector(".aircraft-layer");
    const airportMarker = this.shadowRoot.querySelector(".airport-marker");
    if (!mapEl || !tileLayer || !aircraftLayer || !airportMarker) return;
    const airport = this._airport();
    const map = this._config.map || {};
    const zoom = Math.max(2, Math.min(12, Number(map.zoom ?? 7)));
    const center = this._mapCenter(airport);
    const width = mapEl.clientWidth, height = mapEl.clientHeight;
    if (!width || !height) return;
    const centerPx = this._project(center.latitude, center.longitude, zoom);
    const n = Math.pow(2, zoom);
    const tilesX = Math.ceil(width / TILE_SIZE) + 2, tilesY = Math.ceil(height / TILE_SIZE) + 2;
    const centerTileX = Math.floor(centerPx.x / TILE_SIZE), centerTileY = Math.floor(centerPx.y / TILE_SIZE);
    const startX = centerTileX - Math.floor(tilesX / 2), startY = centerTileY - Math.floor(tilesY / 2);
    const originX = width / 2 - (centerPx.x - centerTileX * TILE_SIZE), originY = height / 2 - (centerPx.y - centerTileY * TILE_SIZE);
    tileLayer.innerHTML = "";
    for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < tilesX; tx++) {
      const rawX = startX + tx, rawY = startY + ty; if (rawY < 0 || rawY >= n) continue;
      const img = document.createElement("img"); img.className = "tile";
      img.src = OSM_TILE_URL.replace("{z}", zoom).replace("{x}", this._tileX(rawX, n)).replace("{y}", rawY);
      img.style.left = `${originX + (rawX - centerTileX) * TILE_SIZE}px`; img.style.top = `${originY + (rawY - centerTileY) * TILE_SIZE}px`; img.alt = ""; tileLayer.appendChild(img);
    }
    const airportPx = this._project(airport.latitude, airport.longitude, zoom);
    airportMarker.style.left = `${width / 2 + (airportPx.x - centerPx.x)}px`; airportMarker.style.top = `${height / 2 + (airportPx.y - centerPx.y)}px`;
    aircraftLayer.innerHTML = "";
    this._flights.forEach(flight => {
      const p = this._project(flight.lat, flight.lon, zoom), x = width / 2 + (p.x - centerPx.x), y = height / 2 + (p.y - centerPx.y);
      if (x < -40 || x > width + 40 || y < -40 || y > height + 40) return;
      const wrapper = document.createElement("div"); wrapper.className = `aircraft ${flight.id === this._selected.id ? "selected-aircraft" : ""}`; wrapper.style.left = `${x}px`; wrapper.style.top = `${y}px`;
      const button = document.createElement("button"); button.type = "button"; button.setAttribute("aria-label", `Track ${flight.flight}`);
      button.innerHTML = `<span class="plane" style="transform:rotate(${Number.isFinite(flight.heading) ? flight.heading : 0}deg)">${this._planeSvg()}</span><span class="tooltip">${flight.flight}</span>`;
      button.addEventListener("click", ev => { ev.stopPropagation(); this._selected = flight; this._liveCenter = { latitude: flight.lat, longitude: flight.lon }; this._render(); });
      wrapper.appendChild(button); aircraftLayer.appendChild(wrapper);
    });
  }

  disconnectedCallback() {
    this._stopLiveUpdates(); if (this._resizeObserver) this._resizeObserver.disconnect();
    window.removeEventListener("resize", this._viewportHandler); window.visualViewport?.removeEventListener("resize", this._viewportHandler);
  }
}

if (!customElements.get("flightradar-card")) customElements.define("flightradar-card", FlightradarCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "flightradar-card", name: "FlightRadar Card", description: "Live FlightRadar-style tracking map card for Home Assistant", preview: true });
