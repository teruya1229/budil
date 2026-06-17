# Budil v2.1「外部需要ピックアップ番頭」GitHub参考調査

調査日: 2026-06-17  
目的: v2.1 実装前に、GitHub上のOSSから**構造・考え方・UI・データ設計・ワークフロー**を参考にする  
方針: **コードコピー禁止**。ライセンス不明のコード流用禁止。思想と設計パターンのみ参考。

---

## 調査サマリー

| テーマ | 参考リポジトリ数 | Budilへの主な示唆 |
|---|---|---|
| Google Trends / 検索需要 | 2 | ウォッチキーワード登録、期間比較、急上昇検知、地域フィルタ |
| RSS / ニュース収集 | 3 | キーワードトリガー、スコア付け、毎朝見る1画面 |
| SNS投稿ネタ / カレンダー | 2 | 1ネタ→複数チャネル展開、未使用/使用済み、優先度 |
| アラート / タスク化 | 3 | 毎朝ブリーフィング、変化→アクション、GitHub Actions連携 |

Budil v2.0 には既に `DemandBrain`（需要サーチ）、`DemandRadar`（需要レーダー）、`ManagementBrain`（朝レポート）がある。v2.1 はこれらを**外部需要→アクション**の1本線でつなぐ「需要ピックアップ番頭」として拡張するのが自然。

---

## 1. Google Trends / 検索需要系

### 1-1. GeneralMills/pytrends

| 項目 | 内容 |
|---|---|
| リポジトリ名 | GeneralMills/pytrends |
| URL | https://github.com/GeneralMills/pytrends |
| 概要 | Google Trends 非公式API。キーワード登録（最大5件）、期間指定、地域（`geo`）、関連クエリ、急上昇検索などを Python から取得 |
| ライセンス | **Other (NOASSERTION)** — 公式 SPDX なし。コード流用不可 |
| 最終更新の目安 | archived。最終 push 2024-08、メンテナンス終了 |
| 参考にできる点 | `kw_list` でウォッチキーワード管理、`timeframe`（`now 7-d` / `today 3-m`）、`geo='JP'` で沖縄含む日本需要、`interest_over_time` の相対スコア（0–100）、`related_queries` で派生キーワード発見 |
| Budilに取り込むなら | ブラウザ直叩きは不可。将来は GitHub Actions + trendspyg で JSON 生成→Budil が読む。MVP は手入力＋既存 `DemandBrain.scoreKeyword()` で代替 |
| コード流用可否 | **不可**（ライセンス不明・archived） |
| 注意点 | 非公式API。Google側変更で壊れやすい。レート制限あり（連続リクエストは60秒待機推奨） |

### 1-2. flack0x/trendspyg

| 項目 | 内容 |
|---|---|
| リポジトリ名 | flack0x/trendspyg |
| URL | https://github.com/flack0x/trendspyg |
| 概要 | pytrends の後継候補。CLI + Python ライブラリ。トレンドRSS、interest over time、関連クエリ、地域別関心 |
| ライセンス | **MIT** — コード流用は原則不要（設計参考のみ） |
| 最終更新の目安 | 2026-06 時点で活発（v0.4.2） |
| 参考にできる点 | RSS ベースの「今の急上昇」取得、非同期バッチ、DataFrame 出力を JSON に変換してダッシュボードへ渡すパターン |
| Budilに取り込むなら | 沖縄向けキーワード（エアコン、洗濯機、カビ、台風、梅雨）を日次バッチで取得し、`budil_demand_pickups` 相当の JSON を repo に commit。Budil は静的 JSON を fetch |
| コード流用可否 | **参考のみ**（MIT でもコピーしない） |
| 注意点 | スター数は少ない。本番前に安定性を実機確認 |

**Budil向けキーワード設計（Trends系から学ぶ）**

