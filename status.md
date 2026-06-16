# Budil status

最終更新: 2026-06-16

## 現在の公開状態

- 公開URL: https://teruya1229.github.io/budil/
- 現在バージョン: v1.7.1
- 最新commit: 1ac8ab9
- push済み（`67dddfb..1ac8ab9 main -> main`）
- GitHub Pages公開済み

## v1.7 実装内容

### 変更ファイル

- `js/sales-brain.js`
- `js/storage.js`
- `js/app.js`
- `js/management-brain.js`
- `index.html`
- `css/style.css`

### 実装内容

**営業ステータス追加（`salesStatus`）**

- 未営業
- 初回連絡済み
- 興味あり
- 見積り・提案中
- 日程調整中
- 成約
- 見送り

**新規フィールド**

- `nextAction` — 次アクションメモ
- `nextActionDate` — 次アクション日
- `priorityScore` — 優先度スコア（ルールベース算出）
- `priorityLabel` — 優先度ラベル（高 / 中 / 低）
- `priorityReason` — 優先理由
- `lastContactAt` — 最終連絡日

**マイグレーション**

- `migrateV17()` / `budil_migrated_v17` フラグで既存リードに安全な初期値を付与

**UI・連携**

- 営業詳細パネルに営業管理UI追加（ステータス・次アクション・日付・優先度表示）
- 営業先一覧に優先度・営業ステータス・次アクション日を表示
- 今日営業すべき会社へ優先度反映
- 朝レポート「今日の営業」へv1.7情報反映（優先度・理由・次アクション・プリセット・ステータス）
- 画面上のバージョン表示を v1.7 に更新

**優先度ロジック（ルールベース）**

- 次アクション日が今日以前 → 優先度高
- 興味あり / 見積り・提案中 / 日程調整中 → 優先度高
- 未営業 → 優先度中
- 成約 / 見送り → 今日の営業から除外
- 営業プリセット設定済み → 優先度を少し上げる
- 次アクション未設定 → 注意表示

## 互換確認

- localStorageキーは変更なし
- 既存リードに安全な初期値を付与（旧 `status` から `salesStatus` へマッピング）
- v1.6営業プリセット維持
- 文面生成維持
- 朝レポート維持
- 詳細パネル維持

## v1.7.1 修正内容（スマホ写真アップロード）

### 変更ファイル

- `index.html`
- `css/style.css`
- `js/app.js`

### 実装内容（要点）

- 名刺登録UIの `input[type=file]` を `hidden`（display:none相当）から解除し、`label[for="card-file-input"]` 方式に切替（スマホで選択ダイアログを開きやすくする）
- 画像読み込み時にダウンサンプル/圧縮（JPEGへ変換・最大幅1200px程度）して、localStorage保存の失敗（容量過多）を減らす
- 画像読み込み・保存失敗を `#card-ocr-status` に表示し、無言で止まらないようにする
- 同一ファイルを再選択できるように `input.value` をリセットする

### 互換確認

- 既存の `budil_card_draft`（画像のdataURL）形式は維持
- localStorageキーを破壊的に変更しない

## 動作確認

- `node --check` 成功（変更JSファイル）
- 公開URLで v1.7 表示確認対象
- 営業先追加
- 詳細パネルで営業ステータス編集
- 次アクション保存
- 朝レポート反映
- スマホ表示確認

## 残課題

- 実機での営業先追加 → 詳細編集 → 朝レポート反映の通し確認
- プリセットごとの次アクション初期値テンプレート
- 営業履歴の分析強化
- 今日の営業ミッションの精度向上
- status.md / rules.md / README.md / handoff.md を正本として継続更新

## v1.7後のドキュメント整備

- brain.md 作成（Budilの判断設計）
- playbooks.md 作成（状況別の行動パターン）
- kpi-rules.md 作成（数字の判断基準）
- decision-log.md 作成（判断履歴）
- experiments.md 作成（仮説検証ログ）

## バージョン履歴（概要）

| バージョン | commit | 主な内容 |
|---|---|---|
| v1.7 | 1ce1259 | 営業ステータス・次アクション・優先度管理 |
| v1.6 | 8eb2c9f | 営業プリセット |
| v1.5 | d1a8890 | 営業自動準備 |
