# Budil 公開準備メモ

> **【旧情報】** 本ファイルは MVP v0.1 時代のメモです。  
> 正本ドキュメントはリポジトリルートの [README.md](../README.md) / [status.md](../status.md) / [rules.md](../rules.md) / [handoff.md](../handoff.md) を参照してください。

最終更新: 2026-06-16  
対象: Budil MVP v0.1

---

## Budilの目的

照屋さん専用のAI経営脳みそ「バディル（Budil）」は、営業番頭・需要サーチ番頭・将来的な経営番頭の土台となる統合ダッシュボードです。

MVP v0.1 の完成定義は、完全自動連携ではなく、次の4つを判断できる状態にすることです。

- 今日、何を売るか
- 誰に営業するか
- 何を投稿するか
- 何を優先するか

Budilは相手を評価するツールではなく、営業準備を速くする相棒として設計されています。

---

## 現在の完成状態

| 機能 | 状態 |
|---|---|
| ダッシュボード（今日の3アクション・アラート） | 完成 |
| 需要サーチ番頭（手動貼り付け→ローカル分析） | 完成 |
| 営業番頭（リード管理・文面生成） | 完成 |
| 名刺解析モード（UIのみ） | 完成（OCR未接続） |
| 追客管理（フィルター・フォロー漏れ表示） | 完成 |
| localStorage永続化 | 完成 |
| API自動連携 | 未実装（意図的に除外） |

技術スタック: HTML / CSS / JavaScript のみ。ビルド不要。

---

## 画面構成

| # | 画面名 | ファイル内セクション | 主な機能 |
|---|---|---|---|
| 1 | ダッシュボード | `#view-dashboard` | 最優先アクション、投稿テーマ、今日の3アクション、営業先、再連絡案件、アラート、メモ |
| 2 | 需要サーチ番頭 | `#view-demand` | 5種入力の貼り付け、キーワード分析、投稿案・営業ネタ生成 |
| 3 | 営業番頭 | `#view-sales` | リードCRUD、優先度A/B/C、営業文面生成（メール/フォーム/DM/電話） |
| 4 | 名刺解析モード | `#view-card` | 画像アップロード、抽出結果表示（プレースホルダー） |
| 5 | 追客管理 | `#view-followup` | ステータス管理、フィルター、NGリスト、フォロー漏れ表示 |

---

## localStorageキー

| キー | 内容 |
|---|---|
| `budil_leads` | 営業先（会社・連絡先・優先度・ステータス等） |
| `budil_demandNotes` | 需要サーチの入力データ |
| `budil_generatedPosts` | 需要分析の出力結果 |
| `budil_generatedMessages` | 生成済み営業文面 |
| `budil_followups` | 追客管理データ |
| `budil_settings` | ダッシュボード設定（優先アクション・投稿テーマ・メモ） |
| `budil_migrated_v2` | 旧キーからのマイグレーション済みフラグ |

データはブラウザのlocalStorageに保存されます。ブラウザやデバイスを変えるとデータは引き継がれません。

---

## ファイル構成

```
budil/
├── index.html              # メインSPA
├── css/
│   └── style.css           # スタイル
├── js/
│   ├── storage.js          # localStorage管理
│   ├── messages.js         # 営業文面テンプレート
│   └── app.js              # アプリケーションロジック
└── docs/
    ├── research/
    │   └── budil-oss-reference.md  # OSS参考調査メモ
    └── handoff.md          # 本ファイル
```

読み込み順（index.html末尾）:

1. `js/storage.js`
2. `js/messages.js`
3. `js/app.js`

---

## 公開手順（GitHub Pages）

### 1. リポジトリ初期化

```powershell
cd C:\dev\budil
git init
git add .
git commit -m "Budil MVP v0.1 初回公開"
```

### 2. GitHubにpush

```powershell
git remote add origin https://github.com/<ユーザー名>/budil.git
git branch -M main
git push -u origin main
```

### 3. GitHub Pages有効化

1. GitHubリポジトリ → Settings → Pages
2. Source: **Deploy from a branch**
3. Branch: **main** / **/ (root)**
4. Save

数分後、`https://<ユーザー名>.github.io/budil/` でアクセス可能になります。

### 4. 動作確認チェックリスト

- [ ] 5画面すべて切り替わる
- [ ] ダッシュボードのメモがリロード後も残る
- [ ] 営業先の追加・編集・削除ができる
- [ ] 文面生成・コピーができる
- [ ] 需要サーチの分析ボタンが動く
- [ ] 追客フィルターが動く
- [ ] スマホ表示でサイドバーがアイコン表示になる

---

## 次にやること

### v0.2 候補

1. **名刺OCR連携** — Tesseract.js または外部API
2. **データエクスポート/インポート** — JSONバックアップ
3. **需要サーチのAI強化** — API連携（Google Trends等）
4. **Kanbanビュー** — 追客パイプラインの視覚化
5. **PWA化** — オフライン対応・ホーム画面追加

### 公開前に推奨

1. git初期化とGitHubリポジトリ作成
2. 実データで1週間の運用テスト
3. localStorageバックアップ手順の確立

---

## 注意点

### データについて

- データはブラウザ内のlocalStorageのみに保存される
- キャッシュクリアでデータが消える可能性がある
- 複数デバイス間の同期は未対応

### セキュリティについて

- 営業先の連絡先情報は端末内に留まる設計
- 認証機能なし（個人利用前提）
- 公開URLは誰でもアクセス可能（データは各ユーザーのブラウザ内）

### 営業文面について

- 自動生成文面は「敬意ある提案型」テンプレート
- 相手のサイトやSNSを指摘する文面は生成しない
- 送信前に必ず照屋さんが内容を確認・調整すること

### 技術的制約

- `file://` で開いた場合、一部ブラウザでClipboard APIが制限される（コピーボタンはフォールバック対応済み）
- GitHub PagesではHTTPSのためClipboard APIは正常動作

---

## 参考資料

- OSS参考調査: `docs/research/budil-oss-reference.md`
