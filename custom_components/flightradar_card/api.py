from __future__ import annotations

import asyncio
import time
from typing import Any

CACHE_TTL = 5
ACTIVITY_TTL = 30


def _entity(hass, kind: str):
    """Find a FlightRadar24 integration sensor without relying on localization."""
    states = hass.states.async_all("sensor")
    kind = kind.lower()
    candidates = []
    for state in states:
        entity_id = state.entity_id.lower()
        name = str(state.attributes.get("friendly_name", "")).lower()
        if "flightradar24" not in entity_id and "flightradar24" not in name:
            continue
        if kind == "current" and ("current_in_area" in entity_id or ("current" in name and "area" in name)):
            return state
        if kind == "additional" and ("additional_tracked" in entity_id or ("additional" in name and "tracked" in name)):
            return state
        if kind in ("arrivals", "departures"):
            if kind == "arrivals":
                exact = "airport_arrivals" in entity_id and not any(x in entity_id for x in ("_canceled", "_delayed", "_on_time", "_delay_"))
                named = "airport" in name and "arrival" in name and not any(x in name for x in ("canceled", "delayed", "on time", "delay average", "delay index"))
            else:
                exact = "airport_departures" in entity_id and not any(x in entity_id for x in ("_canceled", "_delayed", "_on_time", "_delay_"))
                named = "airport" in name and "departure" in name and not any(x in name for x in ("canceled", "delayed", "on time", "delay average", "delay index"))
            if exact or named:
                candidates.append(state)
    return candidates[0] if candidates else None


def _clean_area(f: dict[str, Any]) -> dict[str, Any]:
    return {
        "fr24_id": f.get("id"), "hex": str(f.get("aircraft_icao_24bit") or "").upper() or None,
        "flight": f.get("flight_number"), "callsign": f.get("callsign"), "registration": f.get("aircraft_registration"),
        "type": f.get("aircraft_model") or f.get("aircraft_code"), "aircraft_code": f.get("aircraft_code"),
        "airline": f.get("airline_short") or f.get("airline"), "airline_full": f.get("airline"),
        "airline_iata": f.get("airline_iata"), "airline_icao": f.get("airline_icao"),
        "lat": f.get("latitude"), "lon": f.get("longitude"), "altitude": f.get("altitude"),
        "speed_knots": f.get("ground_speed"), "vertical_rate": f.get("vertical_speed"),
        "track": f.get("heading"), "heading": f.get("heading"), "squawk": f.get("squawk"),
        "origin": f.get("airport_origin_code_iata") or f.get("airport_origin_code_icao"),
        "destination": f.get("airport_destination_code_iata") or f.get("airport_destination_code_icao"),
        "origin_city": f.get("airport_origin_city"), "destination_city": f.get("airport_destination_city"),
        "origin_name": f.get("airport_origin_name"), "destination_name": f.get("airport_destination_name"),
        "origin_lat": f.get("airport_origin_latitude"), "origin_lon": f.get("airport_origin_longitude"),
        "destination_lat": f.get("airport_destination_latitude"), "destination_lon": f.get("airport_destination_longitude"),
        "scheduled_departure": f.get("time_scheduled_departure"), "scheduled_arrival": f.get("time_scheduled_arrival"),
        "estimated_arrival": f.get("time_estimated_arrival"), "estimated_departure": f.get("time_estimated_departure"),
        "real_departure": f.get("time_real_departure"), "real_arrival": f.get("time_real_arrival"),
        "photo_url": f.get("aircraft_photo_medium") or f.get("aircraft_photo_large") or f.get("aircraft_photo_small"),
        "photo_small": f.get("aircraft_photo_small"), "photo_large": f.get("aircraft_photo_large"),
        "aircraft_category": f.get("aircraft_category"), "distance": f.get("distance"),
        "owner": f.get("aircraft_owner") or f.get("owner") or f.get("registered_owner"),
        "operator": f.get("aircraft_operator") or f.get("operator"),
        "first_flight_date": f.get("first_flight_date") or f.get("aircraft_first_flight_date"),
        "aircraft_age": f.get("aircraft_age") or f.get("age"),
        "aircraft_manufacturer": f.get("aircraft_manufacturer") or f.get("manufacturer"),
        "aircraft_series": f.get("aircraft_series") or f.get("aircraft_variant"),
        "registration_country": f.get("registration_country") or f.get("country"),
        "on_ground": bool(f.get("on_ground")), "timestamp": f.get("details_updated_at") or f.get("last_updated"),
        "source": "FlightRadar24 integration",
    }


