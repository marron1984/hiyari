// ======== AI副社長 型定義 ========

import { z } from 'zod';

// ======== ソース種別 ========

export type IngestionSourceType = 'audio' | 'pdf' | 'text' | 'lineworks' | 'spreadsheet';

export const INGESTION_SOURCE_LABELS: Record<IngestionSourceType, string> = {
  audio: '音声文字起こし',
  pdf: 'PDF',
  text: 'テキスト',
  lineworks: 'LINE WORKS',
  spreadsheet: 'スプレッドシート',
};

// ======== 取り込み（Ingestion） ========

export interface AiVpIngestion {
  id: string;
  tenantId: string;
  sourceType: IngestionSourceType;
  sourceMeta: {
    filename?: string;
    driveFileId?: string;
    lineworksRoomId?: string;
    spreadsheetId?: string;
    url?: string;
  };
  rawText: string;
  createdByUserId: string;
  createdByUserName: string;
  createdAt: Date;
}

// ======== 抽出ステータス ========

export type ExtractionStatus = 'draft' | 'confirmed' | 'exported' | 'failed';

export const EXTRACTION_STATUS_LABELS: Record<ExtractionStatus, string> = {
  draft: '下書き',
  confirmed: '確定済み',
  exported: '実行済み',
  failed: '失敗',
};

// ======== 緊急度・重要度（AI抽出用）========

export type AiVpUrgencyLevel = 'high' | 'mid' | 'low';
export type AiVpImportanceLevel = 'high' | 'mid' | 'low';

export const AI_VP_URGENCY_LABELS: Record<AiVpUrgencyLevel, string> = {
  high: '高',
  mid: '中',
  low: '低',
};

export const AI_VP_IMPORTANCE_LABELS: Record<AiVpImportanceLevel, string> = {
  high: '高',
  mid: '中',
  low: '低',
};

// ======== タスクカテゴリ ========

export type TaskCategory =
  | 'inquiry'      // 問い合わせ
  | 'resident'     // 入居者
  | 'ringi'        // 稟議
  | 'hiyarihat'    // ヒヤリハット
  | 'kaizen'       // 改善アイデア
  | 'attendance'   // 出退勤
  | 'other';       // その他

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  inquiry: '問い合わせ',
  resident: '入居者',
  ringi: '稟議',
  hiyarihat: 'ヒヤリハット',
  kaizen: '改善アイデア',
  attendance: '出退勤',
  other: 'その他',
};

// ======== 抽出されたタスク ========

export interface ExtractedTask {
  title: string;
  background?: string;
  ownerName?: string;
  ownerType?: 'staff' | 'manager' | 'unknown';
  dueDate?: string;      // ISO日付
  urgency: AiVpUrgencyLevel;
  importance: AiVpImportanceLevel;
  category: TaskCategory;
  recommendedNextAction?: string;
  relatedEntities?: Array<{
    type: string;
    id?: string;
    name: string;
  }>;
  confidence: number;    // 0-1
}

// ======== 抽出されたエンティティ ========

export interface ExtractedEntity {
  type: 'resident' | 'staff' | 'facility' | 'room' | 'phone' | 'email' | 'company' | 'other';
  value: string;
  normalizedValue?: string;
  confidence: number;
}

// ======== 提案レコード ========

export interface ProposedInquiry {
  customerName?: string;
  age?: number;
  gender?: string;
  careLevel?: string;
  budget?: string;
  currentSituation?: string;
  desiredFacility?: string;
  tourRequestDate?: string;
  salesCompanyName?: string;
  salesRepName?: string;
  otherNotes?: string;
  confidence: number;
}

export interface ProposedResidentUpdate {
  residentId?: string;
  residentName?: string;
  updateFields: Record<string, unknown>;
  reason?: string;
  confidence: number;
}

export interface ProposedRingi {
  title: string;
  category: string;
  body: string;
  amount?: number;
  confidence: number;
}

export interface ProposedHiyarihat {
  date: string;
  timeSlot: string;
  category: string;
  severity: number;
  body: string;
  action?: string;
  prevention?: string;
  confidence: number;
}

export interface ProposedKaizen {
  title: string;
  body: string;
  category?: string;
  confidence: number;
}

export interface ProposedLineWorksAlert {
  groupId?: string;
  message: string;
  urgency: AiVpUrgencyLevel;
}

export interface ProposedSheetRow {
  sheetId?: string;
  sheetName?: string;
  rowData: Record<string, unknown>;
}

// ======== 抽出JSON全体構造 ========

export interface ExtractedJson {
  tasks: ExtractedTask[];
  entities: ExtractedEntity[];
  proposedRecords: {
    inquiries: ProposedInquiry[];
    residentsUpdates: ProposedResidentUpdate[];
    ringi: ProposedRingi[];
    hiyarihat: ProposedHiyarihat[];
    kaizen: ProposedKaizen[];
  };
  alerts: {
    lineworks: ProposedLineWorksAlert[];
    spreadsheet: ProposedSheetRow[];
  };
}

// ======== 抽出（Extraction） ========

export interface AiVpExtraction {
  id: string;
  tenantId: string;
  ingestionId: string;
  extractionVersion: number;
  status: ExtractionStatus;
  modelMeta: {
    modelName: string;
    promptHash: string;
    tokenUsage?: {
      input: number;
      output: number;
    };
  };
  extractedJson: ExtractedJson;
  summaryText: string;
  errorText?: string;
  createdAt: Date;
  updatedAt?: Date;
}

// ======== アクション種別 ========

