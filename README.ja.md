# Feed to Go

[English](README.md) | [简体中文](README.zh-CN.md) | **日本語**

Go バックエンドと React フロントエンドで構築したショート動画共有アプリです。
動画フィードの閲覧、再開可能なチャンクアップロードによる投稿、いいね、コメント、
フォロー、ダイレクトメッセージに対応しています。

## 機能

- 新着、フォロー中、いいね数のフィードと、独立した人気ランキング。
- 動画再生、シーク、キーボード操作、公開動画の詳細ページ。
- アカウント登録、ログイン、トークン更新、パスワード変更、プロフィール。
- チャンクごとのチェックサム、アップロードの再開、カバー画像に対応した MP4 投稿。
- いいね、コメント、フォロー一覧、ダイレクトメッセージ。
- 英語、簡体字中国語、日本語の表示と、言語設定の保存。
- アカウントのセッションとは独立して保存されるライト・ダークテーマ。
- ソーシャル操作、人気度、タイムライン、通知を処理するバックグラウンドコンシューマー。

## 技術スタック

| レイヤー | 技術 |
| --- | --- |
| バックエンド | Go、Gin、GORM、PostgreSQL、JWT、Zap |
| バックグラウンド処理 | RabbitMQ、Redis、トランザクショナル Outbox |
| フロントエンド | React、TypeScript、Vite、TanStack Router / Query / Form |
| 状態管理と検証 | Zustand、Zod |
| UI | Tailwind CSS、daisyUI、Lucide、Sonner |
| 国際化とアップロード | i18next、react-i18next、hash-wasm |

## ディレクトリ構成

```text
feed-to-go/
  apps/
    api/
      cmd/app/       # API とワーカーをまとめて起動
      cmd/server/    # API と関連バックグラウンドタスクの起動
      cmd/worker/    # ビジネス処理用コンシューマーの起動
      configs/       # プロファイリング設定
      internal/      # アプリ、HTTP API、サービス、ワーカー
      pkg/           # バックエンドの補助パッケージ
    web/
      src/           # ルート、機能、コンポーネント、翻訳
      tests/         # Node ベースのフロントエンドテスト
      scripts/       # ブラウザー回帰テスト用ツール
  shared/            # 共通エラーコード定義
  scripts/           # コード生成と結合テスト用ツール
  docs/              # 設定、規約、実装記録
```

## 必要な環境

- [go.mod](apps/api/go.mod) で指定された Go **1.27.2**、または互換性のある新しいツールチェーン。
- [package.json](apps/web/package.json) で指定された Node.js **24+** と pnpm **12+**。
- アプリ全体の実行には PostgreSQL、Redis、RabbitMQ が必要です。
- テスト用 MP4 ファイルのコーデックを再生できるブラウザー。

依存関係はリポジトリ内のマニフェストとロックファイルを基準にしてください。
以下のコマンドは外部サービスを構築しません。起動前に各サービスを用意してください。

## クイックスタート

以下は PowerShell の例です。バックエンドのコマンドは `apps/api`、フロントエンドの
コマンドは `apps/web` で実行します。依存関係はそれぞれ個別に管理されています。

### 1. リポジトリのクローン

```powershell
git clone https://github.com/yydrowz3/feed-to-go.git
cd feed-to-go
```

### 2. バックエンドの設定と起動

```powershell
cd apps/api
go mod download
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

開発専用のデータベースを作成し、`apps/api/.env` を編集してください。
以下は各サービスがローカルで動作している場合の例です。データベースのユーザー名、
パスワード、データベース名、ブローカー URI、JWT シークレットを環境に合わせて変更してください。

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

この設定はローカル開発用です。テストには専用の Redis インスタンスと RabbitMQ vhost を
使用してください。全設定項目は [apps/api/.env.example](apps/api/.env.example) を参照してください。
`AMQP_URL` は個別のブローカー設定より優先されます。`DATABASE_URL` と `REDIS_URL` は
読み込まれません。プロセスの環境変数は `.env` より優先されます。

API とワーカーをまとめて起動します。

```powershell
go run ./cmd/app
```

このエントリーポイントは API と全コンシューマーを同じプロセスで起動するため、
3 つの外部サービスがすべて必要です。起動時にデータベースのスキーマ移行を行うので、
開発用データベースを使用してください。設定パスは `apps/api` を基準に解決されます。

別のターミナルで HTTP の稼働状況とアプリ全体の準備状態を確認します。

```powershell
Invoke-RestMethod http://localhost:8095/healthz
Invoke-RestMethod http://localhost:8095/readyz
```

プロセスを分ける場合は、統合エントリーポイントの代わりに、別々のターミナルで
`go run ./cmd/server` と `go run ./cmd/worker` を実行します。依存サービスとライフサイクルは
[バックエンドのデプロイガイド](docs/backend-render.md) を参照してください。

### 3. フロントエンドの設定と起動

リポジトリのルートで別のターミナルを開きます。

```powershell
cd apps/web
pnpm install --frozen-lockfile
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

`apps/web/.env` を設定します。

```dotenv
VITE_API_BASE=http://localhost:8095
```

```powershell
pnpm dev --host 127.0.0.1 --port 5173 --strictPort
```

**http://localhost:5173** を開き、アカウントを登録してテスト動画を投稿してください。

### 4. オリジンとメディアへのアクセスの確認

