import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/admin/bootstrap/vacancy-from-sheets
 *
 * Google Sheets から空室データを一括インポート（一度きり）
 *
 * Body:
 * {
 *   tenantId: string,
 *   facilities: Array<{
 *     id?: string,          // 任意（省略時はnameから生成）
 *     name: string,
 *     area?: string,
 *     capacity: number,
 *     vacantCount: number,
 *     note?: string,
 *     roomNumbers?: string, // "210, 211, 303" 形式
 *   }>,
 *   dryRun?: boolean,
 * }
 *
 * 二重インポート防止:
 * _bootstrap/vacancy-import ドキュメントが存在すれば拒否
 */

interface FacilityInput {
  id?: string;
  name: string;
  area?: string;
  capacity: number;
  vacantCount: number;
  note?: string;
  roomNumbers?: string;
}

interface BootstrapRequest {
  tenantId: string;
  facilities: FacilityInput[];
  dryRun?: boolean;
}

function toDocId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9ぁ-んァ-ヶー一-龥]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function POST(request: NextRequest) {
  try {
    const body: BootstrapRequest = await request.json();
    const { tenantId, facilities, dryRun } = body;

    if (!tenantId || !facilities || !Array.isArray(facilities) || facilities.length === 0) {
      return NextResponse.json(
        { error: 'tenantId と facilities が必要です' },
        { status: 400 }
      );
    }

    const adminDb = getAdminDb();

    // 二重インポートチェック
    const flagRef = adminDb.collection('_bootstrap').doc('vacancy-import');
    const flagDoc = await flagRef.get();

    if (flagDoc.exists) {
      const flagData = flagDoc.data();
      return NextResponse.json(
        {
          error: '空室データは既にインポート済みです',
          importedAt: flagData?.importedAt?.toDate?.() || flagData?.importedAt,
          importedBy: flagData?.importedBy,
          count: flagData?.count,
        },
        { status: 409 }
      );
    }

    // バリデーション
    const errors: string[] = [];
    for (let i = 0; i < facilities.length; i++) {
      const f = facilities[i];
      if (!f.name) errors.push(`facilities[${i}]: name は必須です`);
      if (typeof f.capacity !== 'number' || f.capacity < 0) {
        errors.push(`facilities[${i}]: capacity は0以上の数値が必要です`);
      }
      if (typeof f.vacantCount !== 'number' || f.vacantCount < 0) {
        errors.push(`facilities[${i}]: vacantCount は0以上の数値が必要です`);
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: 'バリデーションエラー', details: errors }, { status: 400 });
    }

    // Dry-run: プレビューのみ
    if (dryRun) {
      const preview = facilities.map((f) => ({
        id: f.id || toDocId(f.name),
        name: f.name,
        area: f.area || '介護',
        capacity: f.capacity,
        vacantCount: f.vacantCount,
        note: f.note || f.roomNumbers || '',
      }));

      return NextResponse.json({
        mode: 'dry-run',
        count: preview.length,
        preview,
      });
    }

    // 本番実行: バッチ書き込み
    const batch = adminDb.batch();
    const results: Array<{ id: string; name: string }> = [];

    for (const f of facilities) {
      const docId = f.id || toDocId(f.name);

      // 施設ドキュメント作成
      const facilityRef = adminDb.collection('facilities').doc(docId);
      batch.set(facilityRef, {
        name: f.name,
        area: f.area || '介護',
        capacity: f.capacity,
        isActive: true,
        tenantId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      // 空室状態ドキュメント作成
      const vacancyRef = adminDb.collection('vacancyStatus').doc(docId);
      batch.set(vacancyRef, {
        facilityId: docId,
        vacantCount: f.vacantCount,
        note: f.note || f.roomNumbers || null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'bootstrap',
        updatedByName: 'Sheetsインポート',
      });

      results.push({ id: docId, name: f.name });
    }

    // 二重インポート防止フラグを書き込み
    batch.set(flagRef, {
      importedAt: FieldValue.serverTimestamp(),
      importedBy: 'api',
      count: facilities.length,
      tenantId,
    });

    await batch.commit();

    return NextResponse.json({
      mode: 'execute',
      count: results.length,
      imported: results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
