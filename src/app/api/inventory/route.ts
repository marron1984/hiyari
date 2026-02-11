/**
 * 備品在庫管理 API
 *
 * GET /api/inventory - 在庫一覧取得
 * POST /api/inventory - 在庫品目追加
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

const COLLECTION = 'inventory_items';

export interface InventoryItemDoc {
  id: string;
  name: string;
  category: 'consumable' | 'equipment' | 'medical' | 'office' | 'other';
  currentStock: number;
  minStock: number;
  unit: string;
  location: string;
  lastOrderedAt: string | null;
  status: 'ok' | 'low' | 'critical' | 'out_of_stock';
  tenantId: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

/** Compute status from stock levels */
function computeStatus(currentStock: number, minStock: number): InventoryItemDoc['status'] {
  if (currentStock <= 0) return 'out_of_stock';
  if (minStock > 0 && currentStock < minStock * 0.5) return 'critical';
  if (minStock > 0 && currentStock <= minStock) return 'low';
  return 'ok';
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const db = getAdminDb();
    const { searchParams } = new URL(request.url);

    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    // Filter by tenant
    query = query.where('tenantId', '==', user.tenantId);

    // Optional status filter
    const status = searchParams.get('status');
    if (status) {
      query = query.where('status', '==', status);
    }

    // Optional category filter
    const category = searchParams.get('category');
    if (category) {
      query = query.where('category', '==', category);
    }

    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const snapshot = await query.get();
    let items = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name ?? '',
        category: data.category ?? 'other',
        currentStock: data.currentStock ?? 0,
        minStock: data.minStock ?? 0,
        unit: data.unit ?? '個',
        location: data.location ?? '',
        lastOrderedAt: data.lastOrderedAt ?? null,
        status: data.status ?? 'ok',
        createdAt: data.createdAt ?? '',
        updatedAt: data.updatedAt ?? '',
      };
    });

    // Sort by status priority (out_of_stock > critical > low > ok)
    const statusOrder: Record<string, number> = {
      out_of_stock: 0,
      critical: 1,
      low: 2,
      ok: 3,
    };
    items.sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));

    const total = items.length;
    items = items.slice(offset, offset + limit);

    return NextResponse.json({ items, total });
  } catch (error) {
    console.error('inventory GET error:', error);
    return NextResponse.json(
      { error: '在庫一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const body = await request.json();

    const {
      name,
      category,
      currentStock,
      minStock,
      unit,
      location,
      lastOrderedAt,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: '品目名は必須です' },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const timestamp = new Date().toISOString();
    const stock = currentStock ?? 0;
    const min = minStock ?? 0;

    const itemData: Omit<InventoryItemDoc, 'id'> = {
      name,
      category: category ?? 'other',
      currentStock: stock,
      minStock: min,
      unit: unit ?? '個',
      location: location ?? '',
      lastOrderedAt: lastOrderedAt ?? null,
      status: computeStatus(stock, min),
      tenantId: user.tenantId,
      createdByUserId: user.uid,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const docRef = await db.collection(COLLECTION).add(itemData);

    return NextResponse.json(
      { item: { id: docRef.id, ...itemData } },
      { status: 201 }
    );
  } catch (error) {
    console.error('inventory POST error:', error);
    return NextResponse.json(
      { error: '在庫品目の追加に失敗しました' },
      { status: 500 }
    );
  }
}
