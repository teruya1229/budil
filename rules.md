# Budil 開発ルール

最終更新: 2026-06-16

## 基本方針

- ゴール達成型で進める
- 内部ツールとして現場実用を優先
- 既存機能を壊さない
- 小さく改善して公開確認まで行う
- 完了後は必ず status.md / handoff.md を更新する

## 技術ルール

- 静的HTML / CSS / JavaScript構成を維持
- GitHub Pagesで動くこと
- npm installしない
- 外部APIを追加しない
- ビルド工程を追加しない
- localStorage保存を維持
- 既存localStorageキーを破壊的変更しない
- バージョンアップ時はマイグレーション関数を使う
- JS変更後は `node --check` を実施する

## データ互換ルール

- 既存localStorageデータを消さない
- 保存構造を変える場合は旧データから安全に補完する
- 未設定値は初期値を入れる
- 破壊的な初期化は禁止
- データ管理画面のエクスポート/インポート機能を壊さない

## UIルール

- スマホ表示を維持
- 既存の画面構成を大きく壊さない
- 新機能は既存UIに自然に追加
- 営業番頭、朝レポート、データ管理を優先して守る
- 表示バージョンは必ず更新する

## Git運用

### 確認なしで実行してよいコマンド

- `git status`
- `git diff`
- `git log`
- `git add`
- `git commit`
- `git push`
- `pwd`
- `ls`
- `cat`
- `type`
- `echo`
- `Get-Location`
- `Get-ChildItem`

### 禁止コマンド

- `rm`
- `del`
- `sudo`
- `git reset --hard`
- `git clean`
- `git checkout -- .`
- `git restore .`
- `git restore --source`
- `git reset --mixed`
- `git reset --soft`

## 禁止事項

- 既存機能の削除
- localStorageキーの破壊的変更
- 外部ライブラリ追加
- 不要な大規模リファクタ
- unrelatedなファイル変更
- デザイン全面変更
- 動作確認なしのpush
- status.md未更新での完了

## 完了報告ルール

作業完了時は以下を報告する。

- git status
- 変更ファイル
- commit hash
- push結果
- 公開URL
- 実装内容
- 互換確認
- 動作確認
- 残課題

## 正本ドキュメント

開発・引継ぎ時は以下を参照する。

- [README.md](README.md) — プロジェクト概要
- [status.md](status.md) — 現在の公開状態
- [rules.md](rules.md) — 本ファイル
- [handoff.md](handoff.md) — 引継ぎ情報
