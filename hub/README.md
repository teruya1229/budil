# Budil 受付ハブ（BT Hub）

受付データを Firestore に置き、Budil 本体が API キー付き HTTPS で取り込む構成です。  
v4.10.2 Phase 1 から、Google カレンダー予定を Budil 互換 JSON で返す `exportCalendarForBudil` も同じ Hub API に追加しています。

**Budil 本体のボタン接続は Phase 2 です。** 今回は Functions/API 側の土台のみです。

## デプロイ

```bash
cd hub/functions && npm install && cd ..
firebase deploy --only functions,firestore
firebase functions:secrets:set BUDIL_HUB_API_KEY
firebase functions:secrets:set GOOGLE_CALENDAR_SA_JSON
firebase functions:secrets:set GOOGLE_CALENDAR_ID
```

`firebase.json` の `projectId` を Firebase コンソールのプロジェクトに合わせてください。

### Secrets

| Secret / 環境変数 | 用途 |
|---|---|
| `BUDIL_HUB_API_KEY` | Budil / Hub クライアント認証（必須） |
| `GOOGLE_CALENDAR_SA_JSON` | サービスアカウント JSON 文字列（カレンダー取得に必須） |
| `GOOGLE_CALENDAR_ID` | 対象カレンダー ID（省略時 `primary`） |

**Google カレンダー共有:** サービスアカウントのメール（`xxx@xxx.iam.gserviceaccount.com`）を、対象 Google カレンダーの共有設定から「予定の変更権限」以上で追加してください。共有しないと `403 Calendar access denied` になります。

### Git に含めないもの

- `.env`
- サービスアカウント JSON ファイル（`credentials/` 等）
- カレンダー export の実データ JSON
- `output/`

Secrets は Firebase Functions Secret またはデプロイ環境の環境変数のみに置いてください。

## Budil 側（受付）

1. `js/hub-import.js` を読み込み済みであること
2. データ管理 → **BT Hub 受付** に Hub URL（`https://.../api`）と API キーを保存
3. **Hub から受付を取り込む** を実行

## API（要 `Authorization: Bearer <BUDIL_HUB_API_KEY>` または `X-API-Key`）

| action | 説明 |
|--------|------|
| `listIntakes` | 一覧 |
| `listPendingIntakes` | 未取り込み一覧 |
| `exportForBudil` | POST — 受付を Budil 形式でエクスポート |
| `markImported` | POST body `{ ids: [] }` — 取り込み済みに更新 |
| `exportCalendarForBudil` | POST — Google カレンダー予定を Budil v4.10.1 互換 JSON で返す |

### `exportCalendarForBudil`

**メソッド:** POST（推奨）

**Body 例:**

```json
{
  "action": "exportCalendarForBudil",
  "from": "2026-06-30",
  "to": "2026-07-30",
  "timezone": "Asia/Tokyo"
}
```

| 項目 | 省略時 |
|---|---|
| `from` | 今日（JST） |
| `to` | `from` から 30 日後 |
| `timezone` | `Asia/Tokyo` |

最大期間は **90 日**。超過時は `400 Invalid date range`。

**成功レスポンス（200）:** v4.10.1 の worker JSON と同型。`items[].budilImport.dedupeKey` は `google_calendar|{calendarId}|{eventId}` 形式。

**エラー:**

| HTTP | error |
|---:|---|
| 400 | Invalid date range |
| 401 | Unauthorized |
| 403 | Calendar access denied |
| 429 | Rate limit exceeded |
| 503 | Calendar not configured |
| 500 | Internal error |

ログには `action`, `from`, `to`, `itemCount`, `durationMs`, `errorCode` のみ。予定タイトル・顧客名・電話・住所・`items` 配列は出力しません。

## 受付の入力（Auth 管理画面）

`auth/` フォルダの管理画面を Firebase Hosting 等で公開し、メール/パスワードでログインして `receptionIntakes` を登録します。ルールは `auth/firestore.rules` をデプロイしてください。

## ローカル verify

Budil リポジトリ root で:

```bash
node scripts/verify-v4102-calendar-api-foundation.mjs
```

Secrets 未設定でも、日付検証・モック変換・503 応答・Budil 本体未変更を確認できます。
