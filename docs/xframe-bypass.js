/**
 * x-frame-bypass (Leafy fork)
 * Based on niutech/x-frame-bypass (Apache-2.0, © 2019 Jerzy Głowacki)
 * https://github.com/niutech/x-frame-bypass
 *
 * WHAT CHANGED FROM THE ORIGINAL:
 * - Replaced the dead proxy list (cors.io, jsonp.afeld.me, cors-anywhere.herokuapp.com
 *   — all three are shut down or demo-locked as of 2026) with proxies confirmed
 *   alive as of Sep 2026: AllOrigins, CodeTabs, and cors.x2u.in.
 * - Each proxy has a different URL shape (some want ?url=, some want the target
 *   appended raw), so fetchProxy() now builds the request per-proxy instead of
 *   assuming one shared "prefix + url" format.
 * - Everything else (srcdoc injection, click/submit rerouting, sandbox flags)
 *   is unchanged from the original — that part of the design is still sound.
 *
 * STILL A LIMITATION (not fixable by swapping proxies):
 * This only bypasses the X-Frame-Options HEADER. Sites that also detect
 * framing via JavaScript (YouTube, Google, Instagram, etc.) or that require
 * live cookies/auth will still break. Use this only as a second-tier
 * fallback, not a universal unblock.
 */

customElements.define('x-frame-bypass', class extends HTMLIFrameElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.load(this.src);
    this.src = '';
    this.sandbox = '' + this.sandbox ||
      'allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts allow-top-navigation-by-user-activation';
  }

  load(url, options) {
    if (!url || !url.startsWith('http')) {
      throw new Error(`X-Frame-Bypass src ${url} does not start with http(s)://`);
    }

    this.srcdoc = `<html><head><style>
      .loader{position:absolute;top:calc(50% - 25px);left:calc(50% - 25px);width:50px;height:50px;
      background-color:#333;border-radius:50%;animation:loader 1s infinite ease-in-out;}
      @keyframes loader{0%{transform:scale(0);}100%{transform:scale(1);opacity:0;}}
    </style></head><body><div class="loader"></div></body></html>`;

    this.fetchProxy(url, options, 0)
      .then(res => res.text())
      .then(data => {
        if (!data) return;
        this.srcdoc = data.replace(/<head([^>]*)>/i, `<head$1>
          <base href="${url}">
          <script>
            document.addEventListener('click', e => {
              if (frameElement && document.activeElement && document.activeElement.href) {
                e.preventDefault();
                frameElement.load(document.activeElement.href);
              }
            });
            document.addEventListener('submit', e => {
              if (frameElement && document.activeElement && document.activeElement.form && document.activeElement.form.action) {
                e.preventDefault();
                const form = document.activeElement.form;
                if (form.method === 'post') {
                  frameElement.load(form.action, {method: 'post', body: new FormData(form)});
                } else {
                  frameElement.load(form.action + '?' + new URLSearchParams(new FormData(form)));
                }
              }
            });
          </script>`);
      })
      .catch(e => {
        console.error('Cannot load X-Frame-Bypass:', e);
        this.dispatchEvent(new CustomEvent('xfb-failed', { detail: { url, error: e } }));
      });
  }

  // Each entry returns the full proxied fetch URL for a given target.
  // Order matters: tried top-to-bottom, falls through on failure.
  buildProxyUrl(i, url) {
    switch (i) {
      case 0: return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
      case 1: return 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(url);
      case 2: return 'https://cors.x2u.in/' + url;
      default: return null;
    }
  }

  fetchProxy(url, options, i) {
    const proxyUrl = this.buildProxyUrl(i, url);
    if (!proxyUrl) {
      return Promise.reject(new Error('All proxies exhausted for ' + url));
    }
    return fetch(proxyUrl, options).then(res => {
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res;
    }).catch(error => {
      const next = i + 1;
      if (this.buildProxyUrl(next, url) === null) throw error;
      return this.fetchProxy(url, options, next);
    });
  }
}, { extends: 'iframe' });
