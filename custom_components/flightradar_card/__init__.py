from __future__ import annotations

import asyncio
from pathlib import Path

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .api import (
    _clean_airport,
    _entity,
    _raw_flights,
    _track_airport,
    get_aircraft,
    get_aircraft_detail,
    get_aircraft_photo,
    get_airport_activity,
    search_aircraft,
)
from .const import CARD_URL, DOMAIN


async def _fresh_airport_activity(hass: HomeAssistant, airport: str) -> dict:
    """Force the upstream FR24 integration to track the selected airport, then read its feeds."""
    airport = airport.strip().upper()
    await _track_airport(hass, airport)
    await asyncio.sleep(1.5)
    arrivals_state = _entity(hass, "arrivals")
    departures_state = _entity(hass, "departures")
    arrivals = [_clean_airport(f, "ARRIVALS", airport) for f in _raw_flights(arrivals_state)]
    departures = [_clean_airport(f, "DEPARTURES", airport) for f in _raw_flights(departures_state)]
    return {
        "airport": airport,
        "arrivals": arrivals,
        "departures": departures,
        "provider": "FlightRadar24 Home Assistant integration",
    }


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    frontend_path = Path(__file__).parent / "frontend"
    loader_path = frontend_path / "card-loader.js"
    card_path = frontend_path / "flightradar-card.js"
    fix_path = frontend_path / "card-fix.js"
    static_paths = []
    if loader_path.exists():
        static_paths.append(StaticPathConfig("/flightradar_card/card-loader.js", str(loader_path), cache_headers=False))
    if card_path.exists():
        static_paths.append(StaticPathConfig("/flightradar_card/flightradar-card.js", str(card_path), cache_headers=False))
    if fix_path.exists():
        static_paths.append(StaticPathConfig("/flightradar_card/card-fix.js", str(fix_path), cache_headers=False))
    if static_paths:
        await hass.http.async_register_static_paths(static_paths)
        add_extra_js_url(hass, CARD_URL)
    websocket_api.async_register_command(hass, websocket_get_aircraft)
    websocket_api.async_register_command(hass, websocket_search_aircraft)
    websocket_api.async_register_command(hass, websocket_get_detail)
    websocket_api.async_register_command(hass, websocket_get_activity)
    websocket_api.async_register_command(hass, websocket_get_photo)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    return True


@websocket_api.websocket_command({
    vol.Required("type"): "flightradar_card/get_aircraft",
    vol.Required("latitude"): vol.Coerce(float),
    vol.Required("longitude"): vol.Coerce(float),
    vol.Optional("radius", default=250): vol.All(vol.Coerce(int), vol.Range(min=10, max=250)),
})
@websocket_api.async_response
async def websocket_get_aircraft(hass: HomeAssistant, connection, msg: dict) -> None:
    try:
        result = await get_aircraft(hass, msg["latitude"], msg["longitude"], msg["radius"])
        airport = result.get("airport") or ""
        if not airport:
            # Derive the tracked airport from the same coordinates used by the card.
            from .api import _airport_from_coordinates
            airport = _airport_from_coordinates(msg["latitude"], msg["longitude"])
        activity = await _fresh_airport_activity(hass, airport)
        result["arrivals"] = activity["arrivals"]
        result["departures"] = activity["departures"]
        result["airport"] = airport
        result["timestamp"] = __import__("time").time()
        connection.send_result(msg["id"], result)
    except Exception as err:
        connection.send_error(msg["id"], "fr24_unavailable", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "flightradar_card/search",
    vol.Required("query"): vol.Coerce(str),
})
@websocket_api.async_response
async def websocket_search_aircraft(hass: HomeAssistant, connection, msg: dict) -> None:
    try:
        result = await search_aircraft(hass, msg["query"])
        connection.send_result(msg["id"], result)
    except Exception as err:
        connection.send_error(msg["id"], "search_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "flightradar_card/get_detail",
    vol.Required("flight"): dict,
})
@websocket_api.async_response
async def websocket_get_detail(hass: HomeAssistant, connection, msg: dict) -> None:
    try:
        result = await get_aircraft_detail(hass, msg["flight"])
        connection.send_result(msg["id"], result)
    except Exception as err:
        connection.send_error(msg["id"], "detail_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "flightradar_card/get_activity",
    vol.Required("airport"): vol.Coerce(str),
})
@websocket_api.async_response
async def websocket_get_activity(hass: HomeAssistant, connection, msg: dict) -> None:
    try:
        result = await _fresh_airport_activity(hass, msg["airport"])
        result["timestamp"] = __import__("time").time()
        connection.send_result(msg["id"], result)
    except Exception as err:
        connection.send_error(msg["id"], "activity_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "flightradar_card/get_photo",
    vol.Required("hex"): vol.Coerce(str),
})
@websocket_api.async_response
async def websocket_get_photo(hass: HomeAssistant, connection, msg: dict) -> None:
    try:
        result = await get_aircraft_photo(hass, msg["hex"])
        connection.send_result(msg["id"], result)
    except Exception as err:
        connection.send_error(msg["id"], "photo_unavailable", str(err))
