from __future__ import annotations

import asyncio
import time
from typing import Any

from homeassistant.helpers.aiohttp_client import async_get_clientsession

PROVIDERS = (("ADSB.lol", "https://api.adsb.lol/v2", "point"),("Airplanes.live", "https://api.airplanes.live/v2", "point"),("ADSB.fi", "https://opendata.adsb.fi/api/v2", "adsbfi"))
ROUTE_PROVIDERS = ("https://api.adsb.lol/api/0/routeset", "https://adsb.im/api/0/routeset")
PHOTO_URL = "https://api.planespotters.net/pub/photos/hex/{}"
USER_AGENT = "HomeAssistant-FlightRadar-Card/0.9.2"
_aircraft_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_route_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_photo_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _clean_aircraft(item: dict[str, Any]) -> dict[str, Any]:
    return {"hex":str(item.get("hex") or item.get("icao24") or "").upper(),"flight":str(item.get("flight") or item.get("callsign") or "").strip(),"registration":item.get("r") or item.get("registration"),"type":item.get("t") or item.get("type") or item.get("desc"),"description":item.get("desc") or item.get("description"),"lat":item.get("lat") if item.get("lat") is not None else item.get("latitude"),"lon":item.get("lon") if item.get("lon") is not None else item.get("longitude"),"altitude":item.get("alt_baro",item.get("alt_geom",item.get("altitude"))),"speed_knots":item.get("gs",item.get("ground_speed")),"ias_knots":item.get("ias"),"tas_knots":item.get("tas"),"mach":item.get("mach"),"vertical_rate":item.get("baro_rate",item.get("geom_rate")),"track":item.get("track",item.get("true_heading",item.get("heading"))),"heading":item.get("true_heading",item.get("mag_heading")),"squawk":item.get("squawk"),"emergency":item.get("emergency"),"category":item.get("category"),"on_ground":item.get("alt_baro")=="ground" or item.get("on_ground") is True,"seen":item.get("seen",item.get("seen_pos"))}


async def _get_json(hass,url:str)->dict[str,Any]:
    session=async_get_clientsession(hass)
    async with session.get(url,timeout=12,headers={"Accept":"application/json","User-Agent":USER_AGENT}) as response:
        response.raise_for_status();return await response.json(content_type=None)


async def _post_json(hass,url:str,payload:dict[str,Any])->Any:
    session=async_get_clientsession(hass)
    async with session.post(url,json=payload,timeout=12,headers={"Accept":"application/json","User-Agent":USER_AGENT}) as response:
        response.raise_for_status();return await response.json(content_type=None)


def _aircraft_from_response(data:dict[str,Any],provider_type:str)->list[dict[str,Any]]:
    items=data.get("aircraft",data.get("ac",[])) if provider_type=="adsbfi" else data.get("ac",data.get("aircraft",[]))
    return [_clean_aircraft(i) for i in items if isinstance(i,dict)]


def _merge_aircraft(items:list[dict[str,Any]])->list[dict[str,Any]]:
    merged={}
    for item in items:
        key=item.get("hex") or item.get("registration") or item.get("flight")
        if not key: continue
        if key not in merged: merged[key]=dict(item); continue
        for field,value in item.items():
            if value not in (None,"") and merged[key].get(field) in (None,""): merged[key][field]=value
    return list(merged.values())