フロントエンドは API とメディア URL に直接アクセスします。`VITE_API_BASE` は HTTP(S) の
絶対 URL にしてください。`/api` は自動で追加されません。この値はビルド時に公開される
設定なので、シークレットを含めないでください。

`APP_ENV=dev` はすべての CORS オリジンを許可します。それ以外の環境では、`WEB_URL` に
フロントエンドの正確なオリジンを設定してください。スキームとポートを含め、パスや末尾の
スラッシュは付けません。`localhost` と `127.0.0.1` は別のオリジンです。設定変更後は
バックエンドを再起動してください。詳細は [CORS 設定](docs/backend-cors.md) を参照してください。

アップロードしたファイルは `apps/api/.run/uploads` に保存され、`/static` で配信されます。
API プロセスには書き込み権限が必要です。バックエンドが返すメディア URL にブラウザーから
アクセスできることも確認してください。

## 開発と検証

`apps/api` でバックエンドを検証します。

```powershell
go test ./...
go vet ./...
go build ./cmd/app ./cmd/server ./cmd/worker
```

`apps/web` でフロントエンドを検証します。

```powershell
pnpm test
pnpm lint
pnpm fmt:check
pnpm errors:check
pnpm build
```

フロントエンドテストはフィクスチャを使用するため、稼働中のバックエンドは不要です。
ビルドには TypeScript の型チェックが含まれます。API エラーコードを変更する場合は
`shared/error-codes.json` を編集し、`apps/web` で `pnpm errors:generate` を実行して、
両方の生成ファイルをコミットしてください。詳細は [エラーコード仕様](docs/api-error-codes.md) を参照してください。

フロントエンドのビルド後、必要に応じてブラウザー回帰テストを起動できます。

```powershell
pnpm test:browser --media C:/path/to/test.mp4
```

出力された `http://127.0.0.1:5186/__checks` を開き、**Run checks** をクリックしてください。
結果はページ内と `/__report` で確認できます。Ctrl+C で停止し、ポートの変更には
`BROWSER_TEST_PORT` を使用します。`--media` を省略すると、正常な動画デコードの検証は
行われません。このツールは分離された API フィクスチャを使用します。実サービスとの
結合テストには専用のテスト環境が必要です。

## ビルドとデプロイ

- **バックエンド：** `apps/api` で `go build -o app ./cmd/app` を実行し、必要な環境変数と
  設定ファイルへのアクセスを用意して実行ファイルを起動します。統合エントリーポイントの
  準備状態は `/readyz` で確認できます。
  詳細は [Render デプロイとライフサイクル](docs/backend-render.md) を参照してください。
- **フロントエンド：** `apps/web` で `pnpm build` を実行する前に、`VITE_API_BASE` を公開
  HTTPS API URL に設定します。静的ホストで `apps/web/dist` を配信し、クライアント側の
  ルートには `index.html` を返すようにしてください。API URL の変更後は再ビルドが必要です。
- **運用：** `APP_ENV=production` と `WEB_URL` を設定し、認証情報を保護して、
  プロファイリングエンドポイントへのアクセスを制限してください。アップロードしたメディアには
  永続ストレージとバックアップを用意します。一時的なファイルシステム上のファイルは
  インスタンスの置き換えで失われる場合があります。Vite preview はローカルでのビルド確認用です。

## 現在の制限

- 検索対象は読み込み済み動画のタイトルと投稿者です。データベース全体の検索には対応していません。
- メッセージは会話を開くか手動更新したときに最新 50 件を取得します。フロントエンドには
  ポーリング、リアルタイム更新、過去のメッセージのページングはありません。
- 動画は空でない MP4 ファイルで、上限は **200 MiB** です。カバー画像は
  JPG/JPEG/PNG/WebP、上限は **10 MiB** です。再生の可否はブラウザーのコーデック対応に依存します。
- 未完了のチャンクアップロードは、サーバー側のセッションが有効な間、同じファイルを
  選び直すと再開できます。セッションの有効期間は通常約 **24 時間** です。
  完了済みメディアのチェックポイントは現在のページセッション内だけに保持されます。
- キューを経由する操作は、読み取り結果への反映に時間がかかる場合があります。
  投稿やメッセージ送信の結果が不明な場合は、再試行する前に実際の結果を確認してください。

## ドキュメントとコミュニティ

| ドキュメント | 内容 |
| --- | --- |
| [フロントエンドガイド](apps/web/README.md) | 設定、動作、ブラウザー検証 |
| [バックエンドガイド](docs/backend-render.md) | 起動方法、依存サービス、デプロイ、終了処理 |
| [CORS 設定](docs/backend-cors.md) | 許可オリジンと検証方法 |
| [API エラーコード](docs/api-error-codes.md) | 共通エラー仕様とコード生成 |
| [コントリビューションガイド](CONTRIBUTING.md) | 開発手順、検証、プルリクエスト |
| [コミット規約](docs/commit-conventions.md) | 絵文字付き Conventional Commits |
| [行動規範](CODE_OF_CONDUCT.md) | コミュニティでの行動指針 |
| [セキュリティポリシー](SECURITY.md) | 脆弱性の非公開報告 |

詳細な実装ドキュメントの一部は、現在中国語で提供されています。
通常の不具合は [GitHub Issues](https://github.com/yydrowz3/feed-to-go/issues) で報告してください。
脆弱性の疑いがある場合は [SECURITY.md](SECURITY.md) に従って非公開で報告してください。

## ライセンス

[MIT ライセンス](LICENSE) のもとで公開されています。
