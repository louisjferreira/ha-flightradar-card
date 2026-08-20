window.customCards = window.customCards || [];

const CARD_VERSION = "0.8.5";
const TILE = 256;
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const AIRPORTS = {
  HRE: { code: "HRE", icao: "FVHA", name: "Robert Gabriel Mugabe International", lat: -17.9318, lon: 31.0928 },
  JNB: { code: "JNB", icao: "FAOR", name: "O.R. Tambo International", lat: -26.1337, lon: 28.2420 },
  CPT: { code: "CPT", icao: "FACT", name: "Cape Town International", lat: -33.9715, lon: 18.6021 },
  DUR: { code: "DUR", icao: "FALE", name: "King Shaka International", lat: -29.6144, lon: 31.1197 },
  GBE: { code: "GBE", icao: "FBSK", name: "Sir Seretse Khama International", lat: -24.5552, lon: 25.9182 },
  MPM: { code: "MPM", icao: "FQMA", name: "Maputo International", lat: -25.9208, lon: 32.5726 },
  LUN: { code: "LUN", icao: "FLKK", name: "Kenneth Kaunda International", lat: -15.3308, lon: 28.4526 },
  NBO: { code: "NBO", icao: "HKJK", name: "Jomo Kenyatta International", lat: -1.3192, lon: 36.9278 },
  ADD: { code: "ADD", icao: "HAAB", name: "Addis Ababa Bole International", lat: 8.9779, lon: 38.7993 },
  WDH: { code: "WDH", icao: "FYWH", name: "Hosea Kutako International", lat: -22.4799, lon: 17.4709 },
  MUB: { code: "MUB", icao: "FBMN", name: "Maun International", lat: -19.9726, lon: 23.4311 },
  LHR: { code: "LHR", icao: "EGLL", name: "London Heathrow", lat: 51.4700, lon: -0.4543 },
  DXB: { code: "DXB", icao: "OMDB", name: "Dubai International", lat: 25.2532, lon: 55.3657 },
  SIN: { code: "SIN", icao: "WSSS", name: "Singapore Changi", lat: 1.3644, lon: 103.9915 },
  JFK: { code: "JFK", icao: "KJFK", name: "New York JFK", lat: 40.6413, lon: -73.7781 },
};

const AIRLINES = {
  SAA: "South African Airways", FA: "FlySafair", LM: "LAM Mozambique Airlines",
  ET: "Ethiopian Airlines", KQ: "Kenya Airways", RWD: "RwandAir",
  AAL: "American Airlines", UAL: "United Airlines", DAL: "Delta Air Lines",
  BAW: "British Airways", UAE: "Emirates", KLM: "KLM", AFR: "Air France",
};

const PREVIEW_AIRCRAFT = [
  { hex: "PREVIEW1", callsign: "SAA218", airline: "South African Airways", type: "B737-800", altitude: 31000, speed: 448, track: 90, lat: -17.55, lon: 30.35 },
  { hex: "PREVIEW2", callsign: "FA221", airline: "FlySafair", type: "B737-800", altitude: 28000, speed: 765, track: 55, lat: -17.70, lon: 31.75 },
  { hex: "PREVIEW3", callsign: "ET873", airline: "Ethiopian Airlines", type: "B787", altitude: 37000, speed: 820, track: 210, lat: -16.80, lon: 31.45 },
];

class FlightRadarCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._flights = [];
    this._selected = null;
    this._loading = false;
    this._error = "";
    this._timer = null;
    this._preview = false;
    this._resize = () => this._setHeight();
  }

  static getStubConfig() {
    return {
      airport: "HRE",
      map: { zoom: 7 },
      appearance: { full_screen: true },
      live: { enabled: false, radius_nm: 250 },
      refresh_interval: 15,
    };
  }

  // Home Assistant 2026.x built-in graphical editor.
  // Keep the form keys flat; setConfig() converts them to the nested runtime config.
  static getConfigForm() {
    return {
      schema: [
        {
          name: "airport",
          required: true,
          selector: {
            select: {
              options: Object.values(AIRPORTS).map((a) => ({ value: a.code, label: `${a.code} — ${a.name}` })),
              mode: "dropdown",
            },
          },
        },
        {
          name: "radius_nm",
          selector: { number: { min: 10, max: 250, step: 10, mode: "box" } },
        },
        {
          name: "refresh_interval",
          selector: { number: { min: 5, max: 120, step: 5, mode: "box" } },
        },
        {
          name: "zoom",
          selector: { number: { min: 3, max: 12, step: 1, mode: "box" } },
        },
        {
          name: "full_screen",
          selector: { boolean: {} },
        },
      ],
      computeLabel: (schema) => ({
        airport: "Tracked airport",
        radius_nm: "Live aircraft radius (NM)",
        refresh_interval: "Refresh interval (seconds)",
        zoom: "Map zoom",
        full_screen: "Fill available screen height",
      }[schema.name]),
      computeHelper: (schema) => schema.name === "airport"
        ? "The selected airport centres the map and defines the live traffic area. All ADS-B aircraft within the radius are displayed, not just flights serving the airport."
        : undefined,
    };
  }

  setConfig(config = {}) {
    this._stop();
    const legacyRadius = config.live?.radius_nm ?? config.radius_nm ?? 250;
    const legacyZoom = config.map?.zoom ?? config.zoom ?? 7;
    const fullScreen = config.appearance?.full_screen ?? config.full_screen ?? true;

    this._config = {
      airport: String(config.airport || "HRE").toUpperCase(),
      map: { zoom: Number(legacyZoom) || 7 },
      appearance: { full_screen: fullScreen !== false, ...(config.appearance || {}) },
      live: { enabled: config.live?.enabled !== false, radius_nm: Number(legacyRadius) || 250 },
      refresh_interval: Number(config.refresh_interval) || 15,
    };

    this._preview = this._config.live.enabled === false;
    this._flights = this._preview ? PREVIEW_AIRCRAFT : [];
    this._selected = this._preview ? PREVIEW_AIRCRAFT[0] : null;
    this._error = "";
    this._render();
    this._setHeight();
    if (!this._preview) this._start();
  }

  set hass(value) {
    this._hass = value;
    if (!this._preview && this._flights.length === 0) this._fetchAircraft();
  }

  disconnectedCallback() {
    this._stop();
  }

  getCardSize() { return 7; }

  _airport() {
    return AIRPORTS[this._config.airport] || AIRPORTS.HRE;
  }

  _height() {
    const a = this._config.appearance || {};
    if (a.height) return typeof a.height === "number" ? `${a.height}px` : a.height;
    if (a.full_screen === false) return "520px";
    const vv = window.visualViewport?.height || window.innerHeight;
    const top = Math.max(0, this.getBoundingClientRect().top);
    return `${Math.max(420, Math.round(vv - top))}px`;
  }

  _setHeight() {
    const card = this.shadowRoot.querySelector(".card");
    if (card) card.style.height = this._height();
  }

  _start() {
    this._fetchAircraft();
    const seconds = Math.max(5, Number(this._config.refresh_interval) || 15);
    this._timer = window.setInterval(() => this._fetchAircraft(), seconds * 1000);
    window.addEventListener("resize", this._resize);
    window.visualViewport?.addEventListener("resize", this._resize);
  }

  _stop() {
    if (this._timer) window.clearInterval(this._timer);
    this._timer = null;
    window.removeEventListener("resize", this._resize);
    window.visualViewport?.removeEventListener("resize", this._resize);
  }

  async _fetchAircraft() {
    if (!this._hass || this._preview) return;
    const airport = this._airport();
    this._loading = true;
    this._error = "";
    this._render();
    try {
      const radius = Math.min(250, Math.max(10, Number(this._config.live.radius_nm) || 250));
      const result = await this._hass.callWS({
        type: "flightradar_card/get_aircraft",
        latitude: airport.lat,
        longitude: airport.lon,
        radius,
      });
      this._flights = Array.isArray(result?.aircraft) ? result.aircraft : [];
      if (this._selected) {
        const selectedId = this._selected.hex || this._selected.icao24;
        this._selected = this._flights.find((f) => (f.hex || f.icao24) === selectedId) || null;
      }
    } catch (err) {
      this._error = err?.message || "Live ADS-B unavailable";
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _search(query) {
    if (this._preview) return;
    const q = String(query || "").trim();
    if (!q || !this._hass) return;
    try {
      const result = await this._hass.callWS({ type: "flightradar_card/search", query: q });
      const aircraft = Array.isArray(result?.aircraft) ? result.aircraft[0] : result?.aircraft;
      if (aircraft) {
        this._selected = aircraft;
        this._render();
      } else {
        this._error = `No live aircraft found for ${q}`;
        this._render();
      }
    } catch (err) {
      this._error = err?.message || `Search failed for ${q}`;
      this._render();
    }
  }

  _render() {
    if (!this.shadowRoot) return;
    const airport = this._airport();
    const aircraft = this._flights || [];
    const selected = this._selected;

    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;width:100%}
        .card{position:relative;width:100%;min-height:420px;overflow:hidden;border-radius:16px;background:#11161b;color:#f5f7fa;font-family:var(--primary-font-family,Arial,sans-serif)}
        .map{position:absolute;inset:0;overflow:hidden;background:#b8c3c8}.map img{position:absolute;width:256px;height:256px}.overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.24),rgba(0,0,0,.08) 45%,rgba(0,0,0,.34));pointer-events:none}
        .panel{position:absolute;z-index:10;background:rgba(17,22,27,.96);border:1px solid rgba(255,255,255,.12);box-shadow:0 10px 30px rgba(0,0,0,.35);border-radius:16px}
        .selected{top:12px;left:12px;width:min(300px,calc(100% - 24px));overflow:hidden}.traffic{top:12px;right:12px;width:min(360px,calc(100% - 24px));padding:12px}
        .search{position:absolute;z-index:20;top:12px;left:50%;transform:translateX(-50%);display:flex;gap:6px;width:min(420px,calc(100% - 24px));background:rgba(17,22,27,.96);padding:6px;border-radius:12px;border:1px solid rgba(255,255,255,.14)}
        .search input{flex:1;min-width:0;background:#252b31;color:#fff;border:0;border-radius:8px;padding:10px 12px;outline:none}.search button{border:0;border-radius:8px;padding:0 14px;font-weight:700}
        .content{padding:12px}.eyebrow{font-size:10px;letter-spacing:1.6px;color:#aeb9c4}h2{margin:4px 0;font-size:23px}.airline{color:#c6ced6;font-size:12px}
        .route{display:flex;align-items:center;gap:8px;margin:12px 0;font-size:12px}.route span:nth-child(2){flex:1;height:1px;background:#59636c}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.stat{background:#252b31;padding:8px;border-radius:9px}.stat label{display:block;font-size:9px;color:#89949f;text-transform:uppercase}.stat b{font-size:12px}
        .traffic-head{display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-bottom:8px}.traffic-sub{font-size:9px;color:#9aa6b2;font-weight:400}.traffic-row{display:grid;grid-template-columns:38px 72px 1fr 55px;gap:4px;align-items:center;background:#22282e;border-radius:8px;padding:8px;margin-top:4px;font-size:10px}.traffic-row .callsign{font-weight:700}
        .aircraft{position:absolute;z-index:6;cursor:pointer;color:white;font-size:24px;text-shadow:0 2px 8px #000}.aircraft.selected{color:#ffd33d;font-size:30px}.airport{position:absolute;z-index:5;transform:translate(-50%,-50%);width:12px;height:12px;background:white;border-radius:50%;box-shadow:0 0 0 3px rgba(255,255,255,.22)}
        .badge{position:absolute;z-index:12;bottom:10px;padding:8px 10px;border-radius:8px;background:rgba(17,22,27,.9);font-size:10px}.badge.left{left:10px}.badge.right{right:10px}.preview-label{color:#8ed0ff}.error{color:#ffb4ab;font-size:11px}
        @media(max-width:700px){.search{top:8px}.selected{top:72px;left:12px;width:calc(100% - 24px)}.traffic{top:calc(72px + 300px);left:12px;right:12px;width:auto}.traffic-row{grid-template-columns:34px 60px 1fr 48px}}
      </style>
      <div class="card">
        <div class="map" id="map"></div><div class="overlay"></div>
        <form class="search" id="search"><input id="q" placeholder="Search flight / registration / ICAO..." autocomplete="off"><button>SEARCH</button></form>
        <section class="panel selected" id="selectedPanel"></section>
        <section class="panel traffic" id="trafficPanel"></section>
        <div class="badge left">${airport.code} · ${airport.name}</div>
        <div class="badge right">${this._preview ? '<span class="preview-label">PREVIEW</span>' : (aircraft.length ? `${aircraft.length} aircraft · ALL LIVE ADS-B` : 'Live ADS-B unavailable')}</div>
      </div>`;

    this._renderMap(airport, aircraft, selected);
    this._renderSelected(selected);
    this._renderTraffic(airport, aircraft);

    this.shadowRoot.getElementById("search")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this._search(this.shadowRoot.getElementById("q")?.value);
    });
  }

  _renderMap(airport, aircraft, selected) {
    const map = this.shadowRoot.getElementById("map");
    if (!map) return;
    const rect = map.getBoundingClientRect();
    const zoom = Number(this._config.map?.zoom) || 7;
    const world = TILE * Math.pow(2, zoom);
    const project = (lat, lon) => {
      const x = (lon + 180) / 360 * world;
      const sin = Math.sin(lat * Math.PI / 180);
      const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world;
      return { x, y };
    };
    const center = project(airport.lat, airport.lon);
    const ox = rect.width / 2 - center.x;
    const oy = rect.height / 2 - center.y;
    const tx0 = Math.floor((center.x - rect.width / 2) / TILE) - 1;
    const tx1 = Math.ceil((center.x + rect.width / 2) / TILE) + 1;
    const ty0 = Math.floor((center.y - rect.height / 2) / TILE) - 1;
    const ty1 = Math.ceil((center.y + rect.height / 2) / TILE) + 1;
    const frag = document.createDocumentFragment();

    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        const img = document.createElement("img");
        img.src = OSM.replace("{z}", zoom).replace("{x}", ((tx % 2 ** zoom) + 2 ** zoom) % 2 ** zoom).replace("{y}", ty);
        img.style.left = `${tx * TILE + ox}px`;
        img.style.top = `${ty * TILE + oy}px`;
        frag.appendChild(img);
      }
    }
    map.appendChild(frag);

    const airportEl = document.createElement("div");
    airportEl.className = "airport";
    airportEl.style.left = `${rect.width / 2}px`;
    airportEl.style.top = `${rect.height / 2}px`;
    map.appendChild(airportEl);

    for (const f of aircraft) {
      if (!Number.isFinite(f.lat) || !Number.isFinite(f.lon)) continue;
      const p = project(f.lat, f.lon);
      const el = document.createElement("div");
      const selectedId = selected?.hex || selected?.icao24;
      const id = f.hex || f.icao24;
      el.className = `aircraft ${selectedId === id ? "selected" : ""}`;
      el.textContent = "✈";
      el.title = f.callsign || f.flight || f.registration || f.hex || "Aircraft";
      el.style.left = `${p.x + ox}px`;
      el.style.top = `${p.y + oy}px`;
      el.style.transform = `translate(-50%,-50%) rotate(${Number(f.track) || 0}deg)`;
      el.addEventListener("click", () => { this._selected = f; this._render(); });
      map.appendChild(el);
    }
  }

  _renderSelected(f) {
    const panel = this.shadowRoot.getElementById("selectedPanel");
    if (!panel) return;
    const callsign = f?.callsign || f?.flight || f?.registration || f?.hex || "—";
    const airline = f?.airline || AIRLINES[String(callsign).replace(/\d/g, "")] || "Live ADS-B aircraft";
    const speed = f?.speed ?? (f?.speed_knots != null ? Number(f.speed_knots) * 1.852 : null);
    panel.innerHTML = `<div class="content"><div class="eyebrow">SELECTED AIRCRAFT</div><h2>${callsign}</h2><div class="airline">${airline}</div><div class="route"><span>LIVE</span><span></span><span>TRACKING</span></div><div class="stats"><div class="stat"><label>Aircraft</label><b>${f?.type || "—"}</b></div><div class="stat"><label>Altitude</label><b>${f?.altitude != null ? `${Math.round(f.altitude).toLocaleString()} ft` : "—"}</b></div><div class="stat"><label>Speed</label><b>${speed != null ? `${Math.round(speed)} km/h` : "—"}</b></div></div></div>`;
  }

  _renderTraffic(airport, aircraft) {
    const panel = this.shadowRoot.getElementById("trafficPanel");
    if (!panel) return;
    const rows = aircraft.slice(0, 8).map((f) => `<div class="traffic-row"><span>ADS-B</span><span class="callsign">${f.callsign || f.flight || f.registration || "—"}</span><span>${f.type || "Unknown"}</span><span>${f.altitude != null ? `${Math.round(f.altitude / 100) * 100} ft` : "—"}</span></div>`).join("");
    panel.innerHTML = `<div class="traffic-head"><span>${airport.code} · Live Air Traffic</span><span class="traffic-sub">ALL AIRCRAFT IN AREA</span></div>${rows || `<div class="traffic-row"><span>—</span><span class="callsign">${this._loading ? "LOADING" : "NO DATA"}</span><span>${this._error || "No aircraft"}</span><span>—</span></div>`}`;
  }
}

if (!customElements.get("flightradar-card")) {
  customElements.define("flightradar-card", FlightRadarCard);
}

if (!window.customCards.some((card) => card.type === "flightradar-card")) {
  window.customCards.push({
    type: "flightradar-card",
    name: "FlightRadar Card",
    description: "Live ADS-B flight tracking map with airport selection and all-aircraft traffic.",
    preview: true,
  });
}
