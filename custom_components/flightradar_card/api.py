from __future__ import annotations

import math
import time
from typing import Any

from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOMAIN

FR24_BASE = "https://fr24api.flightradar24.com/api"
USER_AGENT = "HomeAssistant-FlightRadar-Card/0.9.3"
_cache: dict[str, tuple[float, Any]] = {}


def _token(hass) -> str | None:
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        return None
    return entries[0].data.get("api_token")


def _headers(token: str) -> dict[str, str]:
    return {"Accept": "application/json", "Authorization": f"Bearer {token}", "Accept-Version": "v1", "User-Agent": USER_AGENT}


async def _get(hass, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    token = _token(hass)
    if not token:
        raise RuntimeError("FlightRadar24 API token is not configured. Open Settings > Devices & services > FlightRadar Card > Configure.")
    session = async_get_clientsession(hass)
    async with session.get(f"{FR24_BASE}{path}", params=params or {}, headers=_headers(token), timeout=15) as response:
        if response.status == 401:
            raise RuntimeError("FlightRadar24 API token is invalid or expired.")
        if response.status == 402:
            raise RuntimeError("FlightRadar24 API credits are exhausted.")
        if response.status == 403:
            raise RuntimeError("FlightRadar24 API access is not permitted for this token or endpoint.")
        response.raise_for_status()
        return await response.json(content_type=None)


def _bounds(lat: float, lon: float, radius_nm: int) -> str:
    lat_delta = radius_nm / 60.0
    lon_delta = radius_nm / max(60.0 * math.cos(math.radians(lat)), 1.0)
    return f"{min(90.0, lat + lat_delta):.5f},{max(-90.0, lat - lat_delta):.5f},{lon - lon_delta:.5f},{lon + lon_delta:.5f}"


def _clean(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "fr24_id": item.get("fr24_id"),
        "hex": str(item.get("hex") or "").upper() or None,
        "flight": item.get("flight"),
        "callsign": item.get("callsign"),
        "registration": item.get("reg"),
        "type": item.get("type"),
        "airline": item.get("operated_as") or item.get("painted_as"),
        "lat": item.get("lat"),
        "lon": item.get("lon"),
        "altitude": item.get("alt"),
        "speed_knots": item.get("gspeed"),
        "vertical_rate": item.get("vspeed"),
        "track": item.get("track"),
        "heading": item.get("track"),
        "squawk": item.get("squawk"),
        "origin": item.get("orig_iata") or item.get("orig_icao"),
        "destination": item.get("dest_iata") or item.get("dest_icao"),
        "origin_icao": item.get("orig_icao"),
        "destination_icao": item.get("dest_icao"),
        "eta": item.get("eta"),
        "source": item.get("source"),
        "category": item.get("category"),
        "on_ground": item.get("alt") == 0,
        "timestamp": item.get("timestamp"),
    }


def _data(payload: dict[str, Any]) -> list[dict[str, Any]]:
    return [_clean(x) for x in payload.get("data", []) if isinstance(x, dict)]


async def get_aircraft(hass, latitude: float, longitude: float, radius: int) -> dict[str, Any]:
    radius = max(10, min(250, int(radius)))
    cache_key = f"full:{latitude:.4f}:{longitude:.4f}:{radius}"
    cached = _cache.get(cache_key)
    if cached and time.monotonic() - cached[0] < 5:
        return cached[1]
    data = await _get(hass, "/live/flight-positions/full", {"bounds": _bounds(latitude, longitude, radius), "limit": 20})
    result = {"aircraft": _data(data), "provider": "FlightRadar24", "timestamp": time.time()}
    _cache[cache_key] = (time.monotonic(), result)
    return result


async def _full_search(hass, query: str) -> list[dict[str, Any]]:
    for params in ({"callsigns": query, "limit": 20}, {"registrations": query, "limit": 20}, {"flights": query, "limit": 20}):
        try:
            flights = _data(await _get(hass, "/live/flight-positions/full", params))
            if flights:
                return flights
        except Exception:
            continue
    return []


async def search_aircraft(hass, query: str) -> dict[str, Any]:
    query = query.strip().upper()
    if not query:
        return {"aircraft": [], "provider": "FlightRadar24"}
    flights = await _full_search(hass, query)
    return {"aircraft": flights, "provider": "FlightRadar24", "timestamp": time.time(), **({} if flights else {"error": f"No live FlightRadar24 aircraft found for {query}"})}


async def get_aircraft_detail(hass, flight: dict[str, Any]) -> dict[str, Any]:
    query = str(flight.get("callsign") or flight.get("flight") or flight.get("registration") or "").strip().upper()
    if not query:
        return flight
    flights = await _full_search(hass, query)
    if not flights:
        return flight
    target = flight.get("fr24_id") or flight.get("hex") or flight.get("registration")
    return next((item for item in flights if target and target in (item.get("fr24_id"), item.get("hex"), item.get("registration"))), flights[0])


async def get_airport_activity(hass, airport: str) -> dict[str, Any]:
    airport = airport.strip().upper()
    cache_key = f"activity:{airport}"
    cached = _cache.get(cache_key)
    if cached and time.monotonic() - cached[0] < 180:
        return cached[1]
    arrivals = await _get(hass, "/live/flight-positions/full", {"airports": f"inbound:{airport}", "limit": 20})
    departures = await _get(hass, "/live/flight-positions/full", {"airports": f"outbound:{airport}", "limit": 20})
    result = {"airport": airport, "arrivals": _data(arrivals), "departures": _data(departures), "provider": "FlightRadar24", "timestamp": time.time()}
    _cache[cache_key] = (time.monotonic(), result)
    return result


async def get_aircraft_photo(hass, hex_code: str) -> dict[str, Any]:
    hex_code = str(hex_code or "").strip().upper()
    if not hex_code:
        return {"photo": None}
    cache_key = f"photo:{hex_code}"
    cached = _cache.get(cache_key)
    if cached and time.monotonic() - cached[0] < 3600:
        return cached[1]
    try:
        session = async_get_clientsession(hass)
        async with session.get(f"https://api.planespotters.net/pub/photos/hex/{hex_code}", headers={"Accept": "application/json", "User-Agent": USER_AGENT}, timeout=10) as response:
            response.raise_for_status()
            data = await response.json(content_type=None)
        photos = data.get("photos", []) if isinstance(data, dict) else []
        photo = None
        if photos:
            item = photos[0]
            thumb = item.get("thumbnail", {}) or {}
            photo = {"src": thumb.get("src") or item.get("src"), "link": item.get("link"), "photographer": item.get("photographer")}
    except Exception:
        photo = None
    result = {"photo": photo}
    _cache[cache_key] = (time.monotonic(), result)
    return result
