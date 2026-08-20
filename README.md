# FlightRadar Card for Home Assistant

A FlightRadar-style Lovelace card for Home Assistant.

> **Development status:** Early UI prototype. The current release uses demonstration flight data while the live flight-data source is being designed.

## Planned features

- Full-card geographic map
- Configurable map center and zoom
- Clickable aircraft
- Selected-aircraft information panel
- Combined airport arrivals and departures board
- Configurable airport
- Live aircraft positions
- Automatic refresh
- HACS distribution

## Installation

The card will be distributed through HACS as development progresses.

For manual development installation, copy `flightradar-card.js` into your Home Assistant `www` directory and add it as a Lovelace resource.

```yaml
resources:
  - url: /local/flightradar-card.js
    type: module
```

## Initial configuration

```yaml
type: custom:flightradar-card
airport: HRE
map:
  latitude: -17.9318
  longitude: 31.0928
  zoom: 7
appearance:
  height: 520px
refresh_interval: 15
```

## Development

This project is being developed as a standalone Home Assistant custom card with the goal of a clean HACS release.

The initial UI prototype demonstrates the intended layout using OpenStreetMap tiles and sample aircraft data. Live data integration will be added after the card architecture and data-source requirements are finalized.

## License

MIT
