// BeautifyAds Content Script v1.0.6
// New: "Insights" is a master toggle covering search-terms-insights + AI suggestions + theme cards + wide-recommendation cards.

(function() {
  'use strict';

  // ==========================================
  // CONFIG
  // ==========================================

  const CONFIG = {
    optionalMenuItems: [
      'brand-report',
      'shops',
      'campaign-groups',
      'performance-planner',
      'reach-planner',
      'app-advertising-hub',
      'youtube-creator-partnerships',
      'content-suitability',
      'policy-manager',
      'ad-preview-diagnosis'
    ],

    // v1.0.6 — restructured UI blocks
    uiBlocks: [
      'recommendations',     // header-card on Campaigns chart row
      'insights',            // master: search-terms-insights + AI suggestions + theme-card + wide-recommendation-card
      'ai-max-section'       // .search-max in Campaign settings
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
    }
  };

  // ==========================================
  // MENU RESTRUCTURING SPEC
  // Each move: source item ID → destination section ID, position within destination
  // ==========================================

  const MENU_MOVES = [
    {
      // Keywords: from audiences → campaigns, after Ad groups
      sourceId: 'navigation.campaigns.audiences.searchKeywords',
      destSectionId: 'navigation.campaigns.campaigns',
      targetPosition: 2,  // after campaigns(0) + adGroups(1)
      sourceSectionId: 'navigation.campaigns.audiences'
    },
    {
      // Search terms: from insightsAndReports → campaigns, after Keywords
      sourceId: 'navigation.campaigns.insightsAndReports.searchTerms.keywords',
      destSectionId: 'navigation.campaigns.campaigns',
      targetPosition: 3,
      sourceSectionId: 'navigation.campaigns.insightsAndReports'
    },
    {
      // Ads: native Campaigns item moved explicitly to position 4 (after Search terms)
      sourceId: 'navigation.campaigns.campaigns.ads',
      destSectionId: 'navigation.campaigns.campaigns',
      targetPosition: 4,
      sourceSectionId: 'navigation.campaigns.campaigns'
    },
    {
      // Assets: from assets → campaigns, after Ads
      sourceId: 'navigation.campaigns.assets.assets',
      destSectionId: 'navigation.campaigns.campaigns',
      targetPosition: 5,
      sourceSectionId: 'navigation.campaigns.assets'
    },
    {
      // Videos: from assets → campaigns, after Assets
      sourceId: 'navigation.campaigns.assets.videos',
      destSectionId: 'navigation.campaigns.campaigns',
      targetPosition: 6,
      sourceSectionId: 'navigation.campaigns.assets'
    }
  ];

  // Sections to swap (in pairs) — swap insightsAndReports with campaigns
  // After moves, Campaigns should come BEFORE Insights and reports
  const SECTION_SWAP = {
    earlierSectionId: 'navigation.campaigns.campaigns',     // should appear first
    laterSectionId: 'navigation.campaigns.insightsAndReports'  // should appear second
  };

  // After moves, hide the now-empty Assets parent header
  const ASSETS_PARENT_ID = 'navigation.campaigns.assets';

  // ==========================================
  // STATE
  // ==========================================

  let settings = null;
  // Bug #2 fix: persist Active OFF across reloads within the same browser session.
  // sessionStorage clears when the browser is fully closed (not on reload).
  const ACTIVE_SESSION_KEY = 'beautifyads_active';
  let isActive = (() => {
    try {
      const stored = sessionStorage.getItem(ACTIVE_SESSION_KEY);
      return stored === null ? true : stored === '1';
    } catch (e) {
      return true;
    }
  })();
  let badgeElement = null;
  let lastUrl = location.href;
  let recommendationsHideAttempted = false;

  // ==========================================
  // SETTINGS
  // ==========================================

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get('beautifyads_settings', (result) => {
        if (result.beautifyads_settings) {
          settings = mergeWithDefaults(result.beautifyads_settings);
        } else {
          settings = JSON.parse(JSON.stringify(CONFIG.defaults));
        }
        resolve(settings);
      });
    });
  }

  function mergeWithDefaults(stored) {
    const merged = JSON.parse(JSON.stringify(CONFIG.defaults));

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

  // ==========================================
  // ROOT ATTRIBUTES
  // ==========================================

  function syncRootAttributes() {
    const html = document.documentElement;
    if (!html) return;

    html.setAttribute('data-ba-active', isActive ? '1' : '0');

    if (!settings) return;

    CONFIG.uiBlocks.forEach((blockId) => {
      const shouldHide = settings.uiBlocksHidden[blockId] === true;
      const attr = 'data-ba-hide-' + blockId;
      if (shouldHide) html.setAttribute(attr, '1');
      else html.removeAttribute(attr);
    });

    CONFIG.optionalMenuItems.forEach((itemId) => {
      const isVisible = settings.optionalMenuItemsVisible[itemId] === true;
      const attr = 'data-ba-hide-menu-' + itemId;
      if (!isVisible) html.setAttribute(attr, '1');
      else html.removeAttribute(attr);
    });
  }

  // ==========================================
  // RECOMMENDATIONS — Click native "Hide all"
  // ==========================================

  function tryHideAllRecommendations() {
    if (!isActive) return;
    if (!settings || !settings.uiBlocksHidden['recommendations']) return;
    if (recommendationsHideAttempted) return;
    if (!location.pathname.includes('/campaigns')) return;

    const buttons = document.querySelectorAll('button, [role="button"]');

    for (const btn of buttons) {
      const text = (btn.textContent || '').trim().toLowerCase();
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();

      if (text === 'hide all' || text === 'dismiss all' || text === 'hide') {
        if (isInsideRecommendationBanner(btn)) {
          btn.click();
          recommendationsHideAttempted = true;
          setTimeout(() => { recommendationsHideAttempted = false; }, 5000);
          return;
        }
      }

      if (
        (aria === 'close' || aria === 'dismiss' || aria.includes('close recommendation') || aria.includes('dismiss recommendation')) &&
        isInsideRecommendationBanner(btn)
      ) {
        btn.click();
        recommendationsHideAttempted = true;
        setTimeout(() => { recommendationsHideAttempted = false; }, 5000);
        return;
      }
    }
  }

  function isInsideRecommendationBanner(element) {
    let current = element;
    let depth = 0;
    while (current && depth < 8) {
      const tag = current.tagName ? current.tagName.toLowerCase() : '';
      const className = (typeof current.className === 'string') ? current.className.toLowerCase() : '';
      const dataComp = ((current.getAttribute && current.getAttribute('data-component-name')) || '').toLowerCase();

      if (
        tag === 'header-card' ||
        tag.includes('recommendation') ||
        (className.includes('recommendation') && !className.includes('text')) ||
        dataComp.includes('recommendation')
      ) {
        return true;
      }
      current = current.parentElement;
      depth++;
    }
    return false;
  }

  // ==========================================
  // INSIGHTS — text-based hiding for Search terms insights card
  // ==========================================

  function applyInsightsTextBasedHiding() {
    if (!isActive) {
      document.querySelectorAll('[data-beautifyads-hidden]').forEach((el) => {
        el.removeAttribute('data-beautifyads-hidden');
        el.style.removeProperty('display');
      });
      return;
    }

    if (!settings || !settings.uiBlocksHidden['insights']) {
      document.querySelectorAll('[data-beautifyads-hidden="insights"]').forEach((el) => {
        el.removeAttribute('data-beautifyads-hidden');
        el.style.removeProperty('display');
      });
      return;
    }

    // Search terms insights onboarding card (only on /keywords/searchterms)
    if (location.pathname.includes('/keywords/searchterms')) {
      const TARGET = 'Use the search terms report to see what people searched';
      const els = findElementsContainingText(TARGET);

      els.forEach((textParent) => {
        let current = textParent;
        let depth = 0;
        while (current && current !== document.body && depth < 4) {
          const tag = current.tagName ? current.tagName.toLowerCase() : '';
          const className = (typeof current.className === 'string') ? current.className.toLowerCase() : '';

          if (current.getBoundingClientRect) {
            const rect = current.getBoundingClientRect();
            if (rect.height > 300 || rect.width > window.innerWidth * 0.95) break;
          }

          if (
            tag.includes('card') ||
            tag.includes('onboarding') ||
            className.includes('onboarding-card') ||
            className.includes('insights-card') ||
            className.includes('promo-card')
          ) {
            current.setAttribute('data-beautifyads-hidden', 'insights');
            current.style.setProperty('display', 'none', 'important');
            break;
          }

          current = current.parentElement;
          depth++;
        }
      });
    }
  }

  function findElementsContainingText(targetText) {
    if (!document.body) return [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (node.nodeValue && node.nodeValue.includes(targetText)) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    const results = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement) results.push(node.parentElement);
    }
    return results;
  }

  // ==========================================
  // INSIGHTS — click native "Hide for now" / "Hide" buttons on insight blocks
  // ==========================================

  function tryDismissInsightBlocks() {
    if (!isActive) return;
    if (!settings || !settings.uiBlocksHidden['insights']) return;

    const buttons = document.querySelectorAll('button, [role="button"], a');

    for (const btn of buttons) {
      const text = (btn.textContent || '').trim().toLowerCase();
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();

      // "Hide for now" link on Search terms insights
      if (text === 'hide for now' && isInsideInsightBlock(btn)) {
        btn.click();
        return;
      }

      // "Hide" or close button on AI dialog / theme cards
      if ((text === 'hide' || aria.includes('hide') || aria.includes('dismiss') || aria.includes('close')) && isInsideInsightBlock(btn)) {
        btn.click();
        return;
      }
    }
  }

  function isInsideInsightBlock(element) {
    let current = element;
    let depth = 0;
    while (current && depth < 8) {
      const tag = current.tagName ? current.tagName.toLowerCase() : '';
      const className = (typeof current.className === 'string') ? current.className.toLowerCase() : '';
      const dataComp = ((current.getAttribute && current.getAttribute('data-component-name')) || '').toLowerCase();

      if (
        tag === 'ai-dialog-portal' ||
        tag === 'ai-dialog-portal-host' ||
        tag === 'theme-card' ||
        tag === 'wide-recommendation-card' ||
        tag === 'wide-recommendation-card-chart-topper' ||
        tag === 'search-terms-onboarding-card' ||
        className.includes('ai-dialog') ||
        className.includes('theme-card') ||
        className.includes('wide-recommendation-card') ||
        className.includes('onboarding-card') ||
        dataComp.includes('search-terms-onboarding') ||
        dataComp.includes('search-terms-insights')
      ) {
        return true;
      }
      current = current.parentElement;
      depth++;
    }
    return false;
  }

  // ==========================================
  // KEYBOARD SHORTCUT: G then L → Search Terms
  // ==========================================

  let keyboardState = { waitingForSecondKey: false, timer: null };

  function setupKeyboardShortcut() {
    document.addEventListener('keydown', handleKeyDown, true);
  }

  function handleKeyDown(event) {
    if (!isActive) return;
    if (!settings || !settings.keyboardShortcutEnabled) return;
    if (isTypingInInputField(event.target)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key.toLowerCase();

    if (keyboardState.waitingForSecondKey) {
      clearTimeout(keyboardState.timer);
      keyboardState.waitingForSecondKey = false;

      if (key === 'l') {
        event.preventDefault();
        event.stopPropagation();
        navigateToSearchTermsFast();
      }
    } else if (key === 'g') {
      keyboardState.waitingForSecondKey = true;
      keyboardState.timer = setTimeout(() => {
        keyboardState.waitingForSecondKey = false;
      }, 1500);
    }
  }

  function isTypingInInputField(target) {
    if (!target) return false;
    const tag = target.tagName ? target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (target.isContentEditable) return true;
    if (target.getAttribute && target.getAttribute('contenteditable') === 'true') return true;
    if (target.getAttribute && target.getAttribute('role') === 'textbox') return true;
    return false;
  }

  function navigateToSearchTermsFast() {
    showQuickNotification('G L: go to Search terms');

    // If reorganization is on, the original Search terms is hidden and clicking it
    // wouldn't behave normally. Skip directly to the clone or pushState.
    const reorgActive = settings && settings.menuReorganizeEnabled && isActive;

    if (reorgActive) {
      // Try clicking our clone first (it has our pushState handler)
      const clone = document.querySelector(
        '#beautifyads-cloned-children sidebar-panel a[title="Search terms"]'
      );
      if (clone) {
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true,
          button: 0
        });
        clone.dispatchEvent(clickEvent);
        scheduleLeftMenuClose();
        return;
      }
      // Fallback: direct pushState
      pushStateToSearchTerms();
      return;
    }

    // Reorganization not active — use the original Angular link approach (fast path)
    const linkSelectors = [
      'sidebar-panel[id$=".searchTerms.keywords"] a[href]',
      'sidebar-panel[id*=".searchTerms"] a[href]',
      'sidebar-panel a[title="Search terms"]'
    ];

    let link = null;
    for (const sel of linkSelectors) {
      link = document.querySelector(sel);
      if (link) break;
    }

    if (link && link.href) {
      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
        button: 0
      });
      link.dispatchEvent(clickEvent);
      scheduleLeftMenuClose();
      return;
    }

    pushStateToSearchTerms();
  }

  function pushStateToSearchTerms() {
    const currentUrl = new URL(location.href);
    const newUrl = new URL('https://ads.google.com/aw/keywords/searchterms');
    currentUrl.searchParams.forEach((value, key) => {
      newUrl.searchParams.set(key, value);
    });

    const newPath = newUrl.pathname + newUrl.search;
    history.pushState({}, '', newPath);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));

    scheduleLeftMenuClose();
  }

  function scheduleLeftMenuClose() {
    if (!settings || !settings.autoCloseLeftMenu) return;

    let attempts = 0;
    const maxAttempts = 8;
    const interval = setInterval(() => {
      attempts++;
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        return;
      }
      const closed = closeLeftMenuIfOpen();
      if (closed) clearInterval(interval);
    }, 250);
  }

  function closeLeftMenuIfOpen() {
    const togglers = document.querySelectorAll(
      'button[aria-label*="menu" i], ' +
      'button[aria-label="Hide navigation menu"], ' +
      'button[aria-label="Hide left navigation"], ' +
      'material-icon[aria-label*="menu" i]'
    );

    for (const toggle of togglers) {
      const aria = (toggle.getAttribute('aria-label') || '').toLowerCase();
      const expanded = toggle.getAttribute('aria-expanded');

      if (aria.includes('hide') || aria.includes('close') || expanded === 'true') {
        toggle.click();
        return true;
      }
    }
    return false;
  }

  function showQuickNotification(text) {
    const existing = document.querySelector('.beautifyads-notification');
    if (existing) existing.remove();

    const notif = document.createElement('div');
    notif.className = 'beautifyads-notification';
    notif.textContent = text;
    document.body.appendChild(notif);

    setTimeout(() => {
      notif.classList.add('beautifyads-notification-out');
      setTimeout(() => notif.remove(), 300);
    }, 1500);
  }

  // ==========================================
  // MENU REORGANIZATION ENGINE
  // ==========================================

  // Session flag — animation plays once per browser session
  const SESSION_KEY = 'beautifyads_session_v110';
  let reorgState = {
    initialAttempt: false,    // have we tried the initial restructure?
    appliedOnce: false,       // have we successfully moved at least once?
    animationPlayed: false    // animation done this session?
  };

  function hasPlayedAnimationThisSession() {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function markAnimationPlayed() {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch (e) {
      // ignore
    }
  }

  function esc(id) {
    // CSS.escape for ID selectors with dots
    if (window.CSS && CSS.escape) return CSS.escape(id);
    return id.replace(/\./g, '\\.');
  }

  /**
   * Locate the sidebar menu container, waiting if not yet present.
   * Returns Promise that resolves with the container element.
   */
  function waitForMenuContainer(timeoutMs = 10000) {
    return new Promise((resolve) => {
      const existing = document.querySelector('.sidebar-menu-container');
      if (existing) {
        resolve(existing);
        return;
      }

      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        const found = document.querySelector('.sidebar-menu-container');
        if (found) {
          clearInterval(checkInterval);
          resolve(found);
          return;
        }
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 200);
    });
  }

  /**
   * Wait until the menu has at least N top-level sidebar-panel children loaded.
   * Helps avoid acting on a half-rendered menu.
   */
  function waitForMenuReady(timeoutMs = 8000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const check = () => {
        const container = document.querySelector('.sidebar-menu-container .sidebar-section');
        if (container) {
          const panels = container.querySelectorAll(':scope > sidebar-panel');
          // Need at least 5 top-level panels (overview, recommendations, insights, campaigns, assets...)
          if (panels.length >= 5) {
            resolve(container);
            return;
          }
        }
        if (Date.now() - startTime > timeoutMs) {
          resolve(container || null);
          return;
        }
        setTimeout(check, 200);
      };
      check();
    });
  }

  /**
   * Find a sidebar-panel by its ID (escaping dots).
   */
  function findPanel(id) {
    return document.querySelector('sidebar-panel#' + esc(id));
  }

  /**
   * Get the content-container that holds children of a parent section.
   * In the DOM, this container is the immediate sibling AFTER the section's sidebar-panel header.
   */
  function getChildrenContainer(sectionId) {
    const header = findPanel(sectionId);
    if (!header) return null;
    let next = header.nextElementSibling;
    // skip text/comment nodes
    while (next && next.nodeType !== 1) {
      next = next.nextElementSibling;
    }
    if (next && next.classList && next.classList.contains('content-container')) {
      return next;
    }
    return null;
  }

  /**
   * Click a section header to expand it. Returns true if click was issued.
   */
  function expandSection(sectionId) {
    const header = findPanel(sectionId);
    if (!header) return false;
    const link = header.querySelector('a[role="menuitem"]');
    if (!link) return false;

    // Already expanded? skip
    if (link.getAttribute('aria-expanded') === 'true') return true;

    // Click via synthetic event so Angular handles it
    const clickEvent = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
      button: 0
    });
    link.dispatchEvent(clickEvent);
    return true;
  }

  /**
   * Collapse a section header.
   */
  function collapseSection(sectionId) {
    const header = findPanel(sectionId);
    if (!header) return;
    const link = header.querySelector('a[role="menuitem"]');
    if (!link) return;
    if (link.getAttribute('aria-expanded') !== 'true') return;
    const clickEvent = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
      button: 0
    });
    link.dispatchEvent(clickEvent);
  }

  /**
   * v1.1.1 — CLONE-BASED ARCHITECTURE
   *
   * Instead of physically moving items (which Angular undoes on re-render),
   * we:
   *   1. Find the original <sidebar-panel> in its native section
   *   2. Hide it via a CSS marker attribute
   *   3. Clone it (deep clone) and inject the clone into the destination
   *   4. Strip Angular-managed attributes so clones are static
   *   5. Use CSS Flex order to reorder top-level sections
   *
   * Clones are inert in Angular's eyes. They have working <a href>, so clicks navigate normally.
   * URL-based highlighting handles the "selected" state since Angular won't.
   */

  // Wrap the destination children in a special container we control
  // so Angular doesn't decide to nuke our clones.
  const BA_CLONE_CONTAINER_ID = 'beautifyads-cloned-children';
  const BA_CLONE_ATTR = 'data-beautifyads-clone';
  const BA_HIDE_ORIGINAL_ATTR = 'data-beautifyads-hide-original';

  /**
   * Ensure a dedicated container exists for our clones inside the Campaigns section's children.
   * Returns the container element.
   */
  function ensureCloneContainer() {
    const campaignsChildren = getChildrenContainer(SECTION_SWAP.earlierSectionId);
    if (!campaignsChildren) return null;

    let cloneContainer = campaignsChildren.querySelector(':scope > #' + BA_CLONE_CONTAINER_ID);
    if (cloneContainer) return cloneContainer;

    cloneContainer = document.createElement('div');
    cloneContainer.id = BA_CLONE_CONTAINER_ID;
    cloneContainer.style.display = 'contents'; // Doesn't affect layout, just groups children

    // Insert at position 2 within Campaigns children (after campaigns(0), adGroups(1))
    const children = campaignsChildren.querySelectorAll(':scope > sidebar-panel');
    const insertBeforeIndex = 2;
    if (children.length > insertBeforeIndex) {
      campaignsChildren.insertBefore(cloneContainer, children[insertBeforeIndex]);
    } else {
      campaignsChildren.appendChild(cloneContainer);
    }
    return cloneContainer;
  }

  /**
   * Strip Angular-managed attributes from a clone so Angular doesn't try to manage it.
   * Returns the cleaned clone.
   */
  function sanitizeClone(node, sourceId) {
    // Remove all Angular content/host attributes (`_ngcontent-*`, `_nghost-*`)
    function cleanAttrs(el) {
      if (!el.attributes) return;
      const toRemove = [];
      for (const attr of el.attributes) {
        if (attr.name.startsWith('_ngcontent-') || attr.name.startsWith('_nghost-')) {
          toRemove.push(attr.name);
        }
      }
      toRemove.forEach((name) => el.removeAttribute(name));
    }
    // Walk the entire tree
    function walk(el) {
      cleanAttrs(el);
      for (const child of el.children) walk(child);
    }
    walk(node);

    // Mark as clone for our tracking
    node.setAttribute(BA_CLONE_ATTR, sourceId);
    // Give the clone a unique ID so it doesn't conflict with the (hidden) original
    node.id = 'ba-clone-' + sourceId.replace(/\./g, '_');

    // Remove any "selected" classes from the title-wrapper (we'll re-add based on URL)
    const titleWrappers = node.querySelectorAll('.title-wrapper');
    titleWrappers.forEach((tw) => {
      tw.classList.remove('selected', 'selected-parent');
    });

    // Make sure the clone's <a> still has a proper tabindex
    const link = node.querySelector('a[href]');
    if (link) {
      link.setAttribute('tabindex', '0');

      // CRITICAL: intercept clicks on clones to use Angular Router (pushState)
      // instead of triggering full page reload via default <a> behaviour.
      link.addEventListener('click', handleCloneClick, true);
    }
    return node;
  }

  /**
   * Click handler for clone <a> elements. Prevents default browser navigation,
   * uses history.pushState to update the URL, and fires popstate so Angular
   * Router picks up the change. Mimics what Angular does internally for the originals.
   */
  function handleCloneClick(event) {
    // Allow modifier keys to do their default (open in new tab/window)
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;

    const link = event.currentTarget;
    const href = link.getAttribute('href');
    if (!href) return;

    event.preventDefault();
    event.stopPropagation();

    // Bug #3 fix: clear highlight immediately so there's no visual lag
    // while Angular processes the navigation.
    updateCloneHighlight();

    // Resolve the href to a full URL
    let newUrl;
    try {
      newUrl = new URL(href, location.origin);
    } catch (e) {
      return;
    }

    const newPath = newUrl.pathname + newUrl.search;
    history.pushState({}, '', newPath);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));

    // Update highlight after navigation kicks in
    setTimeout(() => updateCloneHighlight(), 100);
  }

  /**
   * For a single move spec, find the original item, hide it, clone it into Campaigns.
   */
  function processMove(move) {
    const original = findPanel(move.sourceId);
    if (!original) return false;

    // Mark original as hidden (CSS will display:none it)
    original.setAttribute(BA_HIDE_ORIGINAL_ATTR, '1');

    // Check if a clone already exists in our clone container
    const cloneContainer = ensureCloneContainer();
    if (!cloneContainer) return false;

    const existingClone = cloneContainer.querySelector(
      `[${BA_CLONE_ATTR}="${move.sourceId}"]`
    );
    if (existingClone) {
      // Bug #4 fix: verify the clone is still connected to the live DOM.
      // Angular can detach nodes without triggering a removal observable on our container.
      if (existingClone.isConnected) {
        // Already cloned and present — just ensure correct position
        return true;
      } else {
        // Clone was detached — remove the stale reference and re-clone below
        console.debug('[BeautifyAds] Clone detached, re-creating:', move.sourceId);
        existingClone.remove();
      }
    }

    // Deep-clone the original (with all children)
    const clone = original.cloneNode(true);
    // Important: remove the hide-original marker from the clone (we want clone visible)
    clone.removeAttribute(BA_HIDE_ORIGINAL_ATTR);

    sanitizeClone(clone, move.sourceId);

    // Insert clone at the right position within the clone container
    const existingClones = cloneContainer.querySelectorAll(':scope > sidebar-panel');
    // Position within the clone container = move.targetPosition - 2 (we start at offset 2)
    const relativePosition = move.targetPosition - 2;

    if (relativePosition >= existingClones.length || relativePosition < 0) {
      cloneContainer.appendChild(clone);
    } else {
      cloneContainer.insertBefore(clone, existingClones[relativePosition]);
    }

    return true;
  }

  /**
   * Run all moves: hide originals + create clones.
   */
  function processAllMoves() {
    let count = 0;
    MENU_MOVES.forEach((move) => {
      if (processMove(move)) count++;
    });
    return count;
  }

  /**
   * Apply CSS flex order to enforce the desired top-level section order:
   *   Overview, Recommendations, Campaigns, Insights and reports, Audiences, Change history
   *
   * We set explicit order on every top-level section we know about. Sections we don't know
   * about keep order 0 — but that's fine because Overview is order 1 (so unknowns appear first
   * which matches default DOM order at the top).
   *
   * Actually safer: set Overview to order 10 so unknown sections appear AFTER all known ones
   * in their original DOM order.
   */
  function applySectionOrder() {
    const sectionOrder = [
      { id: 'navigation.campaigns.overview',           orderHeader: 10, orderContainer: 11 },
      { id: 'navigation.campaigns.recommendations',    orderHeader: 20, orderContainer: 21 },
      { id: 'navigation.campaigns.campaigns',          orderHeader: 30, orderContainer: 31 },
      { id: 'navigation.campaigns.insightsAndReports', orderHeader: 40, orderContainer: 41 },
      { id: 'navigation.campaigns.assets',             orderHeader: 50, orderContainer: 51 },
      { id: 'navigation.campaigns.audiences',          orderHeader: 60, orderContainer: 61 },
      { id: 'navigation.campaigns.changeHistory',      orderHeader: 70, orderContainer: 71 }
    ];

    // First section we find gives us the parent
    let parent = null;
    for (const sec of sectionOrder) {
      const header = findPanel(sec.id);
      if (header && header.parentNode) {
        parent = header.parentNode;
        break;
      }
    }
    if (!parent) return;

    // Make parent a flex column so 'order' applies
    parent.style.display = 'flex';
    parent.style.flexDirection = 'column';

    sectionOrder.forEach((sec) => {
      const header = findPanel(sec.id);
      if (header) header.style.order = String(sec.orderHeader);
      const container = getChildrenContainer(sec.id);
      if (container) container.style.order = String(sec.orderContainer);
    });
  }

  /**
   * Remove CSS flex order applied for section ordering.
   */
  function clearSectionOrder() {
    const idsToReset = [
      'navigation.campaigns.overview',
      'navigation.campaigns.recommendations',
      'navigation.campaigns.campaigns',
      'navigation.campaigns.insightsAndReports',
      'navigation.campaigns.assets',
      'navigation.campaigns.audiences',
      'navigation.campaigns.changeHistory'
    ];

    let parent = null;
    idsToReset.forEach((id) => {
      const header = findPanel(id);
      if (header) {
        if (!parent) parent = header.parentNode;
        header.style.removeProperty('order');
        const container = getChildrenContainer(id);
        if (container) container.style.removeProperty('order');
      }
    });

    if (parent) {
      parent.style.removeProperty('display');
      parent.style.removeProperty('flex-direction');
    }
  }

  /**
   * Hide the Assets parent header (and its container).
   * After moves, Assets has no children visible (its real children are hidden as originals).
   */
  function hideAssetsParent() {
    const assetsPanel = findPanel(ASSETS_PARENT_ID);
    if (!assetsPanel) return;
    assetsPanel.style.setProperty('display', 'none', 'important');
    assetsPanel.setAttribute('data-beautifyads-empty', '1');
    const container = getChildrenContainer(ASSETS_PARENT_ID);
    if (container) {
      container.style.setProperty('display', 'none', 'important');
    }
  }

  function unhideAssetsParent() {
    const assetsPanel = findPanel(ASSETS_PARENT_ID);
    if (assetsPanel) {
      assetsPanel.style.removeProperty('display');
      assetsPanel.removeAttribute('data-beautifyads-empty');
    }
    const container = getChildrenContainer(ASSETS_PARENT_ID);
    if (container) {
      container.style.removeProperty('display');
    }
  }

  /**
   * Update which clone gets the 'selected' highlight based on current URL.
   * Compares URL.pathname against each clone's href pathname.
   */
  function updateCloneHighlight() {
    const cloneContainer = document.querySelector('#' + BA_CLONE_CONTAINER_ID);
    if (!cloneContainer) return;

    const currentPath = location.pathname;

    cloneContainer.querySelectorAll(':scope > sidebar-panel').forEach((clone) => {
      const link = clone.querySelector('a[href]');
      const titleWrapper = clone.querySelector('.title-wrapper');
      if (!link || !titleWrapper) return;

      let cloneHrefPath = '';
      try {
        cloneHrefPath = new URL(link.href).pathname;
      } catch (e) {
        cloneHrefPath = link.getAttribute('href') || '';
        // Strip query/hash
        cloneHrefPath = cloneHrefPath.split('?')[0].split('#')[0];
      }

      if (currentPath === cloneHrefPath) {
        titleWrapper.classList.add('selected');
      } else {
        titleWrapper.classList.remove('selected');
      }
    });
  }

  /**
   * The full reorganization sequence.
   * Includes force-expand + animation orchestration.
   */
  async function runReorganization() {
    if (!settings || !settings.menuReorganizeEnabled) return;
    if (!isActive) return;
    if (reorgState.initialAttempt) return;
    reorgState.initialAttempt = true;

    const menuContainer = await waitForMenuContainer(10000);
    if (!menuContainer) {
      reorgState.initialAttempt = false;
      return;
    }

    const sidebarSection = await waitForMenuReady(8000);
    if (!sidebarSection) {
      reorgState.initialAttempt = false;
      return;
    }

    const shouldAnimate = !hasPlayedAnimationThisSession();

    let overlay = null;
    let label = null;
    if (shouldAnimate) {
      overlay = createOverlay(sidebarSection);
      label = createLabel(sidebarSection, 'Restructuring your menu...');
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      overlay.classList.add('beautifyads-overlay-visible');
      overlay.classList.add('beautifyads-overlay-drawing');
      label.classList.add('beautifyads-label-visible');
    }

    // Force-expand source sections so Angular renders their children in the DOM,
    // making them available to clone.
    const sourcesToExpand = new Set();
    MENU_MOVES.forEach((m) => sourcesToExpand.add(m.sourceSectionId));
    sourcesToExpand.forEach((sectionId) => {
      const header = findPanel(sectionId);
      if (header) {
        const link = header.querySelector('a[role="menuitem"]');
        if (link && link.getAttribute('aria-expanded') !== 'true') {
          expandSection(sectionId);
        }
      }
    });

    await sleep(500);

    // Ensure Campaigns is expanded so clones are visible
    expandSection(SECTION_SWAP.earlierSectionId);
    await sleep(150);

    // Clone-based moves
    processAllMoves();
    applySectionOrder();
    hideAssetsParent();
    updateCloneHighlight();

    // Collapse the source sections (except destination Campaigns)
    sourcesToExpand.forEach((sectionId) => {
      if (sectionId !== SECTION_SWAP.earlierSectionId) {
        collapseSection(sectionId);
      }
    });

    if (shouldAnimate && overlay && label) {
      await sleep(700);
      overlay.classList.remove('beautifyads-overlay-drawing');
      overlay.classList.add('beautifyads-overlay-pulse');
      await sleep(500);

      label.classList.remove('beautifyads-label-visible');
      overlay.classList.remove('beautifyads-overlay-visible');
      overlay.classList.remove('beautifyads-overlay-pulse');
      await sleep(350);
      overlay.remove();
      label.remove();
      markAnimationPlayed();
    }

    reorgState.appliedOnce = true;

    // Set up the fast menu observer so future Angular re-renders (e.g. expand/collapse)
    // get caught with low latency.
    setupMenuObserver();
  }

  function createOverlay(targetElement) {
    const overlay = document.createElement('div');
    overlay.id = 'beautifyads-menu-overlay';

    const rect = targetElement.getBoundingClientRect();
    const scrollY = window.scrollY || 0;
    const scrollX = window.scrollX || 0;

    overlay.style.top = (rect.top + scrollY - 2) + 'px';
    overlay.style.left = (rect.left + scrollX - 2) + 'px';
    overlay.style.width = (rect.width + 4) + 'px';
    overlay.style.height = (rect.height + 4) + 'px';

    document.body.appendChild(overlay);
    return overlay;
  }

  function createLabel(targetElement, text) {
    const label = document.createElement('div');
    label.id = 'beautifyads-menu-label';
    label.textContent = text;

    const rect = targetElement.getBoundingClientRect();
    const scrollY = window.scrollY || 0;
    const scrollX = window.scrollX || 0;

    label.style.top = (rect.top + scrollY + 16) + 'px';
    label.style.left = (rect.left + scrollX + rect.width / 2) + 'px';
    label.style.transform = 'translateX(-50%) translateY(-6px)';

    document.body.appendChild(label);
    return label;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Re-apply moves quietly when Angular re-renders the menu.
   * No animation. Re-processes everything in case Angular reset our changes.
   */
  function reapplyMovesQuietly() {
    if (!settings || !settings.menuReorganizeEnabled) return;
    if (!isActive) return;
    if (!reorgState.appliedOnce) return;

    // Re-process: Angular may have re-rendered originals (unmarking them) or removed our clones.
    // Re-hide originals + re-clone if missing + re-apply order.
    processAllMoves();
    applySectionOrder();
    hideAssetsParent();
    updateCloneHighlight();
  }

  /**
   * Disable reorganization — unhide originals, remove clones, clear CSS order.
   */
  function disableReorganization() {
    // Disconnect the fast menu observer so it doesn't keep firing while we tear down
    if (menuObserver) {
      menuObserver.disconnect();
      menuObserver = null;
    }
    // Remove the hide-original markers from any tagged sidebar-panels
    document.querySelectorAll('[' + BA_HIDE_ORIGINAL_ATTR + ']').forEach((el) => {
      el.removeAttribute(BA_HIDE_ORIGINAL_ATTR);
    });
    // Remove clone container
    const cloneContainer = document.querySelector('#' + BA_CLONE_CONTAINER_ID);
    if (cloneContainer) cloneContainer.remove();
    // Clear section order CSS
    clearSectionOrder();
    // Unhide Assets parent
    unhideAssetsParent();

    reorgState.initialAttempt = false;
    reorgState.appliedOnce = false;
  }

  // ==========================================
  // STATUS BADGE
  // ==========================================

  function syncStatusBadge() {
    const shouldShow = isActive && settings && settings.statusBadgeEnabled;

    if (!shouldShow) {
      removeStatusBadge();
      return;
    }

    if (badgeElement && document.body.contains(badgeElement)) return;

    badgeElement = document.createElement('div');
    badgeElement.id = 'beautifyads-status-badge';
    badgeElement.innerHTML = `
      <span class="beautifyads-badge-mark"></span>
      <span class="beautifyads-badge-text">BeautifyAds</span>
    `;
    badgeElement.title = 'BeautifyAds is active';

    badgeElement.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showQuickNotification('Click the BeautifyAds icon in Extensions to configure');
    });

    document.body.appendChild(badgeElement);
  }

  function removeStatusBadge() {
    if (badgeElement) {
      badgeElement.remove();
      badgeElement = null;
    }
  }

  // ==========================================
  // FLYOUT REORGANIZATION
  // ==========================================
  //
  // The flyout (nav.material-sidebar.flyout) is Angular's hover-panel –
  // a fully separate DOM tree with the same sidebar-panel IDs as the main menu.
  // It is created fresh on every hover, so we use physical DOM reordering
  // (no clone tracking needed) and run it each time it appears.
  //
  // CSS in injected-styles.css pre-defines section order via flex+order rules
  // and item visibility via the same data-ba-hide-menu-* attributes.
  // JS here handles moving the four items (Keywords, Search terms, Assets, Videos)
  // into the Campaigns children container, matching the main menu structure.

  let flyoutObserverDebounceTimer = null;
  let flyoutObserver = null;

  // Cache of panel HTML keyed by sourceId. Populated whenever we successfully
  // find a source panel in the DOM. Used as a fallback for the flyout clone
  // factory when neither the main menu nor the expanded section is available
  // (e.g. when the main drawer is collapsed and Insights/Audiences are not
  // expanded in the flyout).
  const flyoutSourceCache = {};

  /**
   * Find a sidebar-panel by ID scoped to the given root element.
   * Falls back to searching by .panel-title text content if the ID isn't found,
   * so we're resilient to Google changing sub-IDs (e.g. for native items like Ads).
   */
  function findFlyoutPanel(root, id, titleFallback) {
    const byId = root.querySelector('sidebar-panel#' + esc(id));
    if (byId) return byId;
    if (titleFallback) {
      const allPanels = root.querySelectorAll('sidebar-panel');
      for (const panel of allPanels) {
        const titleEl = panel.querySelector('.panel-title');
        if (titleEl && titleEl.textContent.trim() === titleFallback) return panel;
      }
    }
    return null;
  }

  /**
   * Get the content-container that holds children of a flyout section.
   *
   * The flyout DOM is flat – all top-level sidebar-panels and their
   * content-containers are direct children of .sidebar-section. Strategy:
   *   1. Find the section header sidebar-panel by ID.
   *   2. Walk nextElementSibling until we find a .content-container.
   *   3. Fallback: search the whole flyout for a content-container whose
   *      first sidebar-panel ID starts with sectionId + "." (catches cases
   *      where Angular inserts extra nodes between header and container).
   */
  function getFlyoutChildrenContainer(root, sectionId) {
    // The flyout can have multiple .content-container.content-indent-level-1
    // elements (one per expanded section: Campaigns, Insights, Audiences, etc).
    // We must identify the one belonging to OUR section by checking its first
    // native child panel's ID prefix.
    const prefix = sectionId + '.';
    const allContainers = root.querySelectorAll('.sidebar-section > .content-container.content-indent-level-1');
    for (const container of allContainers) {
      // Find the first native sidebar-panel (skip our clones)
      const panels = container.querySelectorAll(':scope > sidebar-panel:not([data-ba-flyout-clone])');
      for (const panel of panels) {
        if (panel.id && panel.id.startsWith(prefix)) return container;
      }
    }
    return null;
  }

  /**
   * Apply the same item moves as the main menu, physically reordering DOM nodes
   * in the flyout. Called each time the flyout is freshly rendered by Angular.
   *
   * Final order within Campaigns children:
   *   0: Campaigns       (native)
   *   1: Ad groups       (native)
   *   2: Keywords        (moved from Audiences)
   *   3: Search terms    (moved from Insights and reports)
   *   4: Ads             (native — moved after Search terms)
   *   5: Asset groups    (native)
   *   6: Assets          (moved from Assets section)
   *   7: Videos          (moved from Assets section)
   *   8: Experiments     (native)
   *
   * We build the final order explicitly by appending every item in sequence
   * rather than relying on offset arithmetic, which is fragile when items
   * are missing or the flyout renders in an unexpected shape.
   */
  function reorganizeFlyout(flyoutNav) {
    if (!flyoutNav) return;
    if (!settings || !settings.menuReorganizeEnabled) return;
    if (!isActive) return;
    // No "done" flag — this function is idempotent and safe to call on every
    // mutation. If clones are already in place, the work below is a no-op.

    // APPROACH: native Campaigns children (Campaigns, Ad groups, Ads, Asset groups,
    // Experiments) are reordered purely by CSS flex `order` rules — we never touch
    // them in JS so Angular keeps full event delegation and links stay clickable.
    //
    // We only inject clones for the four items that don't exist in the flyout DOM:
    // Keywords, Search terms, Assets, Videos. These are cloned from the main menu.
    // They are appended into the content-container; CSS order rules place them
    // visually between Ad groups and Ads, and after Asset groups.

    const BA_FLYOUT_CLONE = 'data-ba-flyout-clone';

    const campaignsContainer = getFlyoutChildrenContainer(flyoutNav, 'navigation.campaigns.campaigns');
    if (!campaignsContainer) {
      console.debug('[BeautifyAds] flyout: Campaigns content-container not found');
      return;
    }

    // IDs that need to be cloned from the main menu (not rendered in flyout)
    const injectedIds = [
      'navigation.campaigns.audiences.searchKeywords',
      'navigation.campaigns.insightsAndReports.searchTerms.keywords',
      'navigation.campaigns.assets.assets',
      'navigation.campaigns.assets.videos',
    ];

    // Build or retrieve a flyout clone for a given sourceId.
    // Strategy: prefer a live source (main menu clone → main original → cache),
    // then update the cache so subsequent invocations work even when the source
    // is no longer in the DOM (e.g. main drawer collapsed, Insights/Audiences not expanded).
    function getOrMakeFlyoutClone(sourceId) {
      // Reuse an existing connected clone in this container
      const existing = campaignsContainer.querySelector('[' + BA_FLYOUT_CLONE + '="' + sourceId + '"]');
      if (existing && existing.isConnected) return existing;

      // Find a live source — try main menu clone (has correct href), then original
      const mainClone    = document.querySelector('[data-beautifyads-clone="' + sourceId + '"]');
      const mainOriginal = document.querySelector('sidebar-panel#' + esc(sourceId));
      const liveSource   = mainClone || mainOriginal;

      let fc;
      if (liveSource) {
        // Update cache with the latest version of the source HTML
        flyoutSourceCache[sourceId] = liveSource.outerHTML;
        fc = liveSource.cloneNode(true);
      } else if (flyoutSourceCache[sourceId]) {
        // Fall back to cached HTML — the source isn't currently in the DOM
        const template = document.createElement('template');
        template.innerHTML = flyoutSourceCache[sourceId].trim();
        fc = template.content.firstElementChild;
        if (!fc) {
          console.debug('[BeautifyAds] flyout: cached HTML parse failed for', sourceId);
          return null;
        }
      } else {
        console.debug('[BeautifyAds] flyout: no source or cache for', sourceId);
        return null;
      }

      // Strip Angular scoping attrs so Angular doesn't try to manage this node
      (function clean(el) {
        const toRemove = [];
        for (const attr of (el.attributes || [])) {
          if (attr.name.startsWith('_ngcontent-') || attr.name.startsWith('_nghost-')) toRemove.push(attr.name);
        }
        toRemove.forEach(n => el.removeAttribute(n));
        for (const child of el.children) clean(child);
      })(fc);

      fc.removeAttribute('data-beautifyads-clone');
      fc.removeAttribute('data-beautifyads-hide-original');
      fc.id = 'ba-flyout-' + sourceId.replace(/\./g, '_');
      fc.setAttribute(BA_FLYOUT_CLONE, sourceId);
      fc.querySelectorAll('.title-wrapper').forEach(tw => tw.classList.remove('selected', 'selected-parent'));

      // Attach click handler so links use pushState (same as main menu clones)
      // without this, clicking navigates via <a href> causing a full page reload
      const link = fc.querySelector('a[href]');
      if (link) {
        link.setAttribute('tabindex', '0');
        link.addEventListener('click', handleCloneClick, true);
      }

      return fc;
    }

    // Desired order — native panels found directly in container, injected ones cloned
    // Items we need to inject from the main menu (Keywords, Search terms,
    // Assets, Videos — none of these exist as natives in the flyout Campaigns).
    // CSS rules in injected-styles.css give each one its correct visual `order`,
    // including reordering native items like Ads after Search terms. So we
    // NEVER physically move native panels — that would break Angular's event
    // delegation and make Campaigns child items unclickable.
    const injectIds = [
      'navigation.campaigns.audiences.searchKeywords',
      'navigation.campaigns.insightsAndReports.searchTerms.keywords',
      'navigation.campaigns.assets.assets',
      'navigation.campaigns.assets.videos',
    ];

    for (const sourceId of injectIds) {
      // Skip if already present in this container
      const existing = campaignsContainer.querySelector(
        '[' + BA_FLYOUT_CLONE + '="' + sourceId + '"]'
      );
      if (existing && existing.isConnected) continue;

      const clone = getOrMakeFlyoutClone(sourceId);
      if (clone) campaignsContainer.appendChild(clone);
    }

    // Cleanup: remove any flyout clones that ended up outside the Campaigns container
    // (Angular may have moved or duplicated them during section expand/collapse).
    flyoutNav.querySelectorAll('[' + BA_FLYOUT_CLONE + ']').forEach((cloneEl) => {
      if (!campaignsContainer.contains(cloneEl)) {
        cloneEl.remove();
      }
    });

    // Hide the Assets section header — all its items moved into Campaigns
    const assetsHeader = flyoutNav.querySelector('sidebar-panel#' + esc('navigation.campaigns.assets'));
    if (assetsHeader) assetsHeader.setAttribute('data-ba-flyout-assets-empty', '1');
  }

    // ONE observer watches document.body. Whenever it fires, we check if the
  // flyout exists and if the Campaigns container needs our clones. Idempotent:
  // calling reorganizeFlyout when clones are already in place is a no-op.
  // No inner observer, no done-flag, no disconnect/reconnect dance.

  let flyoutPollInterval = null;

  function setupFlyoutObserver() {
    if (flyoutObserver) return;

    const tick = () => {
      const flyoutNav = document.querySelector('nav.material-sidebar.flyout');
      if (!flyoutNav) {
        // Flyout closed — stop polling
        if (flyoutPollInterval) { clearInterval(flyoutPollInterval); flyoutPollInterval = null; }
        return;
      }
      if (!settings || !settings.menuReorganizeEnabled || !isActive) return;
      reorganizeFlyout(flyoutNav);
    };

    flyoutObserver = new MutationObserver(() => {
      if (flyoutObserverDebounceTimer) clearTimeout(flyoutObserverDebounceTimer);
      flyoutObserverDebounceTimer = setTimeout(() => {
        tick();
        // Start polling while flyout is open — catches missed mutations
        // and recovers from transient states where the container was being rebuilt
        const flyoutOpen = !!document.querySelector('nav.material-sidebar.flyout');
        if (flyoutOpen && !flyoutPollInterval) {
          flyoutPollInterval = setInterval(tick, 250);
        }
      }, 30);
    });

    flyoutObserver.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Tear down flyout observer and remove any flyout markers (called when
   * reorg is disabled or Active is toggled OFF).
   */
  function disableFlyoutReorganization() {
    if (flyoutObserver) { flyoutObserver.disconnect(); flyoutObserver = null; }
    if (flyoutObserverDebounceTimer) { clearTimeout(flyoutObserverDebounceTimer); flyoutObserverDebounceTimer = null; }
    if (flyoutPollInterval) { clearInterval(flyoutPollInterval); flyoutPollInterval = null; }
    // Remove any clones we injected so the flyout returns to Google's defaults
    document.querySelectorAll('[data-ba-flyout-clone]').forEach(el => el.remove());
  }

  // ==========================================
  // OBSERVER
  // ==========================================

  let observerDebounceTimer = null;
  let menuObserverDebounceTimer = null;
  let menuObserver = null;

  function setupMutationObserver() {
    const observer = new MutationObserver(() => {
      if (observerDebounceTimer) clearTimeout(observerDebounceTimer);
      observerDebounceTimer = setTimeout(() => {
        applyAllCustomizations();
        checkUrlChange();
      }, 300);
    });

    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  /**
   * Dedicated fast observer for the left menu — re-applies moves with minimal debounce
   * so collapsing/expanding Campaigns doesn't leave us in a half-rendered state.
   */
  function setupMenuObserver() {
    if (menuObserver) return; // already set up

    const menuContainer = document.querySelector('.sidebar-menu-container');
    if (!menuContainer) return;

    menuObserver = new MutationObserver(() => {
      if (menuObserverDebounceTimer) clearTimeout(menuObserverDebounceTimer);
      menuObserverDebounceTimer = setTimeout(() => {
        // Quickly re-apply moves if reorg is active and clones may have been removed
        if (
          settings &&
          settings.menuReorganizeEnabled &&
          isActive &&
          reorgState.appliedOnce
        ) {
          reapplyMovesQuietly();
          // Bug #4 fix: second pass 200ms later — Angular sometimes does a second render
          // that removes the clone we just re-created in the first pass.
          setTimeout(() => {
            if (settings && settings.menuReorganizeEnabled && isActive && reorgState.appliedOnce) {
              reapplyMovesQuietly();
            }
          }, 200);
        }
      }, 30);
    });

    menuObserver.observe(menuContainer, {
      childList: true,
      subtree: true
    });
  }

  function checkUrlChange() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      recommendationsHideAttempted = false;
      setTimeout(() => {
        applyAllCustomizations();
        if (typeof updateCloneHighlight === 'function') updateCloneHighlight();
      }, 500);
    }
  }

  // ==========================================
  // APPLY ALL
  // ==========================================

  // Warm the flyout source cache: whenever any of the panels we'd need to inject
  // into the flyout exists in the DOM (typically in the main menu after reorg),
  // cache its HTML so it's available even if the user later collapses everything.
  function warmFlyoutSourceCache() {
    const ids = [
      'navigation.campaigns.audiences.searchKeywords',
      'navigation.campaigns.insightsAndReports.searchTerms.keywords',
      'navigation.campaigns.assets.assets',
      'navigation.campaigns.assets.videos',
    ];
    for (const sourceId of ids) {
      // Prefer the main-menu clone (has the correct stable href), then original
      const mainClone    = document.querySelector('[data-beautifyads-clone="' + sourceId + '"]');
      const mainOriginal = document.querySelector('sidebar-panel#' + esc(sourceId));
      const source = mainClone || mainOriginal;
      if (source) flyoutSourceCache[sourceId] = source.outerHTML;
    }
  }

  function applyAllCustomizations() {
    try {
      syncRootAttributes();
      if (isActive) {
        applyInsightsTextBasedHiding();
        tryHideAllRecommendations();
        tryDismissInsightBlocks();
        // Re-apply menu moves quietly if Angular re-rendered
        reapplyMovesQuietly();
        // Keep flyout source cache warm — works on every render cycle so by the
        // time the user hovers the flyout, we have HTML to clone from.
        warmFlyoutSourceCache();
      } else {
        document.querySelectorAll('[data-beautifyads-hidden]').forEach((el) => {
          el.removeAttribute('data-beautifyads-hidden');
          el.style.removeProperty('display');
        });
      }
      syncStatusBadge();
    } catch (e) {
      console.error('BeautifyAds: error applying customizations', e);
    }
  }

  // ==========================================
  // MESSAGES
  // ==========================================

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.beautifyads_settings) {
      const oldSettings = settings;
      settings = mergeWithDefaults(changes.beautifyads_settings.newValue || {});

      const wasReorgEnabled = oldSettings && oldSettings.menuReorganizeEnabled !== false;
      const isReorgEnabled = settings.menuReorganizeEnabled !== false;

      applyAllCustomizations();

      // Toggle reorganization on/off
      if (!wasReorgEnabled && isReorgEnabled) {
        // Just enabled — run it
        reorgState.initialAttempt = false;
        reorgState.appliedOnce = false;
        runReorganization();
        setupFlyoutObserver();
      } else if (wasReorgEnabled && !isReorgEnabled) {
        // Just disabled — reset
        disableReorganization();
        disableFlyoutReorganization();
      }
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'BA_SET_ACTIVE') {
      const wasActive = isActive;
      isActive = message.active === true;
      // Bug #2 fix: write to sessionStorage so reload preserves the OFF state
      try { sessionStorage.setItem(ACTIVE_SESSION_KEY, isActive ? '1' : '0'); } catch (e) {}
      applyAllCustomizations();

      if (!wasActive && isActive && settings && settings.menuReorganizeEnabled) {
        // Just turned ON — re-run reorganization
        reorgState.initialAttempt = false;
        reorgState.appliedOnce = false;
        runReorganization();
        setupFlyoutObserver();
      } else if (wasActive && !isActive) {
        // Just turned OFF — fully tear down reorganization so the menu returns to default
        disableReorganization();
        disableFlyoutReorganization();
      }

      sendResponse({ ok: true, isActive });
    } else if (message && message.type === 'BA_GET_ACTIVE') {
      sendResponse({ isActive });
    }
    return true;
  });

  // ==========================================
  // INIT
  // ==========================================

  async function init() {
    await loadSettings();
    syncRootAttributes();
    setupKeyboardShortcut();
    applyAllCustomizations();
    setupMutationObserver();

    window.addEventListener('popstate', () => {
      setTimeout(() => applyAllCustomizations(), 500);
    });

    // Kick off menu reorganization (waits for menu to be ready)
    if (isActive && settings && settings.menuReorganizeEnabled) {
      runReorganization();
      setupFlyoutObserver();
    }
  }

  if (document.documentElement) {
    document.documentElement.setAttribute('data-ba-active', '1');
    Object.keys(CONFIG.defaults.uiBlocksHidden).forEach((id) => {
      if (CONFIG.defaults.uiBlocksHidden[id]) {
        document.documentElement.setAttribute('data-ba-hide-' + id, '1');
      }
    });
    CONFIG.optionalMenuItems.forEach((id) => {
      if (CONFIG.defaults.optionalMenuItemsVisible[id] === false) {
        document.documentElement.setAttribute('data-ba-hide-menu-' + id, '1');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
