import React from 'react';
import ReactDOM from 'react-dom/client';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import App from './App.jsx';
import { buildTheme } from './theme.js';

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

  connectedCallback() {
    if (this._hass && !this._mounted) {
      this._mount();
    }
  }

  _mount() {
    if (this._mounted) return;
    this._mounted = true;

    const styleTarget = document.createElement('style');
    this.appendChild(styleTarget);

    const mountPoint = document.createElement('div');
    mountPoint.style.cssText =
      'height:100%;width:100%;display:flex;flex-direction:column;overflow:hidden;';
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
