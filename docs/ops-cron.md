# Ops Cron スケジュール運用ガイド

Implementation Ticket 067: 本番運用固定

## スケジュール

| Job | Cron式 | 実行時刻 | 説明 |
|-----|--------|---------|------|
| daily-ops | `30 8 * * *` | 毎日 08:30 JST | 日次オペレーション（KPI/期限/滞留チェック） |
| notify-digest | `0 9 * * *` | 毎日 09:00 JST | 朝イチダイジェスト通知 |
| weekly-ops | `0 8 * * 1` | 毎週月曜 08:00 JST | 週次オペレーション（WBR/サマリー生成） |

## エンドポイント

### GET /api/cron/daily-ops

```bash
# 通常実行
curl "${APP_BASE_URL}/api/cron/daily-ops?secret=${DAILY_OPS_SECRET}"

# プレビュー（実際にアラートを作成しない）
curl "${APP_BASE_URL}/api/cron/daily-ops?secret=${DAILY_OPS_SECRET}&preview=true"

# 強制実行（同日実行済みでも実行）
curl "${APP_BASE_URL}/api/cron/daily-ops?secret=${DAILY_OPS_SECRET}&force=true"

# 特定ステップのみ実行
curl "${APP_BASE_URL}/api/cron/daily-ops?secret=${DAILY_OPS_SECRET}&steps=kpi_anomaly_scan,licenses_scan"

# 履歴取得
curl "${APP_BASE_URL}/api/cron/daily-ops?secret=${DAILY_OPS_SECRET}&history=true"
```

### GET /api/cron/weekly-ops

```bash
# 通常実行
curl "${APP_BASE_URL}/api/cron/weekly-ops?secret=${WEEKLY_OPS_SECRET}"

# プレビュー
curl "${APP_BASE_URL}/api/cron/weekly-ops?secret=${WEEKLY_OPS_SECRET}&preview=true"

# 強制実行
curl "${APP_BASE_URL}/api/cron/weekly-ops?secret=${WEEKLY_OPS_SECRET}&force=true"

# 履歴取得
curl "${APP_BASE_URL}/api/cron/weekly-ops?secret=${WEEKLY_OPS_SECRET}&history=true"
```

### GET /api/cron/notify-digest

```bash
# 通常実行
curl "${APP_BASE_URL}/api/cron/notify-digest?secret=${DIGEST_CRON_SECRET}"

# プレビュー
curl "${APP_BASE_URL}/api/cron/notify-digest?secret=${DIGEST_CRON_SECRET}&preview=true"
```

## 環境変数

| 変数名 | 説明 | フォールバック |
|--------|------|--------------|
| `DAILY_OPS_SECRET` | daily-ops 認証シークレット | `ALERT_CRON_SECRET` |
| `WEEKLY_OPS_SECRET` | weekly-ops 認証シークレット | `ALERT_CRON_SECRET` |
| `DIGEST_CRON_SECRET` | notify-digest 認証シークレット | `ALERT_CRON_SECRET` |
| `ALERT_CRON_SECRET` | 共通フォールバックシークレット | - |

## 冪等性

- **daily-ops**: 同日に成功実行済みの場合スキップ（`force=true` で上書き可能）
- **weekly-ops**: 同週に成功実行済みの場合スキップ（`force=true` で上書き可能）
- **notify-digest**: 対応事項がない場合スキップ（`force=true` で上書き可能）

各アラートは fingerprint で重複防止:
- `daily_ops:{step}:{YYYY-MM-DD}`
- `weekly_ops:{step}:{週開始日}`

## 失敗時の動作

### system_error アラート

各ステップが失敗すると自動的に:
1. `type='system_error'` のアラートを作成
2. `severity='critical'`
3. `meta.notifyRoles=['manager', 'admin']`
4. 即時通知（Ticket 055/061 ポリシーに従う）

### 復旧方法

1. `/dashboard/ops-report` で失敗ステップを確認
2. 「再実行」ボタンで失敗ステップのみ再実行
3. または CLI で直接再実行:

```bash
# 失敗ステップのみ再実行
curl "${APP_BASE_URL}/api/cron/daily-ops?secret=${SECRET}&steps=failed_step_name&force=true"
```

## 監視ダッシュボード

### Ops Report (/dashboard/ops-report)

確認項目:
- 最終実行日時（lastRunAt）
- 実行結果（ok / failed）
- 失敗ステップ名
- system_error / unclassified / critical 件数

### アラートページ (/dashboard/alerts)

フィルター:
- `type=system_error` でシステムエラーのみ表示
- `status=open` で未対応のみ表示

## トラブルシューティング

### 401 Unauthorized

原因: secret が不正または未設定

確認事項:
1. 環境変数が正しく設定されているか
2. クエリパラメータの secret 値が一致しているか

### 同日/同週に実行されない

原因: 既に成功実行済み

対処:
- `force=true` を追加して強制実行
- または翌日/翌週を待つ

### ステップ失敗後に system_error が出ない

確認事項:
1. `dryRun` / `preview` モードで実行していないか
2. アラートリポジトリへの書き込み権限があるか

## 外部 Cron サービスの設定例

### Google Cloud Scheduler

```yaml
# daily-ops
schedule: "30 8 * * *"
timeZone: "Asia/Tokyo"
httpTarget:
  uri: "${APP_BASE_URL}/api/cron/daily-ops?secret=${SECRET}"
  httpMethod: GET

# weekly-ops
schedule: "0 8 * * 1"
timeZone: "Asia/Tokyo"
httpTarget:
  uri: "${APP_BASE_URL}/api/cron/weekly-ops?secret=${SECRET}"
  httpMethod: GET

# notify-digest
schedule: "0 9 * * *"
timeZone: "Asia/Tokyo"
httpTarget:
  uri: "${APP_BASE_URL}/api/cron/notify-digest?secret=${SECRET}"
  httpMethod: GET
```

### Vercel Cron (vercel.json)

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-ops?secret=${DAILY_OPS_SECRET}",
      "schedule": "30 8 * * *"
    },
    {
      "path": "/api/cron/weekly-ops?secret=${WEEKLY_OPS_SECRET}",
      "schedule": "0 8 * * 1"
    },
    {
      "path": "/api/cron/notify-digest?secret=${DIGEST_CRON_SECRET}",
      "schedule": "0 9 * * *"
    }
  ]
}
```

## 関連リンク

- [Ops Report](/dashboard/ops-report) - 運用状況ダッシュボード
- [Alerts](/dashboard/alerts) - アラート一覧
- [AI VP Top3](/dashboard/ai-vp/top3) - 今日の優先事項
