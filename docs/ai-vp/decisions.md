# AI副社長 設計判断記録

## 概要

このドキュメントは、AI副社長（AI-VP）機能をAA-HUBに統合する際の
設計判断とその理由を記録する。

---

## ADR-001: 既存DBとの共存方針

**日付**: 2026-01-21
**状態**: 採用

### 背景
既存AA-HUBには以下のコレクションが存在:
- incidents (ヒヤリハット)
- improvements (改善アイデア)
- prospects (入居希望者)
- vacancyStatus (空室状態)
- dailyInsights (デイリーインサイト)

### 決定
**既存コレクションは一切変更せず、新規コレクションを追加する**

### 理由
1. 既存機能の安定性を維持
2. ロールバック可能性を確保
3. 段階的移行が可能

### 新規コレクション一覧
```
requests/           # 共通申請エンジン
approvalRoutes/     # 承認ルート定義
approvalLogs/       # 承認履歴（append-only）
paymentBatches/     # 支払バッチ
paymentItems/       # 支払明細
transferRecords/    # 振込記録
approvalKeys/       # 自動承認キー
conditionScores/    # コンディションスコア
aiVpSettings/       # AI副社長設定（既存）
aiVpIngestions/     # 取り込み（既存）
aiVpExtractions/    # 抽出（既存）
aiVpActions/        # アクション（既存）
aiVpAuditLogs/      # 監査ログ（既存）
```

---

## ADR-002: 承認ステータス設計

**日付**: 2026-01-21
**状態**: 採用

### 決定
以下のステータスフローを採用:

```
draft                      # 下書き
  ↓
submitted                  # 申請済み
  ↓
manager_approved           # 拠点長承認
  ↓
admin_approved             # 管理者承認
  ↓
ai_vp_reviewed             # AI副社長レビュー済み
  ↓
final_approved_by_yoshida  # 吉田最終決裁
  ↓
executed                   # 実行済み

# 分岐
rejected                   # 却下
returned                   # 差し戻し
```

### 理由
1. 既存ringiのステータス（draft, pending, approved, rejected）と併存可能
2. 金額・種別に応じてスキップ可能な設計
3. AI副社長は「レビュー」であり「承認」ではないことを明示

---

## ADR-003: 申請種別の統一

**日付**: 2026-01-21
**状態**: 採用

### 決定
4種類の申請を共通モデルで扱う:

```typescript
type RequestType =
  | 'ringi'           // 稟議
  | 'expense'         // 経費精算
  | 'payroll'         // 給与関連（手当・控除・修正）
  | 'vendor_payment'  // 臨時支払
```

### 理由
1. 承認フローの共通化
2. 支払バッチへの統合
3. AI副社長による一元レビュー

---

## ADR-004: AI副社長の権限境界

**日付**: 2026-01-21
**状態**: 採用

### 決定
AI副社長は以下のみ実行可能:

**許可**
- 申請内容の整形・補完提案
- 不足情報の指摘
- 類似案件の参照・提示
- 判断ポイントの抽出
- 要約の生成
- タスク・通知の生成
- 承認キー条件下での代理承認フラグ付与

**禁止**
- 最終決裁の実行
- 振込の実行
- 人事評価・査定
- 承認ルートの変更

### 理由
1. 法的責任の所在を明確化
2. 人間の最終判断を担保
3. AI暴走リスクの排除

---

## ADR-005: 吉田判断のAI諮問方式

**日付**: 2026-01-21
**状態**: 採用

### 決定
吉田の判断が必要な場面では、固定ルールではなく
Claude/ChatGPT APIに構造化データを送信し、
「吉田の過去の判断傾向に基づく助言」を取得する。

### 入力データ構造
```json
{
  "request_summary": "...",
  "amount": 150000,
  "category": "設備投資",
  "applicant_history": { ... },
  "similar_past_decisions": [ ... ],
  "risk_factors": [ ... ],
  "urgency_level": "mid"
}
```

