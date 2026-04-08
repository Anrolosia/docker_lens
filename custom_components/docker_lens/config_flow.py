"""Config flow for Docker Lens."""

from __future__ import annotations

import logging

import docker
from docker.errors import DockerException
import docker.tls
import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.core import HomeAssistant

from .const import (
    CONF_DOCKER_HOST,
    CONF_TLS_CA_CERT,
    CONF_TLS_CLIENT_CERT,
    CONF_TLS_CLIENT_KEY,
    CONF_TLS_VERIFY,
    DEFAULT_DOCKER_HOST,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)


def _build_docker_client(data: dict[str, str | bool]) -> docker.DockerClient:
    """Build a :class:`docker.DockerClient` from config-entry data.

    This is a synchronous helper that must be called via
    :meth:`homeassistant.core.HomeAssistant.async_add_executor_job`.
    """
    host: str = data.get(CONF_DOCKER_HOST, DEFAULT_DOCKER_HOST)
    tls_config: docker.tls.TLSConfig | None = None

    if data.get(CONF_TLS_VERIFY):
        ca_cert: str | None = data.get(CONF_TLS_CA_CERT) or None
        client_cert_path: str | None = data.get(CONF_TLS_CLIENT_CERT) or None
        client_key_path: str | None = data.get(CONF_TLS_CLIENT_KEY) or None
        client_cert = (
            (client_cert_path, client_key_path)
            if client_cert_path and client_key_path
            else None
        )
        tls_config = docker.tls.TLSConfig(
            ca_cert=ca_cert,
            client_cert=client_cert,
            verify=True,
        )

    return docker.DockerClient(base_url=host, tls=tls_config)


async def _test_docker_connection(
    hass: HomeAssistant, data: dict[str, str | bool]
) -> bool:
    """Return ``True`` if the Docker daemon is reachable with *data* credentials."""
    try:
        client = await hass.async_add_executor_job(_build_docker_client, data)
        await hass.async_add_executor_job(client.ping)
    except (DockerException, Exception):
        _LOGGER.exception(
            "Docker connection test failed for host '%s'",
            data.get(CONF_DOCKER_HOST),
        )
        return False
    return True


class DozzleConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Docker Lens."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, str | bool] | None = None
    ) -> ConfigFlowResult:
        """Handle the initial step."""
        if self._async_current_entries():
            return self.async_abort(reason="already_configured")

        errors: dict[str, str] = {}

        if user_input is not None:
            if await _test_docker_connection(self.hass, user_input):
                host = user_input[CONF_DOCKER_HOST]
                return self.async_create_entry(
                    title=f"Docker Lens ({host})",
                    data=user_input,
                )
            errors["base"] = "cannot_connect"

        # Preserve previously entered values (or use defaults on first load).
        current = user_input or {}
        data_schema = vol.Schema(
            {
                vol.Required(
                    CONF_DOCKER_HOST,
                    default=current.get(CONF_DOCKER_HOST, DEFAULT_DOCKER_HOST),
                ): str,
                vol.Optional(
                    CONF_TLS_VERIFY,
                    default=current.get(CONF_TLS_VERIFY, False),
                ): bool,
                vol.Optional(
                    CONF_TLS_CA_CERT,
                    default=current.get(CONF_TLS_CA_CERT, ""),
                ): str,
                vol.Optional(
                    CONF_TLS_CLIENT_CERT,
                    default=current.get(CONF_TLS_CLIENT_CERT, ""),
                ): str,
                vol.Optional(
                    CONF_TLS_CLIENT_KEY,
                    default=current.get(CONF_TLS_CLIENT_KEY, ""),
                ): str,
            }
        )

        return self.async_show_form(
            step_id="user",
            data_schema=data_schema,
            errors=errors,
        )
