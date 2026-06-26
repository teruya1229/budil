# Budil handoff

最終更新: 2026-06-26

## 正本

- [README.md](README.md)
- [status.md](status.md)
- [rules.md](rules.md)
- [handoff.md](handoff.md)
- [decision-log.md](decision-log.md)
- 公開URL: https://teruya1229.github.io/budil/

## 現在の最新状態

| 項目 | 値 |
|------|-----|
| 最新公開URL | https://teruya1229.github.io/budil/ |
| 最新バージョン | v4.4.9.3 |
| 最新commit | v4.4.9.3 修正コミット |
| ブランチ | `main` push 済み |
| GitHub Pages | Cursor Browser Automationで確認予定（v4.4.9.3） |

## v4.4.9.3で入ったもの

- 支払方法別 入金予定日自動入力MVP
- 支払方法9種類: 現金 / 銀行振込 / タッチ決済 / オンライン決済 / Squareカード決済 / くらし後払い / くらしカード決済 / 法人月末請求 / その他
- 旧 `card` はカード決済（旧）として読み込み互換を維持
- 入金予定日ルール: 現金=当日、銀行振込/オンライン決済/くらし後払い/法人月末請求=翌月末、タッチ決済=毎月5日、Square=水曜締・金曜払
- くらしカード決済は毎月1日払・4営業日前締（土日のみ除外、祝日は未対応）
- 法人月末請求は初期値翌月末、翌々月末は手入力
- 売上/請求書フォームに予定日ルール表示と「自動計算」ボタンを追加
- 売上集計、請求書ステータス、linked同期、入金予定一覧重複防止には影響させない

## v4.4.9.2.2で直したもの

- 請求書→売上 linked入金同期修正
- 請求書側で入金済みにした時、linked売上側も入金済みに同期
- 請求書側で入金待ちに戻した時、linked売上側も入金待ちに同期
- 売上側から請求書側への同期も維持
- 同期時は請求書 `total`、売上 `amount` をそれぞれ基準に入金額/未入金額を補正
- 入金予定一覧の linked重複防止と請求書優先表示は維持
- 売上集計には影響しない

## v4.4.9.2.1で直したもの

- 入金待ち切替時の未入金額補正
- 現金以外の支払方法に変更した直後は「入金待ち」を自然な初期値として提案
- 入金待ち時は `paidAmount=0` / `unpaidAmount=total` / `paidDate=""`
- 入金済み時は `paidAmount=total` / `unpaidAmount=0`
- 一部入金時は入金額を 0〜total に丸めて差額を未入金額に反映
- 売上集計は入金状態で増減させない
- 請求書側にも同じ補正を適用
- linked同期・入金予定一覧の重複防止は維持

## v4.4.9.2で入ったもの

- 入金予定・支払方法管理MVP（整合性重視版）
- 支払方法7種類：現金 / 銀行振込 / カード決済 / くらし後払い / くらしカード決済 / 法人月末請求 / その他
- 入金状態：入金待ち / 入金済み / 一部入金 / 未回収 / 取消
- 請求書ステータスと入金状態を分離表示（例：請求済み・入金待ち）
- `linkedRevenueId` / `linkedDocumentId` による売上↔請求書の入金同期
- 入金予定一覧（リンク済みデータの重複防止、請求書優先表示）
- 経営ホーム入金カード（入金待ち合計 / 今月入金予定 / 入金遅れ件数）
- 売上登録・請求書フォームに支払方法・入金管理UI
- 入金状態は売上集計に影響しない（回収状況のみ）

**意思決定：** 売上＝作業完了ベースで確定、入金＝回収状況。お金に関わるため `PaymentBrain` で画面間の整合性を最優先。

**2026-06-25 Codexローカル点検：**

