# ai-analyze（AI評価の中継関数）セットアップ手順

家計簿アプリの「AI評価」タブを本物のClaudeで動かすための中継役。
APIキーをブラウザに出さないため、Supabase Edge Function に置いている。

## 必要なもの
- Supabase プロジェクト（このアプリのログインで既に使用中のもの）
- Anthropic の APIキー（https://console.anthropic.com で取得。利用には課金設定が必要。
  1回の家計分析はおよそ数円以下）

## セットアップ（Supabaseダッシュボードだけで完結。CLI不要）

### 1. Edge Function を作る
1. Supabase ダッシュボード（https://supabase.com/dashboard）にログイン
2. 左メニュー「Edge Functions」を開く
3. 「Deploy a new function」→ 関数名に `ai-analyze` と入力
4. エディタに `index.ts` の中身を貼り付け
5. 「Deploy」を押す
6. 「Verify JWT」は **ON のまま**（ログイン中ユーザーだけが使える状態にするため）

### 2. APIキーを Secret に登録
1. Edge Functions の「Secrets（または Manage secrets）」を開く
2. 「Add new secret」
3. 名前: `ANTHROPIC_API_KEY`
4. 値: Anthropic で取得した APIキー（`sk-ant-...`）
5. 保存

### 3. 動作確認
- アプリにログイン → 「AI評価」タブ →「分析する」ボタン
- 数秒後に家計コメントが出れば成功

## 使用モデルを変えたいとき
`index.ts` の `const MODEL = "claude-opus-4-8";` を書き換えてDeployし直す。
- もっと安く: `claude-haiku-4-5`
- バランス: `claude-sonnet-4-6`

## うまくいかないとき
- 「ANTHROPIC_API_KEY が未設定」→ 手順2を確認
- 401/認証エラー → アプリに再ログイン（JWT検証ONのため）
- それ以外 → ブラウザの開発者ツール Console のエラー文を確認
