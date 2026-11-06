/**
 * Budil x GPT: isolated login ONLY for the localhost fictional-data test page.
 * Uses the existing BC Supabase Auth project, not the unrelated localhost
 * backup/staging project. Never logs, exports, or persists the password.
 * Session storage is namespaced and never touches the regular Budil session.
 *
 * This module is INERT on normal Budil pages and on unknown origins.
 */
(function (scope) {
  'use strict';

  const KEY = 'budil.gpt.fixture.auth.v1';
  // Both values below are PUBLIC (Supabase project URL and publishable API key).
  // This MUST NOT contain a service-role secret or an OpenAI API key.
  const GATEWAY = Object.freeze({
    url: 'https://xvrrlwlgoxbrkhlfyznx.supabase.co',
    publishableKey: 'sb_publishable_dkTnfxy8pA8qcuJeVcrf1w_8ieMQEw1'
  });
  let inFlight = false;

  function supported() {
    try {
      const loc = scope.location;
      if (!loc || loc.protocol !== 'http:') return false;
      if (loc.hostname !== 'localhost' && loc.hostname !== '127.0.0.1') return false;
      if (loc.port !== '8765') return false;
      return loc.pathname === '/budil-gpt-phase1-demo.html';
    } catch (_) {
      return false;
    }
  }
  function safeStore() {
    if (!supported()) return null;
    try { return scope.sessionStorage; } catch (_) { return null; }
  }
  function getSession() {
    const store = safeStore();
    if (!store) return null;
    try {
      const item = JSON.parse(store.getItem(KEY) || 'null');
      if (!item || !item.access_token || !item.refresh_token ||
          !Number.isFinite(item.expires_at)) return null;
      return item;
    } catch (_) { return null; }
  }
  function writeSession(response) {
    const store = safeStore();
    if (!store || !response || !response.access_token || !response.refresh_token) {
      return false;
    }
    const ttl = Math.max(1, Math.min(7200, Number(response.expires_in) || 3600));
    try {
      store.setItem(KEY, JSON.stringify({
        access_token: String(response.access_token),
        refresh_token: String(response.refresh_token),
        expires_at: Math.floor(Date.now() / 1000) + ttl
      }));
      return true;
    } catch (_) { return false; }
  }
  function clear() {
    const store = safeStore();
    if (store) {
      try { store.removeItem(KEY); } catch (_) { /* ignore */ }
    }
  }
  async function requestToken(grantType, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const resp = await scope.fetch(
        GATEWAY.url + '/auth/v1/token?grant_type=' + encodeURIComponent(grantType),
        {
          method: 'POST',
          headers: {
            apikey: GATEWAY.publishableKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        }
      );
      if (resp.status !== 200) return {ok:false,code:'auth_rejected'};
      const body = await resp.json();
      if (!writeSession(body)) return {ok:false,code:'session_unavailable'};
      return {ok:true,code:'ok'};
    } catch (_) {
      return {ok:false,code:'auth_network_error'};
    } finally { clearTimeout(timer); }
  }
  async function login(email, password) {
    if (!supported()) return {ok:false,code:'origin_not_allowed'};
    if (inFlight) return {ok:false,code:'in_progress'};
    const name = typeof email === 'string' ? email.trim() : '';
    const pass = typeof password === 'string' ? password : '';
    if (!name || !pass || name.length > 254 || pass.length > 512) {
      return {ok:false,code:'credentials_required'};
    }
    inFlight = true;
    try {
      return await requestToken('password', {email:name,password:pass});
    } finally { inFlight = false; }
  }
  async function getValidAccessToken() {
    if (!supported()) return {ok:false,code:'origin_not_allowed'};
    const session = getSession();
    if (!session) return {ok:false,code:'not_signed_in'};
    if (Math.floor(Date.now() / 1000) < session.expires_at - 30) {
      return {ok:true,code:'ok',accessToken:session.access_token};
    }
    if (inFlight) return {ok:false,code:'in_progress'};
    inFlight = true;
    try {
      const refreshed = await requestToken('refresh_token',{refresh_token:session.refresh_token});
      if (!refreshed.ok) {
        clear();
        return refreshed;
      }
      const next = getSession();
      return next ? {ok:true,code:'ok',accessToken:next.access_token}
        : {ok:false,code:'session_unavailable'};
    } finally { inFlight = false; }
  }
  function logout() {
    clear();
    return {ok:true,code:'ok'};
  }
  function getAuthStatus() {
    const session = getSession();
    return {available:supported(),signedIn:!!session};
  }
  scope.BudilGptTrialAuth = Object.freeze({
    supported, gatewayConfig: () => supported() ? GATEWAY : null,
    login, getValidAccessToken, logout, getAuthStatus
  });
})(typeof window !== 'undefined' ? window : globalThis);