- 重大な二重計上・請求書作成だけでの売上確定・入金状態変更による売上増減はローカルロジック上なし
- 現金売上 / くらし後払い売上 / 法人月末請求売上 / 請求書単体 / 請求書→売上登録反映 / linked ID 同期 / 税計算を Node ローカル確認
- 修正済み: 一部入金の過大入金額を合計額で上限補正、取消時の回収済み残りを0補正、linked 請求書の入金待ちが片側不整合で一覧から隠れないよう防御
- Browser Automation確認は Cursor 側で実施する

## v4.4.9.1で入ったもの

- 請求書・見積書 税・端数設定対応（折りたたみ式）
- デフォルト外税、内税は特殊ケースとして選択可能
- `taxSettings` を `budil_documents` に追加（既存 `taxMode` 互換）
- 13,000円内税時は税抜11,819円 / 税1,181円（10%・切り捨て）
- 見積書→請求書変換で税設定を引き継ぎ

**意思決定：** 請求書・見積書の数字は信用に関わるため、書類ごとに税・端数を調整可能にする。売上確定は勝手にしない。

## v4.4.9で入ったもの

- 請求書・見積書MVP（売上・利益カテゴリ内）
- 請求書・見積書の作成・保存・一覧・プレビュー・印刷/PDF
- 印影画像 `assets/bc-service-seal.jpg` を使用
- localStorage `budil_documents` を追加
- 見積書→請求書変換、売上登録への手動反映ボタン
- 請求書作成だけでは売上確定扱いしない
- マネーフォワード連携はしない

**意思決定：** 新しい「請求書番頭」は作らず、売上・利益カテゴリ内の「請求書・見積書」として追加。既存 localStorage キーは変更しない。

## v4.4.8で入ったもの

- アナリティクス外部チェック運用MVP
- 外部チェック保存IDの画面表示（運用ログ・完了報告用）
- `注意・ノイズ候補` セクション対応
- GA4/SC → Budil保存プレイブック正式化（`playbooks.md`）
- 半自動運用（Browser Automation / 手動ログイン / 画面読み取り）を優先、API連携は将来

**意思決定：** 新しい番頭は増やさず、集客・需要カテゴリ内の外部チェックで運用する。localStorageキーは変更しない。

## v4.4.7で入ったもの

- 経営番頭 UI整理・番頭名統合MVP
- 左メニュー7大分類化（経営ホーム / 今日やること / 受付・予定 / 売上・利益 / 集客・需要 / レポート・記録 / 設定・バックアップ）
- ホームよく使うメニュー4本柱化＋補助3ボタン
- ユーザー向け「〇〇番頭」表記の整理（内部ファイル名・localStorageは維持）

**意思決定：** 新機能追加時も「〇〇番頭」を増やさず、既存の業務カテゴリへ入れる。Budil全体は「経営番頭」ひとつの業務OSとして見せる。

## 2026-06-25 実機検証（Cursor Browser Automation × 外部チェック）

GA4 / Search Console 読み取り → `【Budil貼り付け用】` 変換 → Budil 外部チェック保存の一連フローを公開ページ（v4.4.6）で確認済み。

| 項目 | 値 |
|------|-----|
| 保存 ID | `extchk-mqtb19j1amlq` |
| 保存日時 | 2026-06-25 18:33 |
| 確認対象 | GA4 / Search Console |
| 今日やること候補 | 3 件 |
| ダッシュボード反映 | OK |
| 売上集計影響 | なし |
| コンソールエラー | なし |

**役割分担（更新）：**

| 役割 | ツール |
|------|--------|
| 外部サービスを見る目 | Browser番頭 |
| その場の読み取り・検査員 | Cursor Browser Automation |
| 記録・判断・行動候補化 | Budil |

詳細は [status.md](status.md) の「2026-06-25 実機検証」節を参照。

## 現在の状態

