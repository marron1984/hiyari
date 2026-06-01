# DHPハブ サイト自己チェックレポート

**生成日**: 2026-02-08
**ブランチ**: `claude/hiyari-attendance-continue-PSEge`
**ビルド結果**: 成功 (0 errors)
**テスト結果**: 24 suites, 516 tests passed

---

## 1. 「デザインが変わらない」原因と修正

### 根本原因
**`/launch/page.tsx` が旧デザインを直接描画していた。**

- `LAUNCH_MODE=true` のとき middleware が `/dashboard` → `/launch` にリダイレクト
- `/launch/page.tsx` は独自の UI（旧 `slate-*` カラー、非ライブカウント版）を持っていた
- 新デザインの `LaunchModeDashboard` は `/dashboard/page.tsx` に実装済みだったが、
  ユーザーは `/launch` に到達するため、新デザインを見ることがなかった

### 修正内容
- `/launch/page.tsx` を書き換え、`LaunchModeDashboard` コンポーネントを描画するようにした
- これにより `/launch` にアクセスしても新デザイン（ライブカウント付きモジュールカード）が表示される

### 追加対策（キャッシュ・バージョン可視化）
| 対策 | ファイル | 説明 |
|------|---------|------|
| `/api/version` | `src/app/api/version/route.ts` | Git SHA + ビルド時刻を返す |
| Build SHA 表示 | `src/components/BuildInfo.tsx` | ダッシュボードフッターに表示 |
| `Cache-Control: no-store` | `next.config.ts` | `/dashboard/*`, `/launch`, `/api/*` |
| middleware Cache-Control | `src/middleware.ts` | 上記に加えてレスポンスヘッダーにも設定 |

### SW/PWA チェック
- **結果**: Service Worker / PWA / workbox は使用されていない
- `public/sw.js`, `next-pwa`, `navigator.serviceWorker` いずれも検出なし
- **キャッシュの原因は SW ではない** ことを確認

---

## 2. デプロイ確認手順

```bash
# 1. 本番の Build SHA を確認
curl -s https://aa-g.org/api/version | jq .

# 2. Cache-Control ヘッダーを確認
curl -I https://aa-g.org/dashboard 2>&1 | grep -i cache-control

# 3. ローカルの最新コミットと比較
git log --oneline -1
```

期待される結果:
- `api/version` の `sha` がデプロイ対象コミットの SHA と一致
- `Cache-Control: no-store, no-cache, must-revalidate` が返る
- Dashboard UI に Build SHA が表示される

---

## 3. ルート一覧と Launch Mode 分類

### Launch Mode で許可されるルート (4モジュール + 共通)

| カテゴリ | ルート例 | 制御方法 |
|----------|---------|----------|
| **打刻** | `/attendance`, `/attendance/history`, `/attendance/overtime` | featureGate: attendance |
| **承認** | `/dashboard/approvals`, `/ringi`, `/ringi/*`, `/requests/*` | featureGate: approvals |
| **入居希望** | `/dashboard/prospects`, `/dashboard/prospects/*` | featureGate: prospects |
| **空室** | `/dashboard/vacancy`, `/vacancies`, `/dashboard/vacancy-inquiries` | featureGate: vacancies |
| **共通** | `/login`, `/onboarding`, `/launch`, `/coming-soon`, `/settings/*` | commonPrefixes |
| **通知** | `/dashboard/notifications` | commonPrefixes |
| **API** | `/api/*` (全API) | 常に許可 |
| **管理(打刻)** | `/admin/attendance/*` | featureGate: attendance |
| **管理(承認)** | `/dashboard/admin/ringi`, `/admin/ringi`, `/admin/approval-routes` | featureGate: approvals |

### Launch Mode でブロックされるルート (→ /coming-soon にリダイレクト)

| カテゴリ | ルート例 | モジュール |
|----------|---------|----------|
| 報告 | `/submit`, `/incident/*`, `/admin/incidents` | incidents (disabled) |
| 改善 | `/improvements/*`, `/admin/improvements` | improvements (disabled) |
| ランク | `/rankings` | rankings (disabled) |
| 営業 | `/sales/*` | sales (disabled) |
| 経営OS | `/dashboard/os/*`, `/dashboard/os-map` | os (disabled) |
| AI副社長 | `/dashboard/ai/*`, `/admin/ai-vp/*` | ai-vp (disabled) |
| ドキュメント | `/dashboard/docs/*` | docs (disabled) |
| その他管理 | `/admin/employees`, `/admin/users`, `/admin/points` | 共通ルートに未登録 |

