"""Register the custom frontend panel for Docker Lens."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components import frontend, http
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PANEL_ICON, PANEL_TITLE, PANEL_URL

_LOGGER = logging.getLogger(__name__)

_STATIC_URL = f"/{DOMAIN}_static"


async def async_setup(hass: HomeAssistant) -> None:
    """Register the static assets and the sidebar panel."""
    frontend_dir = Path(__file__).parent / "frontend" / "dist"

    if not frontend_dir.is_dir():
        _LOGGER.error(
            (
                "Frontend 'dist' directory not found at %s. "
                "The panel will not be registered. "
                "Run `npm run build` inside the `frontend/` directory first."
            ),
            frontend_dir,
        )
        return

    await hass.http.async_register_static_paths(
        [http.StaticPathConfig(_STATIC_URL, str(frontend_dir), cache_headers=False)]
    )

    # Guard against double-registration during a reload.
    if PANEL_URL in hass.data.get("frontend_panels", {}):
        return

    frontend.async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        frontend_url_path=PANEL_URL,
        config={
            "_panel_custom": {
                "name": "ha-docker-lens-panel",
                "js_url": f"{_STATIC_URL}/index.js",
                "embed_iframe": False,
                "trust_external_script": True,
            }
        },
        require_admin=True,
    )
