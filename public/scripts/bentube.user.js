// ==UserScript==
// @name         BenTube - Add to Groups
// @namespace    https://bentube.app
// @version      2.0.0
// @description  Add YouTube channels to your BenTube groups directly from YouTube
// @author       BenTube
// @match        https://www.youtube.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @noframes
// @connect      bentube.app
// @connect      localhost
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  // ============================================
  // Configuration & Storage
  // ============================================

  const DEFAULT_SERVER_URL = 'https://bentube.app';
  const STORAGE_KEY_PREFIX = 'bentube_';
  const DEBUG = false;

  function log(...args) {
    if (DEBUG) console.log('BenTube:', ...args);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function getSettings() {
    let serverUrl, apiKey;

    try {
      serverUrl = GM_getValue(STORAGE_KEY_PREFIX + 'serverUrl', null);
      apiKey = GM_getValue(STORAGE_KEY_PREFIX + 'apiKey', null);
    } catch (e) {
      log('GM_getValue failed, using localStorage');
    }

    if (!serverUrl && !apiKey) {
      try {
        serverUrl = localStorage.getItem(STORAGE_KEY_PREFIX + 'serverUrl');
        apiKey = localStorage.getItem(STORAGE_KEY_PREFIX + 'apiKey');
      } catch (e) {
        log('localStorage also failed');
      }
    }

    return {
      serverUrl: serverUrl || DEFAULT_SERVER_URL,
      apiKey: apiKey || ''
    };
  }

  function saveSettings(serverUrl, apiKey) {
    const url = serverUrl || DEFAULT_SERVER_URL;
    const key = apiKey || '';

    try {
      GM_setValue(STORAGE_KEY_PREFIX + 'serverUrl', url);
      GM_setValue(STORAGE_KEY_PREFIX + 'apiKey', key);
      log('Settings saved to GM storage');
    } catch (e) {
      log('GM_setValue failed:', e);
    }

    try {
      localStorage.setItem(STORAGE_KEY_PREFIX + 'serverUrl', url);
      localStorage.setItem(STORAGE_KEY_PREFIX + 'apiKey', key);
      log('Settings saved to localStorage');
    } catch (e) {
      log('localStorage save failed:', e);
    }
  }

  let settingsShownThisSession = false;

  // ============================================
  // API Functions
  // ============================================

  function apiRequest(endpoint, options = {}) {
    return new Promise((resolve, reject) => {
      const settings = getSettings();

      if (!settings.apiKey) {
        resolve({ success: false, error: 'API key not configured. Click the gear icon to configure.' });
        return;
      }

      const url = `${settings.serverUrl}${endpoint}`;
      log('Making request to', url);

      GM_xmlhttpRequest({
        method: options.method || 'GET',
        url: url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`,
          ...options.headers
        },
        data: options.body,
        onload: function(response) {
          log('Response status', response.status);
          try {
            const data = JSON.parse(response.responseText);
            log('Response data', data);

            if (response.status >= 200 && response.status < 300) {
              resolve(data);
            } else {
              resolve({ success: false, error: data.error || `HTTP ${response.status}` });
            }
          } catch (e) {
            resolve({ success: false, error: 'Invalid JSON response' });
          }
        },
        onerror: function(error) {
          log('API error:', error);
          resolve({ success: false, error: 'Network error - check if server is running' });
        }
      });
    });
  }

  // ============================================
  // Styles
  // ============================================

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #bentube-add-button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        margin-left: 8px;
        background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
        color: white;
        border: none;
        border-radius: 20px;
        font-family: 'Roboto', 'Arial', sans-serif;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        vertical-align: middle;
      }

      #bentube-add-button:hover {
        background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
        transform: scale(1.02);
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
      }

      #bentube-add-button:active {
        transform: scale(0.98);
      }

      #bentube-add-button svg {
        width: 16px;
        height: 16px;
      }

      #bentube-settings-btn {
        background: none;
        border: none;
        padding: 4px;
        margin-left: 4px;
        cursor: pointer;
        opacity: 0.7;
        transition: opacity 0.2s;
      }

      #bentube-settings-btn:hover {
        opacity: 1;
      }

      #bentube-settings-btn svg {
        width: 14px;
        height: 14px;
        fill: white;
      }

      .bentube-popover {
        position: absolute;
        z-index: 9999;
        width: 280px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        opacity: 0;
        visibility: hidden;
        transform: translateY(-8px);
        transition: all 0.2s ease;
        font-family: 'Roboto', 'Arial', sans-serif;
      }

      .bentube-popover.visible {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }

      html[dark] .bentube-popover,
      [dark] .bentube-popover {
        background: #1f1f1f;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      }

      .bentube-popover-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid #e5e5e5;
        font-weight: 600;
        font-size: 14px;
        color: #1f1f1f;
      }

      html[dark] .bentube-popover-header,
      [dark] .bentube-popover-header {
        border-bottom-color: #3f3f3f;
        color: #fff;
      }

      .bentube-popover-close {
        background: none;
        border: none;
        font-size: 20px;
        color: #666;
        cursor: pointer;
        padding: 0;
        line-height: 1;
      }

      .bentube-popover-close:hover {
        color: #333;
      }

      html[dark] .bentube-popover-close,
      [dark] .bentube-popover-close {
        color: #aaa;
      }

      html[dark] .bentube-popover-close:hover,
      [dark] .bentube-popover-close:hover {
        color: #fff;
      }

      .bentube-popover-content {
        padding: 12px;
        max-height: 300px;
        overflow-y: auto;
      }

      .bentube-channel-info {
        padding: 8px 12px;
        background: #f5f5f5;
        border-radius: 8px;
        margin-bottom: 12px;
      }

      html[dark] .bentube-channel-info,
      [dark] .bentube-channel-info {
        background: #2f2f2f;
      }

      .bentube-channel-name {
        font-size: 13px;
        font-weight: 500;
        color: #1f1f1f;
      }

      html[dark] .bentube-channel-name,
      [dark] .bentube-channel-name {
        color: #fff;
      }

      .bentube-groups-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .bentube-group-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        background: transparent;
        border: 1px solid #e5e5e5;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: left;
        width: 100%;
      }

      html[dark] .bentube-group-item,
      [dark] .bentube-group-item {
        border-color: #3f3f3f;
      }

      .bentube-group-item:hover {
        background: #f5f5f5;
        border-color: #3B82F6;
      }

      html[dark] .bentube-group-item:hover,
      [dark] .bentube-group-item:hover {
        background: #2f2f2f;
      }

      .bentube-group-icon {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        font-size: 14px;
      }

      .bentube-group-name {
        flex: 1;
        font-size: 14px;
        font-weight: 500;
        color: #1f1f1f;
      }

      html[dark] .bentube-group-name,
      [dark] .bentube-group-name {
        color: #fff;
      }

      .bentube-group-count {
        font-size: 12px;
        color: #666;
        background: #e5e5e5;
        padding: 2px 8px;
        border-radius: 10px;
      }

      html[dark] .bentube-group-count,
      [dark] .bentube-group-count {
        background: #3f3f3f;
        color: #aaa;
      }

      .bentube-loading {
        text-align: center;
        padding: 20px;
        color: #666;
        font-size: 13px;
      }

      html[dark] .bentube-loading,
      [dark] .bentube-loading {
        color: #aaa;
      }

      .bentube-error {
        text-align: center;
        padding: 16px;
        color: #dc2626;
        font-size: 13px;
      }

      .bentube-empty {
        text-align: center;
        padding: 16px;
        color: #666;
        font-size: 13px;
      }

      html[dark] .bentube-empty,
      [dark] .bentube-empty {
        color: #aaa;
      }

      .bentube-popover-footer {
        padding: 8px 16px;
        border-top: 1px solid #e5e5e5;
        min-height: 32px;
      }

      html[dark] .bentube-popover-footer,
      [dark] .bentube-popover-footer {
        border-top-color: #3f3f3f;
      }

      .bentube-status {
        font-size: 12px;
        text-align: center;
      }

      .bentube-status.loading {
        color: #666;
      }

      .bentube-status.success {
        color: #16a34a;
      }

      .bentube-status.error {
        color: #dc2626;
      }

      html[dark] .bentube-status.loading,
      [dark] .bentube-status.loading {
        color: #aaa;
      }

      .bentube-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        visibility: hidden;
        transition: all 0.2s ease;
      }

      .bentube-modal-overlay.visible {
        opacity: 1;
        visibility: visible;
      }

      .bentube-modal {
        background: white;
        border-radius: 16px;
        width: 360px;
        max-width: 90vw;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        transform: scale(0.9);
        transition: transform 0.2s ease;
      }

      .bentube-modal-overlay.visible .bentube-modal {
        transform: scale(1);
      }

      html[dark] .bentube-modal,
      [dark] .bentube-modal {
        background: #1f1f1f;
      }

      .bentube-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #e5e5e5;
      }

      html[dark] .bentube-modal-header,
      [dark] .bentube-modal-header {
        border-bottom-color: #3f3f3f;
      }

      .bentube-modal-title {
        font-size: 18px;
        font-weight: 600;
        color: #1f1f1f;
      }

      html[dark] .bentube-modal-title,
      [dark] .bentube-modal-title {
        color: #fff;
      }

      .bentube-modal-body {
        padding: 20px;
      }

      .bentube-form-group {
        margin-bottom: 16px;
      }

      .bentube-form-group label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        color: #666;
        margin-bottom: 6px;
      }

      html[dark] .bentube-form-group label,
      [dark] .bentube-form-group label {
        color: #aaa;
      }

      .bentube-form-group input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #e5e5e5;
        border-radius: 8px;
        font-size: 14px;
        background: white;
        color: #1f1f1f;
        box-sizing: border-box;
      }

      html[dark] .bentube-form-group input,
      [dark] .bentube-form-group input {
        background: #2f2f2f;
        border-color: #3f3f3f;
        color: #fff;
      }

      .bentube-form-group input:focus {
        outline: none;
        border-color: #3B82F6;
      }

      .bentube-modal-footer {
        padding: 16px 20px;
        border-top: 1px solid #e5e5e5;
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }

      html[dark] .bentube-modal-footer,
      [dark] .bentube-modal-footer {
        border-top-color: #3f3f3f;
      }

      .bentube-btn {
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        border: none;
      }

      .bentube-btn-secondary {
        background: #e5e5e5;
        color: #1f1f1f;
      }

      .bentube-btn-secondary:hover {
        background: #d5d5d5;
      }

      html[dark] .bentube-btn-secondary,
      [dark] .bentube-btn-secondary {
        background: #3f3f3f;
        color: #fff;
      }

      html[dark] .bentube-btn-secondary:hover,
      [dark] .bentube-btn-secondary:hover {
        background: #4f4f4f;
      }

      .bentube-btn-primary {
        background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
        color: white;
      }

      .bentube-btn-primary:hover {
        background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
      }

      .bentube-connection-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: #f5f5f5;
        border-radius: 8px;
        margin-bottom: 16px;
      }

      html[dark] .bentube-connection-status,
      [dark] .bentube-connection-status {
        background: #2f2f2f;
      }

      .bentube-status-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #666;
      }

      .bentube-status-dot.connected {
        background: #16a34a;
      }

      .bentube-status-dot.disconnected {
        background: #dc2626;
      }

      .bentube-status-dot.checking {
        background: #f59e0b;
        animation: pulse 1s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .bentube-status-text {
        font-size: 13px;
        color: #666;
      }

      html[dark] .bentube-status-text,
      [dark] .bentube-status-text {
        color: #aaa;
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================
  // State
  // ============================================

  let currentChannelId = null;
  let currentChannelName = null;
  let buttonInjected = false;
  let popoverElement = null;
  let modalElement = null;

  // ============================================
  // Channel Detection
  // ============================================

  function getChannelIdFromPage() {
    log('Attempting to detect channel ID...');

    try {
      const ytData = unsafeWindow.ytInitialData;
      if (ytData) {
        log('Found ytInitialData via unsafeWindow');
        if (ytData.contents?.twoColumnWatchNextResults?.results?.results?.contents) {
          const contents = ytData.contents.twoColumnWatchNextResults.results.results.contents;
          for (const content of contents) {
            if (content.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer?.navigationEndpoint?.browseEndpoint?.browseId) {
              const id = content.videoSecondaryInfoRenderer.owner.videoOwnerRenderer.navigationEndpoint.browseEndpoint.browseId;
              log('Found channel ID from ytInitialData (video page):', id);
              return id;
            }
          }
        }
        if (ytData.metadata?.channelMetadataRenderer?.externalId) {
          const id = ytData.metadata.channelMetadataRenderer.externalId;
          log('Found channel ID from ytInitialData (channel page):', id);
          return id;
        }
        if (ytData.header?.c4TabbedHeaderRenderer?.channelId) {
          const id = ytData.header.c4TabbedHeaderRenderer.channelId;
          log('Found channel ID from ytInitialData header:', id);
          return id;
        }
      }
    } catch (e) {
      log('ytInitialData method failed:', e);
    }

    const metaChannelId = document.querySelector('meta[itemprop="channelId"]');
    if (metaChannelId) {
      const id = metaChannelId.content;
      log('Found channel ID from meta tag:', id);
      return id;
    }

    const channelLink = document.querySelector('link[itemprop="url"][href*="/channel/"]');
    if (channelLink) {
      const match = channelLink.href.match(/\/channel\/(UC[\w-]+)/);
      if (match) {
        log('Found channel ID from canonical link:', match[1]);
        return match[1];
      }
    }

    const ownerSelectors = [
      '#owner a[href*="/channel/"]',
      '#owner a[href^="/@"]',
      'ytd-video-owner-renderer a[href*="/channel/"]',
      'ytd-video-owner-renderer a[href^="/@"]',
      '#channel-name a[href*="/channel/"]',
      '#upload-info a[href*="/channel/"]',
      'a.ytd-video-owner-renderer[href*="/channel/"]'
    ];

    for (const selector of ownerSelectors) {
      const link = document.querySelector(selector);
      if (link) {
        const match = link.href.match(/\/channel\/(UC[\w-]+)/);
        if (match) {
          log('Found channel ID from owner link:', match[1]);
          return match[1];
        }
      }
    }

    try {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        const patterns = [
          /"channelId"\s*:\s*"(UC[\w-]+)"/,
          /"externalChannelId"\s*:\s*"(UC[\w-]+)"/,
          /"browseId"\s*:\s*"(UC[\w-]+)"/,
          /channel\/(UC[\w-]+)/
        ];
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) {
            log('Found channel ID from script:', match[1]);
            return match[1];
          }
        }
      }
    } catch (e) {
      log('Error parsing scripts:', e);
    }

    const pathname = window.location.pathname;
    const channelMatch = pathname.match(/^\/channel\/(UC[\w-]+)/);
    if (channelMatch) {
      log('Found channel ID from URL:', channelMatch[1]);
      return channelMatch[1];
    }

    log('Could not detect channel ID');
    return null;
  }

  function getChannelNameFromPage() {
    try {
      const ytData = unsafeWindow.ytInitialData;
      if (ytData) {
        if (ytData.contents?.twoColumnWatchNextResults?.results?.results?.contents) {
          const contents = ytData.contents.twoColumnWatchNextResults.results.results.contents;
          for (const content of contents) {
            if (content.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer?.title?.runs?.[0]?.text) {
              return content.videoSecondaryInfoRenderer.owner.videoOwnerRenderer.title.runs[0].text;
            }
          }
        }
        if (ytData.metadata?.channelMetadataRenderer?.title) {
          return ytData.metadata.channelMetadataRenderer.title;
        }
      }
    } catch (e) {
      log('ytInitialData name method failed:', e);
    }

    const channelNameSelectors = [
      '#channel-name yt-formatted-string',
      '#channel-header ytd-channel-name yt-formatted-string',
      'ytd-channel-name yt-formatted-string#text',
      '#channel-header-container #channel-name'
    ];

    for (const selector of channelNameSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }

    const ownerNameSelectors = [
      '#owner #channel-name a',
      '#owner #channel-name yt-formatted-string',
      'ytd-video-owner-renderer #channel-name a',
      'ytd-video-owner-renderer #channel-name yt-formatted-string',
      '#upload-info #channel-name a',
      '.ytd-video-owner-renderer #text'
    ];

    for (const selector of ownerNameSelectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }

    return null;
  }

  // ============================================
  // Settings Modal
  // ============================================

  function createSettingsModal() {
    const overlay = document.createElement('div');
    overlay.className = 'bentube-modal-overlay';
    overlay.innerHTML = `
      <div class="bentube-modal">
        <div class="bentube-modal-header">
          <span class="bentube-modal-title">BenTube Settings</span>
          <button class="bentube-popover-close bentube-modal-close">&times;</button>
        </div>
        <div class="bentube-modal-body">
          <div class="bentube-connection-status">
            <div class="bentube-status-dot" id="bentube-modal-status-dot"></div>
            <span class="bentube-status-text" id="bentube-modal-status-text">Not configured</span>
          </div>
          <div class="bentube-form-group">
            <label>Server URL</label>
            <input type="text" id="bentube-server-url" placeholder="https://bentube.app">
          </div>
          <div class="bentube-form-group">
            <label>API Key (get from BenTube Settings > Extension)</label>
            <input type="password" id="bentube-api-key" placeholder="bt_xxxxxxxxxxxxxxxx">
          </div>
        </div>
        <div class="bentube-modal-footer">
          <button class="bentube-btn bentube-btn-secondary" id="bentube-test-btn">Test</button>
          <button class="bentube-btn bentube-btn-primary" id="bentube-save-btn">Save</button>
        </div>
      </div>
    `;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        hideSettingsModal();
      }
    });

    overlay.querySelector('.bentube-modal-close').addEventListener('click', hideSettingsModal);

    overlay.querySelector('#bentube-test-btn').addEventListener('click', async () => {
      const serverUrl = overlay.querySelector('#bentube-server-url').value.trim();
      const apiKey = overlay.querySelector('#bentube-api-key').value.trim();

      saveSettings(serverUrl, apiKey);

      const statusDot = overlay.querySelector('#bentube-modal-status-dot');
      const statusText = overlay.querySelector('#bentube-modal-status-text');

      statusDot.className = 'bentube-status-dot checking';
      statusText.textContent = 'Testing...';

      const response = await apiRequest('/api/extension/groups');

      if (response.success) {
        statusDot.className = 'bentube-status-dot connected';
        statusText.textContent = 'Connected!';
      } else {
        statusDot.className = 'bentube-status-dot disconnected';
        statusText.textContent = response.error || 'Connection failed';
      }
    });

    overlay.querySelector('#bentube-save-btn').addEventListener('click', () => {
      const serverUrl = overlay.querySelector('#bentube-server-url').value.trim();
      const apiKey = overlay.querySelector('#bentube-api-key').value.trim();

      saveSettings(serverUrl, apiKey);
      hideSettingsModal();
    });

    return overlay;
  }

  function showSettingsModal() {
    if (!modalElement) {
      modalElement = createSettingsModal();
      document.body.appendChild(modalElement);
    }

    const settings = getSettings();
    modalElement.querySelector('#bentube-server-url').value = settings.serverUrl;
    modalElement.querySelector('#bentube-api-key').value = settings.apiKey;

    const statusDot = modalElement.querySelector('#bentube-modal-status-dot');
    const statusText = modalElement.querySelector('#bentube-modal-status-text');

    if (settings.apiKey) {
      statusDot.className = 'bentube-status-dot';
      statusText.textContent = 'Click Test to verify';
    } else {
      statusDot.className = 'bentube-status-dot disconnected';
      statusText.textContent = 'Not configured';
    }

    modalElement.classList.add('visible');
  }

  function hideSettingsModal() {
    if (modalElement) {
      modalElement.classList.remove('visible');
    }
  }

  // ============================================
  // Button & Popover
  // ============================================

  function createBenTubeButton() {
    const button = document.createElement('button');
    button.id = 'bentube-add-button';
    button.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 5v14M5 12h14"/>
      </svg>
      <span>BenTube</span>
      <span id="bentube-settings-btn" title="Settings">
        <svg viewBox="0 0 24 24"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97 0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1 0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/></svg>
      </span>
    `;
    button.title = 'Add to BenTube';

    button.addEventListener('click', (e) => {
      if (e.target.closest('#bentube-settings-btn')) {
        e.preventDefault();
        e.stopPropagation();
        showSettingsModal();
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      handleButtonClick(e);
    });

    return button;
  }

  function createPopover() {
    const popover = document.createElement('div');
    popover.id = 'bentube-popover';
    popover.className = 'bentube-popover';
    popover.innerHTML = `
      <div class="bentube-popover-header">
        <span>Add to BenTube</span>
        <button class="bentube-popover-close">&times;</button>
      </div>
      <div class="bentube-popover-content">
        <div class="bentube-channel-info">
          <span class="bentube-channel-name"></span>
        </div>
        <div class="bentube-groups-list">
          <div class="bentube-loading">Loading groups...</div>
        </div>
      </div>
      <div class="bentube-popover-footer">
        <div class="bentube-status"></div>
      </div>
    `;

    popover.querySelector('.bentube-popover-close').addEventListener('click', hidePopover);

    document.addEventListener('click', (e) => {
      if (popoverElement && !popoverElement.contains(e.target) &&
          e.target.id !== 'bentube-add-button' && !e.target.closest('#bentube-add-button')) {
        hidePopover();
      }
    });

    return popover;
  }

  function showPopover(button) {
    if (!popoverElement) {
      popoverElement = createPopover();
      document.body.appendChild(popoverElement);
    }

    const rect = button.getBoundingClientRect();
    popoverElement.style.top = `${rect.bottom + window.scrollY + 8}px`;
    popoverElement.style.left = `${rect.left + window.scrollX}px`;

    const channelNameEl = popoverElement.querySelector('.bentube-channel-name');
    channelNameEl.textContent = currentChannelName || 'This channel';

    popoverElement.classList.add('visible');
    loadGroups();
  }

  function hidePopover() {
    if (popoverElement) {
      popoverElement.classList.remove('visible');
    }
  }

  async function loadGroups() {
    const groupsList = popoverElement.querySelector('.bentube-groups-list');
    groupsList.innerHTML = '<div class="bentube-loading">Loading groups...</div>';

    const response = await apiRequest('/api/extension/groups');

    if (!response.success) {
      groupsList.innerHTML = `<div class="bentube-error">${escapeHtml(response.error || 'Failed to load groups')}</div>`;
      return;
    }

    if (!response.data || response.data.length === 0) {
      groupsList.innerHTML = '<div class="bentube-empty">No groups found. Create one in BenTube first.</div>';
      return;
    }

    groupsList.innerHTML = response.data.map(group => `
      <button class="bentube-group-item" data-group-id="${escapeHtml(String(group.id))}">
        <span class="bentube-group-icon" style="background-color: ${escapeHtml(group.color || '#3B82F6')}">${escapeHtml(group.icon || '📁')}</span>
        <span class="bentube-group-name">${escapeHtml(group.name || 'Unnamed')}</span>
        <span class="bentube-group-count">${escapeHtml(String(group.channelCount || 0))}</span>
      </button>
    `).join('');

    groupsList.querySelectorAll('.bentube-group-item').forEach(item => {
      item.addEventListener('click', () => handleGroupSelect(item.dataset.groupId));
    });
  }

  async function handleGroupSelect(groupId) {
    const statusEl = popoverElement.querySelector('.bentube-status');
    statusEl.textContent = 'Adding channel...';
    statusEl.className = 'bentube-status loading';

    const response = await apiRequest('/api/extension/add-channel', {
      method: 'POST',
      body: JSON.stringify({
        youtubeChannelId: currentChannelId,
        groupId: groupId
      })
    });

    if (response.success) {
      statusEl.textContent = response.data?.alreadyInGroup
        ? 'Channel already in group!'
        : 'Channel added!';
      statusEl.className = 'bentube-status success';
      setTimeout(hidePopover, 1500);
    } else {
      statusEl.textContent = response.error || 'Failed to add channel';
      statusEl.className = 'bentube-status error';
    }
  }

  function handleButtonClick(e) {
    if (!currentChannelId) {
      currentChannelId = getChannelIdFromPage();
      if (!currentChannelId) {
        alert('Could not detect channel. Try navigating to the channel page directly.');
        return;
      }
    }

    showPopover(e.currentTarget);
  }

  // ============================================
  // Button Injection
  // ============================================

  function injectButton() {
    if (buttonInjected) return;

    const selectors = [
      '#owner #subscribe-button',
      '#above-the-fold #subscribe-button',
      'ytd-watch-metadata #subscribe-button',
      '#meta #subscribe-button',
      'ytd-video-owner-renderer #subscribe-button',
      '#channel-header #subscribe-button',
      '#inner-header-container #subscribe-button',
      '#subscribe-button'
    ];

    let subscribeContainer = null;
    for (const selector of selectors) {
      subscribeContainer = document.querySelector(selector);
      if (subscribeContainer) {
        log('Found subscribe button with selector:', selector);
        break;
      }
    }

    if (!subscribeContainer) return;

    let parent = subscribeContainer.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      if (parent.querySelector('#bentube-add-button')) {
        buttonInjected = true;
        return;
      }
      parent = parent.parentElement;
    }

    currentChannelId = getChannelIdFromPage();
    currentChannelName = getChannelNameFromPage();

    const button = createBenTubeButton();

    if (subscribeContainer.parentElement) {
      subscribeContainer.parentElement.insertBefore(button, subscribeContainer.nextSibling);
    }
    buttonInjected = true;

    log('Button injected', { channelId: currentChannelId, channelName: currentChannelName });
  }

  function resetState() {
    buttonInjected = false;
    currentChannelId = null;
    currentChannelName = null;
    hidePopover();

    const existingButton = document.querySelector('#bentube-add-button');
    if (existingButton) {
      existingButton.remove();
    }
  }

  // ============================================
  // Navigation Observer
  // ============================================

  function setupNavigationObserver() {
    let lastUrl = location.href;

    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        resetState();
        setTimeout(tryInjectButton, 1000);
      } else if (!buttonInjected) {
        tryInjectButton();
      }
    }).observe(document.body, { subtree: true, childList: true });
  }

  function tryInjectButton() {
    let attempts = 0;
    const maxAttempts = 20;

    const tryInject = () => {
      injectButton();
      if (!buttonInjected && attempts < maxAttempts) {
        attempts++;
        setTimeout(tryInject, 300);
      }
    };

    tryInject();
  }

  // ============================================
  // Initialize
  // ============================================

  function init() {
    log('Userscript loaded');
    injectStyles();
    setupNavigationObserver();
    tryInjectButton();

    if (typeof GM_registerMenuCommand !== 'undefined') {
      GM_registerMenuCommand('BenTube Settings', showSettingsModal);
    }

    setTimeout(() => {
      const settings = getSettings();
      log('Checking settings - API key exists:', !!settings.apiKey);

      if (!settings.apiKey && !settingsShownThisSession) {
        const lsApiKey = localStorage.getItem(STORAGE_KEY_PREFIX + 'apiKey');
        if (!lsApiKey) {
          settingsShownThisSession = true;
          showSettingsModal();
        }
      }
    }, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
