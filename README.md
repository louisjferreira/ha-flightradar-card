# ✈️ FlightRadar Card for Home Assistant

A FlightRadar-style dashboard card for Home Assistant, designed around a full-screen map, live aircraft movement, aircraft details and airport activity.

![FlightRadar Card icon](icon.svg)

## Features

- 🗺️ Full-screen responsive map centred on a selected airport
- ✈️ Live flight data from the **Home Assistant FlightRadar24 integration**
- 🎯 Click aircraft without moving or resizing the map
- 🛰️ Smooth aircraft movement between Home Assistant updates
- 🔎 Search by flight number, callsign, registration or ICAO24
- 📷 Aircraft photographs from the FlightRadar24 integration when available
- 📋 Expanded aircraft information including route, registration, ICAO24, altitude, speed and heading
- 🛬 Airport arrivals and departures using the FlightRadar24 integration's airport sensors
- 🛫 Configurable tracked airport
- 📏 Configurable live-aircraft radius
- 🔄 Configurable refresh interval
- 🔍 Configurable map zoom
- 📱 Responsive desktop, tablet and phone layout
- 🧩 Home Assistant graphical card configuration
- 🛰️ Provider architecture prepared for a future local ADS-B receiver

## Data source

The card **does not require a separate FlightRadar24 API token**.

Instead, it reads the flight data already provided to Home Assistant by the HACS **Flightradar24 integration by AlexandrErohin**. That integration exposes detailed flight objects through the `flights` attribute of its sensors, including current position, altitude, speed, heading, aircraft information, route and aircraft photographs.

The card also uses the integration's **Airport arrivals** and **Airport departures** sensors for the airport board. If airport tracking has not yet been enabled, the card will attempt to set the integration's airport-tracking text entity automatically.

The upstream integration documents the available sensors, flight fields and airport tracking behaviour here:

https://github.com/AlexandrErohin/home-assistant-flightradar24

## Required Home Assistant integration

Install **Flightradar24** by AlexandrErohin through HACS before using this card.

1. Open **HACS → Integrations**.
2. Search for **Flightradar24**.
3. Install the integration by AlexandrErohin.
4. Restart Home Assistant.
5. Add/configure the Flightradar24 integration.
6. Set its monitoring location and radius to cover the area you want to display.

The card expects the integration to expose a **Current in area** sensor with a `flights` attribute. It also uses the **Additional tracked**, **Airport arrivals** and **Airport departures** sensors when available.

Home Assistant may localize entity IDs. The card therefore discovers the relevant Flightradar24 sensors by their entity IDs and friendly names rather than requiring hard-coded entity IDs.

## Installation with HACS

1. Open **HACS** in Home Assistant.
2. Add `louisjferreira/ha-flightradar-card` as a custom repository if it is not already present.
3. Select **Integration** as the repository type.
4. Install **FlightRadar Card**.
5. Restart Home Assistant.
6. Add **FlightRadar Card** from the dashboard card picker.

The card's integration registers the frontend automatically. No separate FlightRadar24 API token is requested by this card.

## Adding the card

Add a new dashboard card and search for **FlightRadar Card**.

### Example YAML

```yaml
type: custom:flightradar-card
airport: HRE
radius_nm: 250
refresh_interval: 10
zoom: 7
full_screen: true
```

The graphical configuration editor exposes the same options.

### Supported airports

The current built-in airport list includes:

`HRE`, `JNB`, `CPT`, `DUR`, `GBE`, `MPM`, `LUN`, `NBO`, `ADD`, `WDH`, `MUB`, `LHR`, `DXB`, `SIN`, `JFK`

The airport selector controls the map centre and the airport activity board. The map itself is **not restricted to flights arriving at or departing from that airport**; all aircraft supplied by the FlightRadar24 integration inside the configured area are displayed.

## Search

The search box accepts:

- Flight number
- Callsign
- Aircraft registration
- ICAO24
- Aircraft code
- Airline

If a matching aircraft is not currently in the configured area, the card can use the FlightRadar24 integration's **Additional tracked** feature to request tracking of the flight. This means the search can find aircraft outside the map area without requiring a second paid API service.

## Aircraft details

Selecting an aircraft displays information such as:

- Flight number
- Callsign
- Airline
- Aircraft model/code
- Registration
- ICAO24
- Origin and destination
- Altitude
- Ground speed
- Vertical speed
- Track/heading
- Squawk
- Aircraft category
- Aircraft photograph when supplied by the integration

## Airport activity

The airport panel provides three views:

- **ALL** — all aircraft currently supplied for the selected area, with route information
- **ARRIVALS** — flights supplied by the selected airport's FlightRadar24 arrivals sensor
- **DEPARTURES** — flights supplied by the selected airport's FlightRadar24 departures sensor

The airport board is deliberately separate from the map traffic. A scheduled airport flight can therefore appear on the airport board even when it has no current map coordinates.

## Map behaviour

The selected airport centres the map and defines the geographic context for the live traffic returned by the Home Assistant FlightRadar24 integration.

Selecting an aircraft does not rebuild or resize the map. Aircraft markers are updated in place and interpolated visually between data updates, producing a much smoother result than repeatedly rebuilding the map.

The map uses OpenStreetMap tiles and does not require a separate map API token.

## Future local ADS-B receiver

The provider layer is intentionally separated from the card UI so a future local ADS-B receiver can be added later.

```text
             FlightRadar Card
                    │
          ┌─────────┴─────────┐
          │                   │
   HA FlightRadar24       Local ADS-B
      integration           receiver
          │                   │
          └─────────┬─────────┘
                    ▼
             Flight data
                    ▼
                Map + UI
```

A local receiver could eventually provide very high-frequency local updates while the FlightRadar24 integration remains the wider-area source.

## Current limitations

- The card is dependent on the FlightRadar24 Home Assistant integration being installed and receiving data.
- The number of aircraft displayed is limited by the radius and filters configured in that integration.
- Airport arrivals/departures require the upstream integration's airport tracking feature.
- Aircraft photographs are unavailable for some aircraft.
- The card does not attempt to reproduce every feature of the consumer FlightRadar24 website.

## Roadmap

- [x] FlightRadar24 integration data source
- [x] Live aircraft positions
- [x] Flight/registration search
- [x] Additional tracked search fallback
- [x] Selected aircraft tracking
- [x] Aircraft details
- [x] Aircraft photographs
- [x] Origin/destination data
- [x] Airport arrivals/departures data
- [x] Full-screen responsive map
- [x] Configurable airport
- [x] All-aircraft map traffic
- [x] Graphical card configuration
- [ ] Local ADS-B receiver provider
- [ ] Optional flight route line display
- [ ] Expanded airport database
- [ ] Optional iframe/FR24-style map provider

## Version

**0.9.3**

## License

MIT