```
ウォッチリスト（例）:
  エアコン, エアコンクリーニング, 洗濯機クリーニング, カビ, 湿気,
  台風, 梅雨, 水漏れ, 異臭, 完全分解

期間:
  - 今日: now 7-d（週次変化）
  - 季節: today 3-m（梅雨・台風シーズン）

地域:
  - geo=JP（全国）+ 手メモで沖縄ローカル補正

急上昇検知:
  - 前週比 +20pt 以上 → demandScore 加点
  - related_queries の新規出現 → 投稿ネタ候補に自動追加
```

---

## 2. RSS / ニュース収集系

### 2-1. dgtlmoon/changedetection.io

| 項目 | 内容 |
|---|---|
| リポジトリ名 | dgtlmoon/changedetection.io |
| URL | https://github.com/dgtlmoon/changedetection.io |
| 概要 | Web/RSS 変更監視。キーワードトリガー、RSS Reader Mode、差分履歴、通知連携 |
| ライセンス | **Apache-2.0** — 参考のみ |
| 最終更新の目安 | 2026-06 活発（32k+ stars） |
| 参考にできる点 | **Keyword triggers**（大文字小文字無視）、グループ監視、スケジュール実行、変更時のみアラート、「unique lines only」でノイズ除去 |
| Budilに取り込むなら | 沖縄気象・家電ニュース・生活トラブル系 RSS をウォッチリスト化。ヒット時に `source: 'news'` の需要ピックアップを生成。MVP は手入力メモ＋URL貼り付け |
| コード流用可否 | **不可**（サーバー必須・Python Flask） |
| 注意点 | Budil 単体では再実装コスト大。外部ツール連携か、GAS で RSS→JSON が現実的 |

### 2-2. FreshRSS/FreshRSS

| 項目 | 内容 |
|---|---|
| リポジトリ名 | FreshRSS/FreshRSS |
| URL | https://github.com/FreshRSS/FreshRSS |
| 概要 | セルフホスト型 RSS リーダー。フィード購読、カテゴリ、未読管理、WebSub |
| ライセンス | **AGPL-3.0** — コード流用不可 |
| 最終更新の目安 | 2026-06 活発（15k+ stars） |
| 参考にできる点 | フィードをカテゴリ分け（天気/家電/清掃/生活トラブル）、未読バッジ、毎朝「今日読むべき」一覧の UX |
| Budilに取り込むなら | Budil内にフルRSSリーダーは不要。カテゴリ＋未処理件数の**要約カード**だけ取る |
| コード流用可否 | **不可** |
| 注意点 | PHP + DB 必須。Budil とは別システムとして併用する想定がよい |

### 2-3. umputun/newscope

| 項目 | 内容 |
|---|---|
| リポジトリ名 | umputun/newscope |
| URL | https://github.com/umputun/newscope |
| 概要 | AI で RSS 記事を 0–10 スコアリング。トピック抽出、好み学習、カスタム RSS 出力 |
| ライセンス | **MIT** — 参考のみ |
| 最終更新の目安 | 2025-06 作成、2026-03 頃まで push |
| 参考にできる点 | **スコアスライダーで重要度フィルタ**、トピックタグクリックで絞り込み、スコア閾値付き RSS（`/rss?min_score=5`）、フィードバックで好み学習 |
| Budilに取り込むなら | 記事全文ではなく「要約1行＋スコア＋関連サービス」で需要ピックアップ表示。`demandScore` の UI 参考に最適 |
| コード流用可否 | **参考のみ** |
| 注意点 | AI スコアリングは API キー必要。MVP はルールベース（`DemandBrain` の既存スコア）で十分 |

**Budil向けニュース/RSS設計**

```
ソースカテゴリ:
  - weather: 沖縄気象・台風・湿度
  - appliance: エアコン・洗濯機・家電
  - trouble: 水漏れ・異臭・カビ・生活トラブル
  - season: 梅雨・猛暑・花粉

表示:
  - タイトル + 1行要約 + 関連サービスタグ + demandScore
  - 未処理 / 使用済み / 無視 の3状態
```

---

## 3. SNS投稿ネタ生成 / コンテンツカレンダー系

