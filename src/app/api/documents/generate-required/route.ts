// ======== 必須書類自動生成API ========
// POST: 入居者・従業員等の必須書類を一括生成
// - 重複チェック: 同一 ownerId + docType の書類は再生成しない
// - エラー継続: 1件失敗しても他の書類は生成継続
// - Firestore安全: undefinedは絶対に渡さない

import { NextRequest, NextResponse } from 'next/server';
import { generateRequiredDocumentsWithDetails } from '@/lib/document';
import { getRequiredTemplates } from '@/data/document-templates';
import { DocumentOwnerType } from '@/types/document';
import { DEFAULT_TENANT_ID } from '@/lib/firebase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tenantId = DEFAULT_TENANT_ID,
      ownerType,
      ownerId,
      ownerName,
      actorId,
      actorName,
    } = body;

    // 必須フィールド検証
    if (!ownerType || !ownerId || !actorId) {
      console.error('[generate-required] Missing required fields:', { ownerType, ownerId, actorId });
      return NextResponse.json(
        { error: 'Missing required fields: ownerType, ownerId, actorId' },
        { status: 400 }
      );
    }

    // 対象の所有者タイプを検証
    const validOwnerTypes: DocumentOwnerType[] = ['RESIDENT', 'EMPLOYEE', 'PARTNER', 'ORG'];
    if (!validOwnerTypes.includes(ownerType)) {
      console.error('[generate-required] Invalid ownerType:', ownerType);
      return NextResponse.json(
        { error: `Invalid ownerType. Must be one of: ${validOwnerTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // テンプレート数を事前確認
    const templates = getRequiredTemplates(ownerType);
    console.log(`[generate-required] ownerType=${ownerType}, ownerId=${ownerId}, templates=${templates.length}`);

    if (templates.length === 0) {
      console.warn(`[generate-required] No templates found for ownerType=${ownerType}`);
      return NextResponse.json({
        success: true,
        message: 'No required document templates defined for this owner type',
        created: 0,
        skipped: 0,
        errors: 0,
        documents: [],
      });
    }

    // 必須書類を生成（重複チェック込み）
    const result = await generateRequiredDocumentsWithDetails(
      ownerType,
      ownerId,
      ownerName || ownerId || '',
      tenantId,
      actorId || 'system',
      actorName || actorId || 'System'
    );

    console.log(`[generate-required] Result: created=${result.created.length}, skipped=${result.skipped.length}, errors=${result.errors.length}`);

    // 結果メッセージを構築
    let message = '';
    if (result.created.length > 0) {
      message = `${result.created.length}件の書類を生成しました`;
    }
    if (result.skipped.length > 0) {
      message += message ? '。' : '';
      message += `${result.skipped.length}件は既に存在するためスキップ`;
    }
    if (result.errors.length > 0) {
      message += message ? '。' : '';
      message += `${result.errors.length}件でエラーが発生`;
    }
    if (!message) {
      message = '書類生成の処理が完了しました';
    }

    return NextResponse.json({
      success: result.errors.length === 0,
      message,
      created: result.created.length,
      skipped: result.skipped.length,
      errors: result.errors.length,
      documents: result.created.map(d => ({
        id: d.id,
        docType: d.docType,
        docTypeName: d.docTypeName,
        status: d.status,
      })),
      skippedDetails: result.skipped,
      errorDetails: result.errors,
    });
  } catch (error) {
    console.error('[generate-required] POST Error:', error);
    if (error instanceof Error) {
      console.error('[generate-required] Error stack:', error.stack);
    }
    return NextResponse.json(
      { error: 'Failed to generate required documents', details: String(error) },
      { status: 500 }
    );
  }
}
