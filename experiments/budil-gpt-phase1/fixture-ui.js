/**
 * Isolated prototype UI. Do not import Storage or any live customer data.
 * GPT API integration intentionally absent. All content is FICTIONAL fixture.
 */
(function () {
  'use strict';
  const Core = window.BudilGptFixtureCore;
  const $ = (id) => document.getElementById(id);
  let session = Core.createSession();
  let exportInFlight = false;
  let pdfCompleted = false;
  let speechRecognizer = null;
  let gptRequestInFlight = false;

  function show(id, yes) {
    $(id).classList.toggle('fixture-hidden', !yes);
  }
  function status(message, error) {
    const el = $('fixture-status');
    el.textContent = message;
    el.classList.toggle('error', !!error);
  }
  function textNode(tag, text) {
    const el = document.createElement(tag);
    el.textContent = String(text == null ? '' : text);
    return el;
  }
  function humanAmount(n) {
    return Number(n).toLocaleString('ja-JP') + '円';
  }
  function summary(containerId, doc, revision) {
    const container = $(containerId);
    container.replaceChildren();
    if (!doc) return;
    const dl = document.createElement('dl');
    const add = (label, value) => {
      dl.append(textNode('dt', label));
      const dd = textNode('dd', value);
      if (label === '合計') dd.className = 'fixture-total';
      dl.append(dd);
    };
    add('顧客', doc.customerName + ' ' + (doc.customerHonorific || '様'));
    add('書類', '架空データ見積書');
    add('品目', (doc.items || []).map((it) => it.name + ' × ' + it.quantity + '台').join(', '));
    add('税区分', doc.taxSettings && doc.taxSettings.taxDisplayMode === 'taxIncluded' ? '税込' : '税抜');
    add('小計', humanAmount(doc.subtotal));
    add('消費税', humanAmount(doc.tax));
    add('合計', humanAmount(doc.total));
    if (revision) add('下書き版', String(revision));
    container.append(dl);
  }
  function hideFuture() {
    show('fixture-followup', false);
    show('fixture-candidates', false);
    show('fixture-draft', false);
    show('fixture-approved', false);
  }
  function showCandidates(result) {
    hideFuture();
    const list = $('fixture-candidate-list');
    list.replaceChildren();
    result.candidates.forEach((customer) => {
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'fixture-choice';
      choice.textContent = customer.displayName + ' ／ ' +
        (customer.municipality || '所在地不明') + ' ／ ' + customer.maskedPhone;
      choice.addEventListener('click', () => {
        const result = Core.selectCustomer(session, customer.customerId);
        if (!result.ok) return status(result.message, true);
        hideFuture();
        show('fixture-draft', true);
        summary('fixture-draft-summary', result.doc, result.revision);
        $('fixture-revision').value = '';
        status('候補を本人が選択しました。内容を確認して承認するか、金額を修正してください。');
        $('fixture-draft').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      list.append(choice);
    });
    show('fixture-candidates', true);
    status('候補は' + result.candidates.length + '件です。本人が該当する架空顧客を選んでください。');
  }
  function processResult(result) {
    if (result.ok && result.code === 'CANDIDATES') {
      showCandidates(result);
      return;
    }
    if (result.code === 'NEEDS_TAX_MODE' || result.code === 'CUSTOMER_NOT_FOUND') {
      hideFuture();
      show('fixture-followup', true);
      $('fixture-followup-help').textContent = result.message;
      $('fixture-followup-text').value = '';
      $('fixture-followup-text').placeholder = result.code === 'NEEDS_TAX_MODE'
        ? '税込 / 税抜' : '架空顧客のフルネーム';
      status(result.message, true);
      return;
    }
    status(result.message || '入力内容を確認してください。', true);
  }
  function start() {
    const value = $('fixture-instruction').value;
    const result = Core.start(session, value);
    processResult(result);
  }
  async function interpretWithGpt(isRevision) {
    if (gptRequestInFlight) return;
    const requiredStage = isRevision ? 'draft' : 'idle';
    if (session.stage !== requiredStage) {
      return status('先に現在の作業を完了するかリセットしてください。', true);
    }
    if (!window.BudilCloud || typeof window.BudilCloud.interpretFixture !== 'function') {
      return status('GPT接続が利用できません。通常のテキスト入力を利用してください。', true);
    }
    const raw = isRevision ? $('fixture-revision').value : $('fixture-instruction').value;
    // No user/customer records are loaded from Budil here.
    const initialSession = session;
    const initialRevision = session.revision;
    gptRequestInFlight = true;
    $('fixture-gpt-start').disabled = true;
    $('fixture-gpt-revise').disabled = true;
    status('認証済みの試験接続を確認しています。');
    try {
      const output = await window.BudilCloud.interpretFixture(raw);
      if (session !== initialSession || session.revision !== initialRevision) {
        return status('別の下書きへ切り替わったため解析結果を破棄しました。', true);
      }
      if (!output || !output.ok) {
        const code = output && output.code || 'unknown';
        return status('GPT試験接続は使用できません（' + code + '）。模擬会話・テキスト入力は引き続き使えます。', true);
      }
      if (output.needs_user_input) {
        return status(output.followup || '不足情報があります。指示内容を修正してください。', true);
      }
      if (isRevision) {
        const result = Core.reviseStructured(session, raw, output);
        if (!result.ok) return status(result.message, true);
        summary('fixture-draft-summary', result.doc, result.revision);
        $('fixture-revision').value = '';
        return status('GPT解析結果から下書きを更新しました。本人の承認までは確定しません。');
      }
      const result = Core.startStructured(session, raw, output);
      processResult(result);
    } catch (_) {
      status('GPT試験接続に失敗しました。模擬会話は利用できます。', true);
    } finally {
      gptRequestInFlight = false;
      $('fixture-gpt-start').disabled = false;
      $('fixture-gpt-revise').disabled = false;
    }
  }

  function followup() {
    let result;
    if (session.stage === 'need_tax_mode') {
      result = Core.answerTaxMode(session, $('fixture-followup-text').value);
    } else if (session.stage === 'need_name') {
      result = Core.answerName(session, $('fixture-followup-text').value);
    } else {
      result = { ok: false, message: '回答待ちではありません。' };
    }
    processResult(result);
  }
  function revise() {
    const result = Core.revise(session, $('fixture-revision').value);
    if (!result.ok) return status(result.message, true);
    summary('fixture-draft-summary', result.doc, result.revision);
    $('fixture-revision').value = '';
    status('下書きを修正しました（第' + result.revision + '版）。最新の内容を見てから承認してください。');
  }
  function approve() {
    const rev = session.revision;
    const result = Core.approve(session, rev);
    if (!result.ok) return status(result.message, true);
    show('fixture-draft', false);
    show('fixture-approved', true);
    summary('fixture-approved-summary', result.doc, null);
    pdfCompleted = false;
    $('fixture-pdf').disabled = false;
    status('架空データ見積書を本人が承認しました。PDF保存の操作を選んでください。');
    $('fixture-approved').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function pdf() {
    if (exportInFlight || pdfCompleted) return;
    const result = Core.getApprovedForPdf(session);
    if (!result.ok) return status(result.message, true);
    if (!window.BudilDocExport) return status('既存Budil PDF出力モジュールが見つかりません。', true);
    exportInFlight = true;
    $('fixture-pdf').disabled = true;
    status('既存Budilの形式で架空見積書PDFを生成します。');
    try {
      const exported = await window.BudilDocExport.downloadDocumentPdf(result.doc, { fixtureSinglePage: true });
      if (!exported || exported.ok !== true) throw new Error('PDF出力結果が不明です。');
      pdfCompleted = true;
      status('PDF保存処理が完了しました：' + exported.filename + '。ファイルが端末に保存されたかご確認ください。');
    } catch (error) {
      status('PDF生成に失敗しました。ブラウザのダウンロード設定・通信・表示環境を確認してください。', true);
      $('fixture-pdf').disabled = false;
    } finally {
      exportInFlight = false;
    }
  }
  function reset() {
    if (speechRecognizer) {
      try { speechRecognizer.abort(); } catch (_) { /* ignore */ }
      speechRecognizer = null;
    }
    session = Core.createSession();
    document.dispatchEvent(new Event('budil-fixture-reset'));
    pdfCompleted = false;
    exportInFlight = false;
    hideFuture();
    $('fixture-instruction').value = '比嘉清子さんのエアコン洗浄2台を税込18,000円で見積して';
    $('fixture-revision').value = '';
    $('fixture-followup-text').value = '';
    $('fixture-pdf').disabled = false;
    status('架空デモをリセットしました。本番データには一切触れていません。');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function listen(targetId) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      status('このブラウザでは音声認識に対応していません。テキスト欄に直接入力してください。', true);
      return;
    }
    if (speechRecognizer) {
      status('音声入力中です。完了してから再度操作してください。', true);
      return;
    }
    try {
      const recognition = new Recognition();
      speechRecognizer = recognition;
      recognition.lang = 'ja-JP';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (evt) => {
        const transcript = String(evt.results[0][0].transcript || '').slice(0, 220);
        $(targetId).value = transcript;
        status('音声を入力欄に転記しました。内容を確認後、ボタンを押してください。');
      };
      recognition.onerror = (evt) => {
        status('音声認識が使えません（' + (evt.error || 'unknown') + '）。テキスト入力をご利用ください。', true);
      };
      recognition.onend = () => { speechRecognizer = null; };
      recognition.start();
      status('音声を聞き取っています。架空顧客の情報だけを話してください。');
    } catch (_) {
      speechRecognizer = null;
      status('音声認識の開始に失敗しました。テキスト入力をご利用ください。', true);
    }
  }

  window.BudilGptFixtureBridge = Object.freeze({
    getApprovedQuoteSession() {
      if (session.stage !== 'approved' || !session.approved || !session.selectedCustomerId) return null;
      return JSON.parse(JSON.stringify({
        stage: 'approved',
        selectedCustomerId: session.selectedCustomerId,
        approved: session.approved
      }));
    }
  });
  const trial = window.BudilGptTrialAuth;
  const authAvailable = trial && trial.supported();
  show('fixture-gpt-auth', !!authAvailable);
  if (authAvailable) {
    const authStatus = () => {
      const status = trial.getAuthStatus();
      $('fixture-auth-status').textContent = status.signedIn
        ? '試験セッションにログイン済みです。GPT APIが未デプロイの場合は解析されません。'
        : '未ログイン。必要な場合のみ既存のBC認証でログインしてください。';
    };
    $('fixture-auth-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = $('fixture-auth-email').value;
      const pass = $('fixture-auth-password').value;
      $('fixture-auth-password').value = '';
      $('fixture-auth-login').disabled = true;
      try {
        const result = await trial.login(email, pass);
        $('fixture-auth-email').value = '';
        authStatus();
        if (!result.ok) {
          $('fixture-auth-status').textContent = '試験認証に失敗しました（' + result.code + '）。';
        }
      } catch (_) {
        $('fixture-auth-status').textContent = '試験認証を確認できませんでした。';
      } finally {
        $('fixture-auth-login').disabled = false;
      }
    });
    $('fixture-auth-logout').addEventListener('click', () => {
      trial.logout();
      $('fixture-auth-email').value = '';
      $('fixture-auth-password').value = '';
      authStatus();
    });
    authStatus();
  }

  $('fixture-start').addEventListener('click', start);
  $('fixture-gpt-start').addEventListener('click', () => interpretWithGpt(false));
  $('fixture-gpt-revise').addEventListener('click', () => interpretWithGpt(true));
  $('fixture-followup-submit').addEventListener('click', followup);
  $('fixture-revise').addEventListener('click', revise);
  $('fixture-approve').addEventListener('click', approve);
  $('fixture-pdf').addEventListener('click', pdf);
  $('fixture-reset').addEventListener('click', reset);
  $('fixture-speak-instruction').addEventListener('click', () => listen('fixture-instruction'));
  $('fixture-followup-speak').addEventListener('click', () => listen('fixture-followup-text'));
  $('fixture-speak-revision').addEventListener('click', () => listen('fixture-revision'));
  $('fixture-followup-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') followup(); });
  $('fixture-revision').addEventListener('keydown', (e) => { if (e.key === 'Enter') revise(); });
})();