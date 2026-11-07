# Budil×GPT 2026-11-07 リリース判定（本番未反映）

## GOAL
「20R」などの実施回数ではなく、BCサービスの日常業務を本人が安心して一連操作できること。
現状は開発・隔離データでの受入候補。**本番完成と判定しない。**

## CURRENT EVIDENCE
- 統合PR: https://github.com/teruya1229/budil/pull/8
- 2026-11-07 更新済み回帰実測: `fd6de97d76be13c3444a88d3eb24a7792e576031` で請求書確定画面の重複IDを修正。6ワークフローSUCCESS（統合CI https://github.com/teruya1229/budil/actions/runs/42359736246 でLinux/Windows Chrome実DOM検証・backend PASS）。
- CI: https://github.com/teruya1229/budil/actions/runs/42349549802
  - business-and-backend / chrome-linux / chrome-windows が全て SUCCESS。
  - 古い20指示、PDF、ローカル版検査、クラウド復元、GPT基盤検査も SUCCESS。
  - 元の実務19例のうち**16/19が架空データ・Chrome操作のE2Eで検証済み**。残る #5, #6, #7 はGoogleの実予定参照・書込・変更。
- 請求書: 金額と税区分の確認→作業完了/売上承認→請求下書き保存→本人による請求確定(`draft`→`issued`)→PDF確認と顧客送付は別操作→独立したCSV銀行入金照合。請求確定は顧客への送信も自動入金済み変更もしない。作業売上に紐づく請求書の銀行CSV自動更新は拒否。
- Google: `google_calendar` integrationと`schedule_blocks_list` read bindingは**テスト専用A/Bの2テナントだけに存在**。実業務tenant `mi-bcs` はowner所属1件、ACTIVE Google integration/READ bindingどちらも0件（2026-11-07 Supabase本番READ実測）。フロントからの読取処理は**開発版のみ**追加。JWT以外の秘密情報を持たず、Google予定の開始/終了時刻のみクライアントへ返し、顧客情報/予定タイトルは外部GPTへ送らない。
- Cloud: `budil-backups` に本番v3あり。PR内にはowner限定の最新バックアップ取得・SHA確認・手動復元・ロールバックを実装。未デプロイ・実JWTで未検証。
- GPT: `budil-gpt-interpret` v1が本番にある。匿名集計の新モードはバックエンド未デプロイ・課金フラグOFF。CIは検証用のモック通信。

## MATERIAL GAPS
1. **Google実読取**: 同じビジネスアカウント/カレンダーの接続先と認可を読み取りで再確認し、隔離テスト予定で実JWTによる日時照合を検品。これまではサーバーをモックで置いたChrome E2E。
2. **Google実書込・変更**: 現行 `tenant_operation_bindings` は `schedule_blocks_list/read` しかない。別に既存 `make-proxy` の `confirmed_reception_forward`→Make webhook経路が存在するが、Budil AI予約との入力・受入先・権限・重複抑制・キャンセル/変更契約は未検証。勝手に接続・送信しない。
3. **GPT自由会話**: 新匿名集計分類は限定文法・default-off。自然な複合依頼の本番GPT通信、料金上限、失敗/遅延処理を未受入。
4. **端末間同期**: 手動バックアップ復元はテスト済みだが自動同期ではない。Edge公開と実ログインでのPC→スマホ復元検証が必要。
5. **本番公開/スマホ実機**: PR #8は未マージ。本番GitHub Pages・iPhone・Androidの実機保存/復元/写真/PDF/CTAは未検証。
6. **CSV金融処理**: 銀行明細の真正性は検証できず、分割入金と売上連動を伴う請求の自動消込は対象外。本人が最終確認。

## SAFETY AND OWNER GATES
- 現状 `main`、既存顧客データ、実Google予定、実銀行、Supabase本番機能、料金・APIキーには一切変更なし。
- 本番変更を始めるときは**対象・接続アカウント・変更先・変更内容・課金上限**を本人へ提示し、その変更ごとの明示承認を受ける。
- 推奨安全順序:
  1. PR #8のコードレビューと検証ブランチの作業差分保護（無許可マージ/公開なし）。
  2. Google読取用の実テストアカウント/カレンダーを識別し、権限確認。
  3. Make登録の既存経路を照合し、架空の1件で登録→再読取→変更/削除を許可後に受入。
  4. Supabase Edgeの差分審査とデプロイ承認（クラウド復元・GPT匿名集計）。利用料金と利用回数の制御を先に確認。
  5. 本番公開承認後、GitHub Pagesと本人PC/iPhone/Androidで全操作検品。
- 実測と推測・CI PASSとユーザー実機PASSは必ず分ける。

## ACCEPTANCE
「見積→予約→作業完了→請求書発行→入金確認→複数端末復元」を本人が実データまたはテスト用アカウントの実接続で操作でき、外部送信や費用が意図どおりであると確認できたとき初めて完成を判定する。

## 2026-11-07 OWNER CALENDAR DECISION / REAL CONNECTOR EVIDENCE (NOT DEPLOYED)
- 本人は、ChatGPT Google Calendar連携でowner権限が確認できた**個人のprimaryカレンダー**を、Budilの業務予定先にすると「はい」と明示選択した。アカウント識別子は公開Gitリポジトリに書かず、既存の会社OSにverifiedで記録（公開資料では非表示）。家族カレンダー/祝日カレンダー、テスト用tenant A/Bを業務予定先に採用しない。
- ChatGPTのGoogle Calendarコネクタで2026-11-07～10を読取（有効な予定3件）。**これはBudilのJWT→Edge→Google read E2Eの証明ではない。**
- Supabase本番の既存 `make-proxy` v24 の `handle_schedule_blocks_list.ts` と `google_calendar_provider.ts` には、`primary` および従来のBC固定個人カレンダー識別子を明示拒否する `forbidden_calendar_id` ガードが存在。**DBにmi-bcs bindingを追加するだけでは読めない**。Google service-account token交換は `calendar.events.readonly` scopeで、これ自体はGoogle予定の登録・変更・削除を実行できない。
- この拒否の背景は、過去の複数テナント向け実装で固定BCカレンダーへfallbackして他社の接続先を混同した問題に対する境界対策。多テナント共用側の禁止を一律解除することはしない。
- 実装案（owner許可待ち）：①本人の主カレンダーと `mi-bcs` owner所属の紐付けを独立検証し、他tenantには適用されない**サーバー側限定スコープ**でアクセス許可を設計・テストする。②既存Google認証方式（OAuthまたは共有許可）の本人・アクセス範囲を検証し、本番秘密値は出力しない。③`schedule_blocks_list` の実JWT経路で開始/終了のみ返り、他tenant/非owner/任意calendarIdの強制変更が拒否されることを実測する。④本人に変更先・権限・影響を説明したうえで、架空予定1件だけをGoogleで作成→再読取→変更→削除し、重複防止/タイムゾーン/実機操作を検品する。
- **未承認・未実施**：既存 `forbidden_calendar_id` ガード変更、Google ACL共有、Supabase本番のintegration/binding追加、Makeへの予約送信、実Google予定への書込、GPT有料通信、PR #8 mainマージ・公開。
