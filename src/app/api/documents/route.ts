// ======== 書類一覧・作成API ========

import { NextRequest, NextResponse } from 'next/server';
import { getDocuments, createDocument } from '@/lib/document';
import { DocumentOwnerType, DocumentStatus } from '@/types/document';
import { DEFAULT_TENANT_ID } from '@/lib/firebase';

// GET: 書類一覧取得
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId') || DEFAULT_TENANT_ID;
  const ownerType = searchParams.get('ownerType') as DocumentOwnerType | null;
  const ownerId = searchParams.get('ownerId');
  const status = searchParams.get('status') as DocumentStatus | null;
  const search = searchParams.get('search');

  try {
    const documents = await getDocuments(tenantId, {
      ownerType: ownerType || undefined,
      ownerId: ownerId || undefined,
      status: status || undefined,
      search: search || undefined,
    });

    return NextResponse.json({ documents });
  } catch (error) {
    console.error('[documents] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to get documents', details: String(error) },
      { status: 500 }
    );
  }
}

// POST: 書類作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tenantId = DEFAULT_TENANT_ID,
      ownerType,
      ownerId,
      ownerName,
      docType,
      status = 'MISSING',
      dueDate,
      signedRequired = false,
      actorId,
      actorName,
    } = body;

    if (!ownerType || !ownerId || !docType || !actorId) {
      return NextResponse.json(
        { error: 'Missing required fields: ownerType, ownerId, docType, actorId' },
        { status: 400 }
      );
    }

    // undefinedではなくnullを使用（Firestoreはundefinedを許可しない）
    const document = await createDocument(
      {
        tenantId,
        ownerType,
        ownerId,
        ownerName: ownerName || null,
        docType,
        status,
        dueDate: dueDate ? new Date(dueDate) : null,
        signedRequired,
      },
      actorId,
      actorName || actorId
    );

    return NextResponse.json({ document });
  } catch (error) {
    console.error('[documents] POST Error:', error);
    return NextResponse.json(
      { error: 'Failed to create document', details: String(error) },
      { status: 500 }
    );
  }
}