- Budil v4.4.9.1 公開予定（請求書・見積書 税・端数設定）
- Budil v4.4.9 公開済み（請求書・見積書MVP）
- Budil v4.4.8 公開済み（アナリティクス外部チェック運用MVP）
- Budil v4.4.7 公開済み（経営番頭 UI整理・番頭名統合MVP）
- Budil v4.4.6 公開済み（月次実績→利益番頭反映）
- Budil v4.4.5 公開済み（月次実績・外注費追加）
- Budil v4.4.4 公開済み（月次実績一括取り込みMVP）
- Budil v4.4.3 公開済み（外部チェック→行動候補P5）
- Budil v4.4.2 公開済み（外部チェック受け皿MVP）
- Budil v4.4.1 公開済み（作業後確定・売上反映 安全検収）
- Budil v4.4 公開済み（作業後の確定処理番頭MVP）
- Budil v4.3.1 公開済み（サイドバー整理・番頭グループ化）
- Budil v4.3 公開済み（カレンダー/予定候補取り込み番頭MVP）
- Budil v4.2 公開済み（売上集計番頭MVP）
- Budil v4.1 公開済み（販売LP・無料体験導線MVP）
- Budil v4.0.1 公開済み（見やすさ・操作性改善）
- Budil v4.0 公開済み（毎朝5分・経営司令塔ホーム再統合MVP）
- Budil v3.9.1 公開済み（ブラウザー番頭連携アナリティクス取り込みMVP）
- Budil v3.9 公開済み（アナリティクス番頭MVP）
- Budil v3.8 公開済み（利益・原価・支出番頭MVP）
- Budil v3.7 公開済み（作業後フォロー・口コミ・リピート番頭MVP）
- Budil v3.6 公開済み（予約・作業予定番頭MVP）
- Budil v3.5 公開済み（Googleマップ軽連携・エリア番頭MVP）
- Budil v3.4 公開済み（AI番頭連携入口MVP）
- Budil v3.3 公開済み（販売・デモ準備MVP）
- Budil v3.2 公開済み（週次・月次レポート出力MVP）
- Budil v3.1 公開済み（実運用安定化・データ診断）
- Budil v3.0 公開済み（経営番頭ホーム統合）
- Budil v2.9 公開済み（施策判断・集中先スコアMVP）
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
| `js/reception-brain.js` | AI番頭受付パース・営業/タスク/売上変換 |
| `js/map-brain.js` | 地図URL・エリア推定・エリア別集計 |
| `js/work-order-brain.js` | 作業予定正規化・カレンダーURL・売上見込み |

| `js/follow-up-brain.js` | 作業後フォロー抽出・文面生成・リピート提案 |
| `js/profit-brain.js` | 利益・支出・粗利集計・改善ヒント |
| `js/analytics-brain.js` | アナリティクス・需要スコア・LP診断・ブラウザー番頭パース |
| `js/executive-brain.js` | 経営司令塔ホーム・全番頭データ統合・優先順位 |
| `js/external-check-brain.js` | 外部チェック（Browser番頭貼り付け）パース・保存 |
| `js/action-brain.js` | 行動候補（外部チェック由来）管理 |
| `js/monthly-results-brain.js` | 月次実績・利益計算・CSV解析・利益番頭オーバーライド |

**意思決定：** Googleカレンダーやブラウザー番頭から得た予定情報は、売上確定ではなく作業予定候補として扱う。現場では予定変更・追加作業・キャンセル・金額変更が発生するため、カレンダー予定を売上集計に直接反映しない。売上正本は引き続き budil_revenue_records の確定売上のみとする。

## v4.4.6で入ったもの

- 対象月に月次実績がある場合、利益番頭サマリーで月次実績を優先表示
- `MonthlyResultsBrain.buildProfitSummaryFromMonthly` による利益番頭オーバーライド
- 二重計上防止（サマリーは月次実績のみ、明細テーブルは従来表示）
- 注記「月次実績を優先表示中（売上明細とは別管理）」
- 経営司令塔ホーム・朝レポートの売上/利益へ反映
- 月次実績保存・削除後の `renderProfitView()` 連携
- 広告費のみ支出明細を併用参照

