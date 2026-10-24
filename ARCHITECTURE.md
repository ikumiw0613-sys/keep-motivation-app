# アーキテクチャ — 何がどう動いているか

このアプリの見取り図。**構成・データの持ち方・既知の課題・置き場所**をまとめています。
アプリの機能と動かし方は [README.md](./README.md)、分担とルールは [TEAM.md](./TEAM.md) を参照。

> ゲームのルールの数値（`MOODS` / `STAGES` / `SESSION`）はここには書きません。
> 原典は `src/state/logic.ts` と `src/avatar/stage.ts`、読み物としては
> [README 2章](./README.md#2-ゲームのルール)にあります。
> 図は GitHub 上で Mermaid として自動表示されます。

---

## 1. 全体像

### 誰が使うか（C4: System Context）

```mermaid
flowchart TB
    user["ユーザー（ブラウザ）<br/><i>[Person]</i><br/>毎日の習慣を続けたい人"]
    app["Keep Motivation App<br/><i>[Software System]</i>"]
    sb["Supabase<br/><i>[External System]</i><br/>DB（目標・状態の保存）"]

    user -->|"目標設定・達成の記録・進捗の閲覧"| app
    app -->|"読み書き（HTTPS）"| sb

    classDef person fill:#08427b,stroke:#052e56,color:#ffffff
    classDef focus fill:#1168bd,stroke:#0b4884,color:#ffffff
    classDef external fill:#999999,stroke:#6b6b6b,color:#ffffff

    class user person
    class app focus
    class sb external
```

### 何が動いているか（C4: Container）

```mermaid
flowchart TB
    user["ユーザー（ブラウザ）<br/><i>[Person]</i>"]

    subgraph system["Keep Motivation App"]
        spa["React SPA<br/><i>[React 19 / TypeScript / Vite]</i><br/>画面・タイマー・状態管理。<br/>build すると静的ファイルになる"]
    end

    sb[("Supabase<br/><i>[PostgreSQL / REST]</i><br/>goals / avatars / records")]

    user -->|"ブラウザで開く"| spa
    spa -->|"起動時に読込 / 変更のたびに保存<br/>@supabase/supabase-js"| sb

    classDef person fill:#08427b,stroke:#052e56,color:#ffffff
    classDef container fill:#438dd5,stroke:#2e6295,color:#ffffff
    classDef boundary fill:none,stroke:#444444,stroke-dasharray:5 5,color:#444444

    class user person
    class spa,sb container
    class system boundary
```

- **自前のバックエンドはありません。** `npm run build` すると HTML / JS / CSS になるだけで、
  常駐するサーバープロセスがありません。DB アクセスは Supabase が直接受けます
- `Vite` はビルド時だけの道具なので、実行時のコンテナとしては描いていません
- 3D 描画（three.js）は独立したコンテナではなく、SPA の中の一部品です

---

## 2. `src/` の構造

```text
src/
├── main.tsx                    エントリポイント。App を描画する
├── vite-env.d.ts               Vite の型定義
│
├── app/                        画面の骨組み
│   ├── App.tsx                   どの画面を出すか決める。状態は持たない
│   └── AccountBar.tsx            メールアドレス・ログアウト
│
├── pages/                      画面（1画面 = 1ファイル）
│   ├── LoginPage.tsx             Googleログイン・メールでのログインと新規登録
│   ├── TopPage.tsx               トップ
│   ├── GoalsList.tsx             目標一覧（どの目標を開くか選ぶ）
│   ├── SetupPage.tsx             目標設定（新しい目標を作る。メニューには出さない）
│   ├── MainPage.tsx              ダッシュボード
│   ├── DebugPage.tsx             デバッグ（開発時だけ。`/debugPage`）
│   ├── main-page.css
│   ├── goals-list.css
│   ├── debug-page.css
│   └── onboarding-page.css
│
├── features/
│   └── calendar/               カレンダー機能一式
│       ├── Calendar.tsx          週表示（達成率・連続サイクルの集計もここ）
│       ├── MonthlyCalendar.tsx   月表示（Calendar.tsx から呼ばれる）
│       └── calendar.css
│
├── state/                      状態とルール
│   ├── useApp.ts                 合成層。下の4つを1つのAPIにまとめる
│   ├── useAuth.ts                ログイン状態だけ。DB を知らない
│   ├── useScreen.ts              画面遷移だけ
│   ├── useTimer.ts               5分タイマーだけ
│   ├── useDailyTimer.ts          タイマーの保存・復元・日付変更・通信状態
│   ├── timerStorage.ts           タイマー更新用RPCの呼び出し
│   ├── calendarDate.ts           全端末共通の日本時間の日付境界
│   ├── useGoalState.ts           目標の状態管理と Supabase の読み書き
│   ├── debug.ts                  **消す**操作。DebugPage だけが import する
│   └── logic.ts                  ルールブック。サイクル・連続・気分・日付計算
│
├── lib/
│   └── supabase.ts             DB の接続クライアント
│
├── avatar/                     アバターの3D描画 → src/avatar/README.md に詳細
│   ├── Avatar.tsx / AvatarCanvas.tsx / Chick.tsx
│   ├── look.ts / stage.ts / avatar.css
│   ├── models/                   モデル1体につき1フォルダ（chick / egg / bird）。
│   │                             中身は .blend と .glb と、それを作るスクリプト
│   └── docs/                     Blender の作業メモ
│
└── ui/                         見た目の共通部品
    ├── Logo.tsx / useAccent.ts / styles.css
```

### つながり（C4: Component）

```mermaid
flowchart TB
    subgraph spa["React SPA"]
        direction TB

        subgraph shell["app/（骨組み）"]
            direction LR
            app["App.tsx<br/>ログインゲート＋<br/>どの画面を出すか決める"]
            accountbar["AccountBar.tsx<br/>メールアドレス・ログアウト"]
        end

        subgraph pages["pages/（画面）"]
            direction LR
            login["LoginPage.tsx"]
            top["TopPage.tsx"]
            goalsp["GoalsList.tsx"]
            setup["SetupPage.tsx"]
            main["MainPage.tsx"]
        end

        subgraph parts["表示部品"]
            direction LR
            avatar["avatar/<br/><i>[react-three-fiber]</i><br/>3Dのひよこ。<br/>WebGL不可なら空枠のみ"]
            calendar["features/calendar/<br/>達成履歴のカレンダー"]
            ui["ui/<br/>配色・ロゴ"]
        end

        subgraph core["state/（状態とルール）"]
            direction LR
            useapp["useApp.ts<br/>合成層"]
            useauth["useAuth.ts<br/>ログイン状態"]
            usescreen["useScreen.ts<br/>画面遷移"]
            usetimer["useTimer.ts<br/>5分タイマー"]
            usegoal["useGoalState.ts<br/>目標の状態と永続化"]
            logic["logic.ts<br/>ルールブック"]
        end

        client["lib/supabase.ts<br/>接続クライアント"]
    end

    db[("Supabase<br/>auth.users ＋<br/>goals / avatars / records")]

    app --> accountbar
    app -->|"未ログインなら"| login
    app --> top
    main --> goalsp
    app --> setup
    app --> main

    goalsp -->|"selectGoal(id) で開く目標を替える"| useapp
    setup -->|"start() で目標を確定"| useapp
    main -->|"タイマー操作・達成記録"| useapp
    useapp --> useauth
    useapp --> usescreen
    useapp --> usetimer
    useapp -->|"user.id（uuid）を渡す"| usegoal
    login -->|"signIn / signUp / signInWithGoogle"| useapp
    useauth -->|"signInWithPassword / signUp /<br/>signInWithOAuth / onAuthStateChange"| client
    usetimer -->|"SESSION 秒たったら onComplete()"| usegoal
    usetimer -->|"SESSION を参照"| logic
    usegoal -->|"markSessionDone() / resetGoal()"| logic
    usegoal --> client
    client -->|"select / insert / update（JWT 付き）"| db

    main -->|"ステージ・色相・気分を渡す"| avatar
    top -->|"たまごの姿を描画"| avatar
    main -->|"達成日リストを渡す"| calendar

    login --> ui
    top --> ui
    goalsp --> ui
    setup --> ui
    main --> ui
    accountbar --> ui

    classDef component fill:#85bbf0,stroke:#5d82a8,color:#000000
    classDef dbx fill:#438dd5,stroke:#2e6295,color:#ffffff
    classDef boundary fill:none,stroke:#444444,stroke-dasharray:5 5,color:#444444

    class app,accountbar,login,top,setup,main,useapp,useauth,usescreen,usetimer,usegoal,logic,avatar,calendar,ui,client component
    class db dbx
    class spa,shell,pages,parts,core boundary
```

読み方のポイント:

- **`App.tsx` は画面遷移とログインゲートだけ**を担当し、状態そのものは持ちません。
  `!ready`（セッション確認中）→ `!user`（ログイン画面）→ 読み込みエラー・再試行 → `!loaded`（目標と表示先の確認中）の順
- **`useApp.ts` は唯一の「状態のリモコン」**ですが、中身は4つの hook の合成層です。
  分けている理由は**変化する理由が別々**だから（画面が増える／タイマー仕様が変わる／保存先が変わる）。
  ログイン時の表示先は `screenFlow.ts` がチュートリアル完了と現在の目標の有無で決めます。
  完了済みトップの再表示と、目標のないダッシュボードへの移動も防ぎます
- **`logic.ts` は UI を持たない純粋なルール**（サイクルの数え方、気分の表、日付計算）。
  4つの hook はここの定数・関数を呼ぶだけで、ロジックそのものは持ちません
- **`useAuth.ts` は DB を知らず、`useGoalState.ts` は誰がログインしているかを知りません。**
  間をつなぐのは `useApp.ts` が渡す uuid 1つだけです。Googleログインもメール認証も
  `useAuth.ts` に置き、同じセッションと既存の画面遷移・DB読み込みを使います
- **`avatar/` の見た目は3Dの一種類だけ**です。WebGL が使えない／初期化に失敗した場合は、
  レイアウトを保つための空枠だけが残ります（`Avatar.tsx` の `WebGLBoundary`）
- **`features/calendar/`** は機能ひとまとまりの置き場。機能が増えたら `features/` にフォルダを足します

---

## 3. データの流れ

### 5分やりきったとき

```mermaid
sequenceDiagram
    autonumber
    actor U as ユーザー
    participant M as MainPage.tsx
    participant T as useTimer.ts
    participant G as useGoalState.ts
    participant L as logic.ts
    participant S as Supabase

    U->>M: ▶ を押す
    M->>T: タイマー開始（useApp() 経由）
    T->>T: SESSION 秒たったら達成と判定
    T->>G: onComplete()（markSessionDone）
    G->>S: records に1行 INSERT（goal_id, done_on）
    Note over S: 同じ日の2回目は UNIQUE(goal_id, done_on) が弾く
    G-->>M: done に今日を足して再描画
    M->>L: moodOf(state) / evolutionOf(...)
    L-->>M: 連続サイクル・気分・ステージ（**保存しない**）
    M-->>U: ゲージが伸び、アバターの色が濃くなる
```

（`useApp.ts` はこの呼び出しを配線する合成層で、図では省略しています。
「記録だけつける」ボタンは、タイマーを飛ばして `markSessionDone` を直接呼ぶ同じ流れです。）

### アプリを開いたとき

```mermaid
sequenceDiagram
    autonumber
    participant B as ブラウザ
    participant G as useGoalState.ts
    participant S as Supabase
    participant L as logic.ts / stage.ts
    participant M as MainPage.tsx

    B->>G: ログインを済ませて uuid が渡ってくる
    G->>S: user_id に一致する全 goals ＋ avatars を新しい順に取得
    G->>S: 取得した goal_id の records をまとめて取得
    S-->>G: 目標・アバター・達成日の一覧
    G-->>M: State（保存値はこれだけ）
    M->>L: 記録とサイクル長から計算
    L-->>M: 連続サイクル・気分・ステージ・次の条件
    M-->>B: その場で計算した絵を描く
```

**やつれ判定のような「起動時の後処理」はもうありません。** 保存値が記録だけなので、
いつ開いても同じ計算結果になります（以前は活力を保存していて、読み込みのタイミングでズレました）。

---

## 4. データモデル

接続クライアントは [`src/lib/supabase.ts`](./src/lib/supabase.ts)、読み書きは
[`src/state/useGoalState.ts`](./src/state/useGoalState.ts) に閉じています。
環境変数は [`.env.example`](./.env.example) を参照。

```mermaid
flowchart LR
    U["auth.users<br/><i>Supabase Auth</i>"] -->|立てる| G["goals"]
    G -->|育てる1体| A["avatars"]
    G -->|積んだ日| R["records"]
```

**DDL の原典は [`supabase/schema.sql`](./supabase/schema.sql)、
[`supabase/timer_status.sql`](./supabase/timer_status.sql)、
[`supabase/goal_commands.sql`](./supabase/goal_commands.sql)** です。新しいプロジェクトでは
この順に実行します。既存プロジェクトには未適用の追加SQLを実行します。
以下はその要約。

### `auth.users` — 持ち主（Supabase Auth）

**`public` に自前の `users` テーブルは置いていません。** 持ち主は Supabase Auth が管理する
`auth.users` で、パスワードのハッシュ（`encrypted_password`）も照合も Supabase の中で完結します。
自前で持つと anon key で全員分のハッシュが読めてしまい、`auth.uid()` が無いので RLS も書けません。

表示名は JWT（`user_metadata.name`、無ければ `email`）から取ります。
初回案内の完了は `user_metadata.tutorial_completed` に保存します。
`useAuth.ts` が「はじめる」「スキップ」の操作で [Auth API](https://supabase.com/docs/reference/javascript/auth-updateuser) を呼びます。
テーブルやカラムの追加は不要で、完了フラグは画面遷移にだけ使います。保存に失敗した場合は案内に留まり、再試行できます。
過去または現在の目標がある既存アカウントは、完了フラグがなくても案内済みとして扱います。

**ログイン画面から新規登録できます。** `useAuth.signUp` が Supabase Auth の `signUp` を呼びます。
パスワードは8文字以上・確認入力との一致を画面で検証し、認証サービス側でも検証します。
メール確認が有効な場合は確認メールの案内を表示し、セッションができるまでは未ログインとして扱います。
確認不要の場合は Auth のイベントでログインし、既存の初回案内へ進みます。
Supabase 側では Email と新規登録の有効化が必要です。メールの戻り先は Site URL を設定します。

**Googleログインも利用できます。** `useAuth.signInWithGoogle` が
`signInWithOAuth({ provider: 'google', options: { redirectTo } })` を呼びます。
戻り先は現在のオリジン＋パスとし、クエリとハッシュを持ち越しません。
現在のSPAではSupabase SDK既定のimplicitフローで戻り先URLからセッションを取得します。
`initialize()` のエラーも取得し、認証をキャンセルした場合や戻りで失敗した場合は再試行を案内します。
Client SecretはSupabase側で管理し、フロントエンドには置きません。
Googleプロバイダと戻り先の設定手順は [README](./README.md#アカウントを作成ログインする) にあります。

### `goals` — 目標

| カラム | 型 | 内容 |
| --- | --- | --- |
| `id` | `bigserial` PK | 目標ID |
| `user_id` | `uuid` FK | どのユーザーのものか（`auth.users(id)`、`ON DELETE CASCADE`） |
| `goal` | `text` | 目標の文章 |
| `deadline` | `date` | 期限 |
| `cycle_days` | `int` | サイクル長。「n日に1回」の n |
| `started_at` | `date` | サイクルの起点（目標を作った日） |

**目標は同時に何本あってもかまいません。** 現役を示す列は持ちません。
目標ごとにアバターと記録がぶら下がるので、行が並んでいればそれだけで並行になります。
**どれを開いているかは DB の関心事ではない**ので、画面側（`useGoalState` の `currentId`）が持ち、
目標一覧（`pages/GoalsList.tsx`）で選び替えます。切り替えても記録もアバターも消えません。

> **「現役の目標」を列で持たないのは意図的です。** 印を1本だけ立てる形にすると、
> 「立っている印は1件だけ」を DB が保証できず（部分ユニークインデックスが別途要る）、
> 印を移す UPDATE と新しい目標の INSERT もトランザクションではないので、
> 途中で失敗すると現役が0件にも2件にもなりえます。
> 並行に持てるなら、そもそも現役を1本に決める必要がありません。

### `avatars` — 育てる1体（目標と 1:1）

| カラム | 型 | 内容 |
| --- | --- | --- |
| `goal_id` | `bigint` FK UNIQUE | 1目標に1体 |
| `name` | `text` | アバターの名前 |
| `hue` | `int` | 色相 0〜359。ユーザーが選ぶ |
| `seen_stage` | `int` | **進化の演出をどこまで見せたか。唯一の「計算できない保存値」** |

### `records` — 積んだ日

| カラム | 型 | 内容 |
| --- | --- | --- |
| `goal_id` | `bigint` FK | どの目標の記録か |
| `done_on` | `date` | 達成した日。`UNIQUE (goal_id, done_on)` が同日の重複を弾く |
| `minutes` | `int` | 何分やったか（1日1行なので最初のセッションぶん） |

### 読み書きの対応

| 操作 | DBへの処理 |
| --- | --- |
| 起動 | `goals` を `user_id` で絞り、`id DESC` に `avatars` を join して取得 ＋ 全目標の `records` をまとめて取得 |
| 目標作成 | `goals` に INSERT（`started_at = 今日`）→ 返った `id` で `avatars` に INSERT |
| 1日達成 | `records` に **INSERT 1行**（同日は UNIQUE が弾く） |
| 進化の演出を流し終わった | `avatars.seen_stage` を UPDATE |
| 期限延長 | `goals.deadline` を UPDATE |
| 新しい目標をはじめる | 新しい `goals` ＋ `avatars` を INSERT するだけ。**前の目標には触らない**（記録もアバターも残り、目標一覧に並ぶ） |
| 目標を切り替える | **なし**（どれを開いているかは DB に持たない） |
| 画面を描くとき | **なし**（`records` と `cycle_days` / `started_at` から毎回その場で計算） |

**本番の画面から行が減ることはありません。** 記録も目標も増えるだけです。
DELETE はデバッグ画面にしかありません。

### デバッグ画面（開発時だけ）

`npm run dev` 中に `/debugPage` を開くと出ます。`import.meta.env.DEV` で
遅延読み込みしているので（`app/App.tsx`）、**本番のバンドルには入りません**。

デバッグが操作するのは**2つだけ**です。気分もステージも `cycleIndex()` でサイクル番号に
直してからしか判定していないので（`state/logic.ts` / `avatar/stage.ts`）、
**日付と記録さえ動かせれば、気分7段もステージ4段も全部再現できます。**

| 軸 | 何を動かすか | DB |
| --- | --- | --- |
| 日付 | `dayOffset`（±1日 / ±1サイクル / 日付を直接指定 / 今日に戻す） | 触らない |
| 記録 | `records` の1行＝1日を、つける / 消す | 書く |

**通常の目標一覧は `GoalsList.tsx` にあります。** デバッグ画面では、
一覧から目標や記録を削除して、再読み込み後の状態を確認できます。

`dayOffset` は**負の値も入ります**。行き過ぎた日送りを戻せないと、やり直しがききません。
日付を戻しても計算は壊れません（`lastDoneCycle()` が今より先のサイクルを数えないため）。

DELETE 系は `state/debug.ts` に隔離してあります。`useGoalState` に置くと
「押せてしまう導線」が本番の画面に生まれるためです。

| 操作 | DBへの処理 |
| --- | --- |
| 1日ぶんの記録を消す | `records` から `(goal_id, done_on)` で DELETE |
| 記録を全部消す | `records` から `goal_id` で DELETE（目標とアバターは残る＝たまごに戻る） |
| 目標を消す | `records` → `avatars` → `goals` の順に DELETE |
| 全部の目標を消す | 過去のぶんも含めて、上を全件ぶん繰り返す |
| 演出の見せ済みを戻す | `avatars.seen_stage` を UPDATE（**下げる**） |

- **子から先に消します。** `records.goal_id` と `avatars.goal_id` に `ON DELETE CASCADE` が
  無いので（`supabase/schema.sql`）、親から消すと外部キー違反で落ちます
- 消したあとは必ず DB から読み直します（`useGoalState` の `reload`）。画面の値を手で
  合わせると「消えたつもりで消えていない」を見逃します
- **進化の演出は `ステージ > avatars.seen_stage` の間しか流れません**（`pages/MainPage.tsx`）。
  流し終わると `seen_stage` が上がるので、もう一度見るには戻すしかありません

### RLS（行レベルセキュリティ）

anon key はブラウザに配られるので、**アクセス範囲はDBの権限とRLSで制限**します。
4テーブルとも有効にしてあり、ポリシーの形は2つしかありません。

| テーブル | ポリシー | 条件 |
| --- | --- | --- |
| `goals` | `goals_own` | `auth.uid() = user_id` |
| `avatars` | `avatars_own` | 親の `goals` が自分のものか（`EXISTS`） |
| `records` | `records_own` | 同上 |
| `timer_status` | `timer_status_own` | 同上。権限はSELECT / INSERT / UPDATEのみ |

`FOR ALL` なので SELECT / INSERT / UPDATE / DELETE の全部に効きます。`USING` が既にある行、
`WITH CHECK` が書こうとしている行の条件で、他人の `goal_id` を書き込まれないよう両方に同じ条件を置いています。

JWT は `supabase.from(...)` に自動で付くので、アプリ側に `Authorization` を書く場所はありません。
`useGoalState.ts` に残っている `.eq('user_id', ...)` はもう防御ではなく、自分の目標だけを引く絞り込みです。

### 当日のタイマーを保存・復元する

`timer_status` は `(goal_id, timer_on)` を主キーにし、確定した `accumulated_ms` と
計測中の起点 `running_since`（停止中はNULL）を保存します。達成の有無は従来どおり
`records` で管理し、タイマーだけの操作では達成を保存しません。

- `useTimer` は時刻差による表示だけ、`useDailyTimer` は保存・復元と通信状態、
  `timerStorage` は `timer_status_command` RPCの呼び出しを担当します。
- 開始・停止・再開をDB内で処理し、`version` が一致した場合だけ更新します。
  同じ目標への操作をロックして直列化し、`updated_at` と開始時刻はDBが設定します。
- 毎秒は画面だけ更新します。再表示時と、表示中の30秒ごとにDBを読み直し、
  他の端末での操作を反映します。「記録する」の直前にも読み直します。
- 計測中にページを閉じても起点は残るため、同じ日の閉じていた時間も加算します。
  一時停止中は加算せず、目標切り替え・新規作成画面への移動前には停止を保存します。
- 日付の基準は全端末で日本時間です。午前0時で前日を区切り、新しい日は0秒・停止中に
  戻します。閉じたまま日をまたいだ行は、次の読み込みで前日の午前0時までを確定します。
- 読み込み・保存結果を確認できない間は操作を止め、再試行でDBの状態を復元します。
  通信失敗を0秒として扱ったり、古い状態を無条件で上書きしたりしません。
- デバッグ画面の5秒タイマーと日送りはローカルで動き、本番のタイマー状態を更新しません。
  「記録する」は従来どおり達成記録に保存します。

SQLの検証は [`supabase/tests/timer_status.sql`](./supabase/tests/timer_status.sql) を実行します。
テスト用の目標・タイマーは最後にROLLBACKし、既存の目標・記録は更新しません。

### DBに保存していないもの

**連続サイクル数・気分・ステージ・最長記録は保存しません。** 記録から計算できるからです。

| 項目 | 用途 | 再読み込み時 |
| --- | --- | --- |
| `dayOffset` | デバッグ用の日送り | `0` に戻る |
| `loaded` / `hasStarted` | 読み込み・開始状況 | hook 内で再設定 |
| 画面の状態 | 現在の画面 | アカウントと目標から表示先を決める |
| タイマーの表示秒数 | 保存した累積時間と開始時刻から計算 | DBから復元して再計算 |

---

## 5. 既知の制約・課題

**データまわり**

- パスワード再発行の導線はありません。
- **ペース（`cycle_days`）はあとから変えられません。** 変えると過去の記録の所属サイクルが
  変わるため、「過去を切り直さずに変える」には変更履歴のテーブルが要ります。いまは
  「変えたいなら新しい目標＝たまごから」。**1日に1回にした人の逃げ道が作り直しだけ**なのが
  未解決の宿題です
- 目標の作成・修正は `goal_commands.sql` のRPCでアバターと同時に保存します。
  本人のRLSを適用する `SECURITY INVOKER` で実行し、途中失敗は全体を取り消します。
  作成の `request_id` はアカウント内で一意なので、応答が失われた後の同じ操作の再送も重複しません。
  画面は保存中の送信を止め、失敗時は入力を残して再試行を案内します。
  `goals` だけ入ると、アバターの無い目標が目標一覧に並びます
- **目標は増える一方で、古いものを片付ける導線がありません。** 作るたびに `goals` が
  1行ずつ積まれ、**全部が目標一覧に並び続けます**。並行に持てるようになったぶん、
  終わった目標を畳む導線（並べ替え・非表示）が要るのはこれからの宿題です
- **どの目標を開いているかは端末ごとです。** `localStorage` に置いているので、
  別の端末やプライベートウィンドウで開くと、いちばん新しい目標から始まります

**コードまわり**

- **ルールと状態管理をテストします**（`npm test`）。サイクル計算・進化条件に加え、
  認証・完了保存・ログイン後の画面遷移・目標読み込み・アカウント切り替えを検証します。
  hook のテストは jsdom 上で Supabase をモックに置き換え、実DBには接続しません。
  3Dを含む画面の描画と実DBとの連携は別途確認が必要です
- **lint / format 設定がありません。** いまスタイルが揃っているのは「守られている」のではなく
  「たまたま揃っている」状態です

> 着手の担当と順番は [TEAM 3章「足回り」](./TEAM.md#3-いまのタスク)。ここは**何が問題か**だけを書き、
> **誰がいつやるか**は TEAM.md に置いています。

---

## 6. どこに置くか（デプロイ）

企画時点の想定は「React + Supabase + Google Cloud Run」でしたが、
**Cloud Run はやめて静的ホスティングにする**方針です。

```text
ブラウザ ──▶ 静的ホスティング（HTML/JS/CSS を配るだけ）
   │
   └──────▶ Supabase（DB / 認証 / API）
```

### なぜ Cloud Run ではないか

Cloud Run は**常駐するサーバープロセス**を動かす場所です。このアプリのフロントは
`build` すればただの静的ファイルで、動かすものがありません。DB も認証も Supabase が
受けるので、間に立つサーバーが不要です。

| | 静的ホスティング | Cloud Run |
| --- | --- | --- |
| 必要な作業 | `build` して `deploy` の2コマンド | Dockerfile、Artifact Registry、IAM など |
| 費用 | 無料枠で足りる | 従量課金（要クレカ登録） |
| 速度 | CDN から即配信 | コールドスタートあり |
| このアプリでの利点 | — | **無し** |

**Cloud Run が要るのは**、Supabase では書けない処理（外部APIの鍵を隠して叩く、重いバッチ、
定期通知）が出てきた時です。その多くは Supabase Edge Functions で足ります。**今は入れない。**

### 公開の手順（着手時）

- [ ] RLS（行レベルセキュリティ）を有効にする ← **他人のデータが読めてしまう事故を防ぐ。必須**
- [ ] `npm i -g firebase-tools` → `firebase login` → `firebase init hosting`
      （公開ディレクトリは `dist`、SPA 設定は「Yes」）
- [ ] `npm run build && firebase deploy` で公開できることを確認
- [ ] GitHub Actions で main マージ時に自動デプロイ（余裕が出てから）

> anon key はブラウザに露出する前提の鍵なので、漏れても RLS があれば守られます。
> **逆に言うと RLS が無いと全データが読み書きされます**（5章の1つ目の課題）。
> 1つ目のチェックを飛ばさないこと。

Firebase Hosting を選ぶ理由は、無料枠・CDN・HTTPS 自動・カスタムドメインが揃っていて
Google アカウントで完結するためです。Vercel / Cloudflare Pages / GitHub Pages でも問題なく、
**乗り換えは後からでも数十分でできます。**
