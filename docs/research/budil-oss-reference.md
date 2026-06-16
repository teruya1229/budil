# Budil OSS 参考調査メモ

調査日: 2026-06-16  
目的: Budil MVP v0.1 の設計・実装における UI構成・画面設計・データ構造・機能思想の参考  
方針: **外部コードの丸コピーは禁止**。思想と設計パターンのみ参考にする。

---

## 1. CRM / 営業管理系

### 1-1. outreach-planner

| 項目 | 内容 |
|---|---|
| リポジトリ名 | kashaziz/outreach-planner |
| URL | https://github.com/kashaziz/outreach-planner |
| ライセンス | **未設定（license: null）** — コード流用不可 |
| 参考にする点 | 単一HTMLファイル・ビルド不要・localStorage永続化・JSONエクスポート思想・オフライン動作 |
| Budilに取り入れる点 | file:// で動く構成、入力即保存、データはブラウザ内に閉じる設計 |
| 取り入れない点 | 単一ファイルへの全埋め込み（保守性のため Budil はファイル分割） |
| 注意点 | ライセンス未設定のためコード参照・流用はしない |

### 1-2. follow-up-pal (Follow-Up Buddy)

| 項目 | 内容 |
|---|---|
| リポジトリ名 | Thanchanokk-p/follow-up-pal |
| URL | https://github.com/Thanchanokk-p/follow-up-pal |
| ライセンス | 要確認（README上は明示なし） |
| 参考にする点 | 追客CRUD、優先度（Low/Medium/High）、Today/Overdue表示、ステータスバッジ |
| Budilに取り入れる点 | 追客の優先度概念、今日対応・期限超過の視覚化、フィルター付き一覧 |
| 取り入れない点 | React + Vite + shadcn/ui スタック |
| 注意点 | フレームワーク依存。UIパターンのみ参考 |

### 1-3. Twenty CRM

| 項目 | 内容 |
|---|---|
| リポジトリ名 | twentyhq/twenty |
| URL | https://github.com/twentyhq/twenty |
| ライセンス | AGPL-3.0（コミュニティ情報より。公式APIでは Other 表記） |
| 参考にする点 | 営業パイプライン、Kanbanビュー、ステージ別案件管理、Companies/Opportunities データモデル |
| Budilに取り入れる点 | ステータス遷移の考え方（未送信→送信済み→返信あり→商談中→成約）、パイプライン的な一覧表示 |
| 取り入れない点 | PostgreSQL/Redis/NestJS/React フルスタック、サーバー必須構成 |
| 注意点 | MVP段階ではKanbanは将来検討。今回はテーブル+ステータスフィルターで代替 |

### 1-4. atomic-crm

| 項目 | 内容 |
|---|---|
| リポジトリ名 | marmelab/atomic-crm |
| URL | https://github.com/marmelab/atomic-crm |
| ライセンス | MIT |
| 参考にする点 | リード・会社・商談の関連付け、CRMオブジェクト設計、ダッシュボード的な一覧UI |
| Budilに取り入れる点 | leads（営業先）と followups（追客）の分離思想、会社を軸にした情報集約 |
| 取り入れない点 | Supabase依存、React Admin フル実装 |
| 注意点 | データモデル思想のみ参考。MITでもコードコピーはしない |

### 1-5. MeetFound

| 項目 | 内容 |
|---|---|
| リポジトリ名 | UltronTheAI/MeetFound |
| URL | https://github.com/UltronTheAI/MeetFound |
| ライセンス | Other (NOASSERTION) |
| 参考にする点 | 名刺画像保存、人物メモリCRM、オフラインクライアントのみ |
| Budilに取り入れる点 | 名刺解析モードのUI構成（アップロード→抽出結果→リスト追加フロー） |
| 取り入れない点 | Next.js + IndexedDB + Capacitor |
| 注意点 | OCR/API連携は将来実装。今回はUIのみ |

---

## 2. ダッシュボードUI系

### 2-1. Nebula-Saas-Dashboard

| 項目 | 内容 |
|---|---|
| リポジトリ名 | mohanprasath-dev/Nebula-Saas-Dashboard |
| URL | https://github.com/mohanprasath-dev/Nebula-Saas-Dashboard |
| ライセンス | 要確認（README上は明示なし） |
| 参考にする点 | Vanilla JS、CSS Custom Properties、KPIカード、ダーク/ライト切替、サイドバー |
| Budilに取り入れる点 | ビルド不要構成、カード型レイアウト、CSS変数によるテーマ管理 |
| 取り入れない点 | SaaS向け汎用ダッシュボードの全機能 |
| 注意点 | 内部ツール感より業務特化UIを優先 |

### 2-2. DashKit Pro

