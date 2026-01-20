# 勤怠モジュール 操作・運用手順

## 概要

勤怠モジュールは既存のヒヤリハット管理システムに独立して追加された機能です。

- 既存機能（ヒヤリハット/改善/稀議）への影響なし
- `users` テーブルのみ共通利用
- `/attendance` 配下に閉じた実装
- JST固定、1分単位

---

## 画面一覧

| パス | 対象 | 機能 |
|------|------|------|
| `/attendance` | 一般 | 打刻（出勤/退勤/休憩） |
| `/attendance/history` | 一般 | 自分の月次勤怠一覧 |
| `/attendance/overtime` | 一般 | 残業申請 |
| `/admin/attendance` | 管理者 | 勤怠管理（一覧/修正/監査ログ/CSV） |
| `/admin/attendance/import` | 管理者 | シフトExcel取込 |
| `/admin/attendance/dashboard` | 管理者 | 勤怠ダッシュボード |
| `/admin/attendance/realtime` | 管理者 | リアルタイム出勤状況 |

---

## 画面操作手順

### 1. 打刻（従業員）

**パス:** `/attendance`

1. ログイン後、ヘッダーの「打刻」をクリック
2. 現在の状態（未出勤/勤務中/休憩中/退勤済）が表示される
3. ボタンをクリックして打刻
   - **出勤**: 勤務開始時
   - **休憩開始**: 休憩に入る時
   - **休憩終了**: 休憩から戻る時
   - **退勤**: 勤務終了時
4. 今日のシフトがある場合は予定時間も表示

**注意:**
- 出勤後でないと休憩・退勤はできない
- 休憩中は退勤できない（先に休憩終了が必要）
- 1日1回のみ出勤可能

---

### 2. 月次勤怠一覧（従業員）

**パス:** `/attendance/history`

1. 月を選択
2. 日別の打刻記録を確認
   - 出勤時刻
   - 退勤時刻
   - 勤務時間
   - ステータス（退勤済/退勤漏れ/勤務中など）
3. 異常がある場合は赤色で表示

---

### 3. 残業申請（従業員）

**パス:** `/attendance/overtime`

1. 「残業申請」ボタンをクリック
2. 以下を入力:
   - 対象日
   - 残業時間（時間と分）
   - 申請理由
3. 「申請」をクリック
4. ステータスが「申請中」になる
5. 管理者が承認すると「承認済み」に変わる

**注意:**
- 承認済みの残業時間のみがfreee CSV出力に反映される

---

### 4. 管理者：勤怠管理

**パス:** `/admin/attendance`

#### タブ1: 打刻一覧
1. 対象月・事業所でフィルタ
2. 全従業員の打刻記録を確認
3. 修正が必要な場合は鉛筆アイコンをクリック
4. 修正モーダルで:
   - 出勤時刻を変更
   - 退勤時刻を変更
   - **修正理由を必ず入力**（監査ログに記録）
5. 「保存」で確定

#### タブ2: 残業承認
1. 未承認の残業申請が一覧表示
2. 内容を確認し:
   - **承認**: 残業時間が確定（CSV出力対象になる）
   - **却下**: 理由を入力して却下
3. 承認後はTimeEntryに残業時間が反映

#### タブ3: 監査ログ
1. 全ての変更履歴を確認
2. 表示内容:
   - 日時
   - 対象（打刻/シフト/残業申請）
   - 操作（作成/更新/削除）
   - 実行者
   - 理由
   - 変更前後の値

#### タブ4: CSV出力
1. 対象月・事業所を選択
2. 「CSVダウンロード」をクリック
3. UTF-8 BOM付きCSVがダウンロードされる

**CSV出力形式:**
```
従業員コード,勤務日,労働時間(分),残業時間(分),深夜時間(分),休憩時間(分)
EMP001,2025-01-20,480,60,0,60
```

---

### 5. 管理者：シフトExcel取込

**パス:** `/admin/attendance/import`

1. 「ファイル選択」でExcelファイル（.xlsx）を選択
2. プレビューで内容を確認
3. エラーがある行は赤色で表示
4. 「シフトを登録」で確定

**Excelフォーマット:**
| 列 | 内容 | 例 |
|----|------|-----|
| A | 従業員コード | EMP001 |
| B | 勤務日 | 2025-01-20 |
| C | 開始時刻 | 09:00 |
| D | 終了時刻 | 18:00 |
| E | 休憩時間（分） | 60 |
| F | シフト種別 | 日勤 |

**シフト種別:**
- 日勤
- 早番
- 遅番
- 夜勤
- 明け
- 休日
- 有給
- 公休
- その他

---

## データベース構成

### コレクション一覧

