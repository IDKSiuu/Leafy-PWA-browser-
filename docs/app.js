(() => {
  'use strict';

  // ---------- Storage helpers ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    }
  };

  let bookmarks = store.get('leafy_bookmarks', []);
  let history = store.get('leafy_history', []);
  let settings = store.get('leafy_settings', {
    theme: 'meadow',
    fontSize: 'medium',
    engine: 'bing',
    proxyBypass: true,
    sound: true,
    confirmClose: false
  });

  function saveSettings() { store.set('leafy_settings', settings); }

  // ---------- DOM refs ----------
  const $ = (id) => document.getElementById(id);
  const html = document.documentElement;
  const tabStrip = $('tabStrip');
  const newTabBtn = $('newTabBtn');
  const viewport = $('viewport');
  const startScreen = $('startScreen');
  const urlForm = $('urlForm');
  const urlInput = $('urlInput');
  const backBtn = $('backBtn');
  const fwdBtn = $('fwdBtn');
  const reloadBtn = $('reloadBtn');
  const starBtn = $('starBtn');
  const menuBtn = $('menuBtn');
  const overlay = $('overlay');
  const menuPanel = $('menuPanel');
  const panelClose = $('panelClose');
  const panelBack = $('panelBack');
  const panelTitle = $('panelTitle');
  const menuList = $('menuList');
  const bookmarksView = $('bookmarksView');
  const historyView = $('historyView');
  const settingsView = $('settingsView');
  const clearHistoryBtn = $('clearHistoryBtn');
  const clearDataBtn = $('clearDataBtn');
  const toast = $('toast');
  const confirmModal = $('confirmModal');
  const confirmTitle = $('confirmTitle');
  const confirmBody = $('confirmBody');
  const confirmOkBtn = $('confirmOkBtn');
  const confirmCancelBtn = $('confirmCancelBtn');
  const themeGrid = $('themeGrid');
  const fontSizeRow = $('fontSizeRow');
  const searchEngineRow = $('searchEngineRow');
  const proxyToggle = $('proxyToggle');
  const soundToggle = $('soundToggle');
  const confirmCloseToggle = $('confirmCloseToggle');

  // ---------- Apply settings to DOM ----------
  function applySettings() {
    html.setAttribute('data-theme', settings.theme);
    html.setAttribute('data-fontsize', settings.fontSize);

    themeGrid.querySelectorAll('.themeSwatch').forEach(el =>
      el.classList.toggle('active', el.dataset.theme === settings.theme));
    fontSizeRow.querySelectorAll('.segmentBtn').forEach(el =>
      el.classList.toggle('active', el.dataset.fontsize === settings.fontSize));
    searchEngineRow.querySelectorAll('.segmentBtn').forEach(el =>
      el.classList.toggle('active', el.dataset.engine === settings.engine));
    proxyToggle.checked = settings.proxyBypass;
    soundToggle.checked = settings.sound;
    confirmCloseToggle.checked = settings.confirmClose;
  }

  themeGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.themeSwatch');
    if (!btn) return;
    settings.theme = btn.dataset.theme;
    saveSettings();
    applySettings();
  });

  fontSizeRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmentBtn');
    if (!btn) return;
    settings.fontSize = btn.dataset.fontsize;
    saveSettings();
    applySettings();
  });

  searchEngineRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmentBtn');
    if (!btn) return;
    settings.engine = btn.dataset.engine;
    saveSettings();
    applySettings();
    showToast(`Search engine set to ${btn.textContent}`);
  });

  proxyToggle.addEventListener('change', () => {
    settings.proxyBypass = proxyToggle.checked;
    saveSettings();
  });
  soundToggle.addEventListener('change', () => {
    settings.sound = soundToggle.checked;
    saveSettings();
  });
  confirmCloseToggle.addEventListener('change', () => {
    settings.confirmClose = confirmCloseToggle.checked;
    saveSettings();
  });

  // ---------- Confirm modal (generic, reusable) ----------
  let confirmResolver = null;
  function askConfirm(title, body) {
    confirmTitle.textContent = title;
    confirmBody.textContent = body;
    confirmModal.classList.add('show');
    confirmModal.setAttribute('aria-hidden', 'false');
    return new Promise((resolve) => { confirmResolver = resolve; });
  }
  function closeConfirm(result) {
    confirmModal.classList.remove('show');
    confirmModal.setAttribute('aria-hidden', 'true');
    if (confirmResolver) { confirmResolver(result); confirmResolver = null; }
  }
  confirmOkBtn.addEventListener('click', () => closeConfirm(true));
  confirmCancelBtn.addEventListener('click', () => closeConfirm(false));

  // ---------- Sound (tiny programmatic click, respects setting) ----------
  let audioCtx = null;
  function playTick() {
    if (!settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 700;
      g.gain.value = 0.04;
      o.connect(g); g.connect(audioCtx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      o.stop(audioCtx.currentTime + 0.09);
    } catch {}
  }

  // ---------- Tab state ----------
  let tabs = [];
  let activeTabId = null;
  let tabCounter = 0;
  function uid() { return 't' + (++tabCounter) + '_' + Date.now().toString(36); }

  function faviconFor(url) {
    if (!url) return '🌐';
    try {
      const h = new URL(url).hostname;
      if (h.includes('wikipedia')) return '📖';
      if (h.includes('github')) return '💻';
      if (h.includes('bing') || h.includes('duckduckgo') || h.includes('coccoc')) return '🔍';
      return '🌐';
    } catch { return '🌐'; }
  }
  function shortTitle(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  }
  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ---------- Search engine URL builder ----------
  function searchUrl(query) {
    const q = encodeURIComponent(query);
    switch (settings.engine) {
      case 'duckduckgo': return 'https://duckduckgo.com/?q=' + q;
      case 'coccoc':      return 'https://coccoc.com/search?query=' + q;
      case 'bing':
      default:            return 'https://www.bing.com/search?q=' + q;
    }
  }

  // ---------- URL normalization ----------
  function normalizeInput(raw) {
    const val = raw.trim();
    if (!val) return null;
    const looksLikeUrl = /^https?:\/\//i.test(val) ||
      (/^[^\s]+\.[a-z]{2,}([/?#].*)?$/i.test(val) && !val.includes(' '));
    if (/^https?:\/\//i.test(val)) return val;
    if (looksLikeUrl) return 'https://' + val;
    return searchUrl(val);
  }

  // ---------- Known-blocked shortlist ----------
  const KNOWN_BLOCKED = [
    'google.com', 'youtube.com', 'facebook.com', 'instagram.com',
    'twitter.com', 'x.com', 'reddit.com', 'amazon.com', 'github.com',
    'stackoverflow.com', 'linkedin.com', 'netflix.com', 'tiktok.com',
    'gmail.com', 'mail.google.com', 'accounts.google.com', 'whatsapp.com'
  ];
  function isLikelyBlocked(url) {
    try {
      const h = new URL(url).hostname.replace(/^www\./, '');
      return KNOWN_BLOCKED.some(b => h === b || h.endsWith('.' + b));
    } catch { return false; }
  }

  // ---------- Tab creation / switching ----------
  function createTab(url) {
    const id = uid();
    const tab = { id, url: url || null, title: 'New tab', history: [], histIndex: -1, iframeEl: null, cropWrapEl: null };
    tabs.push(tab);
    renderTabStrip();
    switchTab(id);
    if (url) navigate(url, id);
    return tab;
  }
  function getTab(id) { return tabs.find(t => t.id === id); }

  function switchTab(id) {
    activeTabId = id;
    renderTabStrip();
    tabs.forEach(t => {
      if (t.iframeEl) t.iframeEl.classList.toggle('visible', t.id === id);
      if (t.cropWrapEl) t.cropWrapEl.classList.toggle('visible', t.id === id);
    });
    const tab = getTab(id);
    if (tab && tab.url) {
      startScreen.classList.add('hidden');
      urlInput.value = tab.url;
      updateNavButtons(tab);
      updateStarState(tab.url);
    } else {
      startScreen.classList.remove('hidden');
      urlInput.value = '';
      updateNavButtons(null);
      updateStarState(null);
    }
  }

  function actuallyCloseTab(id) {
    const idx = tabs.findIndex(t => t.id === id);
    if (idx === -1) return;
    const tab = tabs[idx];
    if (tab.iframeEl) tab.iframeEl.remove();
    if (tab.cropWrapEl) tab.cropWrapEl.remove();
    tabs.splice(idx, 1);
    if (tabs.length === 0) { createTab(null); return; }
    if (activeTabId === id) {
      const next = tabs[idx] || tabs[idx - 1] || tabs[0];
      switchTab(next.id);
    } else {
      renderTabStrip();
    }
  }

  async function closeTab(id) {
    if (settings.confirmClose) {
      const ok = await askConfirm('Close this tab?', "You'll lose this tab's page unless it's bookmarked.");
      if (!ok) return;
    }
    actuallyCloseTab(id);
  }

  function renderTabStrip() {
    tabStrip.querySelectorAll('.tab').forEach(el => el.remove());
    tabs.forEach(tab => {
      const el = document.createElement('div');
      el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
      el.setAttribute('role', 'tab');
      el.innerHTML = `
        <span class="favicon">${faviconFor(tab.url)}</span>
        <span class="tabTitle">${escapeHtml(tab.title || 'New tab')}</span>
        <button class="tabClose" aria-label="Close tab">✕</button>
      `;
      el.addEventListener('click', (e) => {
        if (e.target.closest('.tabClose')) return;
        playTick();
        switchTab(tab.id);
      });
      el.querySelector('.tabClose').addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tab.id);
      });
      tabStrip.insertBefore(el, newTabBtn);
    });
  }

  // ---------- Plain iframe loader (tier 1) ----------
  function mountPlainIframe(tab, url) {
    if (tab.cropWrapEl) { tab.cropWrapEl.remove(); tab.cropWrapEl = null; }
    if (!tab.iframeEl) {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-same-origin allow-popups-to-escape-sandbox');
      viewport.appendChild(iframe);
      tab.iframeEl = iframe;
      iframe.addEventListener('load', () => {
        tab.title = shortTitle(tab.url);
        if (tab.id === activeTabId) { urlInput.value = tab.url; renderTabStrip(); }
      });
    }
    tab.iframeEl.src = url;
    tab.iframeEl.classList.toggle('visible', tab.id === activeTabId);
  }

  // ---------- x-frame-bypass loader (tier 2) ----------
  function mountBypassIframe(tab, url) {
    if (tab.cropWrapEl) { tab.cropWrapEl.remove(); tab.cropWrapEl = null; }
    if (tab.iframeEl) { tab.iframeEl.remove(); tab.iframeEl = null; }

    const bypassFrame = document.createElement('iframe', { is: 'x-frame-bypass' });
    bypassFrame.setAttribute('is', 'x-frame-bypass');
    bypassFrame.className = 'visible';
    viewport.appendChild(bypassFrame);
    tab.iframeEl = bypassFrame;

    bypassFrame.addEventListener('xfb-failed', () => {
      mountCroppedProxy(tab, url);
    });

    // The x-frame-bypass element's connectedCallback fires on first attach and
    // calls this.load(this.src) itself — so setting .src BEFORE appendChild
    // would trigger one load, while calling .load() directly after appending
    // is the more reliable path (avoids relying on attribute-order timing).
    // Only do one or the other, never both, or the proxy fetch fires twice.
    if (typeof bypassFrame.load === 'function') {
      bypassFrame.load(url);
    } else {
      // Fallback if the custom element failed to register for some reason
      bypassFrame.src = url;
    }
  }

  // ---------- Cropped iframetest.com/Webfuse loader (tier 3) ----------
  // iframetest.com's own demo box renders the target page at a consistent
  // position when passed ?url=<target>. We crop the surrounding chrome away
  // with a fixed-offset wrapper. Offsets are approximate; if iframetest.com
  // changes its layout these will need retuning.
  function mountCroppedProxy(tab, url) {
    if (tab.iframeEl) { tab.iframeEl.remove(); tab.iframeEl = null; }
    if (tab.cropWrapEl) { tab.cropWrapEl.remove(); tab.cropWrapEl = null; }

    const wrap = document.createElement('div');
    wrap.className = 'cropWrap visible';
    const inner = document.createElement('iframe');
    inner.src = 'https://iframetest.com/?url=' + encodeURIComponent(url);
    inner.style.top = '-260px';
    inner.style.height = 'calc(100% + 260px)';
    wrap.appendChild(inner);
    viewport.appendChild(wrap);
    tab.cropWrapEl = wrap;

    showToast('Showing via a compatibility view — some features may not work');
  }

  // ---------- Master navigate() with fallback chain ----------
  function navigate(url, tabId, opts = {}) {
    const tab = getTab(tabId || activeTabId);
    if (!tab) return;
    startScreen.classList.add('hidden');

    if (!opts.skipHistoryPush) {
      tab.history = tab.history.slice(0, tab.histIndex + 1);
      tab.history.push(url);
      tab.histIndex = tab.history.length - 1;
    }
    tab.url = url;
    tab.title = shortTitle(url);

    const blocked = isLikelyBlocked(url);

    if (!blocked) {
      mountPlainIframe(tab, url);
    } else if (!settings.proxyBypass) {
      openExternally(url);
      return;
    } else if (typeof customElements !== 'undefined' && customElements.get('x-frame-bypass')) {
      mountBypassIframe(tab, url);
    } else {
      mountCroppedProxy(tab, url);
    }

    if (tab.id === activeTabId) {
      urlInput.value = url;
      updateNavButtons(tab);
      updateStarState(url);
    }
    renderTabStrip();
    pushHistory(url, tab.title);
  }

  function updateNavButtons(tab) {
    if (!tab) { backBtn.disabled = true; fwdBtn.disabled = true; return; }
    backBtn.disabled = tab.histIndex <= 0;
    fwdBtn.disabled = tab.histIndex >= tab.history.length - 1;
  }

  backBtn.addEventListener('click', () => {
    const tab = getTab(activeTabId);
    if (!tab || tab.histIndex <= 0) return;
    tab.histIndex--;
    navigate(tab.history[tab.histIndex], tab.id, { skipHistoryPush: true });
    updateNavButtons(tab);
  });
  fwdBtn.addEventListener('click', () => {
    const tab = getTab(activeTabId);
    if (!tab || tab.histIndex >= tab.history.length - 1) return;
    tab.histIndex++;
    navigate(tab.history[tab.histIndex], tab.id, { skipHistoryPush: true });
    updateNavButtons(tab);
  });
  reloadBtn.addEventListener('click', () => {
    const tab = getTab(activeTabId);
    if (!tab) return;
    if (tab.iframeEl) tab.iframeEl.src = tab.iframeEl.src;
    else if (tab.cropWrapEl) { const f = tab.cropWrapEl.querySelector('iframe'); if (f) f.src = f.src; }
  });

  // ---------- URL form ----------
  urlForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const target = normalizeInput(urlInput.value);
    if (!target) return;
    urlInput.blur();
    navigate(target, activeTabId);
  });
  urlInput.addEventListener('focus', () => urlInput.select());

  function openExternally(url) {
    window.open(url, '_blank', 'noopener');
    showToast('This site blocks embedding — opened in a new tab');
    pushHistory(url, shortTitle(url));
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  // ---------- New tab ----------
  newTabBtn.addEventListener('click', () => { playTick(); createTab(null); });

  // ---------- Bookmarks ----------
  function updateStarState(url) {
    if (!url) { starBtn.classList.remove('active'); return; }
    starBtn.classList.toggle('active', bookmarks.some(b => b.url === url));
  }
  starBtn.addEventListener('click', () => {
    const tab = getTab(activeTabId);
    if (!tab || !tab.url) return;
    const idx = bookmarks.findIndex(b => b.url === tab.url);
    if (idx > -1) { bookmarks.splice(idx, 1); showToast('Bookmark removed'); }
    else { bookmarks.unshift({ url: tab.url, title: tab.title || shortTitle(tab.url) }); showToast('Bookmarked'); }
    store.set('leafy_bookmarks', bookmarks);
    updateStarState(tab.url);
    renderBookmarks();
  });

  function renderBookmarks() {
    if (bookmarks.length === 0) {
      bookmarksView.innerHTML = '<div class="emptyState">No bookmarks yet. Tap ⭐ on any page to save it.</div>';
      return;
    }
    bookmarksView.innerHTML = '';
    bookmarks.forEach((b, i) => {
      const el = buildListItem(b.title, b.url, () => { closePanel(); openFromList(b.url); }, () => {
        bookmarks.splice(i, 1); store.set('leafy_bookmarks', bookmarks);
        renderBookmarks(); updateStarState(getTab(activeTabId)?.url);
      });
      bookmarksView.appendChild(el);
    });
  }

  // ---------- History ----------
  function pushHistory(url, title) {
    history = history.filter(h => h.url !== url);
    history.unshift({ url, title: title || shortTitle(url), ts: Date.now() });
    if (history.length > 200) history = history.slice(0, 200);
    store.set('leafy_history', history);
  }

  function renderHistory() {
    const list = historyView.querySelector('.emptyState') ? historyView : historyView;
    const items = history.slice(0, 100);
    const staticPart = `<button class="menuItem dangerItem" id="clearHistoryBtnInner">🗑 Clear history</button><div class="sectionGap"></div>`;
    if (items.length === 0) {
      historyView.innerHTML = staticPart + '<div class="emptyState">No history yet.</div>';
    } else {
      historyView.innerHTML = staticPart;
      items.forEach((h, i) => {
        const el = buildListItem(h.title, h.url, () => { closePanel(); openFromList(h.url); }, () => {
          history.splice(i, 1); store.set('leafy_history', history); renderHistory();
        });
        historyView.appendChild(el);
      });
    }
    document.getElementById('clearHistoryBtnInner')?.addEventListener('click', handleClearHistory);
  }

  async function handleClearHistory() {
    const ok = await askConfirm('Clear history?', 'This will remove all browsing history. This cannot be undone.');
    if (!ok) return;
    history = [];
    store.set('leafy_history', history);
    renderHistory();
    showToast('History cleared');
  }

  clearDataBtn.addEventListener('click', async () => {
    const ok = await askConfirm('Clear all history & bookmarks?', "This removes everything and can't be undone.");
    if (!ok) return;
    history = [];
    bookmarks = [];
    store.set('leafy_history', history);
    store.set('leafy_bookmarks', bookmarks);
    renderHistory();
    renderBookmarks();
    updateStarState(getTab(activeTabId)?.url);
    showToast('History and bookmarks cleared');
  });

  function buildListItem(title, url, onOpen, onRemove) {
    const el = document.createElement('div');
    el.className = 'listItem';
    el.innerHTML = `
      <span class="favicon">${faviconFor(url)}</span>
      <span class="itemText">
        <div class="itemTitle">${escapeHtml(title)}</div>
        <div class="itemUrl">${escapeHtml(url)}</div>
      </span>
      <button class="itemRemove" aria-label="Remove">✕</button>
    `;
    el.addEventListener('click', (e) => { if (e.target.closest('.itemRemove')) return; onOpen(); });
    el.querySelector('.itemRemove').addEventListener('click', (e) => { e.stopPropagation(); onRemove(); });
    return el;
  }

  function openFromList(url) {
    let tab = getTab(activeTabId);
    if (!tab || tab.url) tab = createTab(null);
    navigate(url, tab.id);
  }

  // ---------- Menu panel navigation (root / bookmarks / history / settings) ----------
  const views = { bookmarks: bookmarksView, history: historyView, settings: settingsView };
  let currentView = null;

  function openPanel() { overlay.classList.add('show'); menuPanel.classList.add('show'); showMenuRoot(); }
  function closePanel() { overlay.classList.remove('show'); menuPanel.classList.remove('show'); }
  function showMenuRoot() {
    currentView = null;
    panelTitle.textContent = 'Menu';
    panelBack.hidden = true;
    menuList.hidden = false;
    Object.values(views).forEach(v => v.hidden = true);
  }
  function showSubView(name, title) {
    currentView = name;
    panelTitle.textContent = title;
    panelBack.hidden = false;
    menuList.hidden = true;
    Object.entries(views).forEach(([k, v]) => v.hidden = k !== name);
    if (name === 'bookmarks') renderBookmarks();
    if (name === 'history') renderHistory();
  }

  menuBtn.addEventListener('click', () => { playTick(); openPanel(); });
  panelClose.addEventListener('click', closePanel);
  panelBack.addEventListener('click', showMenuRoot);
  overlay.addEventListener('click', () => { closePanel(); closeConfirm(false); });

  menuList.querySelectorAll('.menuItem[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      const titles = { bookmarks: 'Bookmarks', history: 'History', settings: 'Settings' };
      showSubView(view, titles[view]);
    });
  });

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // ---------- Init ----------
  applySettings();
  createTab(null);
})();