### 全ルート統計
- **総ルート数**: 184 pages
- **Launch Mode で許可**: ~35 routes (4モジュール + 共通)
- **Launch Mode でブロック**: ~149 routes
- **API ルート**: 全て許可 (UI側で制御)

---

## 4. Feature Gate システム

### アーキテクチャ
```
src/config/featureGate.ts
├── ALL_MODULES (11モジュール定義)
├── LAUNCH_ENABLED (4モジュールID)
├── isModuleEnabled(moduleId)     → boolean
├── getEnabledModules()           → ModuleConfig[]
├── isRouteEnabledByGate(path)    → boolean (middleware用)
└── filterNavItems(items)         → T[] (ナビゲーション用)
```

### 利用箇所
| ファイル | 関数 | 用途 |
|---------|------|------|
| `middleware.ts` | `isRouteEnabledByGate()` | ルートブロック |
| `Header.tsx` | `filterNavItems()` | デスクトップナビ |
| `MobileBottomNav.tsx` | `filterNavItems()`, `isModuleEnabled()` | モバイルナビ |

### 従来の LAUNCH_MODE ハードコード → featureGate への移行
- `LAUNCH_MODE_NAV_HREFS` → `filterNavItems(allNavItems)`
- `LAUNCH_MODE_ADMIN_HREFS` → `filterNavItems(allAdminItems)`
- `LAUNCH_MODE_MORE_HREFS` → `filterNavItems(allMoreItems)`
- `!LAUNCH_MODE && isAiVpOwner()` → `isModuleEnabled('ai-vp') && isAiVpOwner()`

---

## 5. 新規 API エンドポイント

| エンドポイント | メソッド | 用途 |
|---------------|---------|------|
| `/api/version` | GET | デプロイ確認 (SHA + ビルド時刻) |
| `/api/dashboard/counts` | GET | 4モジュールライブカウント |
| `/api/attendance/entries` | GET | 勤怠エントリ一覧 (サーバーサイド) |
| `/api/attendance/shifts` | GET | シフト一覧 (サーバーサイド) |
| `/api/admin/bootstrap/vacancy-from-sheets` | POST | 空室データ Sheets→Firestore インポート |
| `/api/admin/bootstrap/purge-demo-approvals` | POST | テストデータ一括削除 |

---

## 6. 確認チェックリスト

- [x] `npx next build` 成功 (0 errors)
- [x] `npm test` 成功 (24 suites, 516 tests)
- [x] `/launch` ページが `LaunchModeDashboard` を描画する
- [x] `/api/version` が Git SHA を返す
- [x] `Cache-Control: no-store` が `/dashboard/*`, `/api/*` に設定
- [x] SW/PWA なし (キャッシュ原因ではない)
- [x] featureGate で 4モジュール以外がブロックされる
- [x] Header / MobileBottomNav が featureGate でフィルタされる
- [x] Build SHA がダッシュボードフッターに表示される
- [ ] **要確認**: 本番デプロイ後に `curl -s https://aa-g.org/api/version` で SHA 確認
- [ ] **要確認**: 本番で `/dashboard` → `/launch` リダイレクト → 新デザイン表示

---

## 7. 追加修正 (2026-02-08 第2回)

### 7-1. 稟議 (ringi) tenantId フィルタ欠落 [CRITICAL]

**根本原因**: `getRingisByUser()`, `getPendingRingis()`, `getAllRingis()` の3関数が
`tenantId` パラメータを受け取りながら Firestore クエリに `where('tenantId', '==', tenantId)` を含めていなかった。

**影響**:
- 別テナントの稟議データが表示される可能性（マルチテナント分離違反）
- 別アカウントから申請した稟議が見えない問題の原因

**修正**: 3関数すべてに `where('tenantId', '==', tenantId)` を追加。
Firestore composite index `ringis(tenantId ASC, authorId ASC, createdAt DESC)` も追加。

### 7-2. 打刻 clockIn の employeeCode パラメータ

**根本原因**: `clockIn()` に `user.email` を渡していた。
**修正**: `user.name || user.email` に変更。

---

## 8. 今後の推奨事項

1. **デプロイ後の確認 SOP**: `api/version` の SHA と UI の Build 表示で一致確認
2. **Vercel 環境変数**: `NEXT_PUBLIC_GIT_SHA` に `VERCEL_GIT_COMMIT_SHA` を設定
3. **モジュール追加時**: `featureGate.ts` の `LAUNCH_ENABLED` に追加するだけで公開可能
4. **全モジュール公開時**: `NEXT_PUBLIC_LAUNCH_MODE` を削除または `false` に設定
