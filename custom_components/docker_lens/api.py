"""Docker API wrapper for Docker Lens."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import Callable
import logging
from typing import Any

import docker
from docker.errors import DockerException, NotFound
from docker.models.containers import Container

from homeassistant.core import HomeAssistant

from .const import DOCKER_COMPOSE_PROJECT_LABEL, UNCATEGORIZED_STACK

_LOGGER = logging.getLogger(__name__)

# Docker log lines with timestamps=True have exactly two space-separated parts:
# "<RFC3339Nano timestamp> <message>"
_TIMESTAMP_PARTS = 2

type ContainerDict = dict[str, Any]
type StackMap = dict[str, list[ContainerDict]]


class DockerAPI:
    """Interface with the Docker daemon."""

    def __init__(self, hass: HomeAssistant, client: docker.DockerClient) -> None:
        """Initialize the Docker API."""
        self.hass = hass
        self.client = client

    async def get_containers(self) -> StackMap:
        """Return all Docker containers grouped by compose project (stack)."""
        try:
            containers: list[Container] = await self.hass.async_add_executor_job(
                lambda: self.client.containers.list(all=True)
            )
        except DockerException:
            _LOGGER.exception("Failed to list Docker containers")
            return {}

        stacks: dict[str, list[ContainerDict]] = defaultdict(list)
        for container in sorted(containers, key=lambda c: c.name):
            stack_name = container.labels.get(
                DOCKER_COMPOSE_PROJECT_LABEL, UNCATEGORIZED_STACK
            )
            stacks[stack_name].append(
                {
                    "id": container.short_id,
                    "name": container.name,
                    "state": container.status,
                }
            )
        return dict(stacks)

    async def stream_logs(
        self,
        container_id: str,
        callback: Callable[[dict[str, str | None]], None],
        tail: int = 100,
    ) -> None:
        """Stream logs from a container, calling *callback* for each line.

        The callback receives a dict with ``line`` (str) and ``ts`` (str | None).
        Raises ``asyncio.CancelledError`` when the caller cancels the stream.
        """
        _LOGGER.debug(
            "Starting log stream for container %s (tail=%s)", container_id, tail
        )
        producer_task: asyncio.Future[None] | None = None
        try:
            container: Container = await self.hass.async_add_executor_job(
                self.client.containers.get, container_id
            )

            queue: asyncio.Queue[dict[str, str | None] | None] = asyncio.Queue()

            def _producer() -> None:
                """Blocking log producer; runs in a thread-pool worker."""
                try:
                    for raw_line in container.logs(
                        stream=True,
                        follow=True,
                        tail=tail,
                        timestamps=True,
                    ):
                        decoded = raw_line.decode("utf-8", errors="ignore").strip()
                        # Docker prepends an RFC3339Nano timestamp when
                        # timestamps=True: "2024-01-15T18:04:59.014000000Z msg"
                        parts = decoded.split(" ", 1)
                        if (
                            len(parts) == _TIMESTAMP_PARTS
                            and "T" in parts[0]
                            and parts[0][0].isdigit()
                        ):
                            ts, text = parts[0], parts[1]
                        else:
                            ts, text = None, decoded
                        self.hass.loop.call_soon_threadsafe(
                            queue.put_nowait, {"line": text, "ts": ts}
                        )
                except Exception:
                    _LOGGER.exception("Error in log producer for %s", container_id)
                finally:
                    self.hass.loop.call_soon_threadsafe(queue.put_nowait, None)

            producer_task = self.hass.async_add_executor_job(_producer)

            while True:
                entry = await queue.get()
                if entry is None:
                    _LOGGER.debug("Log stream ended for container %s", container_id)
                    break
                callback(entry)
                queue.task_done()

        except asyncio.CancelledError:
            _LOGGER.debug("Log stream for %s cancelled by client.", container_id)
            raise
        except NotFound:
            _LOGGER.warning("Container %s not found for log streaming.", container_id)
            callback(
                {
                    "line": f"Error: Container {container_id} not found.",
                    "ts": None,
                }
            )
        except DockerException:
            _LOGGER.exception("Failed to stream logs for %s", container_id)
            callback(
                {
                    "line": (
                        f"Error: Failed to stream logs for {container_id}."
                        " See HA logs for details."
                    ),
                    "ts": None,
                }
            )
        finally:
            if producer_task is not None and not producer_task.done():
                producer_task.cancel()
                _LOGGER.debug("Cancelled producer task for %s", container_id)
