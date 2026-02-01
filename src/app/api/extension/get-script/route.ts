import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateApiKey, saveApiKeyHash } from '@/lib/auth/api-key'

export const dynamic = 'force-dynamic'

// Embed the script template directly since Vercel can't read from public/ filesystem
// Build timestamp: 2026-02-02T10:00:00Z - force cache invalidation
const SCRIPT_TEMPLATE = `// ==UserScript==
// @name         BenTube - Add to Groups
// @namespace    https://ben-tube.com
// @version      3.5.0
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
  const DEFAULT_API_KEY = '__API_KEY_PLACEHOLDER__';

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

  // Check if string is an emoji (not a text icon name)
  function isEmoji(str) {
    if (!str) return false;
    const emojiRegex = /^[\\p{Emoji}\\u200d]+$/u;
    return emojiRegex.test(str) || str.length <= 2;
  }

  // Render icon - handle waveform and other text icons
  function renderIcon(icon) {
    if (icon === 'waveform') return WAVEFORM_SVG;
    if (isEmoji(icon)) return icon;
    return '📁'; // fallback for unknown text icons
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
    style.textContent = \`
      #bentube-btn {
        display: inline-flex; align-items: center; justify-content: center;
        width: 40px; height: 40px; margin-left: 8px;
        background: linear-gradient(135deg, #B8860B, #8B6914); color: white; border: none;
        border-radius: 50%; cursor: pointer; vertical-align: middle;
      }
      #bentube-btn:hover { background: linear-gradient(135deg, #DAA520, #B8860B); }
      #bentube-btn svg { width: 20px; height: 20px; }
      .bentube-popup {
        position: fixed; z-index: 9999; width: 300px; background: white;
        border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
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
    \`;
    document.head.appendChild(style);
  }

  let channelId = null;
  let popup = null;

  function getChannelId() {
    // Try meta tag first (most reliable)
    const meta = document.querySelector('meta[itemprop="channelId"]');
    if (meta && meta.content) return meta.content;

    // Try URL pattern for channel pages
    const match = location.pathname.match(/\\/channel\\/(UC[\\w-]+)/);
    if (match) return match[1];

    // Try ytInitialData for video pages
    try {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        if (script.textContent && script.textContent.includes('ytInitialData')) {
          const match = script.textContent.match(/"channelId":"(UC[\\w-]+)"/);
          if (match) return match[1];
          const match2 = script.textContent.match(/"externalId":"(UC[\\w-]+)"/);
          if (match2) return match2[1];
        }
      }
    } catch (e) {}

    return null;
  }

  function createPopup(btn) {
    if (popup) { popup.remove(); popup = null; return; }
    popup = document.createElement('div');
    popup.className = 'bentube-popup';
    popup.innerHTML = '<div class="bentube-popup-header"><span>Add to BenTube</span><button class="bentube-close">&times;</button></div><div class="bentube-popup-content"><div class="bentube-status">Loading...</div></div>';

    const rect = btn.getBoundingClientRect();
    popup.style.top = (rect.bottom + 8) + 'px';
    popup.style.left = Math.max(10, rect.left - 130) + 'px';

    document.body.appendChild(popup);
    popup.querySelector('.bentube-close').onclick = () => { popup.remove(); popup = null; };

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function closePopup(e) {
        if (popup && !popup.contains(e.target) && e.target !== btn) {
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

  // BenTube triangle logo SVG
  const BENTUBE_LOGO = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 22h20L12 2z"/></svg>';

  function injectButton() {
    if (document.getElementById('bentube-btn')) return;

    // Find the right actions container - try multiple selectors
    // For video pages: look for the area with bell/subscribe buttons
    // For channel pages: look for channel header buttons
    const selectors = [
      '#actions #flexible-item-buttons',  // Video page actions
      '#actions-inner #menu',              // Alternative video page
      '#top-row #actions',                 // Another video layout
      'ytd-watch-metadata #actions',       // Watch metadata actions
      '#subscribe-button',                 // Fallback to subscribe button
      '#channel-header #subscribe-button', // Channel page
      '#inner-header-container #buttons'   // Channel page buttons
    ];

    let container = null;
    let insertMethod = 'after'; // 'after' or 'append'

    for (const sel of selectors) {
      container = document.querySelector(sel);
      if (container) {
        console.log('[BenTube] Found container:', sel);
        break;
      }
    }

    if (!container) {
      console.log('[BenTube] No container found for button');
      return;
    }

    channelId = getChannelId();
    if (!channelId) {
      console.log('[BenTube] No channel ID found');
      return;
    }
    console.log('[BenTube] Channel ID:', channelId);

    const btn = document.createElement('button');
    btn.id = 'bentube-btn';
    btn.innerHTML = BENTUBE_LOGO;
    btn.title = 'Add to BenTube';
    btn.onclick = (e) => { e.stopPropagation(); e.preventDefault(); createPopup(btn); };

    // Insert button appropriately based on container type
    if (container.id === 'subscribe-button' || container.tagName === 'YTD-SUBSCRIBE-BUTTON-RENDERER') {
      container.parentElement?.insertBefore(btn, container.nextSibling);
    } else {
      container.appendChild(btn);
    }
    console.log('[BenTube] Button injected');
  }

  // Menu command to test connection
  GM_registerMenuCommand('Test BenTube Connection', async () => {
    const res = await apiRequest('/api/extension/groups');
    if (res.success) {
      alert('SUCCESS! Found ' + res.data.length + ' groups:\\n' + res.data.map(g => '- ' + g.name).join('\\n'));
    } else {
      alert('FAILED: ' + res.error);
    }
  });

  function init() {
    console.log('[BenTube] Script initialized v3.5.0 on:', location.href);
    injectStyles();

    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        console.log('[BenTube] URL changed to:', location.href);
        const old = document.getElementById('bentube-btn');
        if (old) old.remove();
        if (popup) { popup.remove(); popup = null; }
        channelId = null;
      }
      injectButton();
    });
    observer.observe(document.body, { subtree: true, childList: true });

    // Initial injection with a small delay to let YouTube render
    setTimeout(injectButton, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();`

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { plaintext, hash } = generateApiKey()
    const saved = await saveApiKeyHash(user.id, hash)

    if (!saved) {
      return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 })
    }

    const script = SCRIPT_TEMPLATE.replace('__API_KEY_PLACEHOLDER__', plaintext)

    return new NextResponse(script, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript',
        'Content-Disposition': 'attachment; filename="bentube.user.js"',
      },
    })
  } catch (error) {
    console.error('[Extension/GetScript] Error:', error)
    return NextResponse.json({ error: 'Failed to generate script' }, { status: 500 })
  }
}