def _clean_airport(f: dict[str, Any], direction: str, airport: str) -> dict[str, Any]:
    remote_code = f.get("airport_code_iata") or f.get("airport_code_icao")
    remote_city = f.get("airport_city")
    return {
        "fr24_id": f.get("flight_id") or f.get("id"), "hex": None, "flight": f.get("flight_number"),
        "callsign": f.get("callsign"), "registration": f.get("aircraft_registration"),
        "type": f.get("aircraft_model") or f.get("aircraft_code"), "aircraft_code": f.get("aircraft_code"),
        "airline": f.get("airline_short") or f.get("airline"), "airline_full": f.get("airline"),
        "airline_iata": f.get("airline_iata"), "airline_icao": f.get("airline_icao"),
        "origin": remote_code if direction == "ARRIVALS" else airport,
        "destination": airport if direction == "ARRIVALS" else remote_code,
        "origin_city": remote_city if direction == "ARRIVALS" else airport,
        "destination_city": airport if direction == "ARRIVALS" else remote_city,
        "scheduled_arrival": f.get("time_scheduled_arrival"), "scheduled_departure": f.get("time_scheduled_departure"),
        "estimated_arrival": f.get("time_estimated_arrival"), "estimated_departure": f.get("time_estimated_departure"),
        "real_arrival": f.get("time_real_arrival"), "real_departure": f.get("time_real_departure"),
        "status": f.get("status"), "status_text": f.get("status_text"), "is_board_flight": True,
        "source": "FlightRadar24 airport sensor",
    }


def _raw_flights(state) -> list[dict[str, Any]]:
    raw = state.attributes.get("flights", []) if state else []
    if isinstance(raw, dict): raw = list(raw.values())
    return [f for f in raw if isinstance(f, dict)]


def _area_flights(hass) -> list[dict[str, Any]]:
    return [_clean_area(f) for f in _raw_flights(_entity(hass, "current"))]


def _additional_flights(hass) -> list[dict[str, Any]]:
    return [_clean_area(f) for f in _raw_flights(_entity(hass, "additional"))]


async def _track_airport(hass, airport: str) -> None:
    target = None
    for state in hass.states.async_all("text"):
        entity_id = state.entity_id.lower(); name = str(state.attributes.get("friendly_name", "")).lower()
        if "flightradar24" in entity_id and "airport" in entity_id and "track" in entity_id:
            target = state.entity_id; break
        if "flightradar24" in name and "airport" in name and "track" in name:
            target = state.entity_id; break
    if target and hass.services.has_service("text", "set_value"):
        await hass.services.async_call("text", "set_value", {"entity_id": target, "value": airport}, blocking=True)


