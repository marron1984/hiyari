# ヒヤリハット報告システム MVP

介護現場のヒヤリハット（インシデント）をWeb登録し、月次集計・ランキング・可視化によってインセンティブの根拠となるポイント制を運用するシステムです。

## 技術スタック

- **フロントエンド**: Next.js 16 (App Router), TypeScript, Tailwind CSS
- **バックエンド**: Firebase (Auth, Firestore, Storage)
- **グラフ**: Recharts
- **フォント**: Noto Sans JP

## セットアップ手順

### 1. Firebaseプロジェクトの作成

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクトを作成
2. **Authentication** を有効化
   - 「Sign-in method」から「Google」を有効化
   - 承認済みドメインにデプロイ先のドメインを追加
3. **Firestore Database** を作成
   - 本番モードで開始（セキュリティルールは後で設定）
4. **Storage** を有効化
5. **ウェブアプリ** を追加し、設定情報を取得

### 2. 環境変数の設定

```bash
cp .env.local.example .env.local
```

`.env.local` を編集し、Firebaseの設定情報を入力：

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

### 3. セキュリティルールの設定

Firebase Consoleで以下のルールを設定：

**Firestore Rules** (`firestore.rules` の内容をコピー)

**Storage Rules** (`storage.rules` の内容をコピー)

### 4. インストールと起動

