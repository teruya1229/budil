# Budil

## Budilとは

Budil（バディル）は、AI経営脳みそ / 営業〜経営番頭ツールです。

朝Budilを開いて、今日やるべきことを把握するための内部ツールとして設計されています。営業先管理、需要チェック、営業文面生成、名刺登録、追客管理、データ管理をひとつにまとめます。

- 外部APIなし
- 静的HTML / CSS / JavaScript構成
- GitHub Pagesで運用

## 公開URL

https://teruya1229.github.io/budil/

## 現在バージョン

v1.7

## 主な機能

- ダッシュボード / 経営番頭
- 朝レポート
- 今日の営業ミッション
- 今日売るべきサービス
- 今日営業すべき会社
- 需要レーダー
- 需要サーチ番頭
- 営業番頭
- 営業プリセット
- 営業文面生成
- 営業ステータス管理
- 次アクション管理
- AI優先度判定
- 名刺登録モード
- 追客管理
- データ管理 / JSONエクスポート・インポート

## データ保存

- localStorage保存
- 既存データ互換を重視
- localStorageキーを破壊的変更しない
- バージョン追加時はマイグレーションで対応

## 開発方針

- まずは内部ツールとして実用優先
- 静的構成を維持
- npm installなし
- 外部APIなし
- 大規模リファクタより、現場で使える小改善を優先

## プロジェクト管理ドキュメント

| ファイル | 内容 |
|---|---|
| [status.md](status.md) | 現在の公開状態・実装内容・残課題 |
| [rules.md](rules.md) | 開発ルール・禁止事項 |
| [handoff.md](handoff.md) | 次回以降の引継ぎ情報 |

## ファイル構成

```
budil/
├── index.html
├── css/style.css
├── js/
│   ├── storage.js
│   ├── messages.js
│   ├── demand-brain.js
│   ├── demand-radar.js
│   ├── sales-brain.js
│   ├── management-brain.js
│   ├── card-ocr.js
│   ├── data-backup.js
│   └── app.js
├── README.md
├── status.md
├── rules.md
├── handoff.md
└── docs/
    └── research/
        └── budil-oss-reference.md
```