async def _airport_activity(hass, airport: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    cache_key = f"activity:{airport}"; now = time.monotonic(); cached = _cache.get(cache_key)
    if cached and now - cached[0] < ACTIVITY_TTL: return cached[1]
    arrivals_state = _entity(hass, "arrivals"); departures_state = _entity(hass, "departures")
    if not arrivals_state or not departures_state:
        try:
            await _track_airport(hass, airport); await asyncio.sleep(1.0)
        except Exception: pass
        arrivals_state = _entity(hass, "arrivals"); departures_state = _entity(hass, "departures")
    arrivals = [_clean_airport(f, "ARRIVALS", airport) for f in _raw_flights(arrivals_state)]
    departures = [_clean_airport(f, "DEPARTURES", airport) for f in _raw_flights(departures_state)]
    result = (arrivals, departures); _cache[cache_key] = (now, result); return result


_cache: dict[str, tuple[float, Any]] = {}


def _airport_from_coordinates(latitude: float, longitude: float) -> str:
    airports = {"HRE":(-17.9318,31.0928),"JNB":(-26.1337,28.2420),"CPT":(-33.9715,18.6021),"DUR":(-29.6144,31.1197),"GBE":(-24.5552,25.9182),"MPM":(-25.9208,32.5726),"LUN":(-15.3308,28.4526),"NBO":(-1.3192,36.9278),"ADD":(8.9779,38.7993),"WDH":(-22.4799,17.4709),"MUB":(-19.9726,23.4311),"LHR":(51.4700,-0.4543),"DXB":(25.2532,55.3657),"SIN":(1.3644,103.9915),"JFK":(40.6413,-73.7781)}
    return min(airports, key=lambda k:(airports[k][0]-latitude)**2+(airports[k][1]-longitude)**2)


async def get_aircraft(hass, latitude: float, longitude: float, radius: int) -> dict[str, Any]:
    now = time.monotonic(); cached = _cache.get("area")
    if cached and now - cached[0] < CACHE_TTL: return cached[1]
    airport = _airport_from_coordinates(latitude, longitude)
    aircraft = _area_flights(hass)
    arrivals, departures = await _airport_activity(hass, airport)
    result = {"aircraft": aircraft, "arrivals": arrivals, "departures": departures, "provider":"FlightRadar24 Home Assistant integration", "timestamp":time.time(), "radius":radius}
    _cache["area"] = (now, result); return result


async def search_aircraft(hass, query: str) -> dict[str, Any]:
    query = query.strip().upper()
    if not query: return {"aircraft":[],"provider":"FlightRadar24 Home Assistant integration"}
    all_flights = _area_flights(hass) + _additional_flights(hass)
    matches = [f for f in all_flights if any(query in str(f.get(k) or "").upper() for k in ("flight","callsign","registration","hex","airline","aircraft_code"))]
    if matches: return {"aircraft":matches,"provider":"FlightRadar24 Home Assistant integration","timestamp":time.time()}
    target = None
    for state in hass.states.async_all("text"):
        entity_id = state.entity_id.lower(); name = str(state.attributes.get("friendly_name", "")).lower()
        if "flightradar24" in entity_id and "add_to_track" in entity_id: target = state.entity_id; break
        if "flightradar24" in name and "add" in name and "track" in name: target = state.entity_id; break
    if target and hass.services.has_service("text","set_value"):
        try:
            await hass.services.async_call("text","set_value",{"entity_id":target,"value":query},blocking=True)
            for _ in range(4):
                await asyncio.sleep(1.5); tracked = _additional_flights(hass)
                matches = [f for f in tracked if any(query in str(f.get(k) or "").upper() for k in ("flight","callsign","registration","hex","airline","aircraft_code"))]
                if matches: return {"aircraft":matches,"provider":"FlightRadar24 Home Assistant integration","timestamp":time.time()}
        except Exception: pass
    return {"aircraft":[],"provider":"FlightRadar24 Home Assistant integration","error":f"No live FlightRadar24 aircraft found for {query}"}


async def get_aircraft_detail(hass, flight: dict[str, Any]) -> dict[str, Any]:
    return flight


async def get_airport_activity(hass, airport: str) -> dict[str, Any]:
    airport = airport.strip().upper(); arrivals, departures = await _airport_activity(hass, airport)
    return {"airport":airport,"arrivals":arrivals,"departures":departures,"provider":"FlightRadar24 Home Assistant integration","timestamp":time.time()}


async def get_aircraft_photo(hass, hex_code: str) -> dict[str, Any]:
    hex_code = str(hex_code or "").strip().upper()
    for flight in _area_flights(hass) + _additional_flights(hass):
        if flight.get("hex") == hex_code:
            src = flight.get("photo_url"); return {"photo":{"src":src,"link":src} if src else None}
    return {"photo":None}