**意思決定：** 月次実績は過去月・補正用の確定経営数字として、利益番頭では対象月に存在すれば優先する。売上番頭の「今月の売上状況」は引き続き売上明細（確定売上）ベースとする。

## v4.4.5で入ったもの

- 月次実績フィールド `outsourcingCost`（外注費）
- 利益計算式に外注費を追加
- CSV新9列 / 旧8列互換

## v4.4.4で入ったもの

- 月次実績一括取り込みMVP（`budil_monthly_results`）
- `js/monthly-results-brain.js`
- 月次実績画面・CSV取り込み・ダッシュボード最新月カード
- 売上詳細レコードとは別管理（自動分解しない）

## v4.4.3で入ったもの

- 行動候補（`budil_action_candidates`）・`js/action-brain.js`
- 外部チェック由来候補の保存・今日やること連携・対応済み管理
- 重複防止・一方向同期・監査修正（`8b25311`）

## v4.4.2で入ったもの

- 外部チェック受け皿（`budil_external_check_reports`）
- `js/external-check-brain.js`
- Browser番頭【Budil貼り付け用】手動取り込み・履歴・削除
- ダッシュボードカード・売上確定扱いしない注記

## v4.4で入ったもの

- 作業後確定フォーム（実績金額・作業内容・支払い状態の確認と確定売上登録）
- `js/work-completion-brain.js`（確定処理・キャンセル・診断・タスク連携）
- `budil_work_orders.completion` / `cancel` 任意フィールド
- 確定売上はユーザー操作時のみ `budil_revenue_records` に保存
- 作業後フォロー番頭・司令塔ホーム・朝レポート・データ診断連携

## v4.3.1で入ったもの

- サイドバーを6グループに整理（入口のみ・機能統合なし）
- サブ導線（司令塔・朝レポート・売上集計・バックアップ等）のスクロール連携
- 既存画面ID・data-view・localStorageは維持

## v4.3で入ったもの

- 予定候補取り込み番頭（貼り付け取り込み・プロンプト生成・候補一覧）
- `js/calendar-candidate-brain.js`（パース・重複検知・作業予定候補化）
- `budil_work_orders.candidateMeta` による候補管理（新規キーなし）
- 作業予定番頭・司令塔ホーム・朝レポート・売上番頭・データ診断連携

## v4.2で入ったもの

- 売上番頭「売上集計」ブロック（コンパクト表示＋折りたたみ詳細）
- `js/revenue-summary-brain.js`（月別・年別・依頼元別・サービス別・クロス集計）
- 年・月・依頼元・サービスフィルター
- 売上集計コピー（ChatGPT/経営レポート用）
- 経営司令塔ホーム・経営レポート・利益番頭・データ診断への反映
- デモデータに6月/7月売上サンプル追加

## v4.1で入ったもの

- 販売用LP `sales.html`（ヒーロー・悩み・機能・使い方・強み・料金・対象・導入・FAQ・CTA）
- 公開URL: https://teruya1229.github.io/budil/sales.html
- LINE無料体験CTA・デモ画面CTA
- Budil本体からの販売ページ導線
- デモ台本 `docs/budil-demo-script.md`

**意思決定：** Budil v4.1では、本体機能追加よりも販売・無料体験・デモ説明の導線を整える。Budilを自分用ツールから、現場業者に説明できる商品へ進める。

## v4.0.1で入ったもの

- 視認性改善（ダークテーマ統一・コントラスト強化）
- よく使うメニュー（主要6ボタン）＋その他メニュー折りたたみ
- 経営司令塔ホームの折りたたみ整理（フォロー・アクセス分析・確認完了）
- 注意・保留の段階表示（重大/注意先出し、確認は折りたたみ）
- 今日やることUI改善（5件表示・完了済み折りたたみ・番頭ラベル）
- 初見向け3ステップガイド（ホーム内）

