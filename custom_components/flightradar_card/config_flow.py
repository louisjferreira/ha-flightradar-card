from __future__ import annotations

import voluptuous as vol
from homeassistant import config_entries

from .const import DOMAIN


class FlightRadarConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle FlightRadar Card setup and API configuration."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title="FlightRadar Card", data={"api_token": user_input["api_token"].strip()})
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({vol.Required("api_token"): vol.All(str, vol.Length(min=10))}),
            description_placeholders={"docs": "https://fr24api.flightradar24.com/"},
        )

    async def async_step_reconfigure(self, user_input=None):
        if user_input is not None:
            self.hass.config_entries.async_update_entry(
                self._get_reconfigure_entry(),
                data={"api_token": user_input["api_token"].strip()},
            )
            return self.async_abort(reason="reconfigure_successful")
        entry = self._get_reconfigure_entry()
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=vol.Schema({vol.Required("api_token", default=entry.data.get("api_token", "")): vol.All(str, vol.Length(min=10))}),
        )

    def _get_reconfigure_entry(self):
        return self.hass.config_entries.async_get_entry(self.context["entry_id"])
