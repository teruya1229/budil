/**
 * Budil v4.13.0 - クラウドバックアップ基盤 Phase 1 (budil-backups連携)
 *
 * localStorageが正本のまま、既存 DataBackup.exportPayload() / validatePayload() を
 * そのまま再利用し、Supabase Edge Function `budil-backups` へ immutable snapshot を
 * 保存するだけの薄いクライアント。自動同期・自動復元・クラウドからの復元・
 * localStorage上書きは一切行わない（保存のみ）。
 *
 * 接続先はホスト名から固定判定する（query/hash/localStorage/画面入力での切替は不可）。
 * - https://teruya1229.github.io  -> production（既存BC Supabase Authを利用）
 * - localhost / 127.0.0.1         -> staging（テストAuth userのみ）
 * - それ以外の未知originはfail closed（クラウド機能を無効化）
 *
 * frontendにはproject URLとpublishable keyだけを置く。
 * secret/service_role key・DBパスワードはここにも他のどこにも置かない。
 *
 * ログイン失敗時にメール・パスワードをConsoleへ出さない。payload本文もConsoleへ出さない。
 */
(function (global) {
  'use strict';

  var SESSION_KEY = 'budil-cloud.auth.v1.session';
  var DEFAULT_TIMEOUT_MS = 15000;

  // 本番はAI番頭と同じBC Supabase Authプロジェクト（既存の公開可能なpublishable keyのみ）。
  var ENV_CONFIG = {
    production: {
      label: '本番（production）',
      url: 'https://xvrrlwlgoxbrkhlfyznx.supabase.co',
      publishableKey: 'sb_publishable_dkTnfxy8pA8qcuJeVcrf1w_8ieMQEw1'
    },
    staging: {
      label: '検証用（staging）',
      url: 'https://kocfoitzxrxjprxfcljy.supabase.co',
      publishableKey: 'sb_publishable_vrZwynp3GoFA_cGxYUJWXQ_YK3_vFB-'
    }
  };

  var CODE = {
    OK: 'ok',
    DISABLED: 'cloud_disabled',
    NOT_SIGNED_IN: 'not_signed_in',
    IN_PROGRESS: 'in_progress',
    INVALID_PAYLOAD: 'invalid_payload',
    NETWORK: 'network_error',
    TIMEOUT: 'timeout',
    UNAUTHORIZED: 'unauthorized',
    UNKNOWN: 'unknown_error'
  };

  var sessionReady = false;
  var backupInFlight = false;

  function resolveEnvironment() {
    var hostname = '';
    try {
      hostname = String(global.location && global.location.hostname || '').toLowerCase();
    } catch (_e) {
      hostname = '';
    }
    if (hostname === 'teruya1229.github.io') return 'production';
    if (hostname === 'localhost' || hostname === '127.0.0.1') return 'staging';
    return null; // 未知origin: fail closed
  }

  function getConfig() {
    var env = resolveEnvironment();
    if (!env) return null;
    var cfg = ENV_CONFIG[env];
    if (!cfg || !cfg.url || !cfg.publishableKey) return null;
    return { env: env, label: cfg.label, url: cfg.url, publishableKey: cfg.publishableKey };
  }

  function isAvailable() {
    return !!getConfig();
  }

  function sessionStorageRef() {
    return global.sessionStorage;
  }

  function clearSessionOnly() {
    try {
      sessionStorageRef().removeItem(SESSION_KEY);
    } catch (_e) { /* ignore */ }
  }

  function readSession() {
    try {
      var raw = sessionStorageRef().getItem(SESSION_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.access_token || !parsed.refresh_token) {
        clearSessionOnly();
        return null;
      }
      return {
        access_token: String(parsed.access_token),
        refresh_token: String(parsed.refresh_token),
        expires_at: Number(parsed.expires_at) || 0,
        env: String(parsed.env || '')
      };
    } catch (_e) {
      clearSessionOnly();
      return null;
    }
  }

  function writeSession(session) {
    var payload = {
      access_token: String(session.access_token || ''),
      refresh_token: String(session.refresh_token || ''),
      expires_at: Number(session.expires_at) || 0,
      env: String(session.env || '')
    };
    if (!payload.access_token || !payload.refresh_token) {
      clearSessionOnly();
      return;
    }
    try {
      sessionStorageRef().setItem(SESSION_KEY, JSON.stringify(payload));
    } catch (_e) { /* ignore */ }
  }

  function isExpired(session, skewSeconds) {
    if (!session || !session.expires_at) return true;
    var skew = typeof skewSeconds === 'number' ? skewSeconds : 30;
    return Math.floor(Date.now() / 1000) >= session.expires_at - skew;
  }

  function buildExpiresAt(body) {
    var expiresIn = Number(body && body.expires_in) || 0;
    if (expiresIn > 0) return Math.floor(Date.now() / 1000) + expiresIn;
    return Math.floor(Date.now() / 1000) + 3600;
  }

  function doFetch(url, options) {
    var timeoutMs = (options && options.timeoutMs) || DEFAULT_TIMEOUT_MS;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
    var init = {
      method: (options && options.method) || 'GET',
      headers: (options && options.headers) || {},
      body: options && options.body != null ? options.body : undefined
    };
    if (controller) init.signal = controller.signal;
    return fetch(url, init)
      .then(function (resp) {
        return resp.text().then(function (text) {
          var body = null;
          try { body = text ? JSON.parse(text) : null; } catch (_e) { body = null; }
          return { networkError: false, timeout: false, status: resp.status, body: body };
        });
      })
      .catch(function (err) {
        var aborted = err && (err.name === 'AbortError' || /aborted|abort/i.test(String(err.message || '')));
        return { networkError: !aborted, timeout: !!aborted, status: 0, body: null };
      })
      .then(function (result) {
        if (timer) clearTimeout(timer);
        return result;
      });
  }

  function authFetch(path, options) {
    var cfg = getConfig();
    if (!cfg) return Promise.resolve({ configError: true, networkError: false, timeout: false, status: 0, body: null });
    var headers = { apikey: cfg.publishableKey, 'Content-Type': 'application/json' };
    if (options && options.authorization) headers.Authorization = options.authorization;
    return doFetch(cfg.url + path, {
      method: (options && options.method) || 'POST',
      headers: headers,
      body: options && options.body,
      timeoutMs: options && options.timeoutMs
    }).then(function (r) {
      r.configError = false;
      return r;
    });
  }

  function login(email, password) {
    if (!isAvailable()) {
      return Promise.resolve({ ok: false, code: CODE.DISABLED, message: 'この環境ではクラウドバックアップは利用できません' });
    }
    var trimmedEmail = String(email || '').trim();
    var pass = String(password || '');
    if (!trimmedEmail || !pass) {
      return Promise.resolve({ ok: false, code: 'invalid_credentials', message: 'メールアドレスとパスワードを入力してください' });
    }
    var env = resolveEnvironment();
    return authFetch('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: trimmedEmail, password: pass })
    }).then(function (result) {
      pass = '';
      trimmedEmail = '';
      if (result.configError) return { ok: false, code: 'config_error', message: '設定エラーです' };
      if (result.timeout) return { ok: false, code: CODE.TIMEOUT, message: '通信がタイムアウトしました' };
      if (result.networkError) return { ok: false, code: CODE.NETWORK, message: '通信に失敗しました' };
      if (result.status !== 200 || !result.body || !result.body.access_token) {
        return { ok: false, code: 'invalid_credentials', message: 'メールアドレスまたはパスワードが正しくありません' };
      }
      writeSession({
        access_token: result.body.access_token,
        refresh_token: result.body.refresh_token,
        expires_at: buildExpiresAt(result.body),
        env: env
      });
      sessionReady = true;
      return { ok: true, code: CODE.OK };
    });
  }

  function refreshSession() {
    var session = readSession();
    if (!session || !session.refresh_token) {
      clearSessionOnly();
      return Promise.resolve({ ok: false, code: CODE.NOT_SIGNED_IN });
    }
    return authFetch('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: session.refresh_token })
    }).then(function (result) {
      if (result.configError || result.timeout || result.networkError || result.status !== 200 || !result.body || !result.body.access_token) {
        clearSessionOnly();
        return { ok: false, code: CODE.UNAUTHORIZED };
      }
      writeSession({
        access_token: result.body.access_token,
        refresh_token: result.body.refresh_token || session.refresh_token,
        expires_at: buildExpiresAt(result.body),
        env: session.env
      });
      return { ok: true, code: CODE.OK };
    });
  }

  function getValidAccessToken() {
    var session = readSession();
    if (!session) return Promise.resolve({ ok: false, code: CODE.NOT_SIGNED_IN, accessToken: null });
    if (session.env !== resolveEnvironment()) {
      // 環境が変わっていたら（原因不明の不整合）安全側でセッション破棄。
      clearSessionOnly();
      return Promise.resolve({ ok: false, code: CODE.NOT_SIGNED_IN, accessToken: null });
    }
    if (!isExpired(session, 30)) {
      return Promise.resolve({ ok: true, code: CODE.OK, accessToken: session.access_token });
    }
    return refreshSession().then(function (r) {
      if (!r.ok) return { ok: false, code: r.code, accessToken: null };
      var next = readSession();
      return { ok: !!next, code: next ? CODE.OK : CODE.NOT_SIGNED_IN, accessToken: next ? next.access_token : null };
    });
  }

  function logout() {
    var session = readSession();
    var cfg = getConfig();
    clearSessionOnly();
    sessionReady = true;
    if (!session || !session.access_token || !cfg) {
      return Promise.resolve({ ok: true });
    }
    return authFetch('/auth/v1/logout', {
      method: 'POST',
      authorization: 'Bearer ' + session.access_token,
      body: '{}'
    }).then(function () {
      return { ok: true };
    }).catch(function () {
      return { ok: true };
    });
  }

  function whenReady() {
    sessionReady = true;
    return Promise.resolve(getAuthState());
  }

  function getAuthState() {
    if (!isAvailable()) return { available: false, signedIn: false };
    var session = readSession();
    return { available: true, signedIn: !!session, ready: sessionReady };
  }

  function isSessionReady() {
    return !!sessionReady;
  }

  function createIdempotencyKey() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return String(global.crypto.randomUUID()).toLowerCase();
    }
    // Fallback (very old browsers only) - still a valid v4-shaped UUID.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function stableStringify(value) {
    return JSON.stringify(sortValue(value));
  }

  function sortValue(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(sortValue);
    var sorted = {};
    Object.keys(value).sort().forEach(function (key) {
      sorted[key] = sortValue(value[key]);
    });
    return sorted;
  }

  function sha256Hex(text) {
    if (!global.crypto || !global.crypto.subtle || typeof global.crypto.subtle.digest !== 'function') {
      return Promise.resolve(null);
    }
    var data = new TextEncoder().encode(text);
    return global.crypto.subtle.digest('SHA-256', data).then(function (digest) {
      var bytes = Array.from(new Uint8Array(digest));
      return bytes.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }).catch(function () {
      return null;
    });
  }

  /**
   * 既存 DataBackup.exportPayload() / validatePayload() をそのまま使い、
   * budil-backups へ1回だけPOSTする。二重押下防止・401時のみ同じキーで1回だけ再試行。
   * 失敗時も既存業務localStorageは一切変更しない（読み取りのみ）。
   */
  function backupNow() {
    if (backupInFlight) {
      return Promise.resolve({ ok: false, code: CODE.IN_PROGRESS, message: '保存処理を実行中です' });
    }
    if (!isAvailable()) {
      return Promise.resolve({ ok: false, code: CODE.DISABLED, message: 'この環境ではクラウドバックアップは利用できません' });
    }
    if (typeof DataBackup === 'undefined') {
      return Promise.resolve({ ok: false, code: CODE.UNKNOWN, message: 'バックアップ機能を読み込めませんでした' });
    }

    backupInFlight = true;

    var payload = DataBackup.exportPayload();
    var validation = DataBackup.validatePayload(payload);
    if (!validation.valid) {
      backupInFlight = false;
      return Promise.resolve({ ok: false, code: CODE.INVALID_PAYLOAD, message: 'バックアップデータの検証に失敗しました' });
    }

    var idempotencyKey = createIdempotencyKey();
    var cfg = getConfig();
    var bodyText = JSON.stringify(payload);

    function attempt(accessToken, retried401) {
      return doFetch(cfg.url + '/functions/v1/budil-backups', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          apikey: cfg.publishableKey,
          'Content-Type': 'application/json',
          'x-idempotency-key': idempotencyKey
        },
        body: bodyText,
        timeoutMs: 30000
      }).then(function (result) {
        if (result.timeout) return { ok: false, code: CODE.TIMEOUT, message: '通信がタイムアウトしました' };
        if (result.networkError) return { ok: false, code: CODE.NETWORK, message: '通信に失敗しました' };
        if (result.status === 401 && !retried401) {
          return refreshSession().then(function (r) {
            if (!r.ok) return { ok: false, code: CODE.UNAUTHORIZED, message: 'ログインが必要です' };
            var next = readSession();
            if (!next) return { ok: false, code: CODE.UNAUTHORIZED, message: 'ログインが必要です' };
            return attempt(next.access_token, true);
          });
        }
        if (result.status === 401) {
          return { ok: false, code: CODE.UNAUTHORIZED, message: 'ログインが必要です' };
        }
        var bodyCode = result.body && result.body.code;
        if ((result.status === 200 || result.status === 201) && result.body && result.body.ok) {
          return {
            ok: true,
            code: CODE.OK,
            snapshotId: result.body.snapshotId,
            createdAt: result.body.createdAt,
            contentHash: result.body.contentHash,
            appVersion: result.body.appVersion
          };
        }
        return { ok: false, code: bodyCode || CODE.UNKNOWN, message: '保存に失敗しました（' + (bodyCode || result.status) + '）' };
      });
    }

    return getValidAccessToken().then(function (tokenResult) {
      if (!tokenResult.ok || !tokenResult.accessToken) {
        return { ok: false, code: CODE.NOT_SIGNED_IN, message: 'ログインが必要です' };
      }
      return sha256Hex(stableStringify(payload)).then(function (localHash) {
        return attempt(tokenResult.accessToken, false).then(function (res) {
          if (localHash) res.localContentHash = localHash;
          return res;
        });
      });
    }).finally(function () {
      backupInFlight = false;
    });
  }

  function fetchLatest() {
    if (!isAvailable()) {
      return Promise.resolve({ ok: false, code: CODE.DISABLED });
    }
    var cfg = getConfig();
    return getValidAccessToken().then(function (tokenResult) {
      if (!tokenResult.ok || !tokenResult.accessToken) {
        return { ok: false, code: CODE.NOT_SIGNED_IN };
      }
      return doFetch(cfg.url + '/functions/v1/budil-backups/latest', {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + tokenResult.accessToken, apikey: cfg.publishableKey },
        timeoutMs: 15000
      }).then(function (result) {
        if (result.timeout) return { ok: false, code: CODE.TIMEOUT };
        if (result.networkError) return { ok: false, code: CODE.NETWORK };
        if (result.status === 401) return { ok: false, code: CODE.UNAUTHORIZED };
        if (result.status !== 200 || !result.body || !result.body.ok) {
          return { ok: false, code: CODE.UNKNOWN };
        }
        return { ok: true, code: CODE.OK, latest: result.body.latest || null };
      });
    });
  }

  /**
   * Read-only Phase1 GPT interpreter — ONLY fictional inputs.
   * Shares the existing Supabase login/session pathway; does not access Budil
   * Storage, create records, or approve/execute generated commands.
   * Backend is disabled until explicitly enabled and deployed.
   */
  function interpretFixture(instruction) {
    var cfg = getConfig();
    var localTrial = null;
    var path = '';
    try { path = String(global.location && global.location.pathname || ''); } catch (_e) {}
    // Dedicated localhost fictional-data demo only. Does NOT modify Budil
    // backup auth, staging selection, or production authentication.
    if (cfg && cfg.env === 'staging' &&
        path === '/budil-gpt-phase1-demo.html' &&
        global.BudilGptTrialAuth && global.BudilGptTrialAuth.supported()) {
      localTrial = global.BudilGptTrialAuth;
      cfg = localTrial.gatewayConfig();
    }
    if (!cfg || (cfg.env !== 'production' && !localTrial)) {
      return Promise.resolve({ ok: false, code: 'gpt_fixture_origin_unavailable' });
    }
    var raw = String(instruction || '').trim();
    if (!raw || raw.length > 480 || new TextEncoder().encode(raw).length > 2048) {
      return Promise.resolve({ ok: false, code: 'instruction_invalid' });
    }
    // Full-match fictional grammar: block arbitrary PII/prompts BEFORE transmitting
    // even to the authenticated test endpoint. The backend enforces this again.
    var clean = raw.replace(/[\s　]/g, '')
      .replace(/[０-９]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
      }).replace(/，/g, ',');
    var yen = '(?:[1-9][0-9]{0,8}|[1-9][0-9]{0,2}(?:,[0-9]{3})+)';
    var demoCreate = new RegExp(
      '^(?:比嘉清子|田中太郎|佐藤美咲|田中)(?:さん|様)?の' +
      '(?:エアコン洗浄|エアコンクリーニング)' +
      '(?:[1-9]|[12][0-9]|30)台を' +
      '(?:税込|税抜|税別|内税|外税)?' + yen +
      '円で見積(?:書)?(?:も)?(?:作って|して|お願い)?$'
    );
    var demoRevision = new RegExp(
      '^(?:金額|合計)(?:を)?(?:税込|税抜|税別|内税|外税)?' +
      yen + '円(?:に)?(?:変更|修正|直し|直して|して|変えて)$'
    );
    var amountMatch = clean.match(/([0-9][0-9,]*)円/);
    var explicitAmount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : 0;
    if ((!demoCreate.test(clean) && !demoRevision.test(clean)) ||
        !Number.isSafeInteger(explicitAmount) || explicitAmount <= 0 ||
        explicitAmount > 100000000) {
      return Promise.resolve({ ok: false, code: 'fixture_only' });
    }
    var readToken = localTrial ? localTrial.getValidAccessToken : getValidAccessToken;
    return readToken().then(function (tokenResult) {
      if (!tokenResult.ok || !tokenResult.accessToken) {
        return { ok: false, code: CODE.NOT_SIGNED_IN, message: 'ログインが必要です' };
      }
      return doFetch(cfg.url + '/functions/v1/budil-gpt-interpret', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + tokenResult.accessToken,
          apikey: cfg.publishableKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ instruction: raw, mode: 'fixture' }),
        timeoutMs: 20000
      }).then(function (response) {
        if (response.timeout) return { ok: false, code: CODE.TIMEOUT };
        if (response.networkError) return { ok: false, code: CODE.NETWORK };
        if (response.status !== 200 || !response.body || response.body.ok !== true) {
          return { ok: false, code: response.body && response.body.code || CODE.UNKNOWN };
        }
        if (response.body.phase !== 'interpret_only' || response.body.can_execute !== false) {
          return { ok: false, code: 'unsafe_interpret_response' };
        }
        return response.body;
      });
    });
  }

  /**
   * Authenticated, no-cost GPT readiness probe for the isolated localhost
   * fictional-data demo. Reuses the trial Auth session, NEVER the backup
   * session. Returns booleans only, no key material or customer data.
   */
  function getFixtureGptReadiness() {
    var trial = global.BudilGptTrialAuth;
    if (!trial || !trial.supported || !trial.supported()) {
      return Promise.resolve({ok:false,code:'gpt_fixture_origin_unavailable'});
    }
    var config = trial.gatewayConfig();
    if (!config) return Promise.resolve({ok:false,code:'gpt_fixture_origin_unavailable'});
    return trial.getValidAccessToken().then(function (token) {
      if (!token || !token.ok || !token.accessToken) {
        return {ok:false,code:CODE.NOT_SIGNED_IN};
      }
      return doFetch(config.url + '/functions/v1/budil-gpt-interpret', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + token.accessToken,
          apikey: config.publishableKey
        },
        timeoutMs: 12000
      }).then(function (response) {
        if (response.timeout) return {ok:false,code:CODE.TIMEOUT};
        if (response.networkError) return {ok:false,code:CODE.NETWORK};
        if (response.status !== 200 || !response.body ||
            response.body.phase !== 'readiness_only' || response.body.ok !== true) {
          return {ok:false,code:response.body && response.body.code || 'readiness_unavailable'};
        }
        return {
          ok:true,
          phase:'readiness_only',
          enabled:response.body.enabled === true,
          keyConfigured:response.body.key_configured === true,
          modelSupported:response.body.model_supported === true,
          ready:response.body.ready === true,
          externalRequestSent:false
        };
      });
    });
  }

  /**
   * Experimental REAL-NAME-COMPATIBLE interpretation path:
   * keep the customer name on the device, send only the standardized
   * customer-neutral service/quantity/total/tax sentence.
   * This is available ONLY from the localhost fictional-data demo.
   * The Edge endpoint independently requires a separate disabled-by-default
   * BUDIL_GPT_ANONYMIZED_ENABLED flag.
   */
  function interpretAnonymizedQuote(original) {
    var tool = typeof BudilGptAnonymize !== 'undefined'
      ? BudilGptAnonymize : global.BudilGptAnonymize;
    if (!tool || typeof tool.prepare !== 'function' ||
        typeof tool.verifyResult !== 'function') {
      return Promise.resolve({ok:false,code:'anonymizer_unavailable'});
    }
    var local = tool.prepare(original);
    if (!local.ok) return Promise.resolve({ok:false,code:local.code});
    var trial = global.BudilGptTrialAuth;
    if (!trial || !trial.supported || !trial.supported()) {
      return Promise.resolve({ok:false,code:'gpt_fixture_origin_unavailable'});
    }
    var config = trial.gatewayConfig();
    if (!config || !tool.acceptsWire(local.wire)) {
      return Promise.resolve({ok:false,code:'anonymized_wire_invalid'});
    }
    return trial.getValidAccessToken().then(function (token) {
      if (!token || !token.ok || !token.accessToken) {
        return {ok:false,code:CODE.NOT_SIGNED_IN};
      }
      // Deliberately omit original, customerName, id and any other local data.
      return doFetch(config.url + '/functions/v1/budil-gpt-interpret', {
        method:'POST',
        headers:{
          Authorization:'Bearer ' + token.accessToken,
          apikey:config.publishableKey,
          'Content-Type':'application/json'
        },
        body:JSON.stringify({
          mode: local.wire.mode,
          instruction: local.wire.instruction
        }),
        timeoutMs:20000
      }).then(function (response) {
        if (response.timeout) return {ok:false,code:CODE.TIMEOUT};
        if (response.networkError) return {ok:false,code:CODE.NETWORK};
        if (response.status !== 200 || !response.body || response.body.ok !== true) {
          return {ok:false,code:response.body && response.body.code || CODE.UNKNOWN};
        }
        if (response.body.input_mode !== 'anonymized' ||
            response.body.requires_human_approval !== true) {
          return {ok:false,code:'anonymized_response_unverified'};
        }
        var verified = tool.verifyResult(original,response.body);
        if (!verified.ok) return {ok:false,code:verified.code || 'anonymized_response_unverified'};
        // Return the server schema, NOT the locally parsed customer name.
        return response.body;
      });
    });
  }

  function isBackupInFlight() {
    return backupInFlight;
  }

  global.BudilCloud = {
    CODE: CODE,
    resolveEnvironment: resolveEnvironment,
    isAvailable: isAvailable,
    getConfig: getConfig,
    whenReady: whenReady,
    isSessionReady: isSessionReady,
    getAuthState: getAuthState,
    login: login,
    logout: logout,
    backupNow: backupNow,
    fetchLatest: fetchLatest,
    interpretFixture: interpretFixture,
    getFixtureGptReadiness: getFixtureGptReadiness,
    interpretAnonymizedQuote: interpretAnonymizedQuote,
    isBackupInFlight: isBackupInFlight
  };
})(typeof window !== 'undefined' ? window : globalThis);
