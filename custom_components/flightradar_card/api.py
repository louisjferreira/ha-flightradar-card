from __future__ import annotations

import time
from typing import Any

from aiohttp import ClientError
from homeassistant.helpers.aiohttp_client import async_get_clientsession

PROVIDERS = (
    ("Airplanes.live", "https://api.airplanes.live/v2"),
    ("ADSB.lol", "https://api.adsb.lol/v2"),
)

_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _clean_aircraft(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "hex": str(item.get("hex") or "").upper(),
        "flight": str(item.get("flight") or "").strip(),
        "registration": item.get("r"),
        "type": item.get("t") or item.get("type") or item.get("desc"),
        "description": item.get("desc"),
        "lat": item.get("lat"),
        "lon": item.get("lon"),
        "altitude": item.get("alt_baro", item.get("alt_geom")),
        "speed_knots": item.get("gs"),
        "track": item.get("track", item.get("true_heading")),
        "on_ground": item.get("alt_baro") == "ground" or item.get("on_ground") is True,
        "seen": item.get("seen", item.get("seen_pos")),
    }


async def _get_json(hass, url: str) -> dict[str, Any]:
    session = async_get_clientsession(hass)
    async with session.get(url, timeout=12, headers={"Accept": "application/json"}) as response:
        response.raise_for_status()
        return await response.json(content_type=None)


async def get_aircraft(hass, latitude: float, longitude: float, radius: int) -> dict[str, Any]:
    radius = max(10, min(250, int(radius)))
    cache_key = f"point:{latitude:.4f}:{longitude:.4f}:{radius}"
    cached = _cache.get(cache_key)
    if cached and time.monotonic() - cached[0] < 8:
        return cached[1]

    errors: list[str] = []
    for name, base in PROVIDERS:
        try:
            data = await _get_json(hass, f"{base}/point/{latitude}/{longitude}/{radius}")
            aircraft = [_clean_aircraft(item) for item in data.get("ac", [])]
            result = {"aircraft": aircraft, "provider": name, "timestamp": time.time()}
            _cache[cache_key] = (time.monotonic(), result)
            return result
        except (ClientError, TimeoutError, ValueError) as err:
            errors.append(f"{name}: {err}")

    raise RuntimeError("; ".join(errors) or "No ADS-B provider responded")


async def search_aircraft(hass, query: str) -> dict[str, Any]:
    query = query.strip().upper()
    if not query:
        return {"aircraft": [], "provider": None}

    errors: list[str] = []
    for name, base in PROVIDERS:
        for kind in ("callsign", "reg", "hex"):
            try:
                data = await _get_json(hass, f"{base}/{kind}/{query}")
                aircraft = [_clean_aircraft(item) for item in data.get("ac", [])]
                if aircraft:
                    return {"aircraft": aircraft, "provider": name, "timestamp": time.time()}
            except (ClientError, TimeoutError, ValueError) as err:
                errors.append(f"{name}/{kind}: {err}")

    return {"aircraft": [], "provider": None, "error": "; ".join(errors[-3:])}
