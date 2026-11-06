# Budil 手動クラウド復元 — 開発ブランチ 2026-11-06

## 検証範囲と公開境界

- 元の Supabase Edge Function `budil-backups` v3 からソースとヘルパーを控え、既存 POST / と GET /latest は維持。
- 新しい GET /latest/payload は既存 JWT・単一のactive membership・active tenant の検査に加え、`role=owner` の場合に限り完全スナップショットを返す。既存のCORS制限と no-store を維持。
- ブラウザ側 `BudilCloud.fetchLatestPayload()` は認証済み GET のみ、操作開始は本人がボタンを押した場合に限る。
- `BudilCloudRestore` は SHA-256 を再計算し、DataBackupで形式を検証する。下書きメモリ以外に復元候補を保存しない。
- 現在の端末のJSONをダウンロードして保存を確認し、同意欄と復元ボタンの別操作が成立した場合のみ、DataBackup.BACKUP_KEYS 内の対象項目を上書きする。
- 復元直前に端末のデータハッシュを再確認。変更されていれば停止。書き込み中失敗したら復元前の値へロールバックを試みる。ロールバック失敗時はユーザーへ明示する。
- キーが存在しない項目は削除しない。自動同期・バックグラウンドの同期・他端末への書込なし。

## 受入テスト

- `node scripts/verify-budil-cloud-safe-restore.mjs` — 10/10 (ダミーユーザー・ダミー帳票、通信なし)。改竄拒否、許可未取得拒否、ローカル内容変更拒否、部分失敗ロールバック、二重実行防止を検証。
- `node scripts/verify-budil-cloud-restore-server.mjs` — 認可・テナント分離・安全確認UIの静的契約。
- `deno check supabase/functions/budil-backups/index.ts` — 実際のTypeScript依存関係を型検査。
- `node scripts/verify-budil-ai-p0-browser.mjs` — 既存見積・PDF・顧客操作を隔離Chromiumで回帰。
- `node scripts/verify-budil-cloud-restore-browser.mjs` — 390pxの隔離Chromeで、クラウドGETモック→プレビュー→現端末JSON保存→本人チェック→復元→データ読み戻しを確認。

## 本番を使用する前に必要な明示承認

1. 変更されたSupabase Edge Functionの本番デプロイ（現時点では未実施）。
2. 開発ブランチをレビューし、PRのGitHub Pages公開反映を明示承認（現時点では未実施）。
3. テスト用の隔離アカウント・データを用いて実際のサーバーGETと手動復元を検証（本番顧客データは使用禁止）。
4. PCと本人のiPhone/Android実機で、同一アカウントの別端末復元・失敗・再読込を検品。
5. オート同期に進化させる際は競合解決・端末別更新時刻とスナップショット選択等が必要（この実装は手動復元MVPであって自動同期ではない）。

その他、GPT実APIの有料通信やGoogleカレンダー書込権限は一切変更しない。