| コレクション | 用途 |
|--------------|------|
| `workShifts` | シフト（予定） |
| `timeEntries` | 打刻記録（実績） |
| `overtimeRequests` | 残業申請 |
| `attendanceAuditLogs` | 監査ログ |
| `payrollExports` | CSV出力履歴 |

### workShifts（シフト）
```typescript
{
  id: string;
  tenantId: string;
  branchId: string;
  userId: string;
  employeeCode: string;
  workDate: string;        // YYYY-MM-DD
  plannedStart: string;    // HH:mm
  plannedEnd: string;      // HH:mm
  breakMinutes: number;
  shiftType: '日勤' | '早番' | '遅番' | '夜勤' | '明け' | '休日' | '有給' | '公休' | 'その他';
  source: 'manual' | 'excel' | 'ai';
  createdAt: Date;
}
```

### timeEntries（打刻記録）
```typescript
{
  id: string;
  tenantId: string;
  branchId: string;
  userId: string;
  employeeCode: string;
  workDate: string;           // YYYY-MM-DD
  clockIn?: Date;
  clockOut?: Date;
  breakStart?: Date;
  breakEnd?: Date;
  actualBreakMinutes?: number;
  totalWorkMinutes?: number;  // 自動計算
  overtimeMinutes?: number;   // 承認後のみ
  lateNightMinutes?: number;  // 22:00-05:00
  status: 'not_started' | 'working' | 'on_break' | 'completed' | 'missing_out';
  isEdited: boolean;
  editedBy?: string;
  editedByName?: string;
  editedAt?: Date;
  editReason?: string;
  createdAt: Date;
}
```

### overtimeRequests（残業申請）
```typescript
{
  id: string;
  tenantId: string;
  branchId: string;
  userId: string;
  userName: string;
  employeeCode: string;
  workDate: string;
  requestedMinutes: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
}
```

### attendanceAuditLogs（監査ログ）
```typescript
{
  id: string;
  tenantId: string;
  targetType: 'time_entry' | 'work_shift' | 'overtime_request';
  targetId: string;
  action: 'create' | 'update' | 'delete';
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  editedBy: string;
  editedByName: string;
  reason?: string;
  createdAt: Date;
}
```

---

## 運用ルール

### 日次運用
1. 従業員は勤務開始時に出勤打刻
2. 休憩時は休憩開始/終了を打刻
3. 勤務終了時に退勤打刻
4. 残業が発生した場合は残業申請

### 週次運用
1. 管理者は「退勤漏れ」ステータスを確認
2. 必要に応じて打刻を修正（理由必須）

### 月次運用
1. 月初に前月のシフトExcelを取込
2. 月末に残業申請を全て承認/却下
3. freee CSV出力して給与システムに連携

---

## トラブルシューティング

### Q: 打刻を忘れた
A: 管理者に連絡し、管理画面から修正してもらう（監査ログに記録される）

### Q: 残業申請が却下された
A: 理由を確認し、必要に応じて再申請

### Q: CSVが文字化けする
A: UTF-8 BOM付きで出力されているため、Excelで開く場合は「データ」→「テキストファイル」から開く

### Q: シフトExcelの取込でエラーが出る
A: 以下を確認:
- 従業員コードが従業員マスタに存在するか
- 日付形式がYYYY-MM-DD形式か
- 時刻形式がHH:mm形式か

---

## 技術仕様

### 時刻計算
- 全てJST（Asia/Tokyo）固定
- 1分単位で計算
- 深夜時間: 22:00-05:00

### 労働時間計算
```
総労働時間 = 退勤時刻 - 出勤時刻 - 休憩時間
```

### 深夜時間計算
```
22:00-05:00の間に勤務した時間を分単位で計算
```

---

## API関数一覧

| 関数 | 用途 |
|------|------|
| `clockIn` | 出勤打刻 |
| `clockOut` | 退勤打刻 |
| `breakStart` | 休憩開始 |
| `breakEnd` | 休憩終了 |
| `getTodayAttendanceState` | 今日の勤怠状態取得 |
| `getTimeEntriesByPeriod` | 期間指定で打刻記録取得 |
| `getTimeEntriesByUser` | ユーザーの打刻記録取得 |
| `importShifts` | シフト一括登録 |
| `createOvertimeRequest` | 残業申請作成 |
| `approveOvertimeRequest` | 残業申請承認 |
| `rejectOvertimeRequest` | 残業申請却下 |
| `editTimeEntry` | 打刻修正（管理者） |
| `getAuditLogs` | 監査ログ取得 |
| `generateFreeeCSVData` | CSV用データ生成 |
| `generateFreeeCSV` | CSV文字列生成 |
