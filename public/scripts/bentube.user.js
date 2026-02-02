// ==UserScript==
// @name         BenTube - Add to Groups
// @namespace    https://ben-tube.com
// @version      4.0.0
// @description  Add YouTube channels to your BenTube groups directly from YouTube
// @author       BenTube
// @match        https://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @noframes
// @connect      ben-tube.com
// @connect      localhost
// @connect      *
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
    requestTimeout: 15000
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
    }
  `;

  const WAVEFORM_SVG = '<svg viewBox="0 0 24 24"><rect x="1" y="10" width="2" height="4" rx="0.5"/><rect x="4" y="7" width="2" height="10" rx="0.5"/><rect x="7" y="4" width="2" height="16" rx="0.5"/><rect x="10" y="8" width="2" height="8" rx="0.5"/><rect x="13" y="3" width="2" height="18" rx="0.5"/><rect x="16" y="6" width="2" height="12" rx="0.5"/><rect x="19" y="9" width="2" height="6" rx="0.5"/><rect x="22" y="11" width="1" height="2" rx="0.5"/></svg>';

  const LOGO_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2z"/></svg>';

  // ============================================
  // Utility Functions
  // ============================================

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function isEmoji(str) {
    if (!str) return false;
    return /^[\p{Emoji}\u200d]+$/u.test(str) || str.length <= 2;
  }

  function renderIcon(icon) {
    if (icon === 'waveform') return WAVEFORM_SVG;
    if (isEmoji(icon)) return `<span style="font-size:14px">${icon}</span>`;
    return '<span style="font-size:14px">📁</span>';
  }

  // ============================================
  // Storage
  // ============================================

  function getApiKey() {
    try {
      return GM_getValue(CONFIG.storageKey, '');
    } catch {
      return localStorage.getItem(CONFIG.storageKey) || '';
    }
  }

  function setApiKey(key) {
    try {
      GM_setValue(CONFIG.storageKey, key);
    } catch {
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
          } catch {
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

  function getChannelId() {
    // Method 1: Meta tag (most reliable)
    const meta = document.querySelector('meta[itemprop="channelId"]');
    if (meta?.content) return meta.content;

    // Method 2: URL pattern
    const urlMatch = location.pathname.match(/\/channel\/(UC[\w-]+)/);
    if (urlMatch) return urlMatch[1];

    // Method 3: Page data
    try {
      for (const script of document.querySelectorAll('script')) {
        const text = script.textContent || '';
        if (text.includes('ytInitialData')) {
          const match = text.match(/"(?:channelId|externalId)":"(UC[\w-]+)"/);
          if (match) return match[1];
        }
      }
    } catch {}

    return null;
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
      if (element?.offsetParent) {
        const rect = element.getBoundingClientRect();
        return {
          top: rect.top + rect.height / 2 - 20,
          left: rect.right + 12
        };
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
      this.position = { top: 0, left: 0 };
      this.popupCloseHandler = null;
    }

    init() {
      // Create Shadow DOM host
      this.host = document.createElement('div');
      this.host.id = 'bentube-shadow-host';

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

    show(position, channelId) {
      this.position = position;
      this.channelId = channelId;

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

      this.showGroups(res.data);
    }

    showGroups(groups) {
      const content = this.popup.querySelector('.bentube-content');
      content.innerHTML = groups.map(g => `
        <button class="bentube-group" data-id="${g.id}">
          <span class="bentube-icon" style="background:${escapeHtml(g.color || '#3B82F6')}">${renderIcon(g.icon)}</span>
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

      const res = await apiRequest('/api/extension/add-channel', {
        method: 'POST',
        body: JSON.stringify({ youtubeChannelId: this.channelId, groupId })
      });

      if (res.success) {
        content.innerHTML = `<div class="bentube-status success">${res.data?.alreadyInGroup ? 'Already in group!' : 'Channel added!'}</div>`;
        setTimeout(() => this.hidePopup(), 1500);
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
    }

    init() {
      this.ui.init();
      this.lastUrl = location.href;

      // Watch for SPA navigation
      this.observer = new MutationObserver(() => {
        if (location.href !== this.lastUrl) {
          this.lastUrl = location.href;
          this.onNavigate();
        }
      });
      this.observer.observe(document.body, { subtree: true, childList: true });

      // Initial positioning
      this.tryPosition();

      console.log('[BenTube] Initialized v4.0.0');
    }

    onNavigate() {
      this.ui.hide();
      setTimeout(() => this.tryPosition(), 500);
    }

    tryPosition(attempts = 0) {
      const position = getSubscribeButtonPosition();
      const channelId = getChannelId();

      if (position && channelId) {
        this.ui.show(position, channelId);
      } else if (attempts < CONFIG.retryAttempts) {
        setTimeout(() => this.tryPosition(attempts + 1), CONFIG.retryDelay);
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
