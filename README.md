# ✈️ FlightRadar Card for Home Assistant

A FlightRadar-style dashboard card for Home Assistant, designed around a full-screen map, live aircraft movement and airport activity.

![FlightRadar Card icon](icon.svg)

## Features

- 🗺️ Full-screen responsive map centred on a selected airport
- ✈️ Live aircraft coverage from the **FlightRadar24 API**
- 🎯 Click aircraft without moving or resizing the map
- 🛰️ Smooth aircraft movement between API updates
- 🔎 Search by flight number, callsign or registration
- 📷 Aircraft photographs from Planespotters when available
- 📋 Expanded aircraft information including route, registration, ICAO24, altitude, speed and heading
- 🛬 Airport activity with live arrivals and departures
- 🛫 Configurable tracked airport
- 📏 Configurable live-aircraft radius
- 🔄 Configurable refresh interval
- 🔍 Configurable map zoom
- 📱 Responsive desktop, tablet and phone layout
- 🧩 Home Assistant graphical card configuration
- 🛰️ Provider architecture prepared for a future local ADS-B receiver

## Data source

FlightRadar Card uses the **official FlightRadar24 API** as its live aviation data provider. The FR24 API provides real-time aircraft movement together with flight number, callsign, origin, destination, registration and aircraft type information. citeturn4search2

This replaces the earlier public ADS-B aggregation used during development. The public feeds were useful for proving the map and animation architecture, but their Zimbabwe coverage was not sufficiently close to the FlightRadar24 experience.

## FlightRadar24 API setup

The FlightRadar24 API is a separate service from a normal FlightRadar24 website subscription. An active API subscription and API token are required. citeturn2search4turn2search5

1. Create or sign in to a FlightRadar24 API account.
2. Select an API subscription.
3. Open **Key management** and create an API token.
4. In Home Assistant go to **Settings → Devices & services**.
5. Open **FlightRadar Card** and choose **Configure**.
6. Enter the API token.
7. Save and reload the card.

The token is stored in the Home Assistant config entry and is **not included in the frontend or GitHub repository**.

The current Explorer plan is intended for testing and private/hobby projects and currently provides 30,000 monthly credits, with a promotional allocation of 60,000 credits for qualifying subscriptions during the current promotion period. citeturn2search0turn2search2

## Credit usage

FlightRadar24 charges by returned flight rather than simply by API request. Live Flight Positions Full currently costs 8 credits per returned flight; the card therefore uses a conservative default radius and refresh interval. citeturn5search1

The graphical defaults are currently:

| Setting | Default |
|---|---:|
| **Tracked airport** | HRE |
| **Live aircraft radius** | 150 NM |
| **Refresh interval** | 60 s |
| **Map zoom** | 7 |
| **Fill available screen height** | On |

The map interpolates aircraft movement between API updates so a 60-second API refresh does not result in aircraft appearing to jump between positions.

## Installation with HACS

1. Open **HACS** in Home Assistant.
2. Add `louisjferreira/ha-flightradar-card` as a custom repository if it is not already present.
3. Select **Integration** as the repository type.
4. Install **FlightRadar Card**.
5. Restart Home Assistant.
6. Go to **Settings → Devices & services → Add Integration**.
7. Search for **FlightRadar Card** and add the integration.
8. Enter your FlightRadar24 API token when prompted.

The integration registers the Lovelace card frontend automatically. A manual Lovelace resource should not be necessary.

## Adding the card

Add a new dashboard card and search for **FlightRadar Card**.

### Example YAML

```yaml
type: custom:flightradar-card
airport: HRE
radius_nm: 150
refresh_interval: 60
zoom: 7
full_screen: true
```

Older nested configurations remain accepted for compatibility.

## Aircraft details

Selecting an aircraft uses the FR24 live/full endpoint to provide richer flight information, including:

- Flight number
- Callsign
- Operating/marketing airline code
- Aircraft type
- Registration
- ICAO24 hex
- Origin
- Destination
- ETA where available
- Altitude
- Ground speed
- Vertical speed
- Track/heading
- Squawk
- Data source

The card can also request an aircraft photograph from the Planespotters public API when one is available.

## Airport activity

The backend provides dedicated FR24 live airport filtering for:

- **ARRIVALS** — live aircraft inbound to the selected airport
- **DEPARTURES** — live aircraft outbound from the selected airport

This is live operational traffic rather than a fabricated schedule. The FR24 live/full endpoint explicitly provides origin and destination fields, making it substantially more reliable than the previous route-enrichment approach. citeturn1search0turn0search5

## Map behaviour

The selected airport centres the map and defines the aircraft search area. The airport does **not** filter the map to only flights serving that airport; all FR24 aircraft returned inside the configured geographic radius can be displayed.

Selecting an aircraft does not rebuild the map, so the map remains stable. Aircraft positions are interpolated visually between live API updates.

## Future local ADS-B receiver

The provider layer is intentionally separated from the card UI so a future local receiver can be added alongside FR24.

```text
             FlightRadar Card
                    │
          ┌─────────┴─────────┐
          │                   │
     FlightRadar24       Local ADS-B
          API              Receiver
          │                   │
          └─────────┬─────────┘
                    ▼
             Home Assistant
                    ▼
                Map + UI
```

A local receiver could eventually provide very high-frequency local updates while FR24 remains the wider-area source.

## Current limitations

- FlightRadar24 API coverage and data are not guaranteed to be identical to the consumer FlightRadar24 website; FR24 states that the website and API are separate products with overlapping but not identical datasets. citeturn4search3
- API credits are consumed according to returned entities.
- Aircraft photographs are unavailable for some aircraft.
- Scheduled gate, terminal and timetable information is not currently part of the live aircraft layer.
- FR24 API data retrieved by the integration is transiently cached only in memory; FR24's API storage rules limit retained API data to 30 days. citeturn0search0

## Roadmap

- [x] FlightRadar24 live aircraft positions
- [x] Flight/registration search
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
- [ ] Scheduled airport board with a dedicated schedule/status API
- [ ] Expanded airport database

## Version

**0.9.3**

## License

MIT
