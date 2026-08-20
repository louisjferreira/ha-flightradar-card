/*
 * FlightRadar Card for Home Assistant
 * Initial UI prototype - real flight data will be added in a later milestone.
 */

const CARD_VERSION = "0.1.0";

const AIRPORTS = {
  HRE: {
    name: "Robert Gabriel Mugabe International",
    city: "Harare",
    country: "Zimbabwe",
    latitude: -17.9318,
    longitude: 31.0928,
    code: "HRE",
  },
};

const DEMO_FLIGHTS = [
  { id: "demo-1", flight: "SAA218", airline: "South African Airways", type: "B737-800", altitude: "31,000 ft", speed: "448 km/h", origin: "Johannesburg", destination: "Harare", lat: -18.22, lon: 29.95, heading: 72 },
  { id: "demo-2", flight: "ET893", airline: "Ethiopian Airlines", type: "B787-9", altitude: "36,000 ft", speed: "821 km/h", origin: "Addis Ababa", destination: "Harare", lat: -15.95, lon: 31.75, heading: 178 },
  { id: "demo-3", flight: "KQ706", airline: "Kenya Airways", type: "B737-800", altitude: "34,000 ft", speed: "794 km/h", origin: "Nairobi", destination: "Harare", lat: -15.90, lon: 33.10, heading: 207 },
  { id: "demo-4", flight: "FA221", airline: "FlySafair", type: "B737-800", altitude: "28,000 ft", speed: "765 km/h", origin: "Harare", destination: "Johannesburg", lat: -20.35, lon: 31.55, heading: 252 },
  { id: "demo-5", flight: "LM402", airline: "LAM Mozambique Airlines", type: "E190", altitude: "24,000 ft", speed: "610 km/h", origin: "Maputo", destination: "Harare", lat: -19.05, lon: 32.35, heading: 326 },
];

class FlightradarCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._selected = DEMO_FLIGHTS[0];
    this._map = null;
  }

  setConfig(config) {
    this._config = {
      airport: "HRE",
      map: {},
      appearance: {},
      refresh_interval: 15,
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
  }

  getCardSize() {
    return 7;
  }

  _airport() {
    const key = String(this._config.airport || "HRE").toUpperCase();
    return AIRPORTS[key] || AIRPORTS.HRE;
  }

  _render() {
    if (!this._config) return;

    const airport = this._airport();
    const map = this._config.map || {};
    const height = this._config.appearance?.height || "520px";

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; color:#fff; font-family:var(--primary-font-family,Arial,sans-serif); }
        * { box-sizing:border-box; }
        .card {
          position:relative; overflow:hidden; height:${height}; min-height:360px;
          border-radius:18px; background:#111820;
          border:1px solid rgba(255,255,255,.12);
          box-shadow:0 10px 30px rgba(0,0,0,.25);
        }
        .map {
          position:absolute; inset:0; overflow:hidden; background:#18232b;
        }
        .tiles {
          position:absolute; inset:0; background-size:cover;
          background-position:center;
          filter:saturate(.72) brightness(.72);
        }
        .shade {
          position:absolute; inset:0;
          background:linear-gradient(180deg,rgba(4,10,15,.18),rgba(4,10,15,.05) 45%,rgba(4,10,15,.45));
          pointer-events:none;
        }
        .map-grid {
          position:absolute; inset:0; opacity:.08; pointer-events:none;
          background-image:linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px);
          background-size:80px 80px;
        }
        .overlay { position:absolute; inset:0; pointer-events:none; }
        .panel {
          position:absolute; pointer-events:auto;
          background:rgba(8,14,20,.88); backdrop-filter:blur(12px);
          border:1px solid rgba(255,255,255,.14); border-radius:14px;
          box-shadow:0 8px 24px rgba(0,0,0,.28);
        }
        .selected { left:14px; top:14px; width:min(320px,calc(100% - 28px)); padding:14px; }
        .movements { right:14px; top:14px; width:min(330px,calc(100% - 28px)); padding:12px; }
        .eyebrow { font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:#9caab5; margin-bottom:4px; }
        .flight { font-size:23px; font-weight:700; line-height:1.1; }
        .airline { color:#c4cdd4; font-size:12px; margin-top:3px; }
        .route { display:flex; align-items:center; gap:8px; margin:12px 0; font-size:12px; }
        .route span:nth-child(2) { flex:1; height:1px; background:rgba(255,255,255,.2); }
        .stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
        .stat { padding:8px; border-radius:9px; background:rgba(255,255,255,.06); }
        .stat-label { font-size:9px; color:#8e9ca7; text-transform:uppercase; }
        .stat-value { margin-top:2px; font-size:12px; font-weight:600; }
        .movement-title { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
        .movement-title strong { font-size:13px; }
        .movement-title span { font-size:10px; color:#9caab5; }
        .rows { display:grid; gap:4px; max-height:235px; overflow:hidden; }
        .row { display:grid; grid-template-columns:34px 58px 1fr 42px; align-items:center; gap:5px; padding:7px 6px; border-radius:8px; background:rgba(255,255,255,.045); font-size:10px; }
        .kind { font-size:9px; font-weight:700; }
        .arr { color:#82c9ff; } .dep { color:#a9e7a4; }
        .row .route-name { color:#c8d0d6; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
        .row time { text-align:right; color:#fff; font-variant-numeric:tabular-nums; }
        .aircraft { position:absolute; pointer-events:auto; transform:translate(-50%,-50%); cursor:pointer; }
        .aircraft button { border:0; background:transparent; color:#fff; padding:5px; cursor:pointer; }
        .plane { display:block; width:24px; height:24px; transform-origin:center; filter:drop-shadow(0 2px 4px rgba(0,0,0,.8)); }
        .plane::before { content:'✈'; display:block; font-size:22px; line-height:24px; }
        .aircraft.selected-aircraft .plane { color:#ffcc66; transform:scale(1.25); }
        .tooltip { position:absolute; left:50%; top:31px; transform:translateX(-50%); white-space:nowrap; padding:4px 7px; border-radius:6px; background:rgba(0,0,0,.78); font-size:9px; opacity:0; transition:opacity .15s; pointer-events:none; }
        .aircraft:hover .tooltip, .aircraft.selected-aircraft .tooltip { opacity:1; }
        .home { position:absolute; left:50%; top:55%; transform:translate(-50%,-50%); pointer-events:none; text-align:center; }
        .home-dot { width:12px; height:12px; margin:auto; border-radius:50%; background:#fff; border:3px solid rgba(255,255,255,.25); box-shadow:0 0 0 5px rgba(255,255,255,.08); }
        .home-label { margin-top:6px; font-size:9px; letter-spacing:.1em; color:#e7edf1; }
        .footer { position:absolute; left:14px; right:14px; bottom:12px; display:flex; justify-content:space-between; align-items:center; pointer-events:none; }
        .badge { background:rgba(8,14,20,.82); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,.12); border-radius:9px; padding:7px 9px; font-size:10px; color:#dce3e8; }
        @media(max-width:650px) {
          .selected { width:calc(100% - 28px); }
          .movements { top:auto; bottom:54px; width:calc(100% - 28px); max-height:160px; }
          .rows { max-height:105px; }
          .selected .stats { grid-template-columns:repeat(3,1fr); }
        }
      </style>
      <ha-card class="card">
        <div class="map">
          <div class="tiles"></div>
          <div class="map-grid"></div>
          <div class="shade"></div>
          <div class="aircraft-layer"></div>
          <div class="home"><div class="home-dot"></div><div class="home-label">${airport.code} · ${airport.city.toUpperCase()}</div></div>
        </div>
        <div class="overlay">
          <section class="panel selected">
            <div class="eyebrow">Selected aircraft</div>
            <div class="flight">${this._selected.flight}</div>
            <div class="airline">${this._selected.airline}</div>
            <div class="route"><span>${this._selected.origin}</span><span></span><span>${this._selected.destination}</span></div>
            <div class="stats">
              <div class="stat"><div class="stat-label">Aircraft</div><div class="stat-value">${this._selected.type}</div></div>
              <div class="stat"><div class="stat-label">Altitude</div><div class="stat-value">${this._selected.altitude}</div></div>
              <div class="stat"><div class="stat-label">Speed</div><div class="stat-value">${this._selected.speed}</div></div>
            </div>
          </section>
          <section class="panel movements">
            <div class="movement-title"><strong>${airport.code} · Arrivals & Departures</strong><span>LIVE BOARD</span></div>
            <div class="rows">
              <div class="row"><span class="kind arr">ARR</span><strong>SAA218</strong><span class="route-name">Johannesburg</span><time>09:35</time></div>
              <div class="row"><span class="kind arr">ARR</span><strong>ET893</strong><span class="route-name">Addis Ababa</span><time>10:10</time></div>
              <div class="row"><span class="kind dep">DEP</span><strong>FA221</strong><span class="route-name">Johannesburg</span><time>10:45</time></div>
              <div class="row"><span class="kind dep">DEP</span><strong>KQ706</strong><span class="route-name">Nairobi</span><time>11:20</time></div>
              <div class="row"><span class="kind arr">ARR</span><strong>ET873</strong><span class="route-name">Addis Ababa</span><time>12:05</time></div>
            </div>
          </section>
          <div class="footer">
            <div class="badge">${airport.name}</div>
            <div class="badge">${DEMO_FLIGHTS.length} aircraft · demo data</div>
          </div>
        </div>
      </ha-card>
    `;

    this._renderMap(map, airport);
    this._renderAircraft();
  }

  _renderMap(map, airport) {
    const tiles = this.shadowRoot.querySelector(".tiles");
    if (!tiles) return;

    const zoom = Number(map.zoom ?? 7);
    const lat = Number(map.latitude ?? airport.latitude);
    const lon = Number(map.longitude ?? airport.longitude);
    const n = Math.pow(2, zoom);
    const x = (lon + 180) / 360 * n;
    const latRad = lat * Math.PI / 180;
    const y = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n;
    const size = 256;
    const centerX = x * size;
    const centerY = y * size;

    tiles.style.backgroundImage = [
      `url("https://tile.openstreetmap.org/${zoom}/${Math.floor(x)}/${Math.floor(y)}.png")`,
      `url("https://tile.openstreetmap.org/${zoom}/${Math.floor(x) + 1}/${Math.floor(y)}.png")`,
      `url("https://tile.openstreetmap.org/${zoom}/${Math.floor(x)}/${Math.floor(y) + 1}.png")`,
      `url("https://tile.openstreetmap.org/${zoom}/${Math.floor(x) + 1}/${Math.floor(y) + 1}.png")`,
    ].join(",");
    tiles.style.backgroundSize = `${size}px ${size}px, ${size}px ${size}px, ${size}px ${size}px, ${size}px ${size}px`;
    tiles.style.backgroundPosition = "50% 50%, calc(50% + 256px) 50%, 50% calc(50% + 256px), calc(50% + 256px) calc(50% + 256px)";
    tiles.dataset.centerX = centerX;
    tiles.dataset.centerY = centerY;
    tiles.dataset.zoom = zoom;
  }

  _renderAircraft() {
    const layer = this.shadowRoot.querySelector(".aircraft-layer");
    const tiles = this.shadowRoot.querySelector(".tiles");
    if (!layer || !tiles) return;

    const zoom = Number(tiles.dataset.zoom);
    const centerX = Number(tiles.dataset.centerX);
    const centerY = Number(tiles.dataset.centerY);
    const mapRect = this.shadowRoot.querySelector(".map").getBoundingClientRect();
    const n = Math.pow(2, zoom);

    layer.innerHTML = DEMO_FLIGHTS.map(flight => {
      const x = (flight.lon + 180) / 360 * n * 256;
      const latRad = flight.lat * Math.PI / 180;
      const y = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n * 256;
      const left = mapRect.width / 2 + (x - centerX);
      const top = mapRect.height / 2 + (y - centerY);
      const selected = this._selected?.id === flight.id ? " selected-aircraft" : "";
      return `<div class="aircraft${selected}" data-flight-id="${flight.id}" style="left:${left}px;top:${top}px"><button aria-label="Track ${flight.flight}"><span class="plane" style="transform:rotate(${flight.heading}deg)"></span></button><span class="tooltip">${flight.flight}</span></div>`;
    }).join("");

    layer.querySelectorAll(".aircraft").forEach(el => {
      el.addEventListener("click", () => {
        const flight = DEMO_FLIGHTS.find(item => item.id === el.dataset.flightId);
        if (!flight) return;
        this._selected = flight;
        this._render();
      });
    });
  }
}

customElements.define("flightradar-card", FlightradarCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "flightradar-card",
  name: "FlightRadar Card",
  description: "FlightRadar-style map and airport movement card.",
  preview: true,
  documentationURL: "https://github.com/louisjferreira/ha-flightradar-card",
  version: CARD_VERSION,
});