| 項目 | 内容 |
|---|---|
| リポジトリ名 | Abood170/dashkit-pro |
| URL | https://github.com/Abood170/dashkit-pro |
| ライセンス | Other (NOASSERTION) |
| 参考にする点 | KPIカード、サイドバー折りたたみ、ステータスバッジ、モバイル対応 |
| Budilに取り入れる点 | 「今日の一手」を目立たせるハイライトカード、レスポンシブサイドバー |
| 取り入れない点 | Chart.js依存の分析チャート（MVP不要） |
| 注意点 | テンプレートの見た目コピーはしない |

### 2-3. web1-project (dungtq2k5)

| 項目 | 内容 |
|---|---|
| リポジトリ名 | dungtq2k5/web1-project |
| URL | https://github.com/dungtq2k5/web1-project |
| ライセンス | MIT |
| 参考にする点 | Vanilla JS + localStorage、MVC風モジュール分割、管理画面CRUD |
| Budilに取り入れる点 | `storage.js` / `app.js` の責務分離、localStorage永続化パターン |
| 取り入れない点 | ECサイト本体、認証フロー |
| 注意点 | 設計パターンのみ参考 |

---

## 3. Googleトレンド / 需要サーチ系

### 3-1. pytrends

| 項目 | 内容 |
|---|---|
| リポジトリ名 | GeneralMills/pytrends |
| URL | https://github.com/GeneralMills/pytrends |
| ライセンス | Other (NOASSERTION) — **アーカイブ済み** |
| 参考にする点 | Interest Over Time、Related Queries、Trending Searches、地域別需要の概念 |
| Budilに取り入れる点 | 需要サーチ番頭の**出力カテゴリ設計**（注目KW、関連KW、投稿テーマ化） |
| 取り入れない点 | Python API連携（MVP禁止）、非公式API依存 |
| 注意点 | Google公式APIではない。MVPは手動貼り付け+ローカル解析で代替 |

### 3-2. trendi_search

| 項目 | 内容 |
|---|---|
| リポジトリ名 | parsafarshadfar/trendi_search |
| URL | https://github.com/parsafarshadfar/trendi_search |
| ライセンス | 要確認 |
| 参考にする点 | キーワード入力→トレンド可視化→サマリー生成のワークフロー |
| Budilに取り入れる点 | 複数ソース（トレンド/広告/GSC/GA4/Instagram）を統合入力する画面構成 |
| 取り入れない点 | Streamlit + PyTorch + HuggingFace による自動要約 |
| 注意点 | AI要約は将来検討。今回はルールベースの投稿案・営業ネタ生成 |

### 3-3. google_trends (DylanTartarini1996)

| 項目 | 内容 |
|---|---|
| リポジトリ名 | DylanTartarini1996/google_trends |
| URL | https://github.com/DylanTartarini1996/google_trends |
| ライセンス | 要確認 |
| 参考にする点 | pytrends入門ノートブック、地域別・時系列分析の手順 |
| Budilに取り入れる点 | 需要分析の観点整理（何を見るか） |
| 取り入れない点 | Jupyter/Python環境 |
| 注意点 | 分析手法の参考のみ |

---

## Budil MVP への設計反映まとめ

### 採用する設計パターン

| 領域 | 採用パターン | 参考元 |
|---|---|---|
| 永続化 | localStorage + キー分離 | outreach-planner, web1-project |
| 営業先管理 | leads テーブル + 優先度 A/B/C | Twenty, atomic-crm |
| 追客管理 | ステータスフィルター + 次回連絡日 | follow-up-pal, Twenty |
| ダッシュボード | KPIカード + 今日の3アクション + アラート | DashKit, Nebula |
| 需要サーチ | 手動貼り付け → ローカルキーワード抽出 → 投稿案生成 | pytrends（概念のみ） |
| 名刺解析 | アップロードUI → 抽出欄 → leads追加 | MeetFound |
| 営業文面 | 敬意あるテンプレート生成（指摘しない） | **Budil独自思想** |

### 採用しないもの

- npm / フレームワーク / サーバー / DB
- 外部API自動連携（Google Trends API、OCR等）
- 外部コードのコピー
- ライセンス不明・未設定リポジトリのコード流用
- 相手サイトを上から目線で指摘する文面生成

### localStorage キー設計

| キー | 用途 |
|---|---|
| `budil_leads` | 営業先（会社・連絡先・優先度・ステータス） |
| `budil_demandNotes` | 需要サーチ入力データ |
| `budil_generatedPosts` | 生成された投稿案 |
| `budil_generatedMessages` | 生成された営業文面 |
| `budil_followups` | 追客管理データ |
| `budil_settings` | ダッシュボード設定・メモ |

### 注意事項（全般）

1. **コードはすべて独自実装**。OSSは画面構成・データ構造・UX思想の参考に留める。
2. **ライセンス不明（NOASSERTION / null）のリポジトリはコード参照しない**。
3. MIT等でもコピーはせず、設計パターンのみ活用する。
4. MVPは「判断ダッシュボード」が主目的。完全自動化は v0.2 以降。
5. 営業文面は照屋さんのスタイル（敬意・提案型）を最優先する。
