# 公開前の確認

## 実装済み

- 達成記録はDB保存成功後に表示する。失敗時は「記録する」から再試行できる。
- 目標作成・修正はアバターと同じトランザクションで保存する。
- 保存中の連打を防ぎ、同じ作成操作の再送には同じIDを使う。
- 確認メールの再送、パスワード再設定メール、新しいパスワードの入力画面。
- アプリ名を画面とブラウザタブで「がんばり畑」に統一。
- 利用案内・プライバシーページと、問い合わせ・削除依頼先 `ikumi.w0613@gmail.com` への導線。

## 公開先で行う確認

公開先はVercelです。設定値と操作手順は [VERCEL_DEPLOY.md](./VERCEL_DEPLOY.md) を参照してください。

- [ ] 本番ビルドの `VITE_SUPABASE_URL` と公開用キーが意図したプロジェクトを指す。
- [ ] 新規DBには `schema.sql` → `timer_status.sql` → `goal_commands.sql` を適用する。
- [ ] Supabase Auth の Site URL を公開URLにし、Redirect URLs に公開アプリのURLと
      `?flow=recovery` を付けた再設定メールの戻り先を登録する。
- [ ] カスタムSMTPを設定し、チーム外の自分のメールアドレスで登録・確認・再送・再設定を確認する。
- [ ] Googleログインを公開URLで完了し、既存アカウントのデータが引き継がれることを確認する。
- [ ] 異なる2アカウントで、相手の目標・記録・タイマーを読み書きできないことを確認する。
- [ ] Supabase Authの漏えい済みパスワード保護を有効化する（利用プランでの提供状況も確認）。
- [ ] スマートフォンで登録、目標作成、5分の計測、記録、再読み込みを確認する。

## 運営情報が決まったら用意するもの

- [ ] 公開URL、運営者名。
- [x] 保存する情報・利用目的・外部サービス・自動削除がないこと・依頼方法の案内。
      公開ページは `public/privacy.html`。連絡先は本人指定のメールアドレス。
- [ ] データ削除依頼に対する運営側の対応手順、バックアップ内のデータの取り扱い。
      現状は利用者が自分でアカウントを削除する画面は無い。
- [ ] 障害時の連絡先、バックアップ・復元の運用。

未実装の自動削除機能や未確定の対応期限は案内していない。

## 検証

`npm test` と `npm run build` を実行する。
DBの検証は `supabase/tests/goal_commands.sql` と `supabase/tests/timer_status.sql` を実行する。
SQLテストは最後にROLLBACKし、既存の目標・記録を変更しない。

参考: [SMTP](https://supabase.com/docs/guides/auth/auth-smtp)、
[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)、
[パスワード保護](https://supabase.com/docs/guides/auth/password-security)。
