// /api/ringi/ai-analysis - 稟議のAI承認補助分析
// 承認者が稟議を確認する際にAIが過去のデータに基づく分析を提供

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import Anthropic from '@anthropic-ai/sdk';
import { buildFeaturePrompt } from '@/lib/ai-vp-persona';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await verifyIdToken(idToken);
    if (!decodedToken) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    const body = await request.json();
    const { ringiId } = body;

    if (!ringiId) {
      return NextResponse.json({ error: '稟議IDは必須です' }, { status: 400 });
    }

    const db = getAdminDb();

    // ユーザーの権限チェック（leader以上のみ）
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    if (!userData || userData.role === 'user') {
      return NextResponse.json({ error: 'AI分析の閲覧権限がありません' }, { status: 403 });
    }

    // 稟議を取得
    const ringiDoc = await db.collection('ringis').doc(ringiId).get();
    if (!ringiDoc.exists) {
      return NextResponse.json({ error: '稟議が見つかりません' }, { status: 404 });
    }
    const ringi = ringiDoc.data()!;

    // 過去の承認済み・却下済みの稟議を取得（同カテゴリ優先）
    const pastRingisSnap = await db
      .collection('ringis')
      .where('tenantId', '==', ringi.tenantId)
      .where('status', 'in', ['approved', 'rejected'])
      .limit(100)
      .get();

    const pastRingis = pastRingisSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        category: data.category,
        amount: data.amount,
        title: data.title,
        status: data.status,
        approvalComment: data.approvalComment,
        rejectionReason: data.rejectionReason,
      };
    });

    // 同カテゴリの統計を計算
    const sameCat = pastRingis.filter((r) => r.category === ringi.category);
    const sameCatApproved = sameCat.filter((r) => r.status === 'approved').length;
    const sameCatTotal = sameCat.length;
    const approvalRate = sameCatTotal > 0 ? Math.round((sameCatApproved / sameCatTotal) * 100) : 50;

    // 類似金額帯の稟議
    const sameAmountRange = pastRingis.filter((r) => {
      if (!ringi.amount || !r.amount) return false;
      const ratio = r.amount / ringi.amount;
      return ratio > 0.5 && ratio < 2.0;
    });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // APIキーがない場合はデータのみで統計を返す
      return NextResponse.json({
        success: true,
        analysis: {
          approvalRate,
          totalSimilar: sameCatTotal,
          missingInfo: [],
          cautions: [],
          referenceCases: sameCat.slice(0, 3).map((r) => ({
            id: r.id,
            title: r.title,
            status: r.status,
            amount: r.amount,
          })),
        },
      });
    }

    // AI分析を生成
    const client = new Anthropic({ apiKey });
    const systemPrompt = buildFeaturePrompt('approval_comment');

    const referenceCases = sameCat.slice(0, 5).map((r) => (
      `- [${r.status === 'approved' ? '承認' : '却下'}] ${r.title} (¥${(r.amount || 0).toLocaleString()}) ${r.approvalComment || r.rejectionReason || ''}`
    )).join('\n');

    const userPrompt = `以下の稟議について、承認判断を補助する情報を整理してください。

【稟議内容】
件名: ${ringi.title}
カテゴリ: ${ringi.category}
金額: ¥${(ringi.amount || 0).toLocaleString()}
背景: ${ringi.background || ringi.description || '記載なし'}
目的: ${ringi.purpose || '記載なし'}
期待効果: ${ringi.expectedEffect || '記載なし'}
リスク: ${ringi.risk || '記載なし'}
支払先: ${ringi.payeeName || '未記載'}
緊急度: ${ringi.urgency || '通常'}

【過去の傾向】
同カテゴリ(${ringi.category})の承認率: ${approvalRate}%（${sameCatTotal}件中${sameCatApproved}件承認）
類似金額帯の稟議: ${sameAmountRange.length}件

【参考ケース】
${referenceCases || 'なし'}

以下のJSON形式で出力してください:
{
  "missingInfo": ["不足している情報1", "不足している情報2"],
  "cautions": ["注意点1（断定禁止、可能性表現を使用）", "注意点2"],
  "suggestion": "判断の参考情報（50文字以内、断定禁止）"
}`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const rawResponse = message.content[0].type === 'text' ? message.content[0].text : '';
    let aiResult = { missingInfo: [] as string[], cautions: [] as string[], suggestion: '' };

    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        aiResult = {
          missingInfo: parsed.missingInfo || [],
          cautions: (parsed.cautions || []).slice(0, 2),
          suggestion: parsed.suggestion || '',
        };
      } catch {
        console.error('AI分析JSONパースエラー');
      }
    }

    return NextResponse.json({
      success: true,
      analysis: {
        approvalRate,
        totalSimilar: sameCatTotal,
        missingInfo: aiResult.missingInfo,
        cautions: aiResult.cautions,
        suggestion: aiResult.suggestion,
        referenceCases: sameCat.slice(0, 3).map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          amount: r.amount,
        })),
      },
    });
  } catch (error) {
    console.error('AI analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
