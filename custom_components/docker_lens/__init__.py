"""The Docker Lens integration."""

from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv

from . import panel_custom, websocket_api
from .api import DockerAPI
from .config_flow import _build_docker_client
from .const import DOMAIN, PANEL_URL

_LOGGER = logging.getLogger(__name__)

# This integration only supports config entries — no YAML configuration.
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Docker Lens component."""
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Docker Lens from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    try:
        docker_client = await hass.async_add_executor_job(
            _build_docker_client, entry.data
        )
    except Exception:
        _LOGGER.exception("Failed to create Docker client")
        return False

    api = DockerAPI(hass, docker_client)
    websocket_api.async_setup_websocket_api(hass)

    hass.data[DOMAIN][entry.entry_id] = {"api": api}

    await panel_custom.async_setup(hass)

    entry.async_on_unload(entry.add_update_listener(async_reload_entry))

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    from homeassistant.components import frontend as frontend_component  # noqa: PLC0415

    frontend_component.async_remove_panel(hass, PANEL_URL)

    hass.data[DOMAIN].pop(entry.entry_id, None)

    _LOGGER.debug("Unloaded Docker Lens entry %s", entry.entry_id)
    return True


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Handle an options update by reloading the config entry."""
    await hass.config_entries.async_reload(entry.entry_id)
