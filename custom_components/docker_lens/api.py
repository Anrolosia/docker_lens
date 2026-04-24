"""Docker API wrapper for Docker Lens."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import Callable
import logging
import time
from typing import Any

import aiohttp
import docker
from docker.errors import APIError, DockerException, NotFound
from docker.models.containers import Container

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import DOCKER_COMPOSE_PROJECT_LABEL, UNCATEGORIZED_STACK

_LOGGER = logging.getLogger(__name__)

# Docker log lines with timestamps=True have exactly two space-separated parts:
# "<RFC3339Nano timestamp> <message>"
_TIMESTAMP_PARTS = 2

_HTTP_OK = 200
_HTTP_UNAUTHORIZED = 401

type ContainerDict = dict[str, Any]
type StackMap = dict[str, list[ContainerDict]]


class DockerAPI:
    """Interface with the Docker daemon."""

    def __init__(self, hass: HomeAssistant, client: docker.DockerClient) -> None:
        """Initialize the Docker API."""
        self.hass = hass
        self.client = client
        self._image_status_cache: dict[str, tuple[float, str]] = {}
        self._image_status_cache_ttl = 300.0
        self._image_locks: dict[str, asyncio.Lock] = {}
        self._image_check_semaphore = asyncio.Semaphore(4)
        self._distribution_supported: bool | None = None

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
                    "image": container.attrs.get("Config", {}).get("Image") or "",
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

    async def get_image_update_status(
        self, container_id: str, image_name: str | None = None
    ) -> dict[str, str]:
        """Check if a container's image has an update available.

        Pass *image_name* (from the container list payload) to avoid a
        redundant containers.get() call that floods the Docker connection pool.

        Returns {"status": "up-to-date" | "update-available" | "unknown"}
        """
        try:
            if not image_name:
                # Fallback: fetch from Docker (slower, avoids extra pool pressure)
                async with self._image_check_semaphore:
                    container: Container = await self.hass.async_add_executor_job(
                        self.client.containers.get, container_id
                    )
                    image_name = container.attrs.get("Config", {}).get("Image") or ""
            if not image_name:
                return {"status": "unknown"}

            cached_status = self._get_cached_image_status(image_name)
            if cached_status is not None:
                return {"status": cached_status}

            lock = self._image_locks.setdefault(image_name, asyncio.Lock())
            async with lock:
                cached_status = self._get_cached_image_status(image_name)
                if cached_status is not None:
                    return {"status": cached_status}

                async with self._image_check_semaphore:
                    status = await self._compute_image_update_status(image_name)

                self._image_status_cache[image_name] = (time.monotonic(), status)
                return {"status": status}

        except NotFound:
            return {"status": "unknown"}
        except DockerException:
            _LOGGER.exception("Failed to check image update for %s", container_id)
            return {"status": "unknown"}

    def _get_cached_image_status(self, image_name: str) -> str | None:
        """Return cached status if still valid."""
        cached = self._image_status_cache.get(image_name)
        if cached is None:
            return None
        ts, status = cached
        if (time.monotonic() - ts) > self._image_status_cache_ttl:
            self._image_status_cache.pop(image_name, None)
            return None
        return status

    async def _compute_image_update_status(self, image_name: str) -> str:
        """Compute image update status for a single image name."""
        try:
            local_image: Any = await self.hass.async_add_executor_job(
                self.client.images.get, image_name
            )
        except (NotFound, DockerException):
            return "unknown"

        local_digests = _extract_all_local_repo_digests(local_image.attrs, image_name)

        if not local_digests:
            return "unknown"

        remote_digest = await self._get_remote_image_digest(image_name)

        if not remote_digest:
            return "unknown"

        return "up-to-date" if remote_digest in local_digests else "update-available"

    async def _get_remote_image_digest(self, image_name: str) -> str | None:
        """Fetch remote digest.

        Prefer Docker distribution inspect (Portainer-like), but gracefully
        fall back to direct registry HTTP when socket proxy blocks distribution.
        """
        digest = await self._get_remote_image_digest_via_distribution(image_name)
        if digest:
            return digest
        return await self._get_remote_image_digest_via_registry(image_name)

    async def _get_remote_image_digest_via_distribution(
        self, image_name: str
    ) -> str | None:
        """Fetch remote digest using Docker distribution inspect."""
        if self._distribution_supported is False:
            return None

        try:
            distribution_data: dict[str, Any] = await self.hass.async_add_executor_job(
                self.client.api.inspect_distribution,
                image_name,
            )
        except APIError as err:
            status_code = getattr(getattr(err, "response", None), "status_code", None)
            if status_code in (401, 403, 404):
                if self._distribution_supported is not False:
                    _LOGGER.debug(
                        "Docker distribution endpoint unavailable via daemon/proxy. "
                        "Falling back to registry HTTP checks."
                    )
                self._distribution_supported = False
                return None
            _LOGGER.debug(
                "Failed to inspect distribution for %s: %s",
                image_name,
                err,
            )
            return None
        except DockerException as err:
            _LOGGER.debug(
                "Failed to inspect distribution for %s: %s",
                image_name,
                err,
            )
            return None

        descriptor = distribution_data.get("Descriptor") or {}
        digest = descriptor.get("digest")
        if isinstance(digest, str) and digest.startswith("sha256:"):
            self._distribution_supported = True
            return digest
        return None

    async def _get_remote_image_digest_via_registry(
        self, image_name: str
    ) -> str | None:
        """Fetch remote digest directly from registry HTTP API."""
        try:
            url, is_docker_hub, repo = _parse_image_name(image_name)
            session = async_get_clientsession(self.hass)
            client_timeout = aiohttp.ClientTimeout(total=5)
            ml_hdrs: dict[str, str] = {
                "Accept": (
                    "application/vnd.docker.distribution.manifest.list.v2+json,"
                    "application/vnd.oci.image.index.v1+json"
                ),
            }
            v2_hdrs: dict[str, str] = {
                "Accept": (
                    "application/vnd.docker.distribution.manifest.v2+json,"
                    "application/vnd.oci.image.manifest.v1+json"
                ),
            }
            if is_docker_hub:
                token = await _get_docker_hub_token(session, repo, client_timeout)
                if not token:
                    return None
                ml_hdrs["Authorization"] = f"Bearer {token}"
                v2_hdrs["Authorization"] = f"Bearer {token}"
            result = await _head_manifest_with_auth(
                session, url, ml_hdrs, v2_hdrs, client_timeout, is_docker_hub
            )
        except (TimeoutError, aiohttp.ClientError):
            return None
        else:
            return result


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


def _extract_all_local_repo_digests(
    image_attrs: dict[str, Any], image_name: str
) -> set[str]:
    """Return ALL local manifest digests matching the image repository.

    An image can be pulled multiple times as the manifest list evolves,
    producing several RepoDigests entries for the same repo.  We keep every
    one so that any matching remote digest counts as up-to-date.
    """
    repo_digests = image_attrs.get("RepoDigests") or []
    if not repo_digests:
        return set()

    image_repo = _normalize_repo_name(image_name.split("@", 1)[0].rsplit(":", 1)[0])

    matched: set[str] = set()
    for digest_ref in repo_digests:
        if "@" not in digest_ref:
            continue
        ref_repo, ref_digest = digest_ref.split("@", 1)
        if _normalize_repo_name(ref_repo) == image_repo:
            matched.add(ref_digest)

    if matched:
        return matched

    # Fallback: return all digests when repo name matching is inconclusive.
    return {d.split("@", 1)[1] for d in repo_digests if "@" in d}


def _parse_image_name(image_name: str) -> tuple[str, bool, str]:
    """Parse image name into (manifest_url, is_docker_hub, repo_path)."""
    parts = image_name.split("/")
    if len(parts) == 1:
        registry = "https://registry-1.docker.io"
        repo_and_tag = parts[0]
        is_docker_hub = True
    elif "." in parts[0] or ":" in parts[0]:
        raw_host = parts[0]
        is_docker_hub = raw_host in {"docker.io", "registry-1.docker.io"}
        # docker.io redirects v2 calls; the real API lives on registry-1.docker.io.
        registry_host = "registry-1.docker.io" if raw_host == "docker.io" else raw_host
        registry = f"https://{registry_host}"
        repo_and_tag = "/".join(parts[1:])
    else:
        registry = "https://registry-1.docker.io"
        repo_and_tag = image_name
        is_docker_hub = True

    if ":" in repo_and_tag:
        repo, tag = repo_and_tag.rsplit(":", 1)
    else:
        repo = repo_and_tag
        tag = "latest"

    if is_docker_hub and "/" not in repo:
        repo = f"library/{repo}"

    url = f"{registry}/v2/{repo}/manifests/{tag}"
    return url, is_docker_hub, repo


async def _get_docker_hub_token(
    session: aiohttp.ClientSession,
    repo: str,
    client_timeout: aiohttp.ClientTimeout,
) -> str | None:
    """Fetch an anonymous pull token from the Docker Hub auth service."""
    token_url = (
        "https://auth.docker.io/token"
        f"?service=registry.docker.io&scope=repository:{repo}:pull"
    )
    async with session.get(token_url, timeout=client_timeout) as token_resp:
        if token_resp.status != _HTTP_OK:
            return None
        token_data = await token_resp.json()
        return token_data.get("token")


async def _head_manifest_with_auth(
    session: aiohttp.ClientSession,
    url: str,
    ml_hdrs: dict[str, str],
    v2_hdrs: dict[str, str],
    client_timeout: aiohttp.ClientTimeout,
    is_docker_hub: bool,
) -> str | None:
    """HEAD manifest endpoints, handling Bearer auth challenges when needed."""
    auth_challenge = ""
    async with session.head(url, headers=ml_hdrs, timeout=client_timeout) as resp:
        if resp.status == _HTTP_OK:
            digest = resp.headers.get("Docker-Content-Digest")
            if isinstance(digest, str) and digest.startswith("sha256:"):
                return digest
        elif resp.status == _HTTP_UNAUTHORIZED and not is_docker_hub:
            auth_challenge = resp.headers.get("WWW-Authenticate", "")

    if auth_challenge:
        token = await _fetch_bearer_token_from_challenge(
            session, auth_challenge, client_timeout
        )
        if token:
            ml_hdrs["Authorization"] = f"Bearer {token}"
            v2_hdrs["Authorization"] = f"Bearer {token}"
            async with session.head(
                url, headers=ml_hdrs, timeout=client_timeout
            ) as resp:
                if resp.status == _HTTP_OK:
                    digest = resp.headers.get("Docker-Content-Digest")
                    if isinstance(digest, str) and digest.startswith("sha256:"):
                        return digest

    async with session.head(url, headers=v2_hdrs, timeout=client_timeout) as resp:
        if resp.status == _HTTP_OK:
            digest = resp.headers.get("Docker-Content-Digest")
            if isinstance(digest, str) and digest.startswith("sha256:"):
                return digest

    return None


async def _fetch_bearer_token_from_challenge(
    session: aiohttp.ClientSession,
    www_authenticate: str,
    client_timeout: aiohttp.ClientTimeout,
) -> str | None:
    """Obtain an anonymous Bearer token from a WWW-Authenticate challenge.

    Standard Docker registry v2 auth flow: on a 401 the server returns
    ``WWW-Authenticate: Bearer realm="https://...",service="...",scope="..."``
    We fetch the token anonymously (no credentials) from that URL.
    Works for public repos on ghcr.io, lscr.io, quay.io, etc.
    """
    if not www_authenticate.startswith("Bearer "):
        return None

    params: dict[str, str] = {}
    for raw_part in www_authenticate[len("Bearer ") :].split(","):
        stripped = raw_part.strip()
        if "=" in stripped:
            key, _, val = stripped.partition("=")
            params[key.strip()] = val.strip().strip('"')

    realm = params.get("realm")
    if not realm:
        return None

    token_params: dict[str, str] = {}
    if "service" in params:
        token_params["service"] = params["service"]
    if "scope" in params:
        token_params["scope"] = params["scope"]

    try:
        async with session.get(
            realm, params=token_params, timeout=client_timeout
        ) as resp:
            if resp.status != _HTTP_OK:
                return None
            data = await resp.json(content_type=None)
            result = data.get("token") or data.get("access_token")
    except (TimeoutError, aiohttp.ClientError):
        return None
    else:
        return result


def _normalize_repo_name(repo: str) -> str:
    """Normalize repository names for digest matching.

    Examples:
    - alpine -> library/alpine
    - docker.io/library/alpine -> library/alpine
    - registry-1.docker.io/library/alpine -> library/alpine
    """
    normalized = repo.strip().lower()
    for prefix in (
        "docker.io/",
        "index.docker.io/",
        "registry-1.docker.io/",
    ):
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix) :]
            break
    if "/" not in normalized:
        normalized = f"library/{normalized}"
    return normalized
