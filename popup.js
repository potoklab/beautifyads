// BeautifyAds Popup Logic v1.0.6
(function() {
  'use strict';

  const POPUP_CONFIG = {
    uiBlocks: [
      {
        id: 'recommendations',
        label: 'Hide Recommendations',
        meta: 'Most Recommendations banners'
      },
      {
        id: 'insights',
        label: 'Hide Insights',
        meta: 'Most Insights banners'
      },
      {
        id: 'ai-max-section',
        label: 'Hide AI Max section',
        meta: 'Inside Campaign settings drawer'
      }
    ],

    optionalMenuItems: [
      { id: 'brand-report', label: 'Brand report', meta: 'Campaign > Insights and reports' },
      { id: 'shops', label: 'Shops', meta: 'Campaign > Insights and reports' },
      { id: 'campaign-groups', label: 'Campaign groups', meta: 'Campaign > Assets' },
      { id: 'performance-planner', label: 'Performance planner', meta: 'Tools > Planning' },
      { id: 'reach-planner', label: 'Reach planner', meta: 'Tools > Planning' },
      { id: 'app-advertising-hub', label: 'App advertising hub', meta: 'Tools' },
      { id: 'youtube-creator-partnerships', label: 'YouTube creator partnerships', meta: 'Tools' },
      { id: 'content-suitability', label: 'Content suitability', meta: 'Tools' },
      { id: 'policy-manager', label: 'Policy manager', meta: 'Tools > Troubleshooting' },
      { id: 'ad-preview-diagnosis', label: 'Ad preview and diagnosis', meta: 'Tools > Troubleshooting' }
    ],

    defaults: {
      uiBlocksHidden: {
        'recommendations': true,
        'insights': true,
        'ai-max-section': true
      },
      optionalMenuItemsVisible: {
        'brand-report': false,
        'shops': false,
        'campaign-groups': false,
        'performance-planner': false,
        'reach-planner': false,
        'app-advertising-hub': false,
        'youtube-creator-partnerships': false,
        'content-suitability': false,
        'policy-manager': false,
        'ad-preview-diagnosis': false
      },
      keyboardShortcutEnabled: true,
      statusBadgeEnabled: true,
      autoCloseLeftMenu: true,
      menuReorganizeEnabled: true
    },

    featureRequestUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSd2MLTTVBK9N-GMPTara8352ovbpY6xKo4pCaUcXEURzVJTTA/viewform?usp=header',
    brandUrl: 'https://potoklab.com',

    defaultBanner: {
      title: 'Struggling with ad performance?',
      ctaText: 'Free audit',
      ctaUrl: 'https://potoklab.com'
    },

    remoteBannerUrl: 'https://potoklab.com/beautifyads/banner.json',
    bannerCacheMs: 60 * 60 * 1000
  };

  let settings = null;
  let isActive = true;

  // ==========================================
  // STORAGE
  // ==========================================

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get('beautifyads_settings', (result) => {
        if (result.beautifyads_settings) {
          settings = mergeWithDefaults(result.beautifyads_settings);
        } else {
          settings = JSON.parse(JSON.stringify(POPUP_CONFIG.defaults));
        }
        resolve(settings);
      });
    });
  }

  function mergeWithDefaults(stored) {
    const merged = JSON.parse(JSON.stringify(POPUP_CONFIG.defaults));

    if (stored.uiBlocksHidden) {
      Object.keys(stored.uiBlocksHidden).forEach((k) => {
        if (k in merged.uiBlocksHidden) merged.uiBlocksHidden[k] = stored.uiBlocksHidden[k];
      });
    }
    if (stored.optionalMenuItemsVisible) {
      Object.keys(stored.optionalMenuItemsVisible).forEach((k) => {
        if (k in merged.optionalMenuItemsVisible) merged.optionalMenuItemsVisible[k] = stored.optionalMenuItemsVisible[k];
      });
    }
    if (typeof stored.keyboardShortcutEnabled === 'boolean') merged.keyboardShortcutEnabled = stored.keyboardShortcutEnabled;
    if (typeof stored.statusBadgeEnabled === 'boolean') merged.statusBadgeEnabled = stored.statusBadgeEnabled;
    if (typeof stored.autoCloseLeftMenu === 'boolean') merged.autoCloseLeftMenu = stored.autoCloseLeftMenu;
    if (typeof stored.menuReorganizeEnabled === 'boolean') merged.menuReorganizeEnabled = stored.menuReorganizeEnabled;

    return merged;
  }

  function saveSettings() {
    chrome.storage.local.set({ beautifyads_settings: settings });
  }

  // ==========================================
  // ACTIVE TOGGLE (session-only)
  // ==========================================

  function broadcastActive(active) {
    chrome.tabs.query({ url: 'https://ads.google.com/*' }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { type: 'BA_SET_ACTIVE', active }, () => {
          void chrome.runtime.lastError;
        });
      });
    });
  }

  function queryActiveFromActiveTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, url: 'https://ads.google.com/*' }, (tabs) => {
        if (!tabs.length) { resolve(true); return; }
        chrome.tabs.sendMessage(tabs[0].id, { type: 'BA_GET_ACTIVE' }, (response) => {
          if (chrome.runtime.lastError || !response) { resolve(true); return; }
          resolve(response.isActive === true);
        });
      });
    });
  }

  function updateActiveUI() {
    const checkbox = document.getElementById('active-toggle-input');
    if (checkbox) checkbox.checked = isActive;
    document.body.classList.toggle('ba-inactive', !isActive);
  }

  function bindActiveToggle() {
    const checkbox = document.getElementById('active-toggle-input');
    if (!checkbox) return;
    checkbox.addEventListener('change', (e) => {
      isActive = e.target.checked;
      updateActiveUI();
      broadcastActive(isActive);
    });
  }

  function bindBadgeCheckbox() {
    const checkbox = document.getElementById('badge-checkbox');
    if (!checkbox) return;
    checkbox.checked = settings.statusBadgeEnabled === true;
    checkbox.addEventListener('change', (e) => {
      settings.statusBadgeEnabled = e.target.checked;
      saveSettings();
    });
  }

  function bindReorganizeToggle() {
    const checkbox = document.getElementById('reorganize-toggle');
    if (!checkbox) return;
    checkbox.checked = settings.menuReorganizeEnabled === true;
    checkbox.addEventListener('change', (e) => {
      settings.menuReorganizeEnabled = e.target.checked;
      saveSettings();
    });
  }

  // ==========================================
  // DYNAMIC BANNER
  // ==========================================

  async function loadBanner() {
    applyBanner(POPUP_CONFIG.defaultBanner);
    const cached = await getCachedBanner();
    if (cached) applyBanner(cached);

    try {
      const response = await fetch(POPUP_CONFIG.remoteBannerUrl, {
        cache: 'no-cache',
        signal: AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined
      });
      if (!response.ok) throw new Error('Bad status');
      const data = await response.json();
      if (data && data.title && data.ctaText && data.ctaUrl) {
        applyBanner(data);
        cacheBanner(data);
      }
    } catch (e) {
      // silent fallback
    }
  }

  function applyBanner(banner) {
    const titleEl = document.getElementById('promo-title');
    const ctaTextEl = document.getElementById('promo-cta-text');
    const ctaEl = document.getElementById('promo-cta');
    if (!titleEl || !ctaEl || !ctaTextEl) return;

    titleEl.textContent = banner.title || POPUP_CONFIG.defaultBanner.title;
    ctaTextEl.textContent = banner.ctaText || POPUP_CONFIG.defaultBanner.ctaText;
    ctaEl.href = banner.ctaUrl || POPUP_CONFIG.defaultBanner.ctaUrl;
    ctaEl.setAttribute('data-banner-url', banner.ctaUrl || POPUP_CONFIG.defaultBanner.ctaUrl);
  }

  function getCachedBanner() {
    return new Promise((resolve) => {
      chrome.storage.local.get('beautifyads_banner_cache', (result) => {
        const cache = result.beautifyads_banner_cache;
        if (!cache || !cache.data || !cache.timestamp) { resolve(null); return; }
        if (Date.now() - cache.timestamp > POPUP_CONFIG.bannerCacheMs) { resolve(null); return; }
        resolve(cache.data);
      });
    });
  }

  function cacheBanner(data) {
    chrome.storage.local.set({
      beautifyads_banner_cache: { data, timestamp: Date.now() }
    });
  }

  // ==========================================
  // RENDER LISTS
  // ==========================================

  function renderUiBlocks() {
    const container = document.getElementById('ui-blocks-list');
    if (!container) return;
    container.innerHTML = '';

    POPUP_CONFIG.uiBlocks.forEach((block) => {
      const row = document.createElement('label');
      row.className = 'toggle-row';
      row.innerHTML = `
        <div class="toggle-info">
          <div class="toggle-label">${escapeHtml(block.label)}</div>
          <div class="toggle-meta">${escapeHtml(block.meta)}</div>
        </div>
        <div class="toggle-switch">
          <input type="checkbox" data-uiblock="${escapeHtml(block.id)}">
          <span class="switch-slider"></span>
        </div>
      `;
      container.appendChild(row);

      const checkbox = row.querySelector('input');
      checkbox.checked = settings.uiBlocksHidden[block.id] === true;
      checkbox.addEventListener('change', (e) => {
        settings.uiBlocksHidden[block.id] = e.target.checked;
        saveSettings();
      });
    });
  }

  function renderMenuItems() {
    const container = document.getElementById('menu-items-list');
    if (!container) return;
    container.innerHTML = '';

    POPUP_CONFIG.optionalMenuItems.forEach((item) => {
      const row = document.createElement('label');
      row.className = 'toggle-row';
      row.innerHTML = `
        <div class="toggle-info">
          <div class="toggle-label">${escapeHtml(item.label)}</div>
          <div class="toggle-meta">${escapeHtml(item.meta)}</div>
        </div>
        <div class="toggle-switch">
          <input type="checkbox" data-menuitem="${escapeHtml(item.id)}">
          <span class="switch-slider"></span>
        </div>
      `;
      container.appendChild(row);

      const checkbox = row.querySelector('input');
      checkbox.checked = settings.optionalMenuItemsVisible[item.id] === true;
      checkbox.addEventListener('change', (e) => {
        settings.optionalMenuItemsVisible[item.id] = e.target.checked;
        saveSettings();
      });
    });
  }

  function bindTabs() {
    const tabs = document.querySelectorAll('.tab');
    const panels = document.querySelectorAll('.panel');

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-tab');
        tabs.forEach((t) => t.classList.toggle('tab-active', t === tab));
        panels.forEach((p) => {
          p.classList.toggle('panel-active', p.getAttribute('data-panel') === target);
        });
      });
    });
  }

  function bindExternalLinks() {
    const featureLink = document.getElementById('feature-request-link');
    if (featureLink) {
      featureLink.href = POPUP_CONFIG.featureRequestUrl;
      featureLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: POPUP_CONFIG.featureRequestUrl });
      });
    }

    const promoCta = document.getElementById('promo-cta');
    if (promoCta) {
      promoCta.addEventListener('click', (e) => {
        e.preventDefault();
        const url = promoCta.getAttribute('data-banner-url') || promoCta.href || POPUP_CONFIG.defaultBanner.ctaUrl;
        chrome.tabs.create({ url });
      });
    }

    const brandLink = document.getElementById('brand-byline-link');
    if (brandLink) {
      brandLink.href = POPUP_CONFIG.brandUrl;
      brandLink.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: POPUP_CONFIG.brandUrl });
      });
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  async function init() {
    await loadSettings();
    isActive = await queryActiveFromActiveTab();
    updateActiveUI();
    renderUiBlocks();
    renderMenuItems();
    bindActiveToggle();
    bindBadgeCheckbox();
    bindReorganizeToggle();
    bindTabs();
    bindExternalLinks();
    loadBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
