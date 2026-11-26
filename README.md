# Budil（バディル）

BCサービスの案件・作業予定・受付・顧客・売上・経費・利益・見積書・請求書を管理する業務ツールです。

## 現在の構成（2026-11-26確認）

- **公開URL**: https://teruya1229.github.io/budil/
- **UI版**: v4.13.20（GitHub Pages／HTML・CSS・JavaScript）
- **GPT**: Supabase Auth + `budil-gpt-chat` Edge Function v6（会話・読取・安全な下書きプレビュー）
- **保存正本**: 現行Budilの主要業務データはブラウザのlocalStorage。JSONバックアップ機能あり
- **外部連携**: Googleカレンダー読取、Browser番頭によるREAD、Supabase認証／GPT等。連携には個別の起動・権限条件あり
- **Google予定の書込み**: 本番はHARD OFF。予約・変更はプレビューのみ。ユーザーの本人承認なしに保存しない

**重要**: GPT会話は業務データを自動確定しません。顧客の氏名・住所・電話・現場メモを外部AIに送らない既存の境界を維持し、請求確定・売上確定・Google予定登録・外部送信などは従来の承認経路が必要です。

## 主な機能

- 受付・顧客管理・作業予定・Google予定取込／確認（重複防止あり）
- 確定売上・入金状況・経費・予定利益／実績利益／月次集計
- 見積書／請求書作成・印刷・PDF出力、案件／売上との紐づけ
- 経営ダッシュボード・需要／集客チェック
- Budil GPT：初回アカウント別同意、通常の連続会話、端末内読取と予約・見積等の安全な下書き
- 端末内JSONバックアップ／確認付き復元

## データと安全境界

- 保存中の案件・売上・経費・予定の **二重作成防止** と **既存データ保全** を最優先
- GPTの会話履歴は匿名化済みの一部のみ同一タブで一時復元。本人の顧客記録はGPT会話キャッシュへコピーしない
- GPT同意は同一ブラウザ内でもBudilの認証アカウントごとに分離
- Googleカレンダーは会社の売上や案件の正本ではない
- Budilクラウドスナップショットは現時点では運用上の正本ではない（本番DBで0件確認）。古いバックアップを現行データと誤認しない
- Supabaseの本番環境と削除済み検証環境を混同しない。localhostから本番へ自動接続しない
- 認証情報・service role key等を公開フロントエンドに配置しない

## 開発・検証

- 本番公開ブランチ：`main`。本番公開URLとコード、CI結果は区別して検証する
- 単独ルートでの`npm install`は不要。正式な`verify-current.mjs`には隣接する`calendar-sync-worker`および`hub/functions`の依存関係が必要
- GPT関連の検証は、偽アカウント・架空顧客を使う隔離ChromeとGitHub Actionsで実行する。本番ログインのGPT GUI・実iPhoneは別途実機検品
- ソース仕様変更→隔離テスト→PRレビュー→明示許可→公開→実機検品の順に進める
- 既存の売上・経費・請求・顧客・原価計算コードを理由なく書き換えない

## 開発正本

| ファイル | 用途 |
|---|---|
| [status.md](status.md) | 現行状況と実測、残課題 |
| [handoff.md](handoff.md) | 再開地点・検証証拠 |
| [decision-log.md](decision-log.md) | 本人確定の判断・安全ルール |
| [rules.md](rules.md) | 既存機能・業務データ保護の開発ルール |
| [brain.md](brain.md) | 経営判断設計 |
| [playbooks.md](playbooks.md) | 運用プレイブック |
| [kpi-rules.md](kpi-rules.md) | 判断基準 |
| [experiments.md](experiments.md) | 仮説検証 |
