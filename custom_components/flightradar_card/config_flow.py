from __future__ import annotations

from homeassistant import config_entries
from homeassistant.core import HomeAssistant

from .const import DOMAIN


class FlightRadarConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle FlightRadar Card setup.

    The card consumes the user's existing Home Assistant FlightRadar24
    integration, so no separate FlightRadar24 API token is required here.
    """

    VERSION = 2

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        return self.async_create_entry(title="FlightRadar Card", data={})

    async def async_step_reconfigure(self, user_input=None):
        return self.async_abort(reason="reconfigure_successful")


async def async_migrate_entry(hass: HomeAssistant, config_entry: config_entries.ConfigEntry) -> bool:
    """Migrate an existing FlightRadar Card config entry to the current version."""
    if config_entry.version < FlightRadarConfigFlow.VERSION:
        hass.config_entries.async_update_entry(
            config_entry,
            version=FlightRadarConfigFlow.VERSION,
            data=dict(config_entry.data),
        )

    return True
