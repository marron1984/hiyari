# AI副社長 統合調査レポート

調査日: 2026-01-21

## 1. 技術スタック

| コンポーネント | 技術 | バージョン |
|--------------|------|-----------|
| フレームワーク | Next.js (App Router) | 16.1.3 |
| UI | React | 19.2.3 |
| 言語 | TypeScript | 5 |
| スタイリング | Tailwind CSS | 4 |
| アイコン | Lucide React | 0.562.0 |
| フォーム | React Hook Form + Zod | 7.71.1 / 4.3.5 |
| グラフ | Recharts | 3.6.0 |

## 2. データベース

**DB**: Google Cloud Firestore

### 既存コレクション

```
users/                    # ユーザー
branches/                 # 事業所
incidents/                # ヒヤリハット
improvements/             # 改善アイデア
improvementComments/      # コメント
ringis/                   # 稟議
ringiAuditLogs/           # 稟議監査ログ
prospects/                # 入居希望者
rooms/                    # 部屋
occupancy/                # 入居状況
auditLogs/                # 監査ログ
notificationLogs/         # 通知ログ
facilities/               # 施設
vacancyStatus/            # 空室状態
vacancyEvents/            # 空室変更ログ
dailyInsights/            # 連携提案
employees/                # 従業員
timeEntries/              # 打刻
workShifts/               # シフト
overtimeRequests/         # 残業申請
pointHistories/           # ポイント履歴
settings/                 # テナント設定
monthlyStats/             # 月次統計
```

### テナント

- MVPでは `DEFAULT_TENANT_ID = 'defaultTenant'` を使用

## 3. 認証・認可

### 認証方式
- Firebase Authentication + Google Sign-In
- `src/contexts/AuthContext.tsx` で管理

### 初期システム管理者
```typescript
const INITIAL_SYSTEM_ADMINS = ['yoshida@aska-g.com'];
```

### ロール階層

| ロール | レベル | 権限 |
|-------|--------|------|
| user | 0 | 自分の投稿閲覧・作成 |
| leader | 1 | 管理画面アクセス、同事業所承認 |
| admin | 2 | 全事業所承認、設定変更 |
| system_admin | 3 | テナント設定、ユーザー管理 |

### 認可関数 (`src/lib/auth.ts`)
```typescript
hasMinRole(userRole, minRole)    // ロール階層チェック
canApprove(userRole, branchId)   // 承認権限
canAccessAdmin(userRole)         // 管理画面（leader+）
canManageSettings(userRole)      // 設定変更（admin+）
canManageUsers(userRole)         // ユーザー管理（admin+）
```

## 4. 既存モジュール

### 入居希望者 (prospects)
- **型定義**: `src/types/prospect.ts`
- **ライブラリ**: `src/lib/prospect.ts`
- **UI**: `/dashboard/prospects`, `/dashboard/prospects/[id]`
- **Webhook**: `POST /api/intake/prospect`
- **機能**: 重複検知、LINE WORKS通知、監査ログ

### 稟議 (ringi)
- **型定義**: `src/types/ringi.ts`
- **ライブラリ**: `src/lib/ringi.ts`
- **UI**: `/ringi`, `/ringi/new`, `/ringi/[id]`
- **ステータス**: draft → submitted → approved/rejected
- **権限**: 作成は全員、承認はleader+

### ヒヤリハット (incidents)
- **型定義**: `src/types/index.ts`
- **ライブラリ**: `src/lib/firestore.ts`
- **UI**: `/submit`, `/incident/[id]`
- **機能**: スコアリング、不正検知、ランキング

### 改善アイデア (improvements)
- **型定義**: `src/types/improvement.ts`
- **ライブラリ**: `src/lib/improvement.ts`
- **UI**: `/improvements`, `/improvements/new`
- **機能**: いいね、コメント、採用ワークフロー

### 出退勤 (attendance)
- **型定義**: `src/types/attendance.ts`
- **ライブラリ**: `src/lib/attendance.ts`
- **UI**: `/attendance`, `/admin/attendance/*`
- **機能**: 打刻、シフト、残業申請

## 5. 外部連携

### LINE WORKS
- **ライブラリ**: `src/lib/lineworks.ts`
- **API**: `https://www.worksapis.com/v1.0/bots/{botId}/channels/{groupId}/messages`
- **環境変数**: `LINEWORKS_BOT_ID`, `LINEWORKS_GROUP_ID`, `LINEWORKS_ACCESS_TOKEN`

### Firebase Admin (サーバーサイド)
- Webhook APIで使用
- **環境変数**: `FIREBASE_SERVICE_ACCOUNT_KEY`

## 6. UIコンポーネント

### カスタムUI (`src/components/ui/`)
- Button (primary, secondary, outline, ghost, danger)
- Card, CardHeader, CardTitle, CardContent
- Input, Select, Badge

### 共通パターン
- `AuthGuard` でルート保護
- `Header` でナビゲーション
- `Loading` でローディング表示

## 7. API構成

### 既存API
```
POST /api/intake/prospect   # Webhook受信、Firebase Admin使用
```

### 認証方式
- Webhook: `X-Webhook-Token` ヘッダー検証
- UI API: Firebase Auth + ロールチェック

## 8. ディレクトリ構成

```
src/
├── app/
│   ├── admin/           # 管理者画面
│   ├── api/             # APIルート
│   ├── dashboard/       # ダッシュボード
│   └── [各ページ]
├── components/
│   ├── ui/              # 共通UIコンポーネント
│   └── [機能別]
├── contexts/
│   └── AuthContext.tsx  # 認証コンテキスト
├── lib/
│   ├── firebase.ts      # Firebase初期化
│   ├── auth.ts          # 認可関数
│   └── [モジュール].ts
└── types/
    ├── index.ts         # 共通型（re-export）
    └── [モジュール].ts
```

## 9. AI副社長 統合方針

### 新規ロール
- `ai_vp_owner`: 吉田専用（yoshida@aska-g.com）
- ロール階層とは別にフラグとして実装

### 新規コレクション
- `aiVpIngestions`: 取り込みデータ
- `aiVpExtractions`: 抽出結果
- `aiVpActions`: 実行アクション
- `aiVpAuditLogs`: AI副社長監査ログ

### UI配置
- `/admin/ai-vp/*`: 吉田専用画面
- 既存Header navItemsには**追加しない**（吉田専用URLのみ）

### 連携対象
1. 入居希望者（prospects）→ 作成
2. 稟議（ringis）→ 下書き作成
3. ヒヤリハット（incidents）→ 作成
4. 改善アイデア（improvements）→ 作成
5. LINE WORKS → 通知送信
6. Google Sheets → 書き込み（将来）

### セキュリティ
- Firestore Rules: `ai_vp_owner` フラグチェック
- ミドルウェア: `/admin/ai-vp` 配下は吉田のみ
- APIルート: 全てサーバーサイドでロールチェック
- ログにraw_textを出力しない