**意思決定：** 機能追加より先に、見やすさ・操作性・初見の分かりやすさを改善する。Budilは高機能であることより、必要なものがすぐ取り出せることを優先する。

## v4.0で入ったもの

- 経営司令塔ホーム（今日の結論・最優先3つ・作業/受付/売上利益/フォロー/需要アナリティクス/注意）
- ExecutiveBrain による既存データ集約（新規キーなし）
- v4.0朝レポート順序・確認完了チェックリスト
- クイック導線12種（各番頭・経営レポート・データ診断・バックアップ）

**意思決定：** v3系で増えた各番頭を、毎朝5分で判断できる経営司令塔ホームに再統合する。Budilは単機能の集合ではなく、今日の優先順位を出す経営OSとして育てる。

## v3.9.1で入ったもの

- ブラウザー番頭連携（プロンプトコピー → レポート貼り付け → 複数ページ取り込み）
- `AnalyticsBrain.parseBrowserBantouReport` 等のパーサー
- 今日やること候補・需要番頭候補の取り込み
- 経営番頭ホーム・朝レポート・経営レポートへのブラウザー番頭判断反映

**意思決定：** ブラウザー番頭はGA4/Search Console/GBP等を見に行く調査員、Budilのアナリティクス番頭はその出力を読んで判断する分析官として分担する。API連携より先に、プロンプトコピー→出力貼り付け→Budil診断の運用を採用する。

## v3.9で入ったもの

- アナリティクス番頭画面（GA4手入力・ページ別診断・需要スコア）
- `budil_analytics_records`（ページ別アナリティクスデータ）
- 需要番頭への送付・今日やること連携
- 広告より先にLP/自然需要を読む方針表示

**意思決定：** 広告番頭より先に、アナリティクス番頭/需要番頭を優先する。広告は自然需要・LP改善・SNS/記事の勝ち筋が見えた後に乗せる。

## v3.8で入ったもの

- 利益番頭画面（支出登録・粗利分析・改善ヒント）
- `budil_expense_records`（支出データ保存）
- 売上別粗利・作業予定見込み利益・サービス/エリア/集客経路別利益
- 経営番頭ホーム・朝レポート・経営レポートへの利益反映

## v3.7で入ったもの

- 作業後フォロー番頭画面（お礼・口コミ・リピート）
- `followUp` 任意フィールド（作業予定・売上）
- 文面生成・コピー・フォロー状態管理
- 営業先活動履歴・今日やること・リピート候補連携
- 事業プロフィールに Google口コミURL

## v3.6で入ったもの

- 予約・作業予定番頭画面（作業予定登録・今日/今週・売上見込み）
- `budil_work_orders`（作業予定データ保存）
- 受付/営業先→作業予定、作業予定→今日やること/売上フォーム
- Googleカレンダー追加リンク（API不使用）
- 経営番頭ホーム・朝レポート・エリア番頭への作業予定反映

## v3.5で入ったもの

- エリア番頭画面（エリア別サマリー・売上・営業先・受付）
- Googleマップ検索リンク（API不使用）
- 住所からのエリア推定と遠方/住所未入力注意
- 営業先・受付の任意 `area` フィールド

## v3.4で入ったもの

- 受付・予約番頭画面（AI番頭結果の貼り付け入口）
- `budil_reception_intakes`（受付データ保存）
- 受付→営業先・今日やること・売上候補の変換
- 経営番頭ホーム・朝レポートへの受付反映

## v2.9で入ったもの

- 需要番頭「施策判断」「サービス別の勝ち筋」
- `DemandBrain.evaluateActionDecision` — 増やす/続ける/改善/停止候補/様子見 + focusScore
- `getFocusRecommendations` / `getServiceFocusInsights` / `getStopOrImproveCandidates`
- ダッシュボード「今週の集中先」「改善・停止候補」
- 判断タスクの今日やること連携（`createDecisionTaskPayload`）
- 朝レポート `mgmt-focus-today`
- 週間作戦への判断反映（grow加点・skip候補）
- 新規 localStorage キーなし（毎回計算）

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

