from __future__ import annotations

import time
from typing import Any

from aiohttp import ClientError
from homeassistant.helpers.aiohttp_client import async_get_clientsession

# Public ADS-B feeds. Coverage varies heavily by region, so we try several
# independent community feeds before reporting the service as unavailable.
PROVIDERS = (
    ("ADSB.lol", "https://api.adsb.lol/v2", "point"),
    ("Airplanes.live", "https://api.airplanes.live/v2", "point"),
    ("ADSB.fi", "https://opendata.adsb.fi/api/v2", "adsbfi"),
)

_cache: dict[str, tuple[float, dict[str, Any]]] = {}
USER_AGENT = "HomeAssistant-FlightRadar-Card/0.9.0"


def _clean_aircraft(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "hex": str(item.get("hex") or item.get("icao24") or "").upper(),
        "flight": str(item.get("flight") or item.get("callsign") or "").strip(),
        "registration": item.get("r") or item.get("registration"),
        "type": item.get("t") or item.get("type") or item.get("desc"),
        "description": item.get("desc") or item.get("description"),
        "lat": item.get("lat") if item.get("lat") is not None else item.get("latitude"),
        "lon": item.get("lon") if item.get("lon") is not None else item.get("longitude"),
        "altitude": item.get("alt_baro", item.get("alt_geom", item.get("altitude"))),
        "speed_knots": item.get("gs", item.get("ground_speed")),
        "track": item.get("track", item.get("true_heading", item.get("heading"))),
        "on_ground": item.get("alt_baro") == "ground" or item.get("on_ground") is True,
        "seen": item.get("seen", item.get("seen_pos")),
    }


async def _get_json(hass, url: str) -> dict[str, Any]:
    session = async_get_clientsession(hass)
    async with session.get(
        url,
        timeout=12,
        headers={"Accept": "application/json", "User-Agent": USER_AGENT},
    ) as response:
        response.raise_for_status()
        return await response.json(content_type=None)


def _aircraft_from_response(data: dict[str, Any], provider_type: str) -> list[dict[str, Any]]:
    if provider_type == "adsbfi":
        items = data.get("aircraft", data.get("ac", []))
    else:
        items = data.get("ac", data.get("aircraft", []))
    return [_clean_aircraft(item) for item in items if isinstance(item, dict)]


async def get_aircraft(hass, latitude: float, longitude: float, radius: int) -> dict[str, Any]:
    radius = max(10, min(250, int(radius)))
    cache_key = f"point:{latitude:.4f}:{longitude:.4f}:{radius}"
    cached = _cache.get(cache_key)
    if cached and time.monotonic() - cached[0] < 8:
        return cached[1]

    errors: list[str] = []
    successful_empty: list[str] = []

    for name, base, provider_type in PROVIDERS:
        try:
            if provider_type == "adsbfi":
                url = f"{base}/lat/{latitude}/lon/{longitude}/dist/{radius}"
            else:
                url = f"{base}/point/{latitude}/{longitude}/{radius}"

            data = await _get_json(hass, url)
            aircraft = _aircraft_from_response(data, provider_type)

            # An HTTP-successful empty response is not a provider failure. It
            # can simply mean that this feed has no receivers covering the area.
            if not aircraft:
                successful_empty.append(name)
                continue

            result = {"aircraft": aircraft, "provider": name, "timestamp": time.time()}
            _cache[cache_key] = (time.monotonic(), result)
            return result
        except (ClientError, TimeoutError, ValueError, OSError) as err:
            errors.append(f"{name}: {type(err).__name__}: {err}")
        except Exception as err:  # noqa: BLE001
            errors.append(f"{name}: {type(err).__name__}: {err}")

    if successful_empty:
        return {
            "aircraft": [],
            "provider": ", ".join(successful_empty),
            "timestamp": time.time(),
            "error": "No aircraft were returned by the available feeds",
        }

    raise RuntimeError(" | ".join(errors) or "No ADS-B provider responded")


async def search_aircraft(hass, query: str) -> dict[str, Any]:
    query = query.strip().upper()
    if not query:
        return {"aircraft": [], "provider": None}

    errors: list[str] = []
    for name, base, provider_type in PROVIDERS:
        # ADSB.fi is used as a regional feed only; its public endpoint does not
        # mirror the callsign/reg/hex search endpoints used by the other feeds.
        if provider_type == "adsbfi":
            continue
        for kind in ("callsign", "reg", "hex"):
            try:
                data = await _get_json(hass, f"{base}/{kind}/{query}")
                aircraft = _aircraft_from_response(data, "point")
                if aircraft:
                    return {"aircraft": aircraft, "provider": name, "timestamp": time.time()}
            except (ClientError, TimeoutError, ValueError, OSError) as err:
                errors.append(f"{name}/{kind}: {type(err).__name__}: {err}")
            except Exception as err:  # noqa: BLE001
                errors.append(f"{name}/{kind}: {type(err).__name__}: {err}")

    return {"aircraft": [], "provider": None, "error": "; ".join(errors[-3:])}
