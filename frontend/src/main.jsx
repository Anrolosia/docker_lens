import React from 'react';
import ReactDOM from 'react-dom/client';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { ThemeProvider } from '@mui/material';
import App from './App.jsx';
import { buildTheme } from './theme.js';

class HaDockerLensPanel extends HTMLElement {
  constructor() {
    super();
    // On ajoute un flag pour savoir si l'élément est bien dans le DOM
    this._isAttached = false;
  }

  set hass(hass) {
    const darkMode = hass.themes?.darkMode ?? false;
    const connectionChanged = !this._hass || this._hass.connection !== hass.connection;
    const darkModeChanged = darkMode !== this._darkMode;

    this._hass = hass;
    this._darkMode = darkMode;

    // On met à jour le bouton natif automatiquement !
    if (this._menuBtn) {
      this._menuBtn.hass = hass;
    }

    // On ne monte l'app que si l'élément est attaché au DOM
    if (this._isAttached && !this._mounted) {
      this._mount();
    } else if (this._mounted && (darkModeChanged || connectionChanged)) {
      this._render();
    }
  }

  set narrow(value) {
    this._narrow = value;
    // Le bouton gère son affichage lui-même grâce à cette propriété
    if (this._menuBtn) {
      this._menuBtn.narrow = value;
    }
  }

  connectedCallback() {
    this._isAttached = true;
    if (this._hass && !this._mounted) {
      this._mount();
    }
  }

  _mount() {
    if (this._mounted) return;
    this._mounted = true;

    this.style.cssText = `
      display: grid;
      /* C'est ICI que la magie opère. Fini le dépassement ! */
      grid-template-rows: 56px minmax(0, 1fr);
      height: 100%;
      width: 100%;
      background: var(--primary-background-color);
      overflow: hidden; /* Ceinture et bretelles */
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      padding: 0 16px;
      background-color: var(--app-header-background-color, var(--primary-color));
      color: var(--app-header-text-color, var(--text-primary-color));
      z-index: 2;
    `;

    this._menuBtn = document.createElement('ha-menu-button');
    this._menuBtn.hass = this._hass;
    this._menuBtn.narrow = this._narrow;
    header.appendChild(this._menuBtn);

    const title = document.createElement('div');
    title.textContent = 'Docker Lens';
    title.style.cssText = `
      margin-left: 24px; 
      font-size: 20px; 
      font-weight: 500; 
      line-height: normal; 
      flex: 1; 
      letter-spacing: 0.15px;
      font-family: var(--paper-font-title_-_font-family, -apple-system, BlinkMacSystemFont, 'Roboto', sans-serif);
      -webkit-font-smoothing: antialiased;
    `;
    header.appendChild(title);

    this.appendChild(header);

    const styleTarget = document.createElement('style');
    this.appendChild(styleTarget);

    const mountPoint = document.createElement('div');
    mountPoint.style.cssText = `
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
    `;
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
      this._isAttached = false;
    }
  }
}

customElements.define('ha-docker-lens-panel', HaDockerLensPanel);
