// ======== 必須書類自動生成API ========
// POST: 入居者・従業員等の必須書類を一括生成

import { NextRequest, NextResponse } from 'next/server';
import { generateRequiredDocuments, getDocuments } from '@/lib/document';
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

    if (!ownerType || !ownerId || !actorId) {
      return NextResponse.json(
        { error: 'Missing required fields: ownerType, ownerId, actorId' },
        { status: 400 }
      );
    }

    // 対象の所有者タイプを検証
    const validOwnerTypes: DocumentOwnerType[] = ['RESIDENT', 'EMPLOYEE', 'PARTNER', 'ORG'];
    if (!validOwnerTypes.includes(ownerType)) {
      return NextResponse.json(
        { error: `Invalid ownerType. Must be one of: ${validOwnerTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // 既存書類を確認（スキップオプション）
    if (skipExisting) {
      const existingDocs = await getDocuments(tenantId, { ownerType, ownerId });
      if (existingDocs.length > 0) {
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
      ownerName || ownerId,
      tenantId,
      actorId,
      actorName || actorId
    );

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
    return NextResponse.json(
      { error: 'Failed to generate required documents', details: String(error) },
      { status: 500 }
    );
  }
}
