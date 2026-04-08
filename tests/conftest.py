"""Fixtures for Docker Lens tests."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from custom_components.docker_lens.const import (
    CONF_DOCKER_HOST,
    CONF_TLS_CA_CERT,
    CONF_TLS_CLIENT_CERT,
    CONF_TLS_CLIENT_KEY,
    CONF_TLS_VERIFY,
    DEFAULT_DOCKER_HOST,
)

# Matches exactly what the config flow submits (all fields including optional ones)
MOCK_CONFIG_DATA = {
    CONF_DOCKER_HOST: DEFAULT_DOCKER_HOST,
    CONF_TLS_VERIFY: False,
    CONF_TLS_CA_CERT: "",
    CONF_TLS_CLIENT_CERT: "",
    CONF_TLS_CLIENT_KEY: "",
}


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Enable custom integrations for all tests in this package."""
    return


@pytest.fixture
def mock_docker_client() -> MagicMock:
    """Return a mock DockerClient that simulates a reachable daemon."""
    client = MagicMock()
    client.ping.return_value = True
    client.containers.list.return_value = []
    return client


@pytest.fixture
def mock_build_docker_client(mock_docker_client: MagicMock):
    """Patch _build_docker_client at both call sites."""
    # __init__.py does: from .config_flow import _build_docker_client
    # so Python creates a local reference — we must patch that local reference,
    # not the original in config_flow.
    with patch(
        "custom_components.docker_lens._build_docker_client",
        return_value=mock_docker_client,
    ):
        yield mock_docker_client
