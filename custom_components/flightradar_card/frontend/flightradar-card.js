const CARD_VERSION = "0.8.0";
const TILE = 256;
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const AIRPORTS = {
  HRE: { code: "HRE", icao: "FVHA", name: "Robert Gabriel Mugabe International", lat: -17.9318, lon: 31.0928 },
};
const AIRLINES = {
  SAA: "South African Airways", FA: "FlySafair", LM: "LAM Mozambique Airlines",
  ET: "Ethiopian Airlines", KQ: "Kenya Airways", RWD: "RwandAir",
  AAL: "American Airlines", UAL: "United Airlines", DAL: "Delta Air Lines",
  BAW: "British Airways", UAE: "Emirates", KLM: "KLM", AFR: "Air France",
};

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
    this._searchMessage = "";
    this._center = null;
    this._timer = null;
    this._resize = () => this._setHeight();
  }

  setConfig(config) {
    this._stop();
    this._config = { airport: "HRE", map: {}, appearance: {}, live: {}, refresh_interval: 15, ...config };
    this._center = null;
    this._selected = null;
    this._render();
    this._setHeight();
    this._start();
  }

  set hass(value) {
    this._hass = value;
  }

  getCardSize() { return 7; }

  _airport() {
    return AIRPORTS[String(this._config.airport || "HRE").toUpperCase()] || AIRPORTS.HRE;
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
    if (!card) return;
    const h = this._height();
    card.style.height = h;
    this.style.height = h;
    this._renderMap();
  }

  _project(lat, lon, zoom) {
    const n = 2 ** zoom;
    const x = (lon + 180) / 360 * n * TILE;
    const r = lat * Math.PI / 180;
    const y = (1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * n * TILE;
    return { x, y };
  }

  _centerPoint() {
    const a = this._airport();
    if (this._center) return this._center;
    const m = this._config.map || {};
    return m.center_on_airport === false
      ? { lat: Number(m.latitude ?? a.lat), lon: Number(m.longitude ?? a.lon) }
      : { lat: a.lat, lon: a.lon };
  }

  _zoom() { return Math.max(3, Math.min(12, Number(this._config.map?.zoom ?? 7))); }

  _normalize(raw) {
    const flight = String(raw.flight || "").trim() || String(raw.registration || raw.r || raw.hex || "").trim().toUpperCase();
    const prefix = flight.replace(/[0-9].*$/, "").toUpperCase();
    const type = raw.type || raw.t || raw.description || raw.desc || "Aircraft";
    return {
      id: String(raw.hex || flight),
      hex: String(raw.hex || "").toUpperCase(),
      flight: flight || "UNKNOWN",
      airline: AIRLINES[prefix] || "Unknown airline",
      registration: raw.registration || raw.r || "—",
      type,
      lat: Number(raw.lat), lon: Number(raw.lon),
      altitude: raw.altitude === "ground" ? "GROUND" : (Number.isFinite(Number(raw.altitude)) ? `${Math.round(Number(raw.altitude)).toLocaleString()} ft` : "—"),
      speed: Number.isFinite(Number(raw.speed_knots)) ? `${Math.round(Number(raw.speed_knots) * 1.852)} km/h` : "—",
      heading: Number(raw.track ?? 0),
      onGround: raw.on_ground === true,
      raw,
    };
  }

  async _ws(type, data) {
    if (!this._hass?.callWS) throw new Error("Home Assistant connection is not ready");
    return this._hass.callWS({ type, ...data });
  }

  async _load() {
    if (this._loading) return;
    this._loading = true;
    this._error = "";
    this._status();
    try {
      const a = this._airport();
      const radius = Math.max(10, Math.min(250, Number(this._config.live?.radius_nm ?? 250)));
      const result = await this._ws("flightradar_card/get_aircraft", { latitude: a.lat, longitude: a.lon, radius });
      this._flights = (result.aircraft || []).map(x => this._normalize(x)).filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon));
      if (this._selected) {
        const fresh = this._flights.find(x => x.id === this._selected.id || x.flight === this._selected.flight);
        if (fresh) this._selected = fresh;
      }
      if (!this._selected && this._flights.length) this._selected = this._flights[0];
      this._provider = result.provider || "ADS-B";
      this._render();
    } catch (err) {
      console.warn("FlightRadar Card", err);
      this._error = "Live ADS-B unavailable";
      this._render();
    } finally {
      this._loading = false;
      this._status();
    }
  }

  async _search(q) {
    q = String(q || "").trim().toUpperCase();
    if (!q) return;
    this._searchMessage = "Searching…";
    this._status();
    try {
      const result = await this._ws("flightradar_card/search", { query: q });
      const found = (result.aircraft || []).map(x => this._normalize(x))[0];
      if (!found) {
        this._searchMessage = `No live aircraft found for ${q}`;
        this._status();
        return;
      }
      this._selected = found;
      this._center = { lat: found.lat, lon: found.lon };
      const i = this._flights.findIndex(x => x.id === found.id);
      if (i >= 0) this._flights[i] = found; else this._flights.unshift(found);
      this._searchMessage = "";
      this._render();
    } catch (err) {
      this._searchMessage = "Search failed";
      this._status();
    }
  }

  _start() {
    this._load();
    const seconds = Math.max(10, Number(this._config.refresh_interval ?? 15));
    this._timer = setInterval(() => this._load(), seconds * 1000);
    window.addEventListener("resize", this._resize);
    window.visualViewport?.addEventListener("resize", this._resize);
  }

  _stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    window.removeEventListener("resize", this._resize);
    window.visualViewport?.removeEventListener("resize", this._resize);
  }

  _plane() {
    return `<svg viewBox="0 0 24 24"><path d="M21.8 10.7 14 8.1V3.8c0-.9-.9-1.6-1.9-1.6s-1.9.7-1.9 1.6v4.3L2.2 10.7c-.7.2-1.2.9-1.2 1.6 0 .9.8 1.5 1.7 1.3l7.5-1.6v4.3l-2.5 1.5c-.4.2-.6.6-.6 1.1v.6l5-1.2 5 1.2v-.6c0-.5-.2-.9-.6-1.1L14 16.3V12l7.5 1.6c.9.2 1.7-.4 1.7-1.3 0-.7-.5-1.4-1.2-1.6Z"/></svg>`;
  }

  _photo(type) {
    const t = String(type || "").toUpperCase();
    if (t.includes("E190") || t.includes("E195")) return "https://commons.wikimedia.org/wiki/Special:FilePath/EMBRAER_E-190.jpg?width=900";
    if (t.includes("B787")) return "https://commons.wikimedia.org/wiki/Special:FilePath/First_flight_of_Boeing_787-9_crop.jpg?width=900";
    return "https://commons.wikimedia.org/wiki/Special:FilePath/Boeing_737_800_plane.jpg?width=900";
  }

  _render() {
    const a = this._airport();
    const s = this._selected || null;
    const height = this._height();
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;width:100%;font-family:var(--primary-font-family,Arial,sans-serif);color:#fff}*{box-sizing:border-box}.card{position:relative;width:100%;height:${height};overflow:hidden;background:#17232b}.map,.tiles,.shade,.aircraft{position:absolute;inset:0;overflow:hidden}.tiles{background:#26333a}.tile{position:absolute;width:256px;height:256px;max-width:none;filter:saturate(.7) brightness(.72);pointer-events:none}.shade{background:linear-gradient(180deg,rgba(4,10,15,.18),rgba(4,10,15,.05) 45%,rgba(4,10,15,.48));pointer-events:none}.aircraft{pointer-events:none}.panel{position:absolute;z-index:10;background:rgba(8,14,20,.9);border:1px solid rgba(255,255,255,.13);border-radius:14px;box-shadow:0 10px 28px rgba(0,0,0,.3);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}.search{top:14px;left:50%;transform:translateX(-50%);width:min(520px,calc(100% - 720px));min-width:300px;padding:6px}.search form{display:flex;gap:6px}.search input{flex:1;min-width:0;border:0;outline:0;background:rgba(255,255,255,.08);color:#fff;border-radius:9px;padding:10px 12px;font:inherit;font-size:12px}.search button{border:0;border-radius:9px;background:#fff;color:#101820;font-weight:700;padding:10px 14px;cursor:pointer}.selected{top:14px;left:14px;width:300px;overflow:hidden}.photo{height:130px;background:#22313a center/cover no-repeat}.photo-credit{font-size:8px;color:#d5dce0;padding:5px 10px;background:linear-gradient(transparent,rgba(0,0,0,.65));margin-top:-24px;position:relative}.selected-body{padding:12px}.eyebrow{font-size:9px;letter-spacing:.15em;color:#9aa8b2}.flight{font-size:24px;font-weight:700;margin:4px 0}.airline{font-size:12px;color:#c8d0d5}.route{display:flex;align-items:center;gap:8px;margin:14px 0;font-size:11px}.route i{height:1px;background:rgba(255,255,255,.22);flex:1}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.stat{background:rgba(255,255,255,.07);border-radius:9px;padding:9px}.stat label{display:block;font-size:8px;color:#8997a0}.stat b{display:block;margin-top:4px;font-size:11px}.traffic{top:14px;right:14px;width:290px;padding:12px}.traffic-head{display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-bottom:9px}.traffic-head small{font-size:8px;color:#94a1a9;font-weight:400}.row{display:grid;grid-template-columns:34px 56px 1fr 42px;gap:6px;align-items:center;padding:9px 7px;margin-top:4px;border-radius:8px;background:rgba(255,255,255,.055);font-size:9px}.row b{font-size:10px}.row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.arr{color:#65baff}.dep{color:#79df91}.airport{position:absolute;transform:translate(-50%,-50%);z-index:4;text-align:center}.dot{width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid rgba(255,255,255,.25);box-shadow:0 0 0 5px rgba(255,255,255,.08)}.airport label,.tag{display:inline-block;margin-top:5px;padding:3px 6px;background:rgba(8,14,20,.8);border-radius:5px;font-size:8px;white-space:nowrap}.plane{position:absolute;transform:translate(-50%,-50%);width:25px;height:25px;pointer-events:auto;cursor:pointer;z-index:5}.plane svg{width:100%;height:100%;fill:#fff;filter:drop-shadow(0 2px 4px #000)}.plane.selected svg{fill:#ffc247;filter:drop-shadow(0 0 6px #ffc247)}.tag{position:absolute;left:50%;top:24px;transform:translateX(-50%);font-size:8px}.footer{position:absolute;bottom:12px;left:12px;right:12px;display:flex;justify-content:space-between;z-index:8;pointer-events:none}.badge{background:rgba(8,14,20,.8);padding:8px 10px;border-radius:8px;font-size:9px}.status{position:absolute;bottom:12px;right:12px;z-index:9;font-size:8px;color:#c4cdd2}.osm{position:absolute;right:8px;bottom:2px;font-size:7px;color:#dce4e8;z-index:8}.empty{padding:10px;color:#9ba7ae;font-size:9px}.error{color:#ffb3b3}
      @media(max-width:800px){.search{top:10px;width:calc(100% - 36px);min-width:0}.selected{top:72px;left:14px;width:calc(100% - 28px)}.photo{height:185px}.traffic{top:auto;left:14px;right:14px;bottom:68px;width:auto;max-height:240px;overflow:hidden}.traffic .row:nth-of-type(n+5){display:none}.footer{bottom:14px}.status{bottom:14px}.plane{width:27px;height:27px}}
    </style>
    <div class="card">
      <div class="map"><div class="tiles"></div><div class="shade"></div><div class="aircraft"></div></div>
      <div class="panel search"><form><input placeholder="Search flight / registration / ICAO…"><button>SEARCH</button></form></div>
      <div class="panel selected">${s ? `<div class="photo" style="background-image:url('${this._photo(s.type)}')"></div><div class="photo-credit">Aircraft photo · Wikimedia Commons</div>` : ""}<div class="selected-body"><div class="eyebrow">SELECTED AIRCRAFT</div><div class="flight">${s?.flight || "—"}</div><div class="airline">${s?.airline || "Waiting for live data"}</div><div class="route"><span>${s?.raw?.origin || "—"}</span><i></i><span>${s?.raw?.destination || "—"}</span></div><div class="stats"><div class="stat"><label>AIRCRAFT</label><b>${s?.type || "—"}</b></div><div class="stat"><label>ALTITUDE</label><b>${s?.altitude || "—"}</b></div><div class="stat"><label>SPEED</label><b>${s?.speed || "—"}</b></div></div></div></div>
      <div class="panel traffic"><div class="traffic-head"><span>${a.code} · Live Traffic</span><small>${this._provider || "ADS-B"}</small></div>${this._flights.slice(0,6).map(f => `<div class="row"><span class="${f.onGround ? "dep" : "arr"}">${f.onGround ? "GND" : "AIR"}</span><b>${f.flight}</b><span>${f.type || "Aircraft"}</span><span>${f.altitude === "GROUND" ? "GND" : f.altitude.replace(" ft","")}</span></div>`).join("") || `<div class="empty ${this._error ? "error" : ""}">${this._error || "Waiting for ADS-B"}</div>`}</div>
      <div class="airport" data-airport><div class="dot"></div><label>${a.code} · ${a.name}</label></div>
      <div class="footer"><div class="badge">${a.name}</div><div class="badge">${this._flights.length} aircraft · ${this._provider || "LIVE"}</div></div>
      <div class="status live-status">${this._loading ? "UPDATING" : (this._searchMessage || this._error || "LIVE")}</div><div class="osm">© OpenStreetMap contributors</div>
    </div>`;
    this._bind();
    this._renderMap();
  }

  _bind() {
    const form = this.shadowRoot.querySelector(".search form");
    form?.addEventListener("submit", e => { e.preventDefault(); this._search(this.shadowRoot.querySelector(".search input")?.value); });
  }

  _status() {
    const el = this.shadowRoot.querySelector(".live-status");
    if (el) el.textContent = this._loading ? "UPDATING" : (this._searchMessage || this._error || `${this._flights.length} aircraft · LIVE`);
  }

  _renderMap() {
    const card = this.shadowRoot.querySelector(".card");
    const tiles = this.shadowRoot.querySelector(".tiles");
    const layer = this.shadowRoot.querySelector(".aircraft");
    const airportEl = this.shadowRoot.querySelector("[data-airport]");
    if (!card || !tiles || !layer || !airportEl) return;
    const w = card.clientWidth, h = card.clientHeight, z = this._zoom(), c = this._centerPoint();
    const cp = this._project(c.lat, c.lon, z);
    const left = cp.x - w / 2, top = cp.y - h / 2;
    const n = 2 ** z;
    tiles.innerHTML = "";
    const startX = Math.floor(left / TILE) - 1, endX = Math.floor((left + w) / TILE) + 1;
    const startY = Math.floor(top / TILE) - 1, endY = Math.floor((top + h) / TILE) + 1;
    for (let tx = startX; tx <= endX; tx++) for (let ty = startY; ty <= endY; ty++) {
      const img = document.createElement("img"); img.className = "tile";
      img.src = OSM.replace("{z}", z).replace("{x}", ((tx % n) + n) % n).replace("{y}", ty);
      img.style.left = `${tx*TILE-left}px`; img.style.top = `${ty*TILE-top}px`; tiles.appendChild(img);
    }
    const pos = (lat, lon) => { const p = this._project(lat, lon, z); return { x: p.x-left, y: p.y-top }; };
    const ap = pos(this._airport().lat, this._airport().lon);
    airportEl.style.left = `${ap.x}px`; airportEl.style.top = `${ap.y}px`;
    layer.innerHTML = "";
    for (const f of this._flights) {
      if (!Number.isFinite(f.lat) || !Number.isFinite(f.lon)) continue;
      const p = pos(f.lat, f.lon);
      if (p.x < -30 || p.x > w+30 || p.y < -30 || p.y > h+30) continue;
      const el = document.createElement("div"); el.className = `plane${this._selected?.id === f.id ? " selected" : ""}`;
      el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; el.style.transform = `translate(-50%,-50%) rotate(${f.heading || 0}deg)`;
      el.innerHTML = `${this._plane()}<span class="tag">${f.flight}</span>`;
      el.addEventListener("click", () => { this._selected = f; this._center = { lat: f.lat, lon: f.lon }; this._render(); });
      layer.appendChild(el);
    }
  }
}

if (!customElements.get("flightradar-card")) customElements.define("flightradar-card", FlightRadarCard);
window.customCards = window.customCards || [];
if (!window.customCards.some(x => x.type === "flightradar-card")) {
  window.customCards.push({ type: "flightradar-card", name: "FlightRadar Card", description: "Live ADS-B flight tracking map" });
}