### 3-1. inovector/mixpost

| 項目 | 内容 |
|---|---|
| リポジトリ名 | inovector/mixpost |
| URL | https://github.com/inovector/mixpost |
| 概要 | セルフホスト型 SNS スケジューラ。カレンダー、キュー、チーム承認、複数チャネル投稿 |
| ライセンス | **MIT** — 参考のみ |
| 最終更新の目安 | 2026-03（3.3k stars） |
| 参考にできる点 | **ビジュアルカレンダー**、キュー自動投稿、1投稿を複数SNSに展開、ドラッグ&ドロップの計画UI |
| Budilに取り込むなら | Budil は投稿実行ツールではなく**ネタ出し**。1つの需要ピックアップから Instagram / TikTok / GBP / LINE 案を横並びカードで生成（`DemandBrain.POST_THEMES` 拡張） |
| コード流用可否 | **不可**（Laravel + Vue、サーバー必須） |
| 注意点 | 投稿API連携は v2.1 スコープ外。ネタ管理と「今日やること」連携が先 |

### 3-2. gitroomhq/postiz-app

| 項目 | 内容 |
|---|---|
| リポジトリ名 | gitroomhq/postiz-app |
| URL | https://github.com/gitroomhq/postiz-app |
| 概要 | エージェント型 SNS スケジューラ。AI コンテンツ生成、20+ チャネル、カレンダー、Make/n8n 連携 |
| ライセンス | **AGPL-3.0** — コード流用不可 |
| 最終更新の目安 | 2026-06 活発（32k stars） |
| 参考にできる点 | **1ネタから複数フォーマット生成**、エージェントが「今日何を投稿すべきか」提案、Webhook/API で外部連携 |
| Budilに取り込むなら | `suggestedActions[]` に `channel: Instagram | TikTok | GBP | LINE | ad` を持たせるデータ設計。将来 Make 連携のインスピレーション |
| コード流用可否 | **不可** |
| 注意点 | 機能過多。Budil は「経営判断→今日やること」に絞る |

**Budil向け投稿ネタ設計**

```
1需要ピックアップ → 複数投稿案:
  - Instagram: ビフォーアフター訴求
  - TikTok/Shorts: 15秒チェックリスト
  - GBP: 地域＋季節ワード
  - LINE: 既存顧客向け短文案
  - 広告: LP寄せ・キーワード変更

状態: draft → scheduled → posted → archived
優先度: 高（今日）/ 中（今週）/ 低（保留）
```

---

## 4. アラート / タスク化系

### 4-1. huginn/huginn

| 項目 | 内容 |
|---|---|
| リポジトリ名 | huginn/huginn |
| URL | https://github.com/huginn/huginn |
| 概要 | エージェント型自動化。RSS→フィルタ→通知の有向グラフ。IFTTT/Zapier のセルフホスト版 |
| ライセンス | **MIT** — 参考のみ |
| 最終更新の目安 | 2026-06 活発（49k stars） |
| 参考にできる点 | **イベント駆動パイプライン**（収集→条件→アクション）、Liquid テンプレで通知文生成、エージェント間のデータ受け渡し |
| Budilに取り込むなら | `外部需要取得 → スコアリング → 投稿/営業/広告候補 → 今日やること` のパイプライン設計。Budil内は関数チェーンで再現（Huginn 本体は不要） |
| コード流用可否 | **不可**（Ruby + DB + サーバー） |
| 注意点 | 運用コスト大。Budil は「判断UI」に集中し、収集は外部化 |

### 4-2. dongzhang84/trend-monitor

