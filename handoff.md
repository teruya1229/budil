# Budil handoff

最終更新: 2026-06-17

## 正本

- [README.md](README.md)
- [status.md](status.md)
- [rules.md](rules.md)
- [handoff.md](handoff.md)
- 公開URL: https://teruya1229.github.io/budil/

## 現在の状態
- Budil v2.8 公開済み（施策成果・売上連携MVP）
- Budil v2.7 公開済み（投稿・広告カレンダーMVP）
- Budil v2.6 公開済み（週間作戦ボード）
- Budil v2.5 公開済み（効果メモから改善・勝ちパターン化）
- Budil v2.4 公開済み（投稿・広告アクションの実行管理）
- Budil v2.3 公開済み（需要から投稿・広告文案生成MVP）
- Budil v2.2 公開済み（クロクロ3件一括取り込み・毎朝運用強化）
- Budil v2.1 公開済み（需要ピックアップ受信箱MVP）
- Budil v2.0 公開済み（実運用MVP仕上げ）
- Budil v1.9.9 公開済み（営業先詳細の見やすさ整理）
- Budil v1.9.8 公開済み（活動履歴から次回アクション設定）
- Budil v1.9.7 公開済み（タスク完了を営業履歴に残す）
- Budil v1.9.6 公開済み（手動タスク追加・タスク調整）
- Budil v1.9.5 公開済み（今日やることリスト化）
- Budil v1.9.4 公開済み（経営番頭コメント）
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
| `js/demand-brain.js` | 需要分析・需要ピックアップパース・トップ3・施策成果判定 |
| `js/demand-radar.js` | 需要レーダー分析 |
| `js/data-backup.js` | バックアップ・復元 |

## v2.8で入ったもの

- 需要番頭「施策成果」「成果が出た施策」「売上につながった施策」「改善が必要な施策」
- `DemandBrain.evaluatePerformanceResult` — 数値・メモ・売上紐付けのルールベース判定
- `normalizePerformanceMetrics` / `getPerformanceInsights` / `getTopPerformanceRanking`
- `getRevenueLinkedActions` / `getWeeklyPerformanceSummary` / `createPerformanceTaskPayload`
- 実行アクションへの metrics・relatedLeadIds・relatedRevenueIds（`executionStatus` 内）
- ダッシュボード「今週の施策成果」・朝レポート `mgmt-performance-today`
- 週間作戦への成果ありテーマ・改善広告・売上連携の反映
- 新規 localStorage キーなし

## v2.7で入ったもの

- ダッシュボード「投稿・広告カレンダー」（7日間日別カード）
- `DemandBrain.getActionCalendarItems` / `getSevenDayCalendar` / `getUnscheduledWeeklyCandidates`
- 予定化：executionStatus.scheduledDate / manualTasks.dueDate / 週間候補のタスク化
- 今日の予定ミニ表示・朝レポート統合（v2.4拡張）
- 新規 localStorage キーなし

## v2.6で入ったもの

- ダッシュボード「週間作戦ボード」
- `DemandBrain.buildWeeklyStrategy` — 重点サービス・投稿/広告/営業方針の週次集計
- 集計期間切り替え（7日 / 今月 / すべて）
- 今週やること候補と `Storage.addManualDailyTask` 連携
- 朝レポート `mgmt-weekly-strategy`
- 新規 localStorage キーなし（既存データから毎回生成）

## v2.5で入ったもの

- 需要番頭「効果ふり返り」・「勝ちパターン候補」・「改善が必要な投稿・広告」
- `DemandBrain.evaluateExecutionResult` — 効果メモのルールベース判定
- `getWinningPatterns` / `getImprovementCandidates` / `buildImprovementHints`
- 続編タスク（`sequel`）・改善タスク（`improve`）の今日やること連携
- ダッシュボード「今日の改善ヒント」・朝レポート `mgmt-improvement-today`
- 効果ふり返り集計バー・効果状態バッジ拡張

## v2.4で入ったもの

- 需要番頭「投稿・広告アクション管理」セクション
- `executionStatus` / `executionLogs`（`budil_demand_pickups` 内、任意フィールド）
- 文案ごとのステータス・予定日・実行メモ・効果メモ・次回改善
- 実行済み時の実行ログ自動記録
- ダッシュボード「今日の投稿・広告予定」
- 朝レポートに今日の投稿・広告予定
- 保存済み需要メモの状態バッジ
- `DemandBrain.normalizeExecutionStatus` / `getTodayExecutionActions` 等

