"""Tests for the Docker Lens config flow."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from custom_components.docker_lens.const import DOMAIN
from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

from .conftest import MOCK_CONFIG_DATA


@pytest.mark.asyncio
async def test_user_step_success(hass: HomeAssistant, mock_build_docker_client) -> None:
    """A valid Docker host creates an entry."""
    with patch(
        "custom_components.docker_lens.config_flow._test_docker_connection",
        return_value=True,
    ):
        result = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": config_entries.SOURCE_USER}
        )
        assert result["type"] == FlowResultType.FORM
        assert result["step_id"] == "user"

        result2 = await hass.config_entries.flow.async_configure(
            result["flow_id"], user_input=MOCK_CONFIG_DATA
        )

    assert result2["type"] == FlowResultType.CREATE_ENTRY
    # The config flow returns all submitted fields — verify our input is a subset
    for key, value in MOCK_CONFIG_DATA.items():
        assert result2["data"][key] == value


@pytest.mark.asyncio
async def test_user_step_cannot_connect(hass: HomeAssistant) -> None:
    """An unreachable Docker host shows an error and stays on the form."""
    with patch(
        "custom_components.docker_lens.config_flow._test_docker_connection",
        return_value=False,
    ):
        result = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": config_entries.SOURCE_USER}
        )
        result2 = await hass.config_entries.flow.async_configure(
            result["flow_id"], user_input=MOCK_CONFIG_DATA
        )

    assert result2["type"] == FlowResultType.FORM
    assert result2["errors"] == {"base": "cannot_connect"}


@pytest.mark.asyncio
async def test_already_configured(
    hass: HomeAssistant, mock_build_docker_client
) -> None:
    """A second setup attempt is aborted when the integration is already configured."""
    with patch(
        "custom_components.docker_lens.config_flow._test_docker_connection",
        return_value=True,
    ):
        result = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": config_entries.SOURCE_USER}
        )
        await hass.config_entries.flow.async_configure(
            result["flow_id"], user_input=MOCK_CONFIG_DATA
        )

        result2 = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": config_entries.SOURCE_USER}
        )

    assert result2["type"] == FlowResultType.ABORT
    assert result2["reason"] == "already_configured"
