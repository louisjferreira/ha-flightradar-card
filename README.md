# ✈️ FlightRadar Card for Home Assistant

A FlightRadar-style dashboard card for Home Assistant, designed around a full-screen map and live ADS-B traffic.

![FlightRadar Card icon](icon.svg)

## Features

- 🗺️ Full-screen responsive map centred on a selected airport
- ✈️ Shows **all ADS-B aircraft within the configured radius**
- 🎯 Click any aircraft without moving or resizing the map
- 🛰️ Smooth aircraft movement between live ADS-B updates
- 🔎 Search by callsign, registration, or ICAO hex address
- 📡 Merged live data from multiple public ADS-B networks
- 📷 Aircraft photographs from Planespotters.net when available
- 📋 Expanded aircraft information including registration, ICAO24, heading, vertical rate, squawk and emergency state
- 🛫 Live route enrichment with origin and destination airport codes when available
- 🛬 Airport Activity panel with **ALL / ARRIVALS / DEPARTURES** views
- 🛫 Configurable tracked airport
- 📏 Configurable live-aircraft radius
- 🔄 Configurable refresh interval
- 🔍 Configurable map zoom
- 📱 Responsive desktop, tablet, and phone layout
- 🧩 Home Assistant graphical card configuration
- 🛰️ Architecture prepared for a future local ADS-B receiver

## Installation with HACS

1. Open **HACS** in Home Assistant.
2. Add `louisjferreira/ha-flightradar-card` as a custom repository if it is not already present.
3. Select **Integration** as the repository type.
4. Install **FlightRadar Card**.
5. Restart Home Assistant.
6. Go to **Settings → Devices & services → Add Integration**.
7. Search for **FlightRadar Card** and add the integration.

The integration registers the Lovelace card frontend automatically. A manual Lovelace resource should not be necessary.

## Adding the card

Add a new dashboard card and search for **FlightRadar Card**.

| Setting | Description | Default |
|---|---|---:|
| **Tracked airport** | Airport used as the map centre and live traffic reference point | HRE |
| **Live aircraft radius** | Radius around the selected airport used for ADS-B traffic | 250 NM |
| **Refresh interval** | How often live aircraft data is refreshed | 10 s |
| **Map zoom** | OpenStreetMap zoom level | 7 |
| **Fill available screen height** | Expands the map to the available screen height | On |

### Example YAML

```yaml
type: custom:flightradar-card
airport: HRE
radius_nm: 250
refresh_interval: 10
zoom: 7
full_screen: true
```

Older nested configurations are also accepted for compatibility.

## Live aircraft data

Home Assistant queries several public ADS-B networks and merges their results by aircraft identifier. This is important in areas such as Zimbabwe where coverage can differ significantly between networks.

Current feeds:

- ADSB.lol
- Airplanes.live
- ADSB.fi

The card does **not** claim that these feeds are identical to FlightRadar24. ADS-B coverage is receiver-dependent, and FlightRadar24 uses its own network and data processing. The goal is to provide the best openly accessible live ADS-B picture available to the card.

## Aircraft details

Selecting an aircraft now provides a richer identity panel with:

- Callsign
- Airline where identifiable
- Aircraft type
- Registration
- ICAO24 hex
- Origin and destination when route enrichment is available
- Altitude
- Ground speed
- Heading
- Vertical rate
- Squawk
- Ground/airborne status
- Emergency status
- Aircraft photograph when available

Aircraft photographs are retrieved through the Planespotters.net public API and displayed with photographer attribution when supplied.

## Airport Activity

The right-hand panel is now explicitly an **Airport Activity** panel rather than a generic list of nearby aircraft.

It provides three views:

- **ALL** — live aircraft with a route matching the selected airport
- **ARRIVALS** — aircraft whose enriched route destination matches the selected airport
- **DEPARTURES** — aircraft whose enriched route origin matches the selected airport

Route information comes from the free ADSB.lol/adsb.im route enrichment service. It is crowdsourced route information rather than an official airport schedule, so the card deliberately labels the activity as live route-matched traffic rather than scheduled arrivals/departures.

## Map behaviour

The selected airport centres the map and defines the ADS-B search area. The airport does not filter the aircraft shown on the map.

Selecting an aircraft does not rebuild the map, so the map remains completely stable. Live position updates are animated between provider refreshes rather than appearing as repeated jumps.

## Future local ADS-B receiver

The backend is provider-based so a future local receiver using readsb/tar1090 can be added without redesigning the card.

```text
Local ADS-B receiver
        ↓
   Home Assistant
        ↓
 FlightRadar Card
        ↓
     Map + UI
```

## Current limitations

- Public ADS-B coverage varies by region and provider.
- Free route enrichment is useful but is not an authoritative flight schedule.
- Aircraft photographs are unavailable for some registrations/hex codes.
- A true scheduled airport departures/arrivals board will require a dedicated flight-status/schedule data source.

## Roadmap

- [x] Live ADS-B aircraft positions
- [x] Multi-provider ADS-B merging
- [x] Smooth live position animation
- [x] Flight/registration/ICAO search
- [x] Selected aircraft tracking
- [x] Aircraft details
- [x] Aircraft photographs
- [x] Live route enrichment
- [x] Airport arrivals/departures filtering
- [x] Full-screen responsive map
- [x] Configurable airport
- [x] All-aircraft map traffic
- [x] Graphical card configuration
- [ ] True scheduled airport arrivals/departures board
- [ ] Expanded airport database
- [ ] Local ADS-B receiver provider
- [ ] Optional flight route line display

## Version

**0.9.2**

## License

MIT
