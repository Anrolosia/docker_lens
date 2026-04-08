"""Tests for the Docker Lens DockerAPI."""

from __future__ import annotations

from unittest.mock import MagicMock

from docker.errors import DockerException, NotFound
import pytest

from custom_components.docker_lens.api import DockerAPI
from custom_components.docker_lens.const import UNCATEGORIZED_STACK

_EXPECTED_CONTAINERS_IN_MYAPP = 2
_EXPECTED_LOG_LINES = 2


def _make_container(
    name: str,
    short_id: str,
    status: str = "running",
    labels: dict | None = None,
) -> MagicMock:
    c = MagicMock()
    c.name = name
    c.short_id = short_id
    c.status = status
    c.labels = labels or {}
    return c


@pytest.mark.asyncio
async def test_get_containers_grouped_by_stack(hass) -> None:
    """Containers are grouped by their compose project label."""
    containers = [
        _make_container("web", "aaa", labels={"com.docker.compose.project": "myapp"}),
        _make_container("db", "bbb", labels={"com.docker.compose.project": "myapp"}),
        _make_container("standalone", "ccc"),
    ]

    mock_client = MagicMock()
    mock_client.containers.list.return_value = containers

    api = DockerAPI(hass, mock_client)
    result = await api.get_containers()

    assert "myapp" in result
    assert len(result["myapp"]) == _EXPECTED_CONTAINERS_IN_MYAPP
    assert UNCATEGORIZED_STACK in result
    assert result[UNCATEGORIZED_STACK][0]["name"] == "standalone"


@pytest.mark.asyncio
async def test_get_containers_docker_exception(hass) -> None:
    """A DockerException returns an empty dict without raising."""
    mock_client = MagicMock()
    mock_client.containers.list.side_effect = DockerException("daemon down")

    api = DockerAPI(hass, mock_client)
    result = await api.get_containers()

    assert result == {}


@pytest.mark.asyncio
async def test_stream_logs_calls_callback(hass) -> None:
    """stream_logs calls the callback for each decoded log line."""
    lines = [
        b"2024-01-15T18:04:59.000000000Z first line\n",
        b"2024-01-15T18:05:00.000000000Z second line\n",
    ]

    mock_container = MagicMock()
    mock_container.logs.return_value = iter(lines)

    mock_client = MagicMock()
    mock_client.containers.get.return_value = mock_container

    api = DockerAPI(hass, mock_client)

    received: list[dict] = []
    await api.stream_logs("abc123", received.append, tail=10)

    assert len(received) == _EXPECTED_LOG_LINES
    assert received[0]["line"] == "first line"
    assert received[0]["ts"] == "2024-01-15T18:04:59.000000000Z"
    assert received[1]["line"] == "second line"


@pytest.mark.asyncio
async def test_stream_logs_container_not_found(hass) -> None:
    """stream_logs sends an error dict and does not raise when container is missing."""
    mock_client = MagicMock()
    mock_client.containers.get.side_effect = NotFound("nope")

    api = DockerAPI(hass, mock_client)

    received: list[dict] = []
    await api.stream_logs("missing", received.append)

    assert len(received) == 1
    assert "not found" in received[0]["line"].lower()