### 出力形式
```json
{
  "recommendation": "approve" | "reject" | "return" | "escalate",
  "confidence": 0.85,
  "reasoning": "過去3件の類似案件では承認...",
  "attention_points": ["予算超過リスク", "..."],
  "suggested_conditions": ["分割払い検討", "..."]
}
```

### 理由
1. 柔軟な判断が可能
2. 判断根拠の透明性
3. 吉田の判断スタイルの学習・反映

---

## ADR-006: Google Tasks連携方針

**日付**: 2026-01-21
**状態**: 採用

### 決定
AA-HUB内にタスクUIは作成せず、Google Tasksを唯一のToDoインターフェースとする。

### 連携内容
- 稟議最終決裁待ち → タスク作成
- 経費承認待ち → タスク作成
- 振込実行待ち → タスク作成
- 期限超過 → 優先度変更
- 承認完了 → タスク自動完了

### 理由
1. 既存ワークフローとの親和性
2. モバイル対応の自動化
3. AA-HUB開発範囲の限定

---

## ADR-007: LINE WORKS行動解析

**日付**: 2026-01-21
**状態**: 採用

### 決定
LINE WORKSからメッセージ内容は取得せず、
行動メトリクスのみを収集しコンディションスコアを算出。

### 収集メトリクス
```typescript
interface BehaviorMetrics {
  avgResponseTime: number;      // 平均返信時間（分）
  avgReadTime: number;          // 平均既読時間（分）
  postingFrequency: number;     // 投稿頻度（日あたり）
  nightActivityRatio: number;   // 夜間稼働率（22時-6時）
  reactionDecline: number;      // リアクション減少率
}
```

### コンディションスコア計算
```
score = 100
  - (avgResponseTime > 60 ? 20 : avgResponseTime / 3)
  - (nightActivityRatio > 0.3 ? 15 : 0)
  - (reactionDecline > 0.5 ? 25 : reactionDecline * 50)
  ...
```

### アクション閾値
- 40以下: タスク自動分散、承認負荷緩和、吉田へ非公開通知
- 60以下: 注意モニタリング

### 理由
1. プライバシー保護（内容不取得）
2. メンタルヘルス早期対応
3. 組織パフォーマンス最適化

---

## ADR-008: 振込データ・GMO API連携

**日付**: 2026-01-21
**状態**: 採用

### 決定
振込は以下のフローで処理:

1. 支払バッチ作成（複数申請を集約）
2. バッチ確定（変更不可になる）
3. 振込データJSON生成
4. GMOあおぞら銀行API連携（予約登録）
5. 実行ボタン押下（吉田/財務責任者のみ）

### セキュリティ
- バッチ確定後は一切の修正不可
- 全操作に監査ログ
- 実行権限は環境変数で管理

### 理由
1. 振込事故ゼロの達成
2. 監査証跡の完全性
3. 権限分離の明確化

---

## ADR-009: 承認キー（自動承認条件）

**日付**: 2026-01-21
**状態**: 採用

### 決定
特定条件下でAI副社長による代理承認を許可。

### 条件モデル
```typescript
interface ApprovalKey {
  id: string;
  allowedTypes: RequestType[];
  maxAmount: number;
  riskLevel: 'low' | 'mid';
  scope: string[];  // 部門・プロジェクト
  requiresPastApproval: boolean;
  excludeCategories: string[];
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
}
```

### 承認キー適用時のフロー
```
申請 → 拠点長承認 → 管理者承認
  → [承認キー条件チェック]
  → 条件一致: AI副社長代理承認 → 吉田事後確認
  → 条件不一致: 吉田最終決裁
```

### 理由
1. 吉田の判断負荷軽減
2. 定常業務の高速化
3. リスク管理との両立

---

## 変更履歴

| 日付 | ADR | 変更内容 |
|------|-----|---------|
| 2026-01-21 | ADR-001〜009 | 初版作成 |
