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

    async def container_action(
        self,
        container_id: str,
        action: str,
    ) -> dict[str, str]:
        """Perform start/stop/restart on a container.

        Returns a dict with ``ok`` (bool) and optionally ``error`` (str).
        """
        _LOGGER.debug("Container action %s on %s", action, container_id)
        valid_actions = {"start", "stop", "restart"}
        if action not in valid_actions:
            return {"ok": False, "error": f"Unknown action: {action}"}
        try:
            container: Container = await self.hass.async_add_executor_job(
                self.client.containers.get, container_id
            )
            fn = getattr(container, action)
            await self.hass.async_add_executor_job(fn)
        except NotFound:
            return {"ok": False, "error": f"Container {container_id} not found."}
        except DockerException as exc:
            _LOGGER.exception("Action %s failed for %s", action, container_id)
            return {"ok": False, "error": str(exc)}
        else:
            return {"ok": True}

    async def get_container_stats(self, container_id: str) -> dict:
        """Return a single stats snapshot for a container.

        Returns CPU%, memory usage/limit/%, and network rx/tx bytes.
        """
        try:
            container: Container = await self.hass.async_add_executor_job(
                self.client.containers.get, container_id
            )
            raw: dict = await self.hass.async_add_executor_job(
                lambda: container.stats(stream=False)
            )
        except NotFound:
            return {"error": f"Container {container_id} not found."}
        except DockerException:
            _LOGGER.exception("Failed to get stats for %s", container_id)
            return {"error": "Failed to get container stats."}

        return _parse_stats(raw)


def _parse_stats(raw: dict) -> dict:
    """Parse a raw Docker stats dict into a simplified structure."""
    # CPU %
    cpu_pct = 0.0
    try:
        cpu_delta = (
            raw["cpu_stats"]["cpu_usage"]["total_usage"]
            - raw["precpu_stats"]["cpu_usage"]["total_usage"]
        )
        sys_delta = (
            raw["cpu_stats"]["system_cpu_usage"]
            - raw["precpu_stats"]["system_cpu_usage"]
        )
        cpus = raw["cpu_stats"].get("online_cpus") or len(
            raw["cpu_stats"]["cpu_usage"].get("percpu_usage", [1])
        )
        if sys_delta > 0:
            cpu_pct = round((cpu_delta / sys_delta) * cpus * 100, 2)
    except (KeyError, TypeError, ZeroDivisionError):
        pass

    # Memory
    mem_usage = 0
    mem_limit = 0
    mem_pct = 0.0
    try:
        cache = raw["memory_stats"].get("stats", {}).get("cache", 0)
        mem_usage = raw["memory_stats"]["usage"] - cache
        mem_limit = raw["memory_stats"]["limit"]
        if mem_limit > 0:
            mem_pct = round((mem_usage / mem_limit) * 100, 2)
    except (KeyError, TypeError):
        pass

    # Network
    net_rx = 0
    net_tx = 0
    try:
        for iface in raw.get("networks", {}).values():
            net_rx += iface.get("rx_bytes", 0)
            net_tx += iface.get("tx_bytes", 0)
    except (KeyError, TypeError):
        pass

    return {
        "cpu_pct": cpu_pct,
        "mem_usage": mem_usage,
        "mem_limit": mem_limit,
        "mem_pct": mem_pct,
        "net_rx": net_rx,
        "net_tx": net_tx,
    }
