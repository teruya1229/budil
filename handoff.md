# Budil handoff

最終更新: 2026-06-16

## 正本

- [README.md](README.md)
- [status.md](status.md)
- [rules.md](rules.md)
- [handoff.md](handoff.md)
- 公開URL: https://teruya1229.github.io/budil/

## 現在の状態

- Budil v1.7 公開済み
- 営業プリセット v1.6 実装済み
- 営業ステータス / 次アクション / 優先度判定 v1.7 実装済み
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

## localStorageキー（主要）

| キー | 内容 |
|---|---|
| `budil_leads` | 営業先（ステータス・次アクション・優先度含む） |
| `budil_settings` | ダッシュボード設定 |
| `budil_generatedPosts` | 需要分析結果 |
| `budil_generatedMessages` | 生成済み営業文面 |
| `budil_followups` | 追客管理 |
| `budil_migrated_v17` | v1.7マイグレーション済みフラグ |

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