| 項目 | 内容 |
|---|---|
| リポジトリ名 | dongzhang84/trend-monitor |
| URL | https://github.com/dongzhang84/trend-monitor |
| 概要 | 複数ソース（GitHub Trending, Product Hunt, HN 等）を日次集約。GitHub Actions で毎朝レポート生成、GitHub Pages でダッシュボード表示、メール配信 |
| ライセンス | **未設定（license: null）** — コード流用不可 |
| 最終更新の目安 | 2026-06 活発 |
| 参考にできる点 | **GitHub Actions 日次バッチ + Pages 静的ダッシュボード**、複数ソース集約、週次サマリー、各アイテムに「First Step（具体アクション1つ）」 |
| Budilに取り込むなら | Budil と同じ GitHub Pages 運用と親和性が高い。Actions で `data/demand-snapshot.json` を生成→Budil が fetch。朝レポートと統合 |
| コード流用可否 | **不可**（ライセンス未設定） |
| 注意点 | テック系ソース中心。沖縄清掃業向けにソースを差し替える必要あり |

### 4-3. kks0488/repofit

| 項目 | 内容 |
|---|---|
| リポジトリ名 | kks0488/repofit |
| URL | https://github.com/kks0488/repofit |
| 概要 | GitHub Trending を AI でスコアリングし、プロジェクトに合うものを日次ダイジェスト（Slack） |
| ライセンス | **未設定（license: null）** — コード流用不可 |
| 最終更新の目安 | 2026-02 |
| 参考にできる点 | **「なぜ重要か」1行サマリー**、Rising Fast シグナル（急増率）、日次スナップショット保存で推移比較 |
| Budilに取り込むなら | 需要ピックアップに `reason`（なぜ今）と `risingRatio`（前日比）フィールドを追加 |
| コード流用可否 | **不可** |
| 注意点 | 小規模リポジトリ。設計パターンの参考程度 |

---

## 5. OSS横断で学べる共通パターン

| パターン | 代表例 | Budil v2.1 への適用 |
|---|---|---|
| ウォッチリスト | pytrends, changedetection | `budil_demand_radar.watchedKeywords` を拡張（カテゴリ・優先度付き） |
| スコアリング | newscope, DemandBrain | ルールベース `demandScore`（0–100）+ 閾値でトップ3抽出 |
| 差分・急上昇 | changedetection, repofit | 前回スナップショットとの差分で「急上昇」バッジ |
| 毎朝1画面 | trend-monitor, ManagementBrain | 需要番頭を朝レポート直上に配置 |
| 1ネタ→複数アクション | mixpost, postiz | `suggestedActions[]` で post/sales/ad を分岐 |
| 状態管理 | FreshRSS, postiz | `open / used / ignored` で処理済みを可視化 |
| 外部バッチ→静的JSON | trend-monitor, trendspyg | GitHub Actions が現実的な自動化経路 |

---

## 6. Budil v2.1 向け最終提案

### 6-1. 最初に入れるべき機能（最小実装）

優先度順:

1. **今日の需要ピックアップ（トップ3）** — 手入力＋既存 `DemandRadar` / `DemandBrain` スコアで生成
2. **投稿ネタ候補カード** — `DemandBrain.POST_THEMES` からチャネル別に1行表示
3. **営業アクション候補** — `DemandBrain.SALES_THEMES` + 既存営業先データ連携
4. **広告アクション候補** — 「今週は洗濯機LPへ寄せる」等の文言提案（ルールベース）
5. **需要メモ保存** — 既存 `marketMemos` + 新規 `demandPickups` 配列
6. **今日やることへ追加ボタン** — 既存 `Storage.addManualDailyTask()` 連携

**v2.1 で入れないもの（v2.2以降）**

- Google Trends 自動取得（Actions 連携）
- RSS 自動収集
- AI 要約
- SNS 直接投稿

### 6-2. 需要ピックアップのデータ構造案

localStorage キー案: `budil_demand_pickups`（新規。既存キーは変更しない）