## 重要なlocalStorageキー

| キー | 内容 |
|---|---|
| `budil_revenue_records` | 売上記録（確定売上の正本） |
| `budil_revenue_settings` | 月間目標など |
| `budil_external_check_reports` | 外部チェック（Browser番頭貼り付け）レポート |
| `budil_action_candidates` | 行動候補（外部チェック由来など） |
| `budil_daily_action_tasks` | 今日やることの完了・後回し・メモ・手動タスク |
| `budil_monthly_results` | 月次実績（過去月・補正用の確定経営数字） |
| `budil_leads` | 営業先（ステータス・次アクション・優先度含む） |
| `budil_settings` | ダッシュボード設定 |
| `budil_expense_records` | 支出記録（利益番頭・広告費参照等） |
| `budil_work_orders` | 作業予定（候補メタ含む） |

## 重要な設計判断

- **月次実績**は、過去月・補正用の確定経営数字。売上詳細レコードとは別管理
- **利益番頭**では、対象月（基本は今月）に月次実績がある場合は月次実績を優先表示
- **二重計上しない**：月次実績優先時は明細売上・明細支出をサマリーに加算しない
- **売上番頭**の「今月の売上状況」は引き続き売上明細（確定売上）ベース
- **外部チェック**やGBP反応は売上確定扱いしない
- **行動候補**と**今日やること**は意図的に二重管理（行動候補→今日やることへの一方向同期のみ実装済み）
- 月次実績は売上明細へ自動分解しない
- **Cursor Browser Automation** は GA4 / Search Console 読み取り補助と Budil 公開 URL 実機確認の両方に使える（2026-06-25 検証済み）
- **Browser番頭** = 外部サービスを見る目、**Cursor Browser Automation** = 読み取り・検査員、**Budil** = 記録・判断・行動候補化
- API 連携より先に、Browser Automation / Browser番頭 / Playwright による半自動フローを優先する
- Google API / OAuth / バックエンド連携は将来の Budil 本体ボタン化で検討する

## 現在の残課題

- 利益番頭の対象月選択（今月固定）
- 売上番頭カードに「明細ベース」注記、または月次実績との関係整理
- 手数料率の自動計算は一旦保留
- 外注費内訳のダッシュボード表示は未対応
- 会計ソフト/API連携は未対応
- GA4 の正確な日付範囲取得（Browser Automation）
- Search Console の 28 日間切り替え取得
- GA4/SC の URL 固定化
- ログイン済み Chrome プロファイルの運用整理
- Browser番頭と Cursor Browser Automation の役割分担整理
- Budil への `.md` ファイル取り込み
- 「アナリティクス番頭チェック」ワンコマンド化（PowerShell/bat）

## 次にやるなら

優先候補：

1. **アナリティクス番頭チェックのワンプロンプト化** — Cursor に GA4/SC 確認 → `【Budil貼り付け用】` 生成 → Budil 保存まで一括指示
2. **売上番頭と月次実績の関係整理** — 売上番頭は明細ベースと明記、または月次実績参照モードを追加
3. **利益番頭に対象月選択を追加**
4. **Browser番頭への統合** — 専用 Chrome/CDP でログイン維持、`reports/*.md` 生成

## localStorageキー（主要・旧一覧）

| キー | 内容 |
|---|---|
| `budil_generatedPosts` | 需要分析結果 |
| `budil_generatedMessages` | 生成済み営業文面 |
| `budil_followups` | 追客管理 |
| `budil_migrated_v17` | v1.7マイグレーション済みフラグ |
| `budil_demand_pickups` | 需要ピックアップ（クロクロ調査結果・アクション案） |
| `budil_analytics_records` | アナリティクス（GA4手入力） |
| `budil_reception_intakes` | 受付・予約 |

## 次にやると良いこと（旧候補・v1.8以降）

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
