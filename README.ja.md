<a name="readme-top"></a>

<p align="center">
  <a href="https://feed-to-go.onrender.com">
  <img src="./static/logo/feed-to-go-logo.png" alt="Feed-To-Go" width="280" />
  </a>
</p>

<div align="center">

**Feed To Go** は、ショート動画で人と人をつなぎます。

途切れることのないフィードで、視聴し、共有し、つながりましょう。

次のお気に入りの瞬間は、スクロールの先に。

[英語](./README.md) · [中国語](./README.zh-CN.md) · **日本語** · [公式サイト](https://feed-to-go.onrender.com) · [フィードバック](https://github.com/yydrowz3/feed-to-go/issues)

</div>

<p align="center">
  <a href="https://feed-to-go.onrender.com">
  <img src="./static/banner/feed-to-go.png" alt="Feed-To-Go" />
  </a>
</p>

<p align="center">

**Go** バックエンドと **React** フロントエンドを採用したショート動画共有アプリです。動画フィードの閲覧、再開可能な分割アップロードによる動画投稿に加え、
いいね、コメント、フォロー、プライベートメッセージで交流できます。

</p>

<p align="center">
  <a href="https://feed-to-go.onrender.com">
  <img alt="live-demo-badge" src="https://img.shields.io/badge/Live Demo-Render-000000?logo=render" />
  </a>
</p>

<p align="center">
<img alt="Golang" src="https://img.shields.io/badge/-Go-00ADD8?style=flat-square&logo=go&logoColor=white" />
<img alt="React" src="https://img.shields.io/badge/-React-45b8d8?style=flat-square&logo=react&logoColor=white" />
<img alt="Gin" src="https://img.shields.io/badge/-Gin-008ECF?style=flat-square&logo=gin&logoColor=white" />
<img alt="PostgreSQL" src="https://img.shields.io/badge/-PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
<img alt="Redis" src="https://img.shields.io/badge/-Redis-FF4438?style=flat-square&logo=redis&logoColor=white" />
<img alt="RabbitMQ" src="https://img.shields.io/badge/-RabbitMQ-FF6600?style=flat-square&logo=rabbitmq&logoColor=white" />
<img alt="TypeScript" src="https://img.shields.io/badge/-TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white" />
<img alt="TailwindCSS" src="https://img.shields.io/badge/-Tailwind CSS-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white" />
<img alt="Node.js" src="https://img.shields.io/badge/-Node.js-5fa04e?style=flat-square&logo=node.js&logoColor=white" />
</p>

<p align="center">
<img alt="Upstash" src="https://img.shields.io/badge/-Upstash-00E9A3?style=flat-square&logo=upstsh&logoColor=white" />
<img alt="DaisyUI" src="https://img.shields.io/badge/-DaisyUI-FFC63A?style=flat-square&logo=daisyui&logoColor=white" />
<img alt="Vite" src="https://img.shields.io/badge/-Vite-646CFF?style=flat-square&logo=Vite&logoColor=white" />
<img alt="Neon" src="https://img.shields.io/badge/-Neon-34D59A?style=flat-square&logo=neon&logoColor=white" />
<img alt="Oxc" src="https://img.shields.io/badge/-Oxc-00F7F1?style=flat-square&logo=oxc&logoColor=white" />
</p>

<p align="center">
<sup>さあ、「Feed」と一緒に出かけよう！</sup>
</p>

## ✨ 機能

- 新着、フォロー中、いいね数順のフィードと、専用の人気ランキング。
- 動画の再生、シーク、キーボード操作、公開動画の詳細ページ。
- アカウント登録、ログイン、トークン更新、パスワード変更、プロフィール。
- チャンクのチェックサム検証、アップロード再開、カバー画像に対応した MP4 動画投稿。
- いいね、コメント、フォロー一覧、プライベートな会話。
- 英語、簡体字中国語、日本語のインターフェースと、言語設定の保存。
- アカウントのセッションとは独立して設定を保存するライトテーマとダークテーマ。
- ソーシャル操作、人気度、タイムライン、通知を処理するバックグラウンドコンシューマー。

## 🛠️ 技術スタック

| レイヤー                 | 技術                                                    |
| ------------------------ | ------------------------------------------------------- |
| バックエンド             | Go, Gin, GORM, PostgreSQL, JWT, Zap                     |
| バックグラウンド処理     | RabbitMQ, Redis, トランザクショナルアウトボックス       |
| フロントエンド           | React, TypeScript, Vite, TanStack Router / Query / Form |
| 状態管理と検証           | Zustand, Zod                                            |
| インターフェース         | Tailwind CSS, daisyUI, Lucide, Sonner                   |
| ローカライズとアップロード | i18next, react-i18next, hash-wasm                     |

## 📁 リポジトリ構成

```text
feed-to-go/
  apps/
    api/
      cmd/server/    # API と関連バックグラウンドタスクのエントリーポイント
      cmd/worker/    # 業務コンシューマーのエントリーポイント
      configs/       # プロファイリング設定
      internal/      # アプリケーション、HTTP API、サービス、ワーカー
      pkg/           # バックエンドのサポートパッケージ
    web/
      src/           # フロントエンドのルート、機能、コンポーネント、翻訳
      tests/         # Node ベースのフロントエンドテスト
      scripts/       # ブラウザー回帰テストハーネス
  shared/            # 共通エラーコード定義
  scripts/           # コード生成と統合用ユーティリティ
  docs/              # 設定、規約、実装記録
```

## ⌨️ 開発

### 必要な環境

- [go.mod](apps/api/go.mod) で指定されている Go **1.27.2**、または互換性のある新しいツールチェーン。
- [package.json](apps/web/package.json) で指定されている Node.js **24+** と pnpm **12+**。
- アプリケーション全体の実行には PostgreSQL、Redis、RabbitMQ が必要です。
- テスト用 MP4 ファイルのコーデックに対応したブラウザー。

依存関係のバージョンはマニフェストとロックファイルを正とします。アプリケーションの起動前に、
必要な外部サービスをインストールして設定してください。以下のコマンドでは、
これらのサービスは用意されません。

### `A` リポジトリのクローン

```shell
git clone https://github.com/yydrowz3/feed-to-go.git
cd feed-to-go
```

### `B` バックエンドの設定と起動

```shell
cd apps/api
go mod download
```

開発専用のデータベースを作成し、`apps/api/.env` を設定します。
以下の例は各サービスがローカルで稼働していることを前提としています。データベースユーザー、
パスワード、データベース名、ブローカー URI、JWT シークレットを自分の値に置き換えてください。

```dotenv
APP_ENV=dev
PORT=8095
WEB_URL=http://localhost:5173

DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=feed_to_go
DB_PASSWORD=replace-with-your-local-password
DB_NAME=feed_to_go
DB_SSLMODE=disable

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_TLS=false

AMQP_URL=amqp://guest:guest@127.0.0.1:5672/
JWT_SECRET=replace-with-a-long-random-secret
```

これらはローカル開発用の設定です。テストには専用の Redis インスタンスと
RabbitMQ の vhost を使用してください。利用可能な全フィールドは
[apps/api/.env.example](apps/api/.env.example) を参照してください。`AMQP_URL` は個別の
ブローカー設定フィールドより優先されます。アプリケーションは `DATABASE_URL` や `REDIS_URL` を読み取りません。
プロセスの環境変数は `.env` より優先されます。

### `C` 統合アプリケーションの起動：

```
go run ./cmd/app
```

このエントリーポイントは API と全コンシューマーを同じプロセスで起動するため、上記 3 つの
外部サービスがすべて必要です。起動時にデータベーススキーマのマイグレーションが実行されるため、
開発用データベースを使用してください。設定は `apps/api` を基準に読み込まれます。

<details>

<summary>ヘルスチェック</summary>

別のターミナルで HTTP の応答と統合アプリケーションの準備状態を確認します。

```powershell
Invoke-RestMethod http://localhost:8095/healthz
Invoke-RestMethod http://localhost:8095/readyz
```

別々のプロセスで実行する場合は、統合エントリーポイントの代わりに、別々のターミナルで `go run ./cmd/server` と `go run ./cmd/worker` を
実行してください。依存関係とライフサイクルの
詳細は[バックエンドのデプロイ](docs/backend-render.md)に記載しています。

</details>

### `D` フロントエンドの設定と起動

リポジトリのルートで別のターミナルを開きます。

```shell
cd apps/web
pnpm install
```

`apps/web/.env` を以下のように設定します。

```dotenv
VITE_API_BASE=http://localhost:8095
```

実行します。

```shell
pnpm dev
```

**http://localhost:5173** を開きます。アカウントを登録して、テスト動画を投稿してください。

### `E` オリジンとメディアへのアクセスの確認

フロントエンドは API とメディアの URL に直接アクセスします。`VITE_API_BASE` は
HTTP(S) の絶対 URL である必要があります。`/api` は自動では付加されません。この値は公開される
ビルド時の設定なので、シークレットを含めないでください。

`APP_ENV=dev` では任意の CORS オリジンが許可されます。それ以外の環境では、`WEB_URL` に
フロントエンドの正確なオリジンを設定してください。スキームとポートを含め、パスや末尾の
スラッシュは含めません。`localhost` と `127.0.0.1` は異なるオリジンです。バックエンドの設定を
変更したら再起動してください。[CORS 設定](docs/backend-cors.md)を参照してください。

アップロードされたファイルは `apps/api/.run/uploads` に保存され、
`/static` 経由で配信されます。API プロセスには書き込み権限が必要です。また、バックエンドが返す
メディアの URL にブラウザーからアクセスできる必要があります。

## 🧪 検証

`apps/api` でバックエンドのチェックを実行します。

```shell
go test ./...
go vet ./...
go build ./cmd/app ./cmd/server ./cmd/worker
```

`apps/web` でフロントエンドのチェックを実行します。

```shell
pnpm test
pnpm lint
pnpm fmt:check
pnpm errors:check
pnpm build
```

フロントエンドのテストはフィクスチャを使用するため、実際のバックエンドは不要です。ビルドには
TypeScript の型チェックが含まれます。API エラーコードを変更する場合は、
`shared/error-codes.json` を編集し、`apps/web` で `pnpm errors:generate` を実行して、
生成された 2 つのファイルを両方コミットしてください。[エラーコードの契約](docs/api-error-codes.md)を参照してください。

フロントエンドのビルド後、必要に応じてブラウザー回帰テストを実行できます。

```shell
pnpm test:browser --media C:/path/to/test.mp4
```

出力された `http://127.0.0.1:5186/__checks` の URL を開き、**Run checks** をクリックします。
結果はページ上と `/__report` で確認できます。ハーネスを停止するには
Ctrl+C を押します。ポートは `BROWSER_TEST_PORT` で変更できます。`--media` を省略すると、
動画を正常にデコードできるかの検証をスキップします。ハーネスは分離された API フィクスチャを使用するため、
実際のサービスを使う統合チェックには別のテスト環境が必要です。

- **バックエンド：** `apps/api` で `go build -o app ./cmd/app` を実行し、生成された
  実行ファイルに必要な環境変数と設定ファイルへのアクセスを
  用意して起動します。統合エントリーポイントは準備状態の確認用に `/readyz` を公開します。
- **フロントエンド：** `apps/web` で `pnpm build` を実行する前に、`VITE_API_BASE` を
  公開 HTTPS API の URL に設定します。`apps/web/dist` は、クライアント側のルートで
  `index.html` にフォールバックする静的ホスティングで配信します。API の URL を変更した場合は再ビルドが必要です。
- **運用：** `APP_ENV=production` を使用し、`WEB_URL` を設定してください。認証情報を保護し、
  プロファイリング用エンドポイントへのアクセスを制限し、アップロードされたメディアの永続ストレージと
  バックアップを用意します。一時ストレージを使うホスティングでは、インスタンスの
  置き換え時にファイルが消失することがあります。Vite preview はローカルでのビルド確認用です。

デモアカウント：

| アカウント | ユーザー名                  | パスワード       |
| -------- | ----------------------------- | ---------------- |
| A        | qajohnnyparisianlxncqkkihchva | VG0xUA8Vg2YmL7xr |
| B        | qamarcosstrackelxncqkkihchvb  | nKYzjUk60AnePIyw |
| C        | qaalejandromantelxncqkkihchvc | UQxDTf1tm1EEcOOT |

## 👀 制限事項

- 検索は読み込み済みフィードのタイトルと投稿者を絞り込みます。データベース全体は検索しません。
- プライベートな会話では、会話を開いたときや手動更新時に最新の 50 件を読み込みます。
  フロントエンドはポーリング、メッセージのリアルタイム更新、過去のメッセージのページ分割に対応していません。
- 動画は空でない MP4 ファイルで、上限は **200 MiB** です。カバー画像は
  JPG/JPEG/PNG/WebP に対応し、上限は **10 MiB** です。再生できるかどうかはブラウザーのコーデック対応に依存します。
- 未完了の分割アップロードは、同じファイルを選び直すことで再開できます。ただし、
  サーバー側のアップロードセッションが有効である必要があります。有効期間は通常 **24 時間** です。完了した
  メディアのチェックポイントは現在のページセッション内にのみ保持されます。
- キューを使う操作は、読み取り結果に反映されるまで時間がかかることがあります。投稿や
  メッセージ配信の結果が不明な場合は、再試行する前に結果を確認してください。

## 📚 ドキュメント

| ドキュメント                                     | 内容                                                 |
| ------------------------------------------------ | ---------------------------------------------------- |
| [フロントエンドガイド](apps/web/README.md)       | フロントエンドの設定、動作、ブラウザーチェック         |
| [バックエンドガイド](docs/backend-render.md)    | エントリーポイント、依存関係、デプロイ、終了処理       |
| [CORS 設定](docs/backend-cors.md)               | 許可するオリジンと検証                               |
| [API エラーコード](docs/api-error-codes.md)     | 共通エラー契約と生成                                 |
| [コントリビューション](CONTRIBUTING.md)         | 開発の流れ、チェック、プルリクエスト                   |
| [コミット規約](docs/commit-conventions.md)      | 絵文字を接頭辞に使う Conventional Commits            |
| [行動規範](CODE_OF_CONDUCT.md)                  | コミュニティで求められる行動                           |
| [セキュリティポリシー](SECURITY.md)             | 非公開での脆弱性報告                                 |

一部の詳細な実装ドキュメントは、現在中国語で提供されています。
通常の不具合は [GitHub Issues](https://github.com/yydrowz3/feed-to-go/issues) で報告してください。
脆弱性が疑われる場合は、[SECURITY.md](SECURITY.md) の手順に従い、非公開で報告してください。

## 🤝 コントリビューション

あらゆる形のコントリビューションを歓迎します。コードの貢献に興味がある方は、GitHub の [Issues](https://github.com/yydrowz3/feed-to-go/issues) をご覧ください。

> \[!TIP]
>
> 私たちは技術を軸とするフォーラムを作り、知識の交流やアイデアの交換を通じて、互いのひらめきや共同での革新につなげたいと考えています。
>
> より良いものを一緒に作りましょう。製品デザインへのフィードバックやユーザー体験についてのご意見を、ぜひ直接お寄せください。
>
> **主なメンテナー：** [@yydrowz3](https://github.com/yydrowz3)

## ❤️ スポンサー

どんな支援も大切な力となり、一度の寄付も私たちを支える銀河の中で輝きます。あなたは流れ星のように、私たちの歩みに素早く明るい力を届けてくれます。信じてくださり、ありがとうございます。その温かいご支援の一つひとつが、目標へ向かう道を照らしてくれます。

## 📄 ライセンス

本プロジェクトは `MIT License` のもとで提供されています。詳しくは `LICENSE.md` を参照してください。

著作権 © 2026 [Feed To Go](https://github.com/yydrowz3/feed-to-go)。

<div align="right">

[![](https://img.shields.io/badge/-BACK_TO_TOP-151515?style=flat-square)](#readme-top)

</div>