export type ActionType =
  | 'create_inquiry'
  | 'update_resident'
  | 'create_ringi'
  | 'create_hiyarihat'
  | 'create_kaizen'
  | 'notify_lineworks'
  | 'export_sheet';

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  create_inquiry: '入居希望者作成',
  update_resident: '入居情報更新',
  create_ringi: '稟議起票',
  create_hiyarihat: 'ヒヤリハット登録',
  create_kaizen: '改善アイデア登録',
  notify_lineworks: 'LINE WORKS通知',
  export_sheet: 'シート書き込み',
};

// ======== アクションステータス ========

export type ActionStatus = 'queued' | 'done' | 'failed';

// ======== アクション（Action） ========

export interface AiVpAction {
  id: string;
  tenantId: string;
  extractionId: string;
  actionType: ActionType;
  targetEntityType?: string;
  targetEntityId?: string;
  payload: Record<string, unknown>;
  status: ActionStatus;
  executedAt?: Date;
  errorText?: string;
  createdAt: Date;
}

// ======== 監査ログ ========

export type AiVpAuditEventType =
  | 'ingestion_created'
  | 'extraction_started'
  | 'extraction_completed'
  | 'extraction_failed'
  | 'extraction_confirmed'
  | 'action_executed'
  | 'action_failed';

export interface AiVpAuditLog {
  id: string;
  tenantId: string;
  actorUserId: string;
  actorUserName: string;
  eventType: AiVpAuditEventType;
  eventMeta: Record<string, unknown>;
  createdAt: Date;
}

// ======== 設定 ========

export interface AiVpSettings {
  lineWorksGroupId?: string;
  sheetsIntegrationMode: 'direct' | 'webhook' | 'disabled';
  sheetsConfig?: {
    spreadsheetId: string;
    sheetName: string;
    startRow: number;
  };
  notificationDaysBefore: number;
  autoExecuteEnabled: boolean;
}

// ======== Zodスキーマ ========

export const ExtractedTaskSchema = z.object({
  title: z.string(),
  background: z.string().optional(),
  ownerName: z.string().optional(),
  ownerType: z.enum(['staff', 'manager', 'unknown']).optional(),
  dueDate: z.string().optional(),
  urgency: z.enum(['high', 'mid', 'low']),
  importance: z.enum(['high', 'mid', 'low']),
  category: z.enum(['inquiry', 'resident', 'ringi', 'hiyarihat', 'kaizen', 'attendance', 'other']),
  recommendedNextAction: z.string().optional(),
  relatedEntities: z.array(z.object({
    type: z.string(),
    id: z.string().optional(),
    name: z.string(),
  })).optional(),
  confidence: z.number().min(0).max(1),
});

export const ExtractedEntitySchema = z.object({
  type: z.enum(['resident', 'staff', 'facility', 'room', 'phone', 'email', 'company', 'other']),
  value: z.string(),
  normalizedValue: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export const ProposedInquirySchema = z.object({
  customerName: z.string().optional(),
  age: z.number().optional(),
  gender: z.string().optional(),
  careLevel: z.string().optional(),
  budget: z.string().optional(),
  currentSituation: z.string().optional(),
  desiredFacility: z.string().optional(),
  tourRequestDate: z.string().optional(),
  salesCompanyName: z.string().optional(),
  salesRepName: z.string().optional(),
  otherNotes: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export const ExtractedJsonSchema = z.object({
  tasks: z.array(ExtractedTaskSchema),
  entities: z.array(ExtractedEntitySchema),
  proposedRecords: z.object({
    inquiries: z.array(ProposedInquirySchema),
    residentsUpdates: z.array(z.object({
      residentId: z.string().optional(),
      residentName: z.string().optional(),
      updateFields: z.record(z.string(), z.unknown()),
      reason: z.string().optional(),
      confidence: z.number().min(0).max(1),
    })),
    ringi: z.array(z.object({
      title: z.string(),
      category: z.string(),
      body: z.string(),
      amount: z.number().optional(),
      confidence: z.number().min(0).max(1),
    })),
    hiyarihat: z.array(z.object({
      date: z.string(),
      timeSlot: z.string(),
      category: z.string(),
      severity: z.number(),
      body: z.string(),
      action: z.string().optional(),
      prevention: z.string().optional(),
      confidence: z.number().min(0).max(1),
    })),
    kaizen: z.array(z.object({
      title: z.string(),
      body: z.string(),
      category: z.string().optional(),
      confidence: z.number().min(0).max(1),
    })),
  }),
  alerts: z.object({
    lineworks: z.array(z.object({
      groupId: z.string().optional(),
      message: z.string(),
      urgency: z.enum(['high', 'mid', 'low']),
    })),
    spreadsheet: z.array(z.object({
      sheetId: z.string().optional(),
      sheetName: z.string().optional(),
      rowData: z.record(z.string(), z.unknown()),
    })),
  }),
});

// ======== デフォルト値 ========

export const DEFAULT_EXTRACTED_JSON: ExtractedJson = {
  tasks: [],
  entities: [],
  proposedRecords: {
    inquiries: [],
    residentsUpdates: [],
    ringi: [],
    hiyarihat: [],
    kaizen: [],
  },
  alerts: {
    lineworks: [],
    spreadsheet: [],
  },
};

export const DEFAULT_AI_VP_SETTINGS: AiVpSettings = {
  sheetsIntegrationMode: 'disabled',
  notificationDaysBefore: 3,
  autoExecuteEnabled: false,
};

// ======== AI副社長オーナー判定 ========

// 吉田のメールアドレス（AI副社長の唯一のオーナー）
export const AI_VP_OWNER_EMAIL = 'yoshida@aska-g.com';

/**
 * AI副社長オーナーかどうかを判定
 */
export function isAiVpOwner(email?: string): boolean {
  return email === AI_VP_OWNER_EMAIL;
}
