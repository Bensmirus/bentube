// ==UserScript==
// @name         BenTube - Add to Groups
// @namespace    https://ben-tube.com
// @version      5.1.0
// @description  Add YouTube channels to your BenTube groups directly from YouTube
// @author       BenTube
// @match        https://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @noframes
// @connect      ben-tube.com
// @run-at       document-end
// ==/UserScript==

(function() {
  'use strict';

  // ============================================
  // Configuration
  // ============================================

  const CONFIG = {
    serverUrl: 'https://ben-tube.com',
    storageKey: 'bentube_api_key',
    retryAttempts: 20,
    retryDelay: 300,
    requestTimeout: 15000,
    buttonSize: 40,
    popupWidth: 300,
    popupMaxHeight: 350,
    urlCheckDebounce: 100,
    navigationDelay: 500,
    successMessageDelay: 1500
  };

  // ============================================
  // Styles (injected into Shadow DOM)
  // ============================================

  const STYLES = `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    .bentube-button {
      position: fixed;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #B8860B, #8B6914);
      color: white;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      transition: background 0.2s;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      pointer-events: auto;
      z-index: 2147483647;
    }

    .bentube-button:hover {
      background: linear-gradient(135deg, #DAA520, #B8860B);
    }

    .bentube-button svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }

    .bentube-button.hidden {
      display: none;
    }

    .bentube-popup {
      position: fixed;
      width: 300px;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
      pointer-events: auto;
      z-index: 2147483647;
    }

    .bentube-popup.hidden {
      display: none;
    }

    .bentube-popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #e5e5e5;
      font-weight: 600;
      font-size: 14px;
      color: #1f1f1f;
    }

    .bentube-close {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: #666;
      padding: 0 4px;
      line-height: 1;
    }

    .bentube-close:hover {
      color: #333;
    }

    .bentube-content {
      padding: 12px;
      max-height: 300px;
      overflow-y: auto;
    }

    .bentube-group {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      cursor: pointer;
      width: 100%;
      background: transparent;
      text-align: left;
      margin-bottom: 4px;
      font-size: 14px;
      transition: background 0.15s, border-color 0.15s;
    }

    .bentube-group:hover {
      background: #f5f5f5;
      border-color: #B8860B;
    }

    .bentube-group:last-child {
      margin-bottom: 0;
    }

    .bentube-icon {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      flex-shrink: 0;
    }

    .bentube-icon svg {
      width: 16px;
      height: 16px;
      fill: white;
    }

    .bentube-name {
      flex: 1;
      font-weight: 500;
      color: #1f1f1f;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bentube-count {
      font-size: 12px;
      color: #666;
      background: #e5e5e5;
      padding: 2px 8px;
      border-radius: 10px;
      flex-shrink: 0;
    }

    .bentube-status {
      padding: 16px;
      text-align: center;
      font-size: 13px;
      color: #666;
    }

    .bentube-status.success {
      color: #16a34a;
    }

    .bentube-status.error {
      color: #dc2626;
    }

    .bentube-settings {
      padding: 16px;
    }

    .bentube-settings label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: #666;
      margin-bottom: 6px;
    }

    .bentube-settings input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      font-size: 14px;
      margin-bottom: 12px;
    }

    .bentube-settings input:focus {
      outline: none;
      border-color: #B8860B;
    }

    .bentube-settings-buttons {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .bentube-btn {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: background 0.15s;
    }

    .bentube-btn-secondary {
      background: #e5e5e5;
      color: #1f1f1f;
    }

    .bentube-btn-secondary:hover {
      background: #d5d5d5;
    }

    .bentube-btn-primary {
      background: linear-gradient(135deg, #B8860B, #8B6914);
      color: white;
    }

    .bentube-btn-primary:hover {
      background: linear-gradient(135deg, #DAA520, #B8860B);
    }

    .bentube-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
    }

    .bentube-action {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border: 2px solid #e5e5e5;
      border-radius: 10px;
      cursor: pointer;
      background: transparent;
      text-align: left;
      width: 100%;
      transition: border-color 0.15s, background 0.15s;
    }

    .bentube-action:hover {
      border-color: #B8860B;
      background: #fef9e7;
    }

    .bentube-action-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .bentube-action-icon svg {
      width: 20px;
      height: 20px;
      fill: white;
    }

    .bentube-action-text {
      flex: 1;
    }

    .bentube-action-title {
      font-weight: 600;
      font-size: 14px;
      color: #1f1f1f;
      margin-bottom: 2px;
    }

    .bentube-action-desc {
      font-size: 12px;
      color: #666;
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .bentube-popup {
        background: #1f1f1f;
      }
      .bentube-popup-header {
        border-color: #3f3f3f;
        color: #fff;
      }
      .bentube-close {
        color: #aaa;
      }
      .bentube-close:hover {
        color: #fff;
      }
      .bentube-group {
        border-color: #3f3f3f;
      }
      .bentube-group:hover {
        background: #2f2f2f;
      }
      .bentube-name {
        color: #fff;
      }
      .bentube-count {
        background: #3f3f3f;
        color: #aaa;
      }
      .bentube-status {
        color: #aaa;
      }
      .bentube-settings label {
        color: #aaa;
      }
      .bentube-settings input {
        background: #2f2f2f;
        border-color: #3f3f3f;
        color: #fff;
      }
      .bentube-btn-secondary {
        background: #3f3f3f;
        color: #fff;
      }
      .bentube-btn-secondary:hover {
        background: #4f4f4f;
      }
      .bentube-action {
        border-color: #3f3f3f;
      }
      .bentube-action:hover {
        background: #2a2518;
      }
      .bentube-action-title {
        color: #fff;
      }
      .bentube-action-desc {
        color: #aaa;
      }
    }
  `;

  const WAVEFORM_SVG = '<svg viewBox="0 0 24 24"><rect x="1" y="10" width="2" height="4" rx="0.5"/><rect x="4" y="7" width="2" height="10" rx="0.5"/><rect x="7" y="4" width="2" height="16" rx="0.5"/><rect x="10" y="8" width="2" height="8" rx="0.5"/><rect x="13" y="3" width="2" height="18" rx="0.5"/><rect x="16" y="6" width="2" height="12" rx="0.5"/><rect x="19" y="9" width="2" height="6" rx="0.5"/><rect x="22" y="11" width="1" height="2" rx="0.5"/></svg>';

  const LOGO_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2z"/></svg>';

  const VIDEO_SVG = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

  const CHANNEL_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>';

  // ============================================
  // Utility Functions
  // ============================================

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function isValidColor(color) {
    if (!color || typeof color !== 'string') return false;
    // Allow: #fff, #ffffff, named colors (no spaces/special chars)
    return /^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/.test(color) || /^[a-zA-Z]{3,20}$/.test(color);
  }

  function sanitizeColor(color, fallback = '#3B82F6') {
    return isValidColor(color) ? color : fallback;
  }

  function isEmoji(str) {
    if (!str) return false;
    return /^[\p{Emoji}\u200d]+$/u.test(str) || str.length <= 2;
  }

  function renderIcon(icon) {
    if (icon === 'waveform') return WAVEFORM_SVG;
    if (isEmoji(icon)) return `<span style="font-size:14px">${escapeHtml(icon)}</span>`;
    return '<span style="font-size:14px">📁</span>';
  }

  // ============================================
  // Storage
  // ============================================

  function getApiKey() {
    try {
      return GM_getValue(CONFIG.storageKey, '');
    } catch (e) {
      console.warn('[BenTube] GM_getValue failed, using localStorage:', e);
      return localStorage.getItem(CONFIG.storageKey) || '';
    }
  }

  function setApiKey(key) {
    try {
      GM_setValue(CONFIG.storageKey, key);
    } catch (e) {
      console.warn('[BenTube] GM_setValue failed, using localStorage:', e);
      localStorage.setItem(CONFIG.storageKey, key);
    }
  }

  // ============================================
  // API
  // ============================================

  function apiRequest(endpoint, options = {}) {
    return new Promise((resolve) => {
      const apiKey = getApiKey();

      if (!apiKey) {
        resolve({ success: false, error: 'API key not configured', needsSetup: true });
        return;
      }

      GM_xmlhttpRequest({
        method: options.method || 'GET',
        url: CONFIG.serverUrl + endpoint,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
          ...options.headers
        },
        data: options.body,
        timeout: CONFIG.requestTimeout,
        onload(response) {
          try {
            const data = JSON.parse(response.responseText);
            if (response.status >= 200 && response.status < 300) {
              resolve(data);
            } else {
              resolve({ success: false, error: data.error || `HTTP ${response.status}` });
            }
          } catch (e) {
            console.warn('[BenTube] Failed to parse response:', e);
            resolve({ success: false, error: 'Invalid response' });
          }
        },
        onerror() {
          resolve({ success: false, error: 'Network error' });
        },
        ontimeout() {
          resolve({ success: false, error: 'Request timed out' });
        }
      });
    });
  }

  // ============================================
  // Channel Detection
  // ============================================

  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');
    if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return videoId;
    }
    return null;
  }

  // Cache for channel ID to avoid repeated DOM queries
  let cachedChannelId = null;
  let cachedChannelUrl = null;

  function getChannelId() {
    // Return cached value if URL hasn't changed
    if (cachedChannelUrl === location.href && cachedChannelId) {
      return cachedChannelId;
    }

    // Method 1: Meta tag (most reliable)
    const meta = document.querySelector('meta[itemprop="channelId"]');
    if (meta?.content) {
      console.log('[BenTube] Channel ID from meta tag:', meta.content);
      cachedChannelId = meta.content;
      cachedChannelUrl = location.href;
      return cachedChannelId;
    }

    // Method 2: URL pattern
    const urlMatch = location.pathname.match(/\/channel\/(UC[\w-]+)/);
    if (urlMatch) {
      console.log('[BenTube] Channel ID from URL:', urlMatch[1]);
      cachedChannelId = urlMatch[1];
      cachedChannelUrl = location.href;
      return cachedChannelId;
    }

    // Method 3: Page data (ytInitialData)
    try {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        if (text.includes('ytInitialData')) {
          const match = text.match(/"(?:channelId|externalId)":"(UC[\w-]+)"/);
          if (match) {
            console.log('[BenTube] Channel ID from ytInitialData:', match[1]);
            cachedChannelId = match[1];
            cachedChannelUrl = location.href;
            return cachedChannelId;
          }
        }
      }
    } catch (e) {
      console.warn('[BenTube] Error parsing page data:', e);
    }

    console.log('[BenTube] Channel ID not found');
    return null;
  }

  function clearChannelCache() {
    cachedChannelId = null;
    cachedChannelUrl = null;
  }

  function getSubscribeButtonPosition() {
    const selectors = [
      '#owner ytd-subscribe-button-renderer',
      '#owner #subscribe-button',
      'ytd-video-owner-renderer #subscribe-button',
      '#channel-header ytd-subscribe-button-renderer',
      '#inner-header-container #subscribe-button'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        if (!element.offsetParent) {
          console.log('[BenTube] Found', selector, 'but not visible (no offsetParent)');
          continue;
        }
        const rect = element.getBoundingClientRect();
        const top = rect.top + rect.height / 2 - 20;
        const left = rect.right + 12;

        // Only return position if it's visible in the viewport
        if (top >= 0 && top < window.innerHeight && left >= 0 && left < window.innerWidth) {
          console.log('[BenTube] Using selector:', selector);
          return { top, left };
        } else {
          console.log('[BenTube] Found', selector, 'but outside viewport. top:', top, 'left:', left);
        }
      }
    }

    return null;
  }

  // ============================================
  // UI Component (Shadow DOM)
  // ============================================

  class BenTubeUI {
    constructor() {
      this.host = null;
      this.shadow = null;
      this.button = null;
      this.popup = null;
      this.channelId = null;
      this.videoId = null;
      this.position = { top: 0, left: 0 };
      this.popupCloseHandler = null;
      this.selectedAction = null; // 'video' or 'channel'
    }

    init() {
      // Create Shadow DOM host with fixed positioning at root level
      this.host = document.createElement('div');
      this.host.id = 'bentube-shadow-host';
      // Position host fixed to viewport to avoid any transform issues from YouTube's CSS
      this.host.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 0 !important; height: 0 !important; z-index: 2147483647 !important; pointer-events: none !important; transform: none !important;';

      // Create closed shadow root (completely isolated)
      this.shadow = this.host.attachShadow({ mode: 'closed' });

      // Inject styles
      const styleEl = document.createElement('style');
      styleEl.textContent = STYLES;
      this.shadow.appendChild(styleEl);

      // Create button
      this.button = document.createElement('button');
      this.button.className = 'bentube-button hidden';
      this.button.innerHTML = LOGO_SVG;
      this.button.title = 'Add to BenTube';
      this.button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.togglePopup();
      });
      this.shadow.appendChild(this.button);

      // Create popup container
      this.popup = document.createElement('div');
      this.popup.className = 'bentube-popup hidden';
      this.shadow.appendChild(this.popup);

      // Append to document
      document.documentElement.appendChild(this.host);

      // Handle clicks outside popup
      this.popupCloseHandler = (e) => {
        // Check if click is outside our shadow host
        if (!this.host.contains(e.target) && !this.popup.classList.contains('hidden')) {
          this.hidePopup();
        }
      };
      document.addEventListener('click', this.popupCloseHandler);
    }

    destroy() {
      if (this.popupCloseHandler) {
        document.removeEventListener('click', this.popupCloseHandler);
      }
      if (this.host?.parentNode) {
        this.host.parentNode.removeChild(this.host);
      }
    }

    show(position, channelId, videoId = null) {
      this.position = position;
      this.channelId = channelId;
      this.videoId = videoId;
      this.selectedAction = null;

      this.button.style.top = position.top + 'px';
      this.button.style.left = position.left + 'px';
      this.button.classList.remove('hidden');
    }

    hide() {
      this.button.classList.add('hidden');
      this.hidePopup();
    }

    togglePopup() {
      if (this.popup.classList.contains('hidden')) {
        this.showPopup();
      } else {
        this.hidePopup();
      }
    }

    showPopup() {
      // Position popup below or above button
      const popupHeight = 350;
      const popupWidth = 300;
      const margin = 8;

      let top, left;

      if (this.position.top + 40 + popupHeight + margin < window.innerHeight) {
        top = this.position.top + 48;
      } else {
        top = Math.max(margin, this.position.top - popupHeight - margin);
      }

      left = Math.max(margin, Math.min(this.position.left, window.innerWidth - popupWidth - margin));

      this.popup.style.top = top + 'px';
      this.popup.style.left = left + 'px';
      this.popup.classList.remove('hidden');

      this.loadContent();
    }

    hidePopup() {
      this.popup.classList.add('hidden');
    }

    async loadContent() {
      this.popup.innerHTML = `
        <div class="bentube-popup-header">
          <span>Add to BenTube</span>
          <button class="bentube-close">&times;</button>
        </div>
        <div class="bentube-content">
          <div class="bentube-status">Loading...</div>
        </div>
      `;

      this.popup.querySelector('.bentube-close').addEventListener('click', () => this.hidePopup());

      const res = await apiRequest('/api/extension/groups');

      if (res.needsSetup) {
        this.showSettings();
        return;
      }

      if (!res.success) {
        this.showError(res.error);
        return;
      }

      if (!res.data?.length) {
        this.showMessage('No groups found. Create one in BenTube first.');
        return;
      }

      // If on a video page and no action selected yet, show action choice
      if (this.videoId && !this.selectedAction) {
        this.showActionChoice(res.data);
      } else {
        this.showGroups(res.data);
      }
    }

    showActionChoice(groups) {
      const content = this.popup.querySelector('.bentube-content');
      content.innerHTML = `
        <div class="bentube-actions">
          <button class="bentube-action" data-action="video">
            <span class="bentube-action-icon" style="background: linear-gradient(135deg, #EF4444, #DC2626)">
              ${VIDEO_SVG}
            </span>
            <span class="bentube-action-text">
              <div class="bentube-action-title">Add this video only</div>
              <div class="bentube-action-desc">Save just this video to a group</div>
            </span>
          </button>
          <button class="bentube-action" data-action="channel">
            <span class="bentube-action-icon" style="background: linear-gradient(135deg, #B8860B, #8B6914)">
              ${CHANNEL_SVG}
            </span>
            <span class="bentube-action-text">
              <div class="bentube-action-title">Subscribe to channel</div>
              <div class="bentube-action-desc">Auto-sync all future videos</div>
            </span>
          </button>
        </div>
      `;

      // Store groups for later use
      this._cachedGroups = groups;

      content.querySelectorAll('.bentube-action').forEach(el => {
        el.addEventListener('click', () => {
          this.selectedAction = el.dataset.action;
          this.showGroups(this._cachedGroups);
        });
      });
    }

    showGroups(groups) {
      const content = this.popup.querySelector('.bentube-content');
      content.innerHTML = groups.map(g => `
        <button class="bentube-group" data-id="${escapeHtml(g.id)}">
          <span class="bentube-icon" style="background:${sanitizeColor(g.color)}">${renderIcon(g.icon)}</span>
          <span class="bentube-name">${escapeHtml(g.name)}</span>
          <span class="bentube-count">${g.channelCount || 0}</span>
        </button>
      `).join('');

      content.querySelectorAll('.bentube-group').forEach(el => {
        el.addEventListener('click', () => this.addToGroup(el.dataset.id));
      });
    }

    async addToGroup(groupId) {
      const content = this.popup.querySelector('.bentube-content');
      content.innerHTML = '<div class="bentube-status">Adding...</div>';

      let res;
      let successMessage;

      if (this.selectedAction === 'video' && this.videoId) {
        // Add single video
        res = await apiRequest('/api/extension/add-video', {
          method: 'POST',
          body: JSON.stringify({ youtubeVideoId: this.videoId, groupId })
        });
        successMessage = res.data?.alreadyExists ? 'Video already exists!' : 'Video added!';
      } else {
        // Subscribe to channel
        res = await apiRequest('/api/extension/add-channel', {
          method: 'POST',
          body: JSON.stringify({ youtubeChannelId: this.channelId, groupId })
        });
        successMessage = res.data?.alreadyInGroup ? 'Already subscribed!' : 'Channel added!';
      }

      if (res.success) {
        content.innerHTML = `<div class="bentube-status success">${successMessage}</div>`;
        setTimeout(() => this.hidePopup(), CONFIG.successMessageDelay);
      } else {
        this.showError(res.error);
      }
    }

    showSettings() {
      const content = this.popup.querySelector('.bentube-content');
      content.innerHTML = `
        <div class="bentube-settings">
          <label>API Key (from BenTube Settings)</label>
          <input type="password" id="bentube-api-key" placeholder="bt_xxxxxxxxxxxxxxxx" value="${escapeHtml(getApiKey())}">
          <div class="bentube-settings-buttons">
            <button class="bentube-btn bentube-btn-secondary" id="bentube-cancel">Cancel</button>
            <button class="bentube-btn bentube-btn-primary" id="bentube-save">Save</button>
          </div>
        </div>
      `;

      content.querySelector('#bentube-cancel').addEventListener('click', () => this.hidePopup());
      content.querySelector('#bentube-save').addEventListener('click', () => {
        const key = content.querySelector('#bentube-api-key').value.trim();
        if (key) {
          setApiKey(key);
          this.loadContent();
        }
      });
    }

    showError(message) {
      const content = this.popup.querySelector('.bentube-content');
      content.innerHTML = `<div class="bentube-status error">${escapeHtml(message)}</div>`;
    }

    showMessage(message) {
      const content = this.popup.querySelector('.bentube-content');
      content.innerHTML = `<div class="bentube-status">${escapeHtml(message)}</div>`;
    }
  }

  // ============================================
  // Main Controller
  // ============================================

  class BenTubeController {
    constructor() {
      this.ui = new BenTubeUI();
      this.lastUrl = '';
      this.observer = null;
      this.urlCheckTimeout = null;
      this.channelFound = false; // Track if we've found channel info
      this.currentChannelId = null;
      this.currentVideoId = null;
      this.scrollHandler = null;
    }

    init() {
      this.ui.init();
      this.lastUrl = location.href;

      // Watch for SPA navigation with debounced URL checking
      this.observer = new MutationObserver(() => {
        if (this.urlCheckTimeout) return;
        this.urlCheckTimeout = setTimeout(() => {
          this.urlCheckTimeout = null;
          if (location.href !== this.lastUrl) {
            this.lastUrl = location.href;
            this.onNavigate();
          }
        }, CONFIG.urlCheckDebounce);
      });
      this.observer.observe(document.body, { subtree: true, childList: true });

      // Add scroll listener - button follows subscribe button as you scroll
      this.scrollHandler = () => this.updateButtonPosition();
      window.addEventListener('scroll', this.scrollHandler, { passive: true });

      // Initial positioning
      this.tryPosition();

      console.log('[BenTube] Initialized v5.1.0');
    }

    onNavigate() {
      this.channelFound = false;
      this.currentChannelId = null;
      this.currentVideoId = null;
      clearChannelCache();
      this.ui.hide();
      setTimeout(() => this.tryPosition(), CONFIG.navigationDelay);
    }

    // Called on scroll - update position without retries
    updateButtonPosition() {
      if (!this.channelFound) return; // Still waiting for initial setup

      const position = getSubscribeButtonPosition();

      if (position) {
        // Subscribe button visible - show button at new position
        this.ui.show(position, this.currentChannelId, this.currentVideoId);
      } else {
        // Subscribe button scrolled out of view - hide button
        this.ui.hide();
      }
    }

    // Initial setup with retry logic
    tryPosition(attempts = 0) {
      if (this.channelFound) return;

      const shouldLog = attempts === 0 || attempts % 5 === 0;

      const position = getSubscribeButtonPosition();
      const channelId = getChannelId();
      const videoId = getVideoId();

      if (position && channelId) {
        console.log('[BenTube] Button shown at', position, 'channel:', channelId);
        this.channelFound = true;
        this.currentChannelId = channelId;
        this.currentVideoId = videoId;
        this.ui.show(position, channelId, videoId);
      } else if (attempts < CONFIG.retryAttempts) {
        if (shouldLog) {
          console.log('[BenTube] Attempt', attempts + 1, '/', CONFIG.retryAttempts, '- Position:', !!position, 'ChannelId:', !!channelId);
        }
        setTimeout(() => this.tryPosition(attempts + 1), CONFIG.retryDelay);
      } else {
        console.warn('[BenTube] Gave up after', CONFIG.retryAttempts, 'attempts. Position:', position, 'ChannelId:', channelId);
      }
    }
  }

  // ============================================
  // Menu Commands
  // ============================================

  GM_registerMenuCommand('Configure API Key', () => {
    const key = prompt('Enter your BenTube API key:', getApiKey());
    if (key !== null) {
      setApiKey(key.trim());
      alert(key.trim() ? 'API key saved!' : 'API key cleared.');
    }
  });

  GM_registerMenuCommand('Test Connection', async () => {
    const res = await apiRequest('/api/extension/groups');
    if (res.needsSetup) {
      alert('API key not configured. Use "Configure API Key" menu option.');
    } else if (res.success) {
      alert(`Connected! Found ${res.data.length} groups.`);
    } else {
      alert(`Error: ${res.error}`);
    }
  });

  // ============================================
  // Initialize
  // ============================================

  const controller = new BenTubeController();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => controller.init());
  } else {
    controller.init();
  }

})();
