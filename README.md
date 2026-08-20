# FlightRadar Card for Home Assistant

A FlightRadar-style Lovelace card for Home Assistant with a full-screen map, selectable aircraft, aircraft search, and live ADS-B traffic.

> **Development status:** Early live-data release. The card currently uses public ADS-B providers with automatic fallback. Airport schedules/true arrivals and departures will be added separately.

## Features

- Full-card geographic map
- Configurable map center and zoom
- Airport-centered default view
- Live ADS-B aircraft positions
- Automatic provider fallback
- Search by flight callsign, registration, or ICAO hex
- Click an aircraft to track it and center the map
- Selected-aircraft information panel
- Aircraft type photography
- Configurable airport
- Configurable ADS-B radius up to 250 NM
- Future local ADS-B receiver support
- HACS distribution

## Live data

The default provider is `auto`, which tries:

1. Airplanes.live
2. ADSB.lol

The card does not require an API key for these public endpoints. Provider availability and coverage can vary by location.

The card is designed so a future local ADS-B receiver can be used without changing the dashboard design.

## Installation

Install through HACS as a Dashboard repository using the repository:

`louisjferreira/ha-flightradar-card`

## Configuration

```yaml
type: custom:flightradar-card
airport: HRE
map:
  zoom: 7
  center_on_airport: true
live:
  provider: auto
  radius_nm: 250
refresh_interval: 15
```

### Providers

Use automatic fallback:

```yaml
live:
  provider: auto
```

Or force one provider:

```yaml
live:
  provider: airplanes_live
```

```yaml
live:
  provider: adsb_lol
```

### Local ADS-B receiver

A local receiver can be used later with an HTTP JSON endpoint compatible with readsb/tar1090-style aircraft data:

```yaml
live:
  provider: local
  url: "http://192.168.1.50/data/aircraft.json"
```

The URL may also contain `{lat}`, `{lon}`, and `{radius}` placeholders.

## Map positioning

By default the configured airport is always the map center. To use a custom center:

```yaml
map:
  center_on_airport: false
  latitude: -17.8
  longitude: 31.0
  zoom: 7
```

## Development

This project is being developed as a standalone Home Assistant custom card with the goal of a clean HACS release.

The current implementation focuses on the visual experience and live ADS-B traffic. Scheduled airport arrivals/departures require a separate flight-schedule data source and will be implemented as a distinct data layer.

## License

MIT