```js
{
  id: 'demand-xxxxx',
  date: '2026-06-17',
  source: 'manual',       // manual | news | trend | weather | radar
  sourceLabel: '手入力',   // 画面表示用
  topic: '湿気・カビ',
  summary: '湿度が高く、カビ・臭い訴求が合いそう',
  reason: '梅雨時期で洗濯機・浴室の検索が伸びやすい',
  demandScore: 82,
  scoreDelta: 12,          // 前回比（任意）
  relatedServices: ['洗濯機クリーニング', 'エアコン完全分解'],
  keywords: ['カビ', '湿気', '臭い'],
  suggestedActions: [
    {
      type: 'post',
      title: '洗濯機のカビ投稿',
      channel: 'Instagram',
      body: '縦型洗濯機のカビ臭、放置すると…'
    },
    {
      type: 'sales',
      title: '管理会社へ洗濯機清掃を提案',
      channel: '営業',
      body: '梅雨前の定期清掃パッケージ'
    },
    {
      type: 'ad',
      title: '洗濯機LPへの広告寄せ',
      channel: 'Google広告',
      body: 'エアコン通常より洗濯機キーワードを強化'
    }
  ],
  status: 'open',          // open | used | ignored
  linkedTaskId: '',        // 今日やることに追加した場合
  createdAt: '2026-06-17T08:00:00.000Z',
  updatedAt: '2026-06-17T08:00:00.000Z'
}
```

**既存データとの関係**

| 既存 | v2.1 での扱い |
|---|---|
| `budil_demand_radar` | ウォッチキーワード・市場メモの入力元。ピックアップ生成の材料 |
| `budil_daily_demand_logs` | 日次需要ログ。スコア履歴の比較元 |
| `budil_generatedPosts` | 需要サーチ結果。ピックアップの `source: 'radar'` に紐付け |
| `budil_daily_action_tasks` | `suggestedActions` から手動タスク生成先 |

### 6-3. 画面UI案

**新ビュー: 需要ピックアップ番頭**（サイドバーに「需要番頭」追加、または需要レーダーを拡張）

```
┌─────────────────────────────────────────┐
│ 需要ピックアップ番頭                      │
│ 外部需要 → 投稿・営業・広告 → 今日やること  │
├─────────────────────────────────────────┤
│ 【今日の需要トップ3】                     │
│  1. 湿気・カビ (82) 洗濯機クリーニング     │
│  2. 台風前の水漏れ (75) エアコン          │
│  3. 完全分解 (68) リピート営業            │
├─────────────────────────────────────────┤
│ 【ピックアップ詳細カード】                │
│  要約 / 理由 / 関連サービス               │
│  ┌投稿ネタ┐ ┌営業┐ ┌広告┐              │
│  │Instagram案│ │提案文│ │LP寄せ│          │
│  └─────────┘ └────┘ └────┘              │
│  [今日やることに追加] [使用済み] [無視]    │
├─────────────────────────────────────────┤
│ 【需要メモ追加】                          │
│  トピック / 要約 / 関連キーワード          │
│  [ピックアップとして保存]                  │
├─────────────────────────────────────────┤
│ 【未処理一覧】 open のみ、新しい順         │
└─────────────────────────────────────────┘
```

**ダッシュボード連携**

- 朝レポートに「今日の需要トップ1」を1行表示（既存 `ManagementBrain` 拡張）
- 経営番頭コメントに需要ピックアップを反映（`RevenueBrain.buildManagementComment` と並列）

**スマホ**

- カード縦積み、ボタンは44px以上、`overflow-wrap: anywhere`

### 6-4. 外部自動取得の現実案

| 区分 | できること | 具体手段 |
|---|---|---|
| **Budil単体（GitHub Pages）** | 手入力需要メモ、ルールベーススコア、投稿/営業/広告案生成、今日やること連携、JSONインポート、静的JSON読み込み | `demand-pickup-brain.js` + localStorage |
| **GAS（無料）** | RSS取得、天気API、キーワードフィルタ、要約（任意）、JSONをGitHubにpush or BudilがfetchするURLに配置 | 毎朝トリガー、沖縄気象庁・ニュースRSS |
| **GitHub Actions** | Google Trends バッチ、複数RSS集約、日次スナップショット commit、`data/demand-snapshot.json` 更新 | trendspyg / Python スクリプト（Budil外） |
| **Make / n8n** | RSS→フィルタ→Webhook→（将来）Budil API、Slack/LINE通知 | v2.2以降。BudilにWebhook受け口はまだ不要 |
| **手入力MVP（v2.1推奨）** | 上記すべての**判断UI**を先に完成。データは手入力＋既存需要レーダー | 実運用2週間でウォッチキーワードを調整してから自動化 |

