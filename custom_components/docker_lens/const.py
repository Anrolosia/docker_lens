"""Constants for the Docker Lens integration."""

from __future__ import annotations

DOMAIN = "docker_lens"
PANEL_TITLE = "Docker Lens"
PANEL_URL = "docker-lens"
PANEL_ICON = "mdi:layers-search"

CONF_DOCKER_HOST = "docker_host"
CONF_TLS_VERIFY = "tls_verify"
CONF_TLS_CA_CERT = "tls_ca_cert"
CONF_TLS_CLIENT_CERT = "tls_client_cert"
CONF_TLS_CLIENT_KEY = "tls_client_key"

DEFAULT_DOCKER_HOST = "unix:///var/run/docker.sock"

# Label used by Docker Compose to group containers into stacks
DOCKER_COMPOSE_PROJECT_LABEL = "com.docker.compose.project"

# Displayed when a container belongs to no compose project
UNCATEGORIZED_STACK = "_nostack_"
