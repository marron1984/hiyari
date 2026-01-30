// ======== 必須書類自動生成API ========
// POST: 入居者・従業員等の必須書類を一括生成

import { NextRequest, NextResponse } from 'next/server';
import { generateRequiredDocuments, getDocuments } from '@/lib/document';
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
      skipExisting = true, // 既存書類がある場合はスキップ
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

    // テンプレート数を事前確認（デバッグ用）
    const templates = getRequiredTemplates(ownerType);
    console.log(`[generate-required] ownerType=${ownerType}, ownerId=${ownerId}, templates=${templates.length}`);

    if (templates.length === 0) {
      console.warn(`[generate-required] No templates found for ownerType=${ownerType}`);
      return NextResponse.json({
        success: true,
        message: 'No required document templates defined for this owner type',
        created: 0,
        existing: 0,
        documents: [],
      });
    }

    // 既存書類を確認（スキップオプション）
    if (skipExisting) {
      const existingDocs = await getDocuments(tenantId, { ownerType, ownerId });
      if (existingDocs.length > 0) {
        console.log(`[generate-required] Documents already exist: ${existingDocs.length}`);
        return NextResponse.json({
          success: true,
          message: 'Documents already exist for this owner',
          created: 0,
          existing: existingDocs.length,
          documents: [],
        });
      }
    }

    // 必須書類を生成
    const documents = await generateRequiredDocuments(
      ownerType,
      ownerId,
      ownerName || ownerId || '',
      tenantId,
      actorId,
      actorName || actorId || ''
    );

    console.log(`[generate-required] Successfully generated ${documents.length} documents`);

    return NextResponse.json({
      success: true,
      message: `Generated ${documents.length} required documents`,
      created: documents.length,
      documents: documents.map(d => ({
        id: d.id,
        docType: d.docType,
        docTypeName: d.docTypeName,
        status: d.status,
      })),
    });
  } catch (error) {
    console.error('[generate-required] POST Error:', error);
    // エラーの詳細をログに出力
    if (error instanceof Error) {
      console.error('[generate-required] Error stack:', error.stack);
    }
    return NextResponse.json(
      { error: 'Failed to generate required documents', details: String(error) },
      { status: 500 }
    );
  }
}
