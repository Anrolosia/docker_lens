"""WebSocket API for Docker Lens."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv

from .api import DockerAPI
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


def async_setup_websocket_api(hass: HomeAssistant) -> None:
    """Register WebSocket commands.

    Note: ``async_register_command`` does not return an unsubscribe callable
    in Home Assistant 2024+, so there is nothing to track here.
    """
    _LOGGER.debug("Registering Docker Lens WebSocket commands")
    websocket_api.async_register_command(hass, ws_list_containers)
    websocket_api.async_register_command(hass, ws_subscribe_logs)


def _get_api(hass: HomeAssistant) -> DockerAPI | None:
    """Return the :class:`DockerAPI` for the first active config entry, or ``None``."""
    entries = hass.config_entries.async_entries(DOMAIN)
    if not entries:
        return None
    return hass.data[DOMAIN][entries[0].entry_id]["api"]


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/containers/list",
    }
)
@websocket_api.async_response
async def ws_list_containers(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle a request to list all Docker containers."""
    if (api := _get_api(hass)) is None:
        connection.send_error(msg["id"], "not_setup", "Integration not set up.")
        return

    try:
        containers = await api.get_containers()
    except Exception:
        _LOGGER.exception("Error listing containers")
        connection.send_error(msg["id"], "list_error", "Failed to list containers.")
        return

    connection.send_result(msg["id"], containers)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/logs/subscribe",
        vol.Required("container_id"): cv.string,
        vol.Optional("tail", default=100): vol.All(int, vol.Range(min=0, max=1000)),
    }
)
@websocket_api.async_response
async def ws_subscribe_logs(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle a request to subscribe to a container's log stream."""
    if (api := _get_api(hass)) is None:
        connection.send_error(msg["id"], "not_setup", "Integration not set up.")
        return

    container_id: str = msg["container_id"]
    tail: int = msg["tail"]

    @callback
    def _on_log_line(log_entry: dict[str, str | None]) -> None:
        """Forward a log line to the WebSocket client."""
        connection.send_message(
            websocket_api.event_message(
                msg["id"],
                {"line": log_entry["line"], "ts": log_entry.get("ts")},
            )
        )

    async def _stream_task() -> None:
        try:
            await api.stream_logs(container_id, _on_log_line, tail=tail)
            connection.send_message(
                websocket_api.event_message(msg["id"], {"finished": True})
            )
        except asyncio.CancelledError:
            pass  # Expected on client disconnect.

    task = asyncio.create_task(_stream_task())

    @callback
    def _cleanup() -> None:
        """Cancel the streaming task when the client unsubscribes."""
        _LOGGER.debug("Client unsubscribed from logs for %s", container_id)
        task.cancel()

    connection.subscriptions[msg["id"]] = _cleanup
    connection.send_result(msg["id"])
