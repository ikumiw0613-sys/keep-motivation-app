# Vercelで公開する

## 1. GitHubへ変更を反映する

このリポジトリの変更をコミット・pushし、Vercelの「Add New → Project」で対象リポジトリをImportします。
公開対象のブランチをProduction Branchとして選んでください。

設定はリポジトリ直下の `vercel.json` と `package.json` にあります。

| 項目 | 値 |
| --- | --- |
| Root Directory | リポジトリ直下（変更不要） |
| Framework Preset | Vite |
| Node.js | 22.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

ロックファイルがnpm・pnpmの両方あるため、Vercelでは `npm ci` を明示して `package-lock.json` を使います。
SPAのURLを直接開いたときも `index.html` を返す設定を追加しています。
`privacy.html` や `assets/` 内の既存ファイルはそのまま配信されます。

## 2. 環境変数を設定してDeployする

VercelのEnvironment Variablesへ、手元の `.env` と同じプロジェクトの値を設定してください。

| 名前 | 値 |
| --- | --- |
| `VITE_SUPABASE_URL` | SupabaseのProject URL |
| `VITE_SUPABASE_ANON_KEY` | Supabaseの公開用キー（anon / publishable key） |

まずProductionを対象に設定します。Previewでもログインを確認する場合は、Previewにも設定してください。
`VITE_` の値はブラウザへ配信されるので、`service_role` やsecret keyは指定しません。
環境変数を変更した場合はRedeployし、ビルドに反映させてください。

既存のSupabaseプロジェクトを使う場合、DBを作り直す必要はありません。
今回追加した `goal_commands.sql` は現在の接続先へ適用済みです。

## 3. 発行された公開URLをSupabaseへ登録する

例として、公開URLが `https://your-app.vercel.app` になった場合です。
SupabaseのAuthentication → URL Configurationで次を設定します。

| 項目 | 値 |
| --- | --- |
| Site URL | `https://your-app.vercel.app/` |
| Redirect URLs | `https://your-app.vercel.app/` |
| Redirect URLs（追加） | `https://your-app.vercel.app/?flow=recovery` |

実際に発行されたURLに置き換えてください。独自ドメインを使う場合は、そのURLを登録します。
ローカル開発を続ける場合は、既存の `http://localhost:5173/` も残します。
Previewは本番とは別のURLなので、認証を確認するPreview URLも個別に許可します。

GoogleログインでSupabaseに設定するGoogle Client Secretは、Vercelの環境変数には入れません。
Google側の承認済みリダイレクトURIは、引き続きSupabaseの
`https://<project-ref>.supabase.co/auth/v1/callback` です。
Google側の承認済みJavaScript生成元には公開アプリのオリジンを登録してください。

## 4. 公開URLで確認する

- [ ] ページを開き、Googleログインを最後まで完了できる。
- [ ] メールで登録・確認・確認メール再送・パスワード再設定ができる。
      チーム外の宛先にメールを送るためのカスタムSMTP設定も必要です。
- [ ] 目標作成・5分計測・達成記録を行い、再読み込みしても記録が残る。
- [ ] `/privacy.html` に連絡先と利用案内が表示される。
- [ ] スマートフォンでも表示と操作を確認する。

残る運用上の確認は [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) を参照してください。

公式資料：[Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)、
[Node.jsのバージョン](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)、
[Supabaseの戻り先URL](https://supabase.com/docs/guides/auth/redirect-urls)。