## v2.3で入ったもの

- 需要ピックアップからの文案生成（リール / Instagram / LINE / GBP / 広告）
- `generatedOutputs` フィールド（`budil_demand_pickups` 内、任意）
- 文案コピー・保存・今日やること連携（`pickupDedupeKey` 拡張）
- 需要番頭「需要から作る投稿・広告文案」セクション

## v2.2で入ったもの

- クロクロ3件一括パース（`parseKurokuroBulkPaste` / `parseClocloPaste`）
- 一括取り込みプレビュー + `3件まとめて保存`
- 朝用需要トップ3カード（判断ラベル・個別/一括タスク化）
- 重複タスク防止（`pickupDedupeKey` on manualTasks）
- ステータス `archived`（保管）UI
- クロクロ毎朝調査プロンプト表示・コピー
- 朝レポート `mgmt-demand-top` に需要トップ表示

## v2.1で入ったもの

- 需要番頭画面（需要ピックアップ受信箱）
- `budil_demand_pickups` — クロクロ調査結果の保存
- 貼り付け簡易パース → フォーム反映
- 需要トップ3・投稿/営業/広告候補表示
- 今日やること連携・採用済み/無視
- 経営番頭コメントへの需要1行反映
- 需要テストデータ作成・削除
- バックアップキーに `budil_demand_pickups` を追加

## v2.0で入ったもの

- ダッシュボード初回スタートガイド（3ステップ + 導線ボタン）
- 空データ時の現場向け文言
- テストデータ作成・削除（`isTest` フラグ）
- バックアップ説明・復元注意文の強化
- データ管理に v2.0 動作確認チェックリスト
- バックアップキーに `budil_daily_action_tasks` を追加

## v1.9.9で入ったもの

- 営業先詳細のブロック整理（状態サマリー・次回アクション・累計売上・今日やること/次の一手・活動履歴・売上履歴・基本情報）
- `renderLeadStatusSummary()` / `renderLeadRevenueCompact()` / `renderLeadDailyTasks()` / `renderLeadDetailSubpanels()`
- 次回連絡日の期限状態ラベル（今日対応 / 期限超過 / 予定あり / 未設定）
- スマホ向け営業先詳細スタイル（`.lead-detail-block` 等）

## v1.9.8で入ったもの

- 活動履歴追加フォームに「次回アクション設定」項目を追加
- 活動追加時に営業先本体（次回アクション・次回連絡日・ステータス・優先度・最終連絡）へ反映
- 今日やること編集に「次回アクション / 次回連絡日」を追加（完了時反映）
- 営業先詳細に「次回アクション設定」サマリー表示（期限超過強調）
- 活動履歴に次回設定内容を表示
- `RevenueBrain.buildDailyActionTasks()` の理由文言を次回連絡日基準に調整

## v1.9.7で入ったもの

- 営業先 `activityLogs` — タスク完了・手動活動メモ
- `Storage.addLeadActivityLog()` / `getLeadActivityLogs()`
- 手動タスクの `leadId` / `leadName` 紐付け
- 営業先詳細「活動履歴」セクション（最新5件・手動追加）
- 朝レポート「最近の完了活動」（最大3件）

## v1.9.6で入ったもの

- 手動タスク追加フォーム・編集パネル
- `budil_daily_action_tasks.manualTasks` / 状態の `snoozedUntil`・`completedAt`
- 明日に回す・完了済み表示改善

## v1.9.5で入ったもの

- `RevenueBrain.buildDailyActionTasks()` — 優先度付き今日のタスク生成
- `budil_daily_action_tasks` — taskId / date / status / memo
- `#dash-daily-action-tasks` / `#mgmt-daily-tasks`

## v1.9.4で入ったもの

- `RevenueBrain.buildManagementComment()` — 売上・営業成果・候補・保留を統合した判断コメント
- `#dash-management-comment` / `#revenue-management-comment` / `#mgmt-management-comment`

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
| `budil_daily_action_tasks` | 今日やることの完了・後回し・メモ・手動タスク |
| `budil_demand_pickups` | 需要ピックアップ（クロクロ調査結果・アクション案） |

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