**GitHub Pages 単体でできないこと**

- サーバーサイド cron / バックグラウンド取得
- Google Trends 直接API（CORS・レート制限）
- RSS のブラウザ直 fetch（多くのフィードが CORS ブロック）
- 常時監視・プッシュ通知（Service Worker なし）

**将来API連携の優先順位**

1. 沖縄気象・台風情報（気象庁 or OpenWeather）
2. Google Trends（Actions + trendspyg → JSON）
3. ニュース RSS（GAS プロキシ）
4. AI 要約（任意。ルールベースで十分な間は不要）

---

## 7. v2.1 最小実装ロードマップ（提案）

| フェーズ | 内容 | 工数目安 |
|---|---|---|
| **v2.1.0** | 需要ピックアップ番頭ビュー、手入力CRUD、トップ3表示、今日やること連携 | 小 |
| **v2.1.1** | `DemandRadar` / `DemandBrain` からの自動ピックアップ生成（既存データのみ） | 小 |
| **v2.1.2** | 朝レポート・経営番頭コメントへの統合 | 小 |
| **v2.2** | GitHub Actions で `demand-snapshot.json` 日次更新 | 中 |
| **v2.3** | GAS RSS プロキシ + 天気連携 | 中 |

---

## 8. 参考リポジトリ一覧（10件）

| # | リポジトリ | テーマ | ライセンス | Stars | 最終push目安 |
|---|---|---|---|---|---|
| 1 | [GeneralMills/pytrends](https://github.com/GeneralMills/pytrends) | Trends | Other（不明） | 3.7k | 2024-08 |
| 2 | [flack0x/trendspyg](https://github.com/flack0x/trendspyg) | Trends | MIT | 31 | 2026-06 |
| 3 | [dgtlmoon/changedetection.io](https://github.com/dgtlmoon/changedetection.io) | RSS/監視 | Apache-2.0 | 32k | 2026-06 |
| 4 | [FreshRSS/FreshRSS](https://github.com/FreshRSS/FreshRSS) | RSS | AGPL-3.0 | 15k | 2026-06 |
| 5 | [umputun/newscope](https://github.com/umputun/newscope) | RSS+AI | MIT | 42 | 2026-03 |
| 6 | [inovector/mixpost](https://github.com/inovector/mixpost) | カレンダー | MIT | 3.3k | 2026-03 |
| 7 | [gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app) | カレンダー | AGPL-3.0 | 32k | 2026-06 |
| 8 | [huginn/huginn](https://github.com/huginn/huginn) | アラート | MIT | 49k | 2026-06 |
| 9 | [dongzhang84/trend-monitor](https://github.com/dongzhang84/trend-monitor) | ブリーフィング | **未設定** | 6 | 2026-06 |
| 10 | [kks0488/repofit](https://github.com/kks0488/repofit) | ブリーフィング | **未設定** | 0 | 2026-02 |

---

## 9. 確認チェックリスト（本調査）

- [x] 調査メモ作成
- [x] 5件以上の参考リポジトリ（10件）
- [x] ライセンス欄あり
- [x] Budil取り込み機能案あり
- [x] v2.1最小実装案あり
- [x] GitHub Pages単体 / 外部自動化の切り分けあり

---

## 10. 禁止事項の遵守

- 外部コードのコピー: **なし**
- npm install: **なし**
- Budil本体コード変更: **なし**
- ライセンス不明リポジトリの流用: **なし**（設計参考のみ、明記済み）

---

*本ドキュメントは Budil v2.1 設計の入力資料。実装時は `docs/research/budil-oss-reference.md` と合わせて参照すること。*
