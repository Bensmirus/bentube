// ==UserScript==
// @name         BenTube - Add to Groups
// @namespace    https://ben-tube.com
// @version      3.10.0
// @description  Add YouTube channels to your BenTube groups directly from YouTube
// @author       BenTube
// @match        https://www.youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @noframes
// @connect      ben-tube.com
// @connect      localhost
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function() {
  'use strict';

  const DEFAULT_SERVER_URL = 'https://ben-tube.com';
  const DEFAULT_API_KEY = '';

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function getSettings() {
    return {
      serverUrl: DEFAULT_SERVER_URL,
      apiKey: DEFAULT_API_KEY
    };
  }

  // Waveform icon SVG (matches the app)
  const WAVEFORM_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px"><rect x="1" y="10" width="2" height="4" rx="0.5"/><rect x="4" y="7" width="2" height="10" rx="0.5"/><rect x="7" y="4" width="2" height="16" rx="0.5"/><rect x="10" y="8" width="2" height="8" rx="0.5"/><rect x="13" y="3" width="2" height="18" rx="0.5"/><rect x="16" y="6" width="2" height="12" rx="0.5"/><rect x="19" y="9" width="2" height="6" rx="0.5"/><rect x="22" y="11" width="1" height="2" rx="0.5"/></svg>';

  function isEmoji(str) {
    if (!str) return false;
    const emojiRegex = /^[\p{Emoji}\u200d]+$/u;
    return emojiRegex.test(str) || str.length <= 2;
  }

  function renderIcon(icon) {
    if (icon === 'waveform') return WAVEFORM_SVG;
    if (isEmoji(icon)) return icon;
    return '📁';
  }

  function apiRequest(endpoint, options = {}) {
    return new Promise((resolve) => {
      const settings = getSettings();
      if (!settings.apiKey) {
        resolve({ success: false, error: 'API key not configured' });
        return;
      }
      GM_xmlhttpRequest({
        method: options.method || 'GET',
        url: settings.serverUrl + endpoint,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + settings.apiKey,
          ...options.headers
        },
        data: options.body,
        timeout: 15000,
        onload: function(response) {
          try {
            const data = JSON.parse(response.responseText);
            if (response.status >= 200 && response.status < 300) {
              resolve(data);
            } else {
              resolve({ success: false, error: data.error || 'HTTP ' + response.status });
            }
          } catch (e) {
            resolve({ success: false, error: 'Invalid response' });
          }
        },
        onerror: function() {
          resolve({ success: false, error: 'Network error' });
        },
        ontimeout: function() {
          resolve({ success: false, error: 'Request timed out' });
        }
      });
    });
  }

  function injectStyles() {
    if (document.getElementById('bentube-styles')) return;
    const style = document.createElement('style');
    style.id = 'bentube-styles';
    style.textContent = `
      #bentube-btn {
        position: fixed !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 40px !important;
        height: 40px !important;
        background: linear-gradient(135deg, #B8860B, #8B6914) !important;
        color: white !important;
        border: none !important;
        border-radius: 50% !important;
        cursor: pointer !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
        transform: none !important;
        opacity: 1 !important;
        pointer-events: auto !important;
      }
      #bentube-btn:hover {
        background: linear-gradient(135deg, #DAA520, #B8860B) !important;
      }
      #bentube-btn svg {
        width: 20px !important;
        height: 20px !important;
      }
      #bentube-btn.bentube-hidden {
        display: none !important;
      }
      .bentube-popup {
        position: fixed !important;
        z-index: 2147483646 !important;
        width: 300px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        font-family: 'Roboto', sans-serif;
      }
      html[dark] .bentube-popup { background: #1f1f1f; }
      .bentube-popup-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 12px 16px; border-bottom: 1px solid #e5e5e5;
        font-weight: 600; font-size: 14px;
      }
      html[dark] .bentube-popup-header { border-color: #3f3f3f; color: #fff; }
      .bentube-popup-content { padding: 12px; max-height: 300px; overflow-y: auto; }
      .bentube-group {
        display: flex; align-items: center; gap: 10px; padding: 10px 12px;
        border: 1px solid #e5e5e5; border-radius: 8px; cursor: pointer; width: 100%;
        background: transparent; text-align: left; margin-bottom: 4px;
      }
      html[dark] .bentube-group { border-color: #3f3f3f; }
      .bentube-group:hover { background: #f5f5f5; border-color: #B8860B; }
      html[dark] .bentube-group:hover { background: #2f2f2f; }
      .bentube-icon {
        width: 28px; height: 28px; border-radius: 6px;
        display: flex; align-items: center; justify-content: center;
        font-size: 16px;
      }
      .bentube-icon svg { fill: white; }
      .bentube-name { flex: 1; font-size: 14px; font-weight: 500; }
      html[dark] .bentube-name { color: #fff; }
      .bentube-count { font-size: 12px; color: #666; background: #e5e5e5; padding: 2px 8px; border-radius: 10px; }
      html[dark] .bentube-count { background: #3f3f3f; color: #aaa; }
      .bentube-status { padding: 12px 16px; text-align: center; font-size: 13px; }
      .bentube-status.success { color: #16a34a; }
      .bentube-status.error { color: #dc2626; }
      .bentube-close { background: none; border: none; font-size: 20px; cursor: pointer; color: #666; padding: 0 4px; }
      html[dark] .bentube-close { color: #aaa; }
    `;
    document.head.appendChild(style);
  }

  let channelId = null;
  let popup = null;
  let btn = null;
  let btnHost = null; // Shadow DOM host
  let fixedTop = null;
  let fixedLeft = null;

  function getChannelId() {
    const meta = document.querySelector('meta[itemprop="channelId"]');
    if (meta && meta.content) return meta.content;

    const match = location.pathname.match(/\/channel\/(UC[\w-]+)/);
    if (match) return match[1];

    try {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        if (script.textContent && script.textContent.includes('ytInitialData')) {
          const match = script.textContent.match(/"channelId":"(UC[\w-]+)"/);
          if (match) return match[1];
          const match2 = script.textContent.match(/"externalId":"(UC[\w-]+)"/);
          if (match2) return match2[1];
        }
      }
    } catch (e) {}

    return null;
  }

  function createPopup() {
    if (popup) { popup.remove(); popup = null; return; }

    popup = document.createElement('div');
    popup.className = 'bentube-popup';
    popup.innerHTML = '<div class="bentube-popup-header"><span>Add to BenTube</span><button class="bentube-close">&times;</button></div><div class="bentube-popup-content"><div class="bentube-status">Loading...</div></div>';

    document.documentElement.appendChild(popup);

    // Position popup near the button
    const popupHeight = 350;
    const popupWidth = 300;
    const margin = 8;

    let top, left;

    // Position below button if room, otherwise above
    if (fixedTop + 40 + popupHeight + margin < window.innerHeight) {
      top = fixedTop + 40 + margin;
    } else {
      top = Math.max(margin, fixedTop - popupHeight - margin);
    }

    left = Math.max(margin, Math.min(fixedLeft, window.innerWidth - popupWidth - margin));

    popup.style.top = top + 'px';
    popup.style.left = left + 'px';

    popup.querySelector('.bentube-close').onclick = () => { popup.remove(); popup = null; };

    setTimeout(() => {
      document.addEventListener('click', function closePopup(e) {
        if (popup && !popup.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
          popup.remove();
          popup = null;
          document.removeEventListener('click', closePopup);
        }
      });
    }, 100);

    loadGroups();
  }

  async function loadGroups() {
    const content = popup.querySelector('.bentube-popup-content');
    const res = await apiRequest('/api/extension/groups');
    if (!res.success) {
      content.innerHTML = '<div class="bentube-status error">' + escapeHtml(res.error) + '</div>';
      return;
    }
    if (!res.data?.length) {
      content.innerHTML = '<div class="bentube-status">No groups. Create one in BenTube first.</div>';
      return;
    }
    content.innerHTML = res.data.map(g =>
      '<button class="bentube-group" data-id="' + g.id + '">' +
      '<span class="bentube-icon" style="background:' + (g.color || '#3B82F6') + '">' + renderIcon(g.icon) + '</span>' +
      '<span class="bentube-name">' + escapeHtml(g.name) + '</span>' +
      '<span class="bentube-count">' + (g.channelCount || 0) + '</span></button>'
    ).join('');
    content.querySelectorAll('.bentube-group').forEach(el => {
      el.onclick = () => addToGroup(el.dataset.id);
    });
  }

  async function addToGroup(groupId) {
    const content = popup.querySelector('.bentube-popup-content');
    content.innerHTML = '<div class="bentube-status">Adding...</div>';
    const res = await apiRequest('/api/extension/add-channel', {
      method: 'POST',
      body: JSON.stringify({ youtubeChannelId: channelId, groupId })
    });
    if (res.success) {
      content.innerHTML = '<div class="bentube-status success">' + (res.data?.alreadyInGroup ? 'Already in group!' : 'Added!') + '</div>';
      setTimeout(() => { if (popup) { popup.remove(); popup = null; } }, 1500);
    } else {
      content.innerHTML = '<div class="bentube-status error">' + escapeHtml(res.error) + '</div>';
    }
  }

  const BENTUBE_LOGO = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 22h20L12 2z"/></svg>';

  function createButton() {
    if (btnHost && document.documentElement.contains(btnHost)) return btn;

    // Create Shadow DOM host - this isolates our button from YouTube's CSS completely
    btnHost = document.createElement('div');
    btnHost.id = 'bentube-host';
    btnHost.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 0 !important; height: 0 !important; overflow: visible !important; z-index: 2147483647 !important; pointer-events: none !important;';

    // Create shadow root - 'closed' means YouTube can't access it
    const shadow = btnHost.attachShadow({ mode: 'closed' });

    // Inject styles directly into shadow DOM (completely isolated)
    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial !important;
      }
      #bentube-btn {
        position: fixed !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 40px !important;
        height: 40px !important;
        background: linear-gradient(135deg, #B8860B, #8B6914) !important;
        color: white !important;
        border: none !important;
        border-radius: 50% !important;
        cursor: pointer !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
        pointer-events: auto !important;
        z-index: 2147483647 !important;
      }
      #bentube-btn:hover {
        background: linear-gradient(135deg, #DAA520, #B8860B) !important;
      }
      #bentube-btn svg {
        width: 20px !important;
        height: 20px !important;
      }
      #bentube-btn.hidden {
        display: none !important;
      }
    `;
    shadow.appendChild(style);

    // Create the actual button inside shadow DOM
    btn = document.createElement('button');
    btn.id = 'bentube-btn';
    btn.innerHTML = BENTUBE_LOGO;
    btn.title = 'Add to BenTube';
    btn.className = 'hidden';
    btn.onclick = (e) => { e.stopPropagation(); e.preventDefault(); createPopup(); };
    shadow.appendChild(btn);

    // Append host to documentElement
    document.documentElement.appendChild(btnHost);
    console.log('[BenTube] Button created with Shadow DOM v3.10.0');
    return btn;
  }

  // Find subscribe button and calculate fixed position ONCE
  function calculateFixedPosition() {
    const selectors = [
      '#owner ytd-subscribe-button-renderer',
      '#owner #subscribe-button',
      'ytd-video-owner-renderer #subscribe-button',
      '#channel-header ytd-subscribe-button-renderer',
      '#inner-header-container #subscribe-button'
    ];

    let anchor = null;
    for (const sel of selectors) {
      anchor = document.querySelector(sel);
      if (anchor && anchor.offsetParent !== null) break;
      anchor = null;
    }

    if (!anchor) {
      return false;
    }

    channelId = getChannelId();
    if (!channelId) {
      return false;
    }

    const rect = anchor.getBoundingClientRect();

    // Calculate the position relative to viewport (this becomes the fixed position)
    fixedTop = rect.top + rect.height / 2 - 20;
    fixedLeft = rect.right + 12;

    return true;
  }

  function showButton() {
    if (!btn) createButton();

    if (fixedTop !== null && fixedLeft !== null) {
      // Set position directly - Shadow DOM isolates from YouTube's CSS
      btn.style.top = fixedTop + 'px';
      btn.style.left = fixedLeft + 'px';
      btn.classList.remove('hidden');
    }
  }

  function hideButton() {
    if (btn) {
      btn.classList.add('hidden');
    }
  }

  function tryPositionButton() {
    if (calculateFixedPosition()) {
      showButton();
      return true;
    }
    return false;
  }

  GM_registerMenuCommand('Test BenTube Connection', async () => {
    const res = await apiRequest('/api/extension/groups');
    if (res.success) {
      alert('SUCCESS! Found ' + res.data.length + ' groups:\n' + res.data.map(g => '- ' + g.name).join('\n'));
    } else {
      alert('FAILED: ' + res.error);
    }
  });

  function init() {
    console.log('[BenTube] Script initialized v3.10.0 (Shadow DOM)');
    injectStyles();
    createButton();

    let lastUrl = location.href;
    let positionAttempts = 0;
    const maxAttempts = 20;

    // Try to position button with retries (YouTube loads progressively)
    function attemptPosition() {
      if (tryPositionButton()) {
        console.log('[BenTube] Button positioned at', fixedTop, fixedLeft);
        positionAttempts = 0;
      } else if (positionAttempts < maxAttempts) {
        positionAttempts++;
        setTimeout(attemptPosition, 300);
      }
    }

    // Watch for URL changes (SPA navigation)
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        console.log('[BenTube] URL changed');

        // Reset state
        if (popup) { popup.remove(); popup = null; }
        channelId = null;
        fixedTop = null;
        fixedLeft = null;
        hideButton();

        // Re-calculate position for new page
        positionAttempts = 0;
        setTimeout(attemptPosition, 500);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true });

    // No position enforcement needed - Shadow DOM isolates from YouTube's CSS
    // Initial position attempt
    attemptPosition();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
