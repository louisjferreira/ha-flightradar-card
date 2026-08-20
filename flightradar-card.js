/*
 * FlightRadar Card for Home Assistant
 * UI prototype - live flight data will be added in a later milestone.
 */

const CARD_VERSION = "0.3.0";
const TILE_SIZE = 256;
const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const AIRPORTS = {
  HRE: { name: "Robert Gabriel Mugabe International", city: "Harare", country: "Zimbabwe", latitude: -17.9318, longitude: 31.0928, code: "HRE" },
};

const DEMO_FLIGHTS = [
  { id: "demo-1", flight: "SAA218", airline: "South African Airways", type: "B737-800", altitude: "31,000 ft", speed: "448 km/h", origin: "Johannesburg", destination: "Harare", lat: -18.22, lon: 29.95, heading: 72, photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Boeing_737_800_plane.jpg?width=900", photoCredit: "Wikimedia Commons · public domain" },
  { id: "demo-2", flight: "ET893", airline: "Ethiopian Airlines", type: "B787-9", altitude: "36,000 ft", speed: "821 km/h", origin: "Addis Ababa", destination: "Harare", lat: -15.95, lon: 31.75, heading: 178, photo: "https://commons.wikimedia.org/wiki/Special:FilePath/First_flight_of_Boeing_787-9_crop.jpg?width=900", photoCredit: "Wikimedia Commons · Gordon Werner · CC BY 2.0" },
  { id: "demo-3", flight: "KQ706", airline: "Kenya Airways", type: "B737-800", altitude: "34,000 ft", speed: "794 km/h", origin: "Nairobi", destination: "Harare", lat: -15.90, lon: 33.10, heading: 207, photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Boeing_737_800_plane.jpg?width=900", photoCredit: "Wikimedia Commons · public domain" },
  { id: "demo-4", flight: "FA221", airline: "FlySafair", type: "B737-800", altitude: "28,000 ft", speed: "765 km/h", origin: "Harare", destination: "Johannesburg", lat: -20.35, lon: 31.55, heading: 252, photo: "https://commons.wikimedia.org/wiki/Special:FilePath/Boeing_737_800_plane.jpg?width=900", photoCredit: "Wikimedia Commons · public domain" },
  { id: "demo-5", flight: "LM402", airline: "LAM Mozambique Airlines", type: "E190", altitude: "24,000 ft", speed: "610 km/h", origin: "Maputo", destination: "Harare", lat: -19.05, lon: 32.35, heading: 326, photo: "https://commons.wikimedia.org/wiki/Special:FilePath/EMBRAER_E-190.jpg?width=900", photoCredit: "Wikimedia Commons · CC0" },
];

class FlightradarCard extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); this._config = {}; this._selected = DEMO_FLIGHTS[0]; this._resizeObserver = null; }
  setConfig(config) { this._config = { airport: "HRE", map: {}, appearance: {}, refresh_interval: 15, ...config }; this._render(); }
  set hass(hass) { this._hass = hass; }
  getCardSize() { return 7; }
  _airport() { const key = String(this._config.airport || "HRE").toUpperCase(); return AIRPORTS[key] || AIRPORTS.HRE; }
  _project(lat, lon, zoom) { const n = Math.pow(2, zoom); const x = (lon + 180) / 360 * n * TILE_SIZE; const latRad = lat * Math.PI / 180; const y = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n * TILE_SIZE; return { x, y }; }
  _tileX(x, n) { return ((x % n) + n) % n; }
  _mapCenter(airport) { const map = this._config.map || {}; if (map.center_on_airport !== false) return { latitude: airport.latitude, longitude: airport.longitude }; return { latitude: Number(map.latitude ?? airport.latitude), longitude: Number(map.longitude ?? airport.longitude) }; }

  _render() {
    const airport = this._airport();
    const height = this._config.appearance?.height || "min(72vh, 720px)";
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; width:100%; color:#fff; font-family:var(--primary-font-family,Arial,sans-serif); } * { box-sizing:border-box; }
        .card { position:relative; overflow:hidden; width:100%; height:${height}; min-height:420px; border-radius:18px; background:#111820; border:1px solid rgba(255,255,255,.12); box-shadow:0 10px 30px rgba(0,0,0,.25); }
        .map { position:absolute; inset:0; overflow:hidden; background:#18232b; } .tile-layer { position:absolute; inset:0; overflow:hidden; background:#26343d; }
        .tile { position:absolute; width:${TILE_SIZE}px; height:${TILE_SIZE}px; max-width:none; user-select:none; pointer-events:none; filter:saturate(.72) brightness(.72); }
        .shade { position:absolute; inset:0; background:linear-gradient(180deg,rgba(4,10,15,.18),rgba(4,10,15,.05) 45%,rgba(4,10,15,.45)); pointer-events:none; }
        .map-grid { position:absolute; inset:0; opacity:.05; pointer-events:none; background-image:linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px); background-size:80px 80px; }
        .aircraft-layer { position:absolute; inset:0; pointer-events:none; } .airport-marker { position:absolute; transform:translate(-50%,-50%); pointer-events:none; text-align:center; z-index:4; }
        .airport-dot { width:14px; height:14px; margin:auto; border-radius:50%; background:#fff; border:3px solid rgba(255,255,255,.28); box-shadow:0 0 0 5px rgba(255,255,255,.08),0 2px 8px rgba(0,0,0,.5); }
        .airport-label { margin-top:6px; padding:3px 6px; border-radius:5px; background:rgba(8,14,20,.76); color:#e7edf1; font-size:9px; letter-spacing:.08em; white-space:nowrap; }
        .panel { position:absolute; pointer-events:auto; background:rgba(8,14,20,.88); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,.14); border-radius:14px; box-shadow:0 8px 24px rgba(0,0,0,.28); z-index:10; }
        .selected { left:14px; top:14px; width:min(360px,calc(100% - 28px)); padding:0; overflow:hidden; } .photo-wrap { position:relative; height:128px; background:#202a31; overflow:hidden; }
        .photo { display:block; width:100%; height:100%; object-fit:cover; object-position:center; } .photo-shade { position:absolute; inset:0; background:linear-gradient(180deg,rgba(0,0,0,0) 35%,rgba(8,14,20,.78) 100%); pointer-events:none; }
        .photo-caption { position:absolute; left:10px; bottom:7px; right:10px; font-size:8px; color:rgba(255,255,255,.72); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .selected-body { padding:12px 14px 14px; }
        .eyebrow { font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:#9caab5; margin-bottom:4px; } .flight { font-size:23px; font-weight:700; line-height:1.1; }
        .airline { color:#c4cdd4; font-size:12px; margin-top:3px; } .route { display:flex; align-items:center; gap:8px; margin:12px 0; font-size:12px; } .route span:nth-child(2) { flex:1; height:1px; background:rgba(255,255,255,.2); }
        .stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; } .stat { padding:8px; border-radius:9px; background:rgba(255,255,255,.06); } .stat-label { font-size:9px; color:#8e9ca7; text-transform:uppercase; } .stat-value { margin-top:2px; font-size:12px; font-weight:600; }
        .movements { right:14px; top:14px; width:min(330px,calc(100% - 28px)); padding:12px; } .movement-title { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; } .movement-title strong { font-size:13px; } .movement-title span { font-size:10px; color:#9caab5; }
        .rows { display:grid; gap:4px; max-height:235px; overflow:hidden; } .row { display:grid; grid-template-columns:34px 58px 1fr 42px; align-items:center; gap:5px; padding:7px 6px; border-radius:8px; background:rgba(255,255,255,.045); font-size:10px; }
        .kind { font-size:9px; font-weight:700; } .arr { color:#82c9ff; } .dep { color:#a9e7a4; } .row .route-name { color:#c8d0d6; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; } .row time { text-align:right; color:#fff; font-variant-numeric:tabular-nums; }
        .aircraft { position:absolute; transform:translate(-50%,-50%); pointer-events:auto; cursor:pointer; z-index:6; } .aircraft button { border:0; background:transparent; color:#fff; padding:5px; cursor:pointer; }
        .plane { display:block; width:28px; height:28px; transform-origin:center; filter:drop-shadow(0 2px 4px rgba(0,0,0,.8)); transition:transform .15s ease,color .15s ease; } .plane svg { display:block; width:100%; height:100%; fill:currentColor; }
        .aircraft:hover .plane { color:#d8f0ff; transform:scale(1.12); } .aircraft.selected-aircraft .plane { color:#ffcc66; transform:scale(1.32); filter:drop-shadow(0 0 7px rgba(255,204,102,.65)); }
        .tooltip { position:absolute; left:50%; top:36px; transform:translateX(-50%); white-space:nowrap; padding:4px 7px; border-radius:6px; background:rgba(0,0,0,.78); font-size:9px; opacity:0; transition:opacity .15s; pointer-events:none; } .aircraft:hover .tooltip, .aircraft.selected-aircraft .tooltip { opacity:1; }
        .footer { position:absolute; left:14px; right:14px; bottom:12px; display:flex; justify-content:space-between; align-items:center; pointer-events:none; z-index:12; } .badge { background:rgba(8,14,20,.82); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,.12); border-radius:9px; padding:7px 9px; font-size:10px; color:#dce3e8; }
        .attribution { position:absolute; right:5px; bottom:2px; z-index:13; font-size:7px; color:rgba(255,255,255,.6); pointer-events:none; }
        @media(max-width:850px) { .selected { width:min(340px,calc(100% - 28px)); } .movements { width:min(310px,calc(100% - 28px)); } }
        @media(max-width:650px) { .card { min-height:600px; height:auto; } .selected { width:calc(100% - 28px); } .photo-wrap { height:115px; } .movements { top:auto; bottom:54px; width:calc(100% - 28px); max-height:160px; } .rows { max-height:105px; } .footer { bottom:10px; } .footer .badge:first-child { max-width:55%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } }
      </style>
      <ha-card class="card">
        <div class="map"><div class="tile-layer"></div><div class="map-grid"></div><div class="shade"></div><div class="aircraft-layer"></div><div class="airport-marker"><div class="airport-dot"></div><div class="airport-label">${airport.code} · ${airport.city.toUpperCase()}</div></div></div>
        <div class="overlay">
          <section class="panel selected">
            <div class="photo-wrap"><img class="photo" src="${this._selected.photo}" alt="${this._selected.type}" loading="eager" referrerpolicy="no-referrer"><div class="photo-shade"></div><div class="photo-caption">${this._selected.photoCredit || "Aircraft photo"}</div></div>
            <div class="selected-body"><div class="eyebrow">Selected aircraft</div><div class="flight">${this._selected.flight}</div><div class="airline">${this._selected.airline}</div><div class="route"><span>${this._selected.origin}</span><span></span><span>${this._selected.destination}</span></div><div class="stats"><div class="stat"><div class="stat-label">Aircraft</div><div class="stat-value">${this._selected.type}</div></div><div class="stat"><div class="stat-label">Altitude</div><div class="stat-value">${this._selected.altitude}</div></div><div class="stat"><div class="stat-label">Speed</div><div class="stat-value">${this._selected.speed}</div></div></div></div>
          </section>
          <section class="panel movements"><div class="movement-title"><strong>${airport.code} · Arrivals & Departures</strong><span>LIVE BOARD</span></div><div class="rows"><div class="row"><span class="kind arr">ARR</span><strong>SAA218</strong><span class="route-name">Johannesburg</span><time>09:35</time></div><div class="row"><span class="kind arr">ARR</span><strong>ET893</strong><span class="route-name">Addis Ababa</span><time>10:10</time></div><div class="row"><span class="kind dep">DEP</span><strong>FA221</strong><span class="route-name">Johannesburg</span><time>10:45</time></div><div class="row"><span class="kind dep">DEP</span><strong>KQ706</strong><span class="route-name">Nairobi</span><time>11:20</time></div><div class="row"><span class="kind arr">ARR</span><strong>ET873</strong><span class="route-name">Addis Ababa</span><time>12:05</time></div></div></section>
          <div class="footer"><div class="badge">${airport.name}</div><div class="badge">${DEMO_FLIGHTS.length} aircraft · demo data</div></div><div class="attribution">© OpenStreetMap contributors</div>
        </div>
      </ha-card>`;

    if (this._resizeObserver) this._resizeObserver.disconnect();
    const mapEl = this.shadowRoot.querySelector(".map");
    if (mapEl && "ResizeObserver" in window) { this._resizeObserver = new ResizeObserver(() => this._renderMap()); this._resizeObserver.observe(mapEl); }
    requestAnimationFrame(() => this._renderMap());
  }

  _renderMap() {
    const mapEl = this.shadowRoot.querySelector(".map"); const tileLayer = this.shadowRoot.querySelector(".tile-layer"); const aircraftLayer = this.shadowRoot.querySelector(".aircraft-layer"); const airportMarker = this.shadowRoot.querySelector(".airport-marker");
    if (!mapEl || !tileLayer || !aircraftLayer) return;
    const airport = this._airport(); const map = this._config.map || {}; const zoom = Math.max(2, Math.min(18, Number(map.zoom ?? 7))); const center = this._mapCenter(airport); const width = mapEl.clientWidth; const height = mapEl.clientHeight;
    if (!width || !height) return;
    const centerPoint = this._project(center.latitude, center.longitude, zoom); const n = Math.pow(2, zoom); const startX = Math.floor((centerPoint.x - width / 2) / TILE_SIZE) - 1; const endX = Math.floor((centerPoint.x + width / 2) / TILE_SIZE) + 1; const startY = Math.floor((centerPoint.y - height / 2) / TILE_SIZE) - 1; const endY = Math.floor((centerPoint.y + height / 2) / TILE_SIZE) + 1;
    tileLayer.innerHTML = "";
    for (let ty = startY; ty <= endY; ty += 1) { if (ty < 0 || ty >= n) continue; for (let tx = startX; tx <= endX; tx += 1) { const wrappedX = this._tileX(tx, n); const img = document.createElement("img"); img.className = "tile"; img.alt = ""; img.draggable = false; img.src = OSM_TILE_URL.replace("{z}", zoom).replace("{x}", wrappedX).replace("{y}", ty); img.style.left = `${tx * TILE_SIZE - centerPoint.x + width / 2}px`; img.style.top = `${ty * TILE_SIZE - centerPoint.y + height / 2}px`; tileLayer.appendChild(img); } }
    this._positionMarker(airportMarker, airport.latitude, airport.longitude, centerPoint, zoom, width, height); this._renderAircraft(centerPoint, zoom, width, height);
  }

  _positionMarker(element, lat, lon, center, zoom, width, height) { if (!element) return; const point = this._project(lat, lon, zoom); element.style.left = `${width / 2 + point.x - center.x}px`; element.style.top = `${height / 2 + point.y - center.y}px`; }

  _renderAircraft(center, zoom, width, height) {
    const layer = this.shadowRoot.querySelector(".aircraft-layer"); if (!layer) return;
    const svg = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 12.9 14 10.2V5.1c0-.8-.7-1.5-1.5-1.5S11 4.3 11 5.1v5.1l-7.5 2.7c-.5.2-.8.7-.7 1.2l.2.7 8-1.5v5.2l-2.3 1.4v.8l3.8-.8 3.8.8v-.8L14 18.6v-5.2l8 1.5.2-.7c.1-.6-.2-1.1-.7-1.3Z"/></svg>`;
    layer.innerHTML = DEMO_FLIGHTS.map(flight => { const point = this._project(flight.lat, flight.lon, zoom); const left = width / 2 + point.x - center.x; const top = height / 2 + point.y - center.y; if (left < -50 || left > width + 50 || top < -50 || top > height + 50) return ""; const selected = this._selected?.id === flight.id ? " selected-aircraft" : ""; return `<div class="aircraft${selected}" data-flight-id="${flight.id}" style="left:${left}px;top:${top}px"><button aria-label="Track ${flight.flight}"><span class="plane" style="transform:rotate(${flight.heading}deg)">${svg}</span></button><span class="tooltip">${flight.flight}</span></div>`; }).join("");
    layer.querySelectorAll(".aircraft").forEach(el => el.addEventListener("click", event => { event.stopPropagation(); const flight = DEMO_FLIGHTS.find(item => item.id === el.dataset.flightId); if (!flight) return; this._selected = flight; this._render(); }));
  }

  disconnectedCallback() { if (this._resizeObserver) this._resizeObserver.disconnect(); }
}

if (!customElements.get("flightradar-card")) customElements.define("flightradar-card", FlightradarCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "flightradar-card", name: "FlightRadar Card", description: "Flight tracking map with selected-aircraft details and airport movements.", preview: true });
console.info(`%c FlightRadar Card %c v${CARD_VERSION} `, "color:#fff;background:#1e88e5;font-weight:bold", "color:#1e88e5;background:#fff;font-weight:bold");