async def _enrich_routes(hass,aircraft:list[dict[str,Any]])->None:
    candidates=[f for f in aircraft if f.get("flight") and f.get("lat") is not None and f.get("lon") is not None][:50]
    fresh=[];now=time.monotonic()
    for f in candidates:
        callsign=str(f["flight"]).strip().upper();cached=_route_cache.get(callsign)
        if cached and now-cached[0]<600:f.update(cached[1])
        else:fresh.append(f)
    if not fresh:return
    payload={"planes":[{"callsign":str(f["flight"]).strip(),"lat":float(f["lat"]),"lng":float(f["lon"])} for f in fresh]}
    data=None
    for endpoint in ROUTE_PROVIDERS:
        try:
            data=await _post_json(hass,endpoint,payload)
            if isinstance(data,list):break
        except Exception:continue
    if not isinstance(data,list):return
    by_call={str(row.get("callsign","")).strip().upper():row for row in data if isinstance(row,dict)}
    for f in fresh:
        route=by_call.get(str(f["flight"]).strip().upper())
        if not route:continue
        icao_route=str(route.get("airport_codes") or "")
        iata_route=str(route.get("_airport_codes_iata") or "")
        icao_codes=icao_route.split("-") if icao_route else []
        iata_codes=iata_route.split("-") if iata_route else []
        origin=iata_codes[0] if iata_codes else (icao_codes[0] if icao_codes else None)
        destination=iata_codes[-1] if iata_codes else (icao_codes[-1] if icao_codes else None)
        info={"airline_code":route.get("airline_code"),"route":iata_route or icao_route,"origin":origin,"destination":destination,"origin_icao":icao_codes[0] if icao_codes else None,"destination_icao":icao_codes[-1] if icao_codes else None,"route_plausible":route.get("plausible")}
        _route_cache[str(f["flight"]).strip().upper()]=(now,info);f.update(info)


async def get_aircraft(hass,latitude:float,longitude:float,radius:int)->dict[str,Any]:
    radius=max(10,min(250,int(radius)));cache_key=f"point:{latitude:.4f}:{longitude:.4f}:{radius}";cached=_aircraft_cache.get(cache_key)
    if cached and time.monotonic()-cached[0]<5:return cached[1]
    async def fetch(name,base,ptype):
        try:
            url=f"{base}/lat/{latitude}/lon/{longitude}/dist/{radius}" if ptype=="adsbfi" else f"{base}/point/{latitude}/{longitude}/{radius}"
            return name,_aircraft_from_response(await _get_json(hass,url),ptype),None
        except Exception as err:return name,[],err
    responses=await asyncio.gather(*(fetch(*p) for p in PROVIDERS));results=[];used=[];errors=[]
    for name,aircraft,err in responses:
        if aircraft:used.append(name);results.extend(aircraft)
        elif err:errors.append(f"{name}: {type(err).__name__}")
    aircraft=_merge_aircraft(results);await _enrich_routes(hass,aircraft)
    result={"aircraft":aircraft,"provider":" + ".join(used),"timestamp":time.time()}
    if not aircraft and errors:result["error"]="No ADS-B aircraft returned; "+", ".join(errors)
    _aircraft_cache[cache_key]=(time.monotonic(),result);return result


async def search_aircraft(hass,query:str)->dict[str,Any]:
    query=query.strip().upper()
    if not query:return{"aircraft":[],"provider":None}
    for name,base,_ in PROVIDERS[:2]:
        for kind in ("callsign","reg","hex"):
            try:
                aircraft=_aircraft_from_response(await _get_json(hass,f"{base}/{kind}/{query}"),"point")
                if aircraft:
                    await _enrich_routes(hass,aircraft);return{"aircraft":aircraft,"provider":name,"timestamp":time.time()}
            except Exception:continue
    return{"aircraft":[],"provider":None,"error":f"No live aircraft found for {query}"}


async def get_aircraft_photo(hass,hex_code:str)->dict[str,Any]:
    hex_code=str(hex_code or "").strip().upper()
    if not hex_code:return{"photo":None}
    cached=_photo_cache.get(hex_code)
    if cached and time.monotonic()-cached[0]<3600:return cached[1]
    try:
        data=await _get_json(hass,PHOTO_URL.format(hex_code));photos=data.get("photos",[]) if isinstance(data,dict) else []
        if photos:
            p=photos[0];thumb=p.get("thumbnail",{}) or {};photo={"src":thumb.get("src") or p.get("src"),"link":p.get("link"),"photographer":p.get("photographer")}
        else:photo=None
    except Exception:photo=None
    result={"photo":photo};_photo_cache[hex_code]=(time.monotonic(),result);return result
