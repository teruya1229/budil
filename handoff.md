# Budil handoff

最終更新: 2026-06-17

## 正本

- [README.md](README.md)
- [status.md](status.md)
- [rules.md](rules.md)
- [handoff.md](handoff.md)
- 公開URL: https://teruya1229.github.io/budil/

## 現在の状態
- Budil v1.9.3.2 公開済み（入金注意を営業候補から除外・営業保留リスト）
- Budil v1.9.3.1 公開済み（未入金判定の現場向け修正・入金注意タグ）
- Budil v1.9.3 公開済み（次に売るべき営業先・リピート候補）
- 売上番頭 v1.8 実装済み
- 営業プリセット v1.6 実装済み
- 営業ステータス / 次アクション / 優先度判定 v1.7 実装済み
- スマホ写真アップロード修正（名刺登録UI）
- Budilの判断ロジック正本（brain/playbooks/KPI/検証ログ）整備済み
- localStorage互換維持
- GitHub Pages運用

## 重要ファイル

| ファイル | 役割 |
|---|---|
| `index.html` | メインSPA・画面構成・バージョン表示 |
| `css/style.css` | スタイル（優先度バッジ・営業ステータス等） |
| `js/app.js` | メインアプリケーションロジック・UI連携 |
| `js/storage.js` | localStorage管理・マイグレーション |
| `js/sales-brain.js` | 営業分析・優先度・ステータス正規化 |
| `js/messages.js` | 営業文面テンプレート・プリセット |
| `js/management-brain.js` | 朝レポート・今日の営業生成 |
| `js/revenue-brain.js` | 売上集計・番頭コメント |

## v1.9.3.2で入ったもの

- `RevenueBrain.getSalesHoldCandidates()` / `getLeadSalesHold()` / `evaluateLeadSalesHold()`
- 売上番頭「営業保留・入金確認」カード（`#revenue-sales-hold`）
- 入金注意あり営業先の営業候補除外・営業保留表示

## v1.9.3.1で入ったもの

- 売上レコード任意フィールド `paymentConcern`（入金注意チェック）
- `RevenueBrain.formatPaymentStatusLabel()` / `recordHasPaymentConcern()`
- 未入金の自動警告を廃止し、入金注意タグのみ注意対象に
- 表示ラベル「入金待ち」（保存値は従来どおり `未入金`）

## v1.9.3で入ったもの

- `RevenueBrain.getNextSalesCandidates()` / `getLeadNextSalesAction()`
- 売上番頭「次に売るべき営業先」カード
- 営業先詳細「次の一手」
- 朝レポート `mgmt-sales-candidate`

## v1.9.2で入ったもの

- 今月サマリー内の営業成果4指標
- `revenue-unlinked-banner` / 未紐付け売上スクロール導線
- `RevenueBrain.buildMorningSalesOutcomeLines()`
- 営業成果カードの強調表示・営業先名クリック導線

## v1.9.1で入ったもの

- 売上フォーム「＋営業先を作成して紐付け」「選択中の営業先を開く」
- 営業先詳細「この営業先の売上を登録」
- 売上一覧の営業先リンク・未紐付けからの営業先作成

## v1.9で入ったもの

- 売上レコードに `leadId` / `leadName`（任意・スナップショット）
- 売上登録フォームの営業先選択・成約更新チェック
- 営業先詳細の売上履歴パネル
- `RevenueBrain.normalizeRevenueRecord()` / `getLinkedRevenueSummary()` 等
- 既存レコードに leadId が無くてもエラーにならない（読み取り時正規化のみ）

## v1.8で入ったもの

- 売上番頭画面（`#view-revenue`）
- `budil_revenue_records` / `budil_revenue_settings`
- 月次集計・サービス別/依頼元別・朝レポート反映

## 脳みそドキュメント（v1.8以降の判断正本）

- `brain.md` — Budilが何を見てどう判断するか（脳みそ設計書）
- `playbooks.md` — 状況別の行動パターン（プレイブック）
- `kpi-rules.md` — 数値判断基準
- `decision-log.md` — 判断履歴（いつ・なぜ・結果）
- `experiments.md` — 仮説検証ログ（改善の根拠）

## v1.6で入ったもの

- 営業プリセットUI
- `sales-preset-select`
- `lead-sales-preset`
- `sales-detail-preset`
- `messages.js` の `PRESETS` / `generateAll(lead, product, presetKey)`
- 朝レポート「今日の営業」へのプリセット連携

## v1.7で入ったもの

- `salesStatus`
- `nextAction`
- `nextActionDate`
- `priorityScore`
- `priorityLabel`
- `priorityReason`
- `lastContactAt`
- `migrateV17()`
- `budil_migrated_v17`
- 営業管理UI（詳細パネル内）
- AI優先度判定（ルールベース）
- 今日営業すべき会社への反映
- 朝レポートへの営業ステータス・次アクション・優先理由表示

## v1.7.1で入ったもの

- 名刺登録の `card-file-input` を `hidden`（display:none相当）から解除し、`label[for="card-file-input"]` 方式に切り替えてスマホでのファイル選択を安定化
- 画像の読み込み〜プレビュー時にダウンサンプル/圧縮して、localStorage保存の失敗（容量不足）を減らす
- 画像読み込み・保存失敗を `#card-ocr-status` に表示して無言で止まらないようにした

## localStorageキー（主要）

| キー | 内容 |
|---|---|
| `budil_leads` | 営業先（ステータス・次アクション・優先度含む） |
| `budil_settings` | ダッシュボード設定 |
| `budil_generatedPosts` | 需要分析結果 |
| `budil_generatedMessages` | 生成済み営業文面 |
| `budil_followups` | 追客管理 |
| `budil_migrated_v17` | v1.7マイグレーション済みフラグ |
| `budil_revenue_records` | 売上記録 |
| `budil_revenue_settings` | 月間目標など |

## 次にやると良いこと（v1.8候補）

- プリセットごとの次アクション初期値
- 営業履歴から自動で最終連絡日を更新
- 追客管理と営業番頭の統合強化
- 今日の営業ミッションをより具体化
- 成約 / 見送り理由の蓄積
- 1週間の営業予定ビュー
- 営業先のCSVインポート
- 名刺登録から営業ステータス初期値を自動設定
- 営業結果の振り返りレポート
- brain/playbooks/KPI/検証ログを使って「今日の最優先行動」を精度改善する

## 注意点

- 既存localStorageを壊さない
- v1.6プリセット機能を壊さない
- 朝レポートを壊さない
- データ管理を壊さない
- スマホ表示を壊さない
- GitHub Pagesで確認する
- 完了後は status.md と handoff.md を更新する

## 旧ドキュメント

`docs/handoff.md` には MVP v0.1 時代の公開準備メモが残っています。正本は本ファイルおよびルートの README.md / status.md / rules.md を参照してください。
