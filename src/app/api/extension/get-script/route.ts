import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateApiKey, saveApiKeyHash } from '@/lib/auth/api-key'

// Embed the script template directly since Vercel can't read from public/ filesystem
const SCRIPT_TEMPLATE = `// ==UserScript==
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

  const DEFAULT_SERVER_URL = 'https://bentube.app';
  const DEFAULT_API_KEY = '__API_KEY_PLACEHOLDER__';
  const STORAGE_KEY_PREFIX = 'bentube_';

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
    } catch (e) {}
    if (!serverUrl && !apiKey) {
      try {
        serverUrl = localStorage.getItem(STORAGE_KEY_PREFIX + 'serverUrl');
        apiKey = localStorage.getItem(STORAGE_KEY_PREFIX + 'apiKey');
      } catch (e) {}
    }
    return {
      serverUrl: serverUrl || DEFAULT_SERVER_URL,
      apiKey: apiKey || DEFAULT_API_KEY
    };
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
        }
      });
    });
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = \`
      #bentube-btn {
        display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; margin-left: 8px;
        background: linear-gradient(135deg, #3B82F6, #2563EB); color: white; border: none;
        border-radius: 20px; font-size: 14px; font-weight: 500; cursor: pointer;
      }
      #bentube-btn:hover { background: linear-gradient(135deg, #2563EB, #1D4ED8); }
      .bentube-popup {
        position: absolute; z-index: 9999; width: 280px; background: white;
        border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        font-family: 'Roboto', sans-serif;
      }
      html[dark] .bentube-popup { background: #1f1f1f; }
      .bentube-popup-header {
        display: flex; justify-content: space-between; padding: 12px 16px;
        border-bottom: 1px solid #e5e5e5; font-weight: 600; font-size: 14px;
      }
      html[dark] .bentube-popup-header { border-color: #3f3f3f; color: #fff; }
      .bentube-popup-content { padding: 12px; max-height: 300px; overflow-y: auto; }
      .bentube-group {
        display: flex; align-items: center; gap: 10px; padding: 10px 12px;
        border: 1px solid #e5e5e5; border-radius: 8px; cursor: pointer; width: 100%;
        background: transparent; text-align: left; margin-bottom: 4px;
      }
      html[dark] .bentube-group { border-color: #3f3f3f; }
      .bentube-group:hover { background: #f5f5f5; border-color: #3B82F6; }
      html[dark] .bentube-group:hover { background: #2f2f2f; }
      .bentube-icon { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
      .bentube-name { flex: 1; font-size: 14px; font-weight: 500; }
      html[dark] .bentube-name { color: #fff; }
      .bentube-count { font-size: 12px; color: #666; background: #e5e5e5; padding: 2px 8px; border-radius: 10px; }
      html[dark] .bentube-count { background: #3f3f3f; color: #aaa; }
      .bentube-status { padding: 8px 16px; text-align: center; font-size: 12px; }
      .bentube-status.success { color: #16a34a; }
      .bentube-status.error { color: #dc2626; }
      .bentube-close { background: none; border: none; font-size: 20px; cursor: pointer; color: #666; }
    \`;
    document.head.appendChild(style);
  }

  let channelId = null;
  let popup = null;

  function getChannelId() {
    try {
      const yt = unsafeWindow.ytInitialData;
      if (yt?.metadata?.channelMetadataRenderer?.externalId) return yt.metadata.channelMetadataRenderer.externalId;
      if (yt?.header?.c4TabbedHeaderRenderer?.channelId) return yt.header.c4TabbedHeaderRenderer.channelId;
      const contents = yt?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
      if (contents) {
        for (const c of contents) {
          const id = c.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer?.navigationEndpoint?.browseEndpoint?.browseId;
          if (id) return id;
        }
      }
    } catch (e) {}
    const meta = document.querySelector('meta[itemprop="channelId"]');
    if (meta) return meta.content;
    const match = location.pathname.match(/\\/channel\\/(UC[\\w-]+)/);
    if (match) return match[1];
    return null;
  }

  function createPopup(btn) {
    if (popup) { popup.remove(); popup = null; return; }
    popup = document.createElement('div');
    popup.className = 'bentube-popup';
    popup.innerHTML = '<div class="bentube-popup-header"><span>Add to BenTube</span><button class="bentube-close">&times;</button></div><div class="bentube-popup-content"><div class="bentube-status">Loading...</div></div>';
    const rect = btn.getBoundingClientRect();
    popup.style.top = (rect.bottom + window.scrollY + 8) + 'px';
    popup.style.left = (rect.left + window.scrollX) + 'px';
    document.body.appendChild(popup);
    popup.querySelector('.bentube-close').onclick = () => { popup.remove(); popup = null; };
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
      '<span class="bentube-icon" style="background:' + (g.color || '#3B82F6') + '">' + (g.icon || '📁') + '</span>' +
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

  function injectButton() {
    if (document.getElementById('bentube-btn')) return;
    const sub = document.querySelector('#owner #subscribe-button, #subscribe-button');
    if (!sub) return;
    channelId = getChannelId();
    if (!channelId) return;
    const btn = document.createElement('button');
    btn.id = 'bentube-btn';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg> BenTube';
    btn.onclick = (e) => { e.stopPropagation(); createPopup(btn); };
    sub.parentElement?.insertBefore(btn, sub.nextSibling);
  }

  function init() {
    injectStyles();
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        const old = document.getElementById('bentube-btn');
        if (old) old.remove();
        if (popup) { popup.remove(); popup = null; }
        channelId = null;
      }
      injectButton();
    });
    observer.observe(document.body, { subtree: true, childList: true });
    injectButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();`

export async function POST(request: NextRequest) {
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
