# ✈️ FlightRadar Card for Home Assistant

A FlightRadar-style dashboard card for Home Assistant, designed around a full-screen map and live ADS-B traffic.

![FlightRadar Card icon](icon.svg)

## Features

- 🗺️ Full-screen responsive map centred on a selected airport
- ✈️ Shows **all ADS-B aircraft within the configured radius**, not only aircraft travelling to or from the selected airport
- 🎯 Click any aircraft to select it without moving or resizing the map
- 🛰️ Smooth aircraft movement between live ADS-B updates
- 🔎 Search by flight callsign, registration, or ICAO hex address
- 📡 Live aircraft data through the Home Assistant backend
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

The graphical editor provides:

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

Older nested configurations are also accepted for compatibility:

```yaml
type: custom:flightradar-card
airport: HRE
map:
  zoom: 7
live:
  radius_nm: 250
refresh_interval: 10
appearance:
  full_screen: true
```

## Map behaviour

The selected airport is used to centre the map and define the ADS-B search area.

**The airport does not filter the aircraft shown on the map.** For example, with HRE selected and a 250 NM radius, every aircraft returned by the ADS-B provider inside that area can be displayed, regardless of its scheduled origin or destination.

Clicking an aircraft highlights it and updates the **Selected Aircraft** panel. Selecting an aircraft does not rebuild the map, so the map remains in place.

Live position updates are animated between provider refreshes rather than appearing as repeated jumps. The animation duration follows the configured refresh interval.

## Flight search

The search field accepts:

- Flight callsign, such as `SAA218`
- Aircraft registration
- ICAO 24-bit hex address

A successful live search selects the aircraft in the card.

## Live ADS-B architecture

The browser does not directly query the third-party ADS-B providers. Home Assistant performs the provider requests and the card receives the results through Home Assistant's authenticated WebSocket API.

Current providers:

1. Airplanes.live
2. ADSB.lol

The backend can fall back between providers.

## Future local ADS-B receiver

The backend is deliberately provider-based so a future local receiver using software such as readsb/tar1090 can be added without redesigning the card.

The planned architecture is:

```text
Local ADS-B receiver
        ↓
   Home Assistant
        ↓
 FlightRadar Card
        ↓
     Map + UI
```

This will allow the card to use aircraft received directly at home rather than relying solely on public Internet ADS-B feeds.

## Current limitations

- Public ADS-B coverage depends on the upstream providers.
- Aircraft photos and detailed flight schedules are not yet part of the live backend.
- The arrivals/departures board is planned as a separate data source from the ADS-B traffic layer.

## Roadmap

- [x] Live ADS-B aircraft positions
- [x] Smooth live position animation
- [x] Flight/registration/ICAO search
- [x] Selected aircraft tracking
- [x] Full-screen responsive map
- [x] Configurable airport
- [x] All-aircraft map traffic
- [x] Graphical card configuration
- [ ] Real airport arrivals/departures board
- [ ] Aircraft-specific photographs
- [ ] Expanded airport database
- [ ] Local ADS-B receiver provider
- [ ] Optional flight route display

## Version

**0.9.1**

## License

MIT
