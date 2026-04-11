import React from 'react';
import ReactDOM from 'react-dom/client';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import App from './App.jsx';
import { buildTheme } from './theme.js';

const HAMBURGER_PATH = 'M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z';

class HaDockerLensPanel extends HTMLElement {
  set hass(hass) {
    const darkMode = hass.themes?.darkMode ?? false;
    const connectionChanged = !this._hass || this._hass.connection !== hass.connection;
    const darkModeChanged = darkMode !== this._darkMode;

    this._hass = hass;
    this._darkMode = darkMode;

    if (!this._mounted) {
      this._mount();
    } else if (darkModeChanged || connectionChanged) {
      this._render();
    }
  }

  set narrow(value) {
    this._narrow = value;
    if (this._menuBtn) {
      this._menuBtn.style.display = value ? 'flex' : '';
    }
  }

  connectedCallback() {
    if (this._hass && !this._mounted) {
      this._mount();
    }
  }

  _toggleSidebar() {
    const event = new Event('hass-toggle-menu', {
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  _mount() {
    if (this._mounted) return;
    this._mounted = true;

    this.style.cssText =
      'display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--primary-background-color);';

    // ── Header ──────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = [
      'background-color:var(--app-header-background-color)',
      'color:var(--app-header-text-color)',
      'border-bottom:1px solid var(--divider-color)',
      'position:sticky',
      'top:0',
      'z-index:4',
    ].join(';');

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex;align-items:center;height:64px;padding:0 16px;gap:8px;';

    // Hamburger button
    this._menuBtn = document.createElement('ha-icon-button');
    this._menuBtn.setAttribute('label', 'Menu');
    this._menuBtn.style.cssText = [
      '--mdc-icon-button-size:48px',
      'color:var(--app-header-text-color)',
    ].join(';');

    // Set the SVG path for the hamburger icon
    this._menuBtn.addEventListener('click', () => this._toggleSidebar());

    // Create the path property after element is in DOM
    const svg = document.createElement('ha-svg-icon');
    svg.setAttribute('slot', 'icon');
    svg.setAttribute('path', HAMBURGER_PATH);
    this._menuBtn.appendChild(svg);

    toolbar.appendChild(this._menuBtn);

    // Title
    const title = document.createElement('div');
    title.textContent = 'Docker Lens';
    title.style.cssText = [
      'flex:1',
      'font-size:20px',
      'font-weight:500',
      'margin-left:8px',
      'color:var(--app-header-text-color)',
    ].join(';');
    toolbar.appendChild(title);

    header.appendChild(toolbar);
    this.appendChild(header);

    // ── React content ───────────────────────────────────────────────
    const styleTarget = document.createElement('style');
    this.appendChild(styleTarget);

    const mountPoint = document.createElement('div');
    mountPoint.style.cssText = 'flex:1;min-height:0;overflow:hidden;';
    this.appendChild(mountPoint);

    this._cache = createCache({
      key: 'ha-docker-lens',
      container: styleTarget,
      prepend: true,
    });

    this._root = ReactDOM.createRoot(mountPoint);
    this._render();
  }

  _render() {
    const theme = buildTheme(this._darkMode ?? false);
    this._root.render(
      <React.StrictMode>
        <CacheProvider value={this._cache}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <App connection={this._hass.connection} />
          </ThemeProvider>
        </CacheProvider>
      </React.StrictMode>,
    );
  }

  disconnectedCallback() {
    if (this._root) {
      this._root.unmount();
      this._root = null;
      this._mounted = false;
    }
  }
}

customElements.define('ha-docker-lens-panel', HaDockerLensPanel);
