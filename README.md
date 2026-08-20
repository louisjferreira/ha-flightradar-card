# FlightRadar Card for Home Assistant

A FlightRadar-style Lovelace card for Home Assistant with live ADS-B aircraft tracking.

> **Development status:** Early live-data release. Aircraft positions and flight searches use Airplanes.live ADS-B data. Airport schedule/arrival/departure data will be added separately.

## Features

- Full-screen geographic map
- Configurable map center and zoom
- Live aircraft positions around the configured airport
- Automatic live refresh
- Clickable aircraft
- Selected-aircraft information panel with aircraft photo
- Search a flight by callsign, registration, or ICAO hex
- Search automatically centers the map on the aircraft
- Configurable airport
- HACS distribution

## Live data source

Live aircraft data is provided by [Airplanes.live](https://airplanes.live/) using its public ADS-B REST API. The public API is rate limited to approximately one request per second; the card therefore defaults to a 15-second refresh interval. The Airplanes.live API is intended for personal, non-commercial use.

## Installation

The card is distributed through HACS as a custom frontend card.

For manual installation, copy `flightradar-card.js` into your Home Assistant `www` directory and add it as a Lovelace resource:

```yaml
resources:
  - url: /local/flightradar-card.js
    type: module
```

## Configuration

```yaml
type: custom:flightradar-card
airport: HRE
map:
  latitude: -17.9318
  longitude: 31.0928
  zoom: 7
  center_on_airport: true
appearance:
  full_screen: true
refresh_interval: 15
live:
  radius_nm: 250
```

### Options

| Option | Default | Description |
|---|---:|---|
| `airport` | `HRE` | Configured airport code |
| `map.zoom` | `7` | Map zoom level |
| `map.center_on_airport` | `true` | Keep the initial map centered on the airport |
| `appearance.full_screen` | `true` | Fill the available Home Assistant viewport |
| `refresh_interval` | `15` | Live aircraft refresh interval in seconds |
| `live.radius_nm` | `250` | Aircraft search radius around the airport, maximum 250 NM |

## Flight search

Use the search box at the top of the card to enter a callsign such as `SAA218`, an aircraft registration, or an ICAO hex address. When a live match is found, the card selects the aircraft and centers the map on its current position.

## Development

The card is being developed as a standalone Home Assistant custom card with the goal of a clean HACS release. OpenStreetMap is used for map tiles and Airplanes.live provides the live ADS-B aircraft data.

## License

MIT