```bash
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開きます。

### 5. Firebase Hostingへのデプロイ

```bash
npm install -g firebase-tools
firebase login
firebase init hosting  # public ディレクトリは "out" を指定
npm run build
firebase deploy --only hosting
```

## データ初期化方法

### 事業所（branches）の登録

Firestore Consoleで `branches` コレクションに以下のようなドキュメントを作成：

```json
{
  "name": "本社デイサービス",
  "tenantId": "defaultTenant",
  "headcount": 10,
  "createdAt": "2026-01-01T00:00:00Z"
}
```

複数の事業所がある場合は、同様に追加してください。

### 設定（settings）の初期化

`settings` コレクションは、最初の管理者がアクセスした際に自動的に `defaultTenant` ドキュメントが作成されます。手動で作成する場合：

```json
{
  "tenantId": "defaultTenant",
  "scoringRules": [
    { "key": "base", "label": "投稿基本点", "points": 10, "condition": "投稿1件", "enabled": true },
    { "key": "len300", "label": "本文300文字以上", "points": 5, "condition": "本文が300文字以上", "enabled": true },
    { "key": "len600", "label": "本文600文字以上", "points": 10, "condition": "本文が600文字以上", "enabled": true },
    { "key": "severity4", "label": "重大度4以上", "points": 5, "condition": "重大度が4以上", "enabled": true },
    { "key": "action", "label": "回避行動あり", "points": 5, "condition": "回避行動が入力されている", "enabled": true },
    { "key": "prevention", "label": "再発防止提案あり", "points": 10, "condition": "再発防止提案が入力されている", "enabled": true },
    { "key": "image", "label": "画像添付あり", "points": 5, "condition": "画像が添付されている", "enabled": true }
  ],
  "visibilityMode": "all",
  "domainAllowList": [],
  "excludeFraudFromRanking": true,
  "updatedAt": "2026-01-01T00:00:00Z"
}
```

## 管理者の設定方法

1. 管理者にしたいユーザーにGoogleログインしてもらう
2. Firestore Console で `users` コレクションを開く
3. 対象ユーザーのドキュメントを編集
4. `role` フィールドを `"user"` から `"admin"` に変更

```json
{
  "role": "admin"
}
```

## 集計ロジックの説明

### 月次統計の仕組み

投稿が作成されるたびに、リアルタイムで月次統計を更新します：

```
monthlyStats/{tenantId}/{yyyyMM}/users/{userId}
monthlyStats/{tenantId}/{yyyyMM}/branches/{branchId}
```

各ドキュメントには以下の情報が蓄積されます：

**ユーザー統計**:
- `points`: 合計ポイント
- `count`: 投稿数
- `suggestionsCount`: 再発防止提案ありの件数
- `totalBodyLength`: 本文合計文字数（平均計算用）

**事業所統計**:
- `points`: 合計ポイント
- `count`: 投稿数
- `headcount`: 在籍者数
- `suggestionsCount`: 再発防止提案ありの件数

### ランキング順位決定ルール

**個人ランキング**:
1. ポイント合計（降順）
2. 再発防止提案数（降順）
3. 平均本文文字数（降順）
4. 投稿件数（降順）
5. すべて同じ場合は同順位

**事業所ランキング**:
1. ポイント合計（降順）
2. 投稿件数（降順）
3. 投稿率（降順）

### 不正検知

以下の条件で自動的に不正フラグが付与されます：
- 24時間以内に同一内容（本文の前50文字＋文字数が一致）の投稿がある場合
- 1時間以内に5件以上の投稿がある場合

不正フラグが付いた投稿は、設定によりランキング計算から除外できます。

## 画面一覧

| パス | 説明 | アクセス権限 |
|------|------|------------|
| `/login` | Googleログイン | 全員 |
| `/onboarding` | 初回プロフィール設定 | ログイン済み（未設定者） |
| `/dashboard` | ダッシュボード・可視化 | ログイン済み |
| `/submit` | 投稿フォーム | ログイン済み |
| `/incident/[id]` | 投稿詳細 | 投稿者本人 or 管理者 |
| `/rankings` | 月次ランキング | ログイン済み |
| `/admin/incidents` | 投稿管理・CSV出力 | 管理者のみ |
| `/admin/settings` | システム設定 | 管理者のみ |

## 実装者判断事項

以下の点は要件定義の範囲内で実装者が判断しました：

### グラフライブラリ
- **Recharts** を採用（React との親和性が高く、実装が容易）

### テナントID
- MVPでは `defaultTenant` を固定値として使用
- 将来のマルチテナント対応を見据えた構造は維持

### 不正検知ロジック
- 簡易版として「本文の前50文字＋文字数」による類似判定を実装
- 将来的にはより高度なハッシュ比較や機械学習による検知に拡張可能

### 月次統計の更新タイミング
- Cloud Functions ではなく、投稿作成時にクライアントサイドで直接更新
- Firestore のトランザクションを使用して整合性を確保

### visibilityMode と domainAllowList
- 設定UIは実装済み
- 実際のアクセス制御ロジックはMVPでは未実装（将来の拡張項目）

### 日本時間の処理
- クライアントサイドで `Asia/Tokyo` タイムゾーンを使用して月次切り替えを処理

### 画像アップロード
- 1枚あたり5MBまで、最大3枚
- Firebase Storage に `incidents/{userId}/{timestamp}_{filename}` の形式で保存

### セキュリティ
- Firestoreルールで認証必須、投稿は本人のみ作成可能
- 管理者のみ全投稿閲覧・設定変更可能

## 既知の制限と今後の改善案

### 既知の制限

1. **visibilityMode の制限**
   - 設定は保存できるが、実際の閲覧制限は未実装

2. **ドメイン制限**
   - 設定は保存できるが、ログイン時のドメインチェックは未実装

3. **不正検知の精度**
   - 簡易的な文字列比較のみ。類似文章の検知は不可

4. **リアルタイム更新**
   - ランキングや統計は画面更新時に反映

5. **オフライン対応**
   - 未対応。オンライン必須

6. **PWA対応**
   - 未対応。ブラウザからのアクセスのみ

### 今後の改善案

1. **Cloud Functions の導入**
   - 集計処理をサーバーサイドに移行し、クライアント負荷を軽減
   - 不正検知の高度化

2. **通知機能**
   - ランキング更新時のプッシュ通知
   - 不正フラグ付与時の管理者通知

3. **レポート機能**
   - 月次レポートの自動生成
   - PDF出力

4. **多言語対応**
   - 外国人スタッフ向けの多言語UI

5. **アクセシビリティ改善**
   - スクリーンリーダー対応
   - キーボード操作の最適化

6. **パフォーマンス最適化**
   - 画像の自動リサイズ・圧縮
   - 無限スクロールの実装

7. **監査ログ**
   - 管理者の操作履歴記録

## ライセンス

MIT License

## 開発者向け情報

```bash
# 開発サーバー起動
npm run dev

# ビルド
npm run build

# リント
npm run lint
```

### ディレクトリ構造

```
src/
├── app/                    # Next.js App Router ページ
│   ├── admin/             # 管理者ページ
│   ├── dashboard/         # ダッシュボード
│   ├── incident/[id]/     # 投稿詳細
│   ├── login/             # ログイン
│   ├── onboarding/        # オンボーディング
│   ├── rankings/          # ランキング
│   └── submit/            # 投稿フォーム
├── components/            # 共通コンポーネント
│   └── ui/               # UIコンポーネント
├── contexts/              # React Context
├── hooks/                 # カスタムフック
├── lib/                   # ユーティリティ・Firebase設定
└── types/                 # TypeScript型定義
```
