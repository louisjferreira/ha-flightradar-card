# FlightRadar Card for Home Assistant

A FlightRadar-style Home Assistant card with a full-screen map, live ADS-B aircraft, aircraft search, and a selected-aircraft information panel.

## v0.8.0 architecture

The card now uses a small Home Assistant backend integration. This is intentional: browser-side calls to third-party ADS-B APIs are unreliable because of browser security/CORS behaviour. Home Assistant performs the provider requests and the card receives the result through Home Assistant's authenticated WebSocket API.

Live providers:

1. Airplanes.live
2. ADSB.lol

The backend automatically falls back between them.

## Installation

1. In HACS, remove the old **Dashboard** installation of this repository.
2. Add `louisjferreira/ha-flightradar-card` as a **Custom repository** with type **Integration**.
3. Install/update it.
4. Go to **Settings → Devices & services → Add Integration**.
5. Search for **FlightRadar Card** and add it once.
6. Reload Home Assistant or refresh the browser.

The integration registers the card frontend automatically, so no manual Lovelace resource is required.

## Card configuration

```yaml
type: custom:flightradar-card
airport: HRE
map:
  zoom: 7
  center_on_airport: true
live:
  radius_nm: 250
refresh_interval: 15
```

### Search

The search box accepts a live flight callsign, aircraft registration, or ICAO hex address. A match is selected and the map centres on it.

### Future local receiver

The backend architecture is deliberately provider-based so a future local readsb/tar1090 receiver can be added without redesigning the card. This is the intended path for a home ADS-B receiver.

## Roadmap

- Live ADS-B aircraft positions
- Flight/registration/ICAO search
- Selected aircraft tracking
- Full-screen responsive map
- Real HRE arrivals/departures board
- Aircraft-specific photos
- Local ADS-B receiver provider
- Additional airport support

## License

MIT
