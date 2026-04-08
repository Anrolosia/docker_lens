"""Tests for Docker Lens integration setup and teardown."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.docker_lens.const import DOMAIN
from homeassistant.core import HomeAssistant

from .conftest import MOCK_CONFIG_DATA


def _create_mock_entry(hass: HomeAssistant) -> MockConfigEntry:
    """Create and add a MockConfigEntry to hass."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        data=MOCK_CONFIG_DATA,
        title="Docker Lens (test)",
    )
    entry.add_to_hass(hass)
    return entry


@pytest.mark.asyncio
async def test_setup_entry(hass: HomeAssistant, mock_build_docker_client) -> None:
    """Entry is set up successfully."""
    entry = _create_mock_entry(hass)

    with (
        patch("custom_components.docker_lens.panel_custom.async_setup"),
        patch("custom_components.docker_lens.websocket_api.async_setup_websocket_api"),
    ):
        result = await hass.config_entries.async_setup(entry.entry_id)

    assert result is True
    assert entry.entry_id in hass.data[DOMAIN]


@pytest.mark.asyncio
async def test_unload_entry(hass: HomeAssistant, mock_build_docker_client) -> None:
    """Unloading an entry cleans up DOMAIN data."""
    entry = _create_mock_entry(hass)

    with (
        patch("custom_components.docker_lens.panel_custom.async_setup"),
        patch("custom_components.docker_lens.websocket_api.async_setup_websocket_api"),
        patch("homeassistant.components.frontend.async_remove_panel"),
    ):
        await hass.config_entries.async_setup(entry.entry_id)
        result = await hass.config_entries.async_unload(entry.entry_id)

    assert result is True
    assert entry.entry_id not in hass.data.get(DOMAIN, {})
