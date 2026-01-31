// ======== 仕訳テンプレート API ========

import { NextRequest, NextResponse } from 'next/server';
import {
  getAccountingTemplates,
  createAccountingTemplate,
  seedDefaultTemplates,
} from '@/lib/accounting-template';
import type { CreateAccountingTemplateInput } from '@/types/accounting-template';

/**
 * GET /api/admin/accounting-templates
 * テンプレート一覧取得
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const templates = await getAccountingTemplates({ activeOnly });

    return NextResponse.json({
      success: true,
      templates,
    });
  } catch (error) {
    console.error('[AccountingTemplates] 一覧取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '一覧取得に失敗しました',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/accounting-templates
 * テンプレート作成
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // seed コマンド
    if (body.action === 'seed') {
      await seedDefaultTemplates();
      return NextResponse.json({
        success: true,
        message: 'デフォルトテンプレートを作成しました',
      });
    }

    // 必須チェック
    if (!body.name || !body.entries || body.entries.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'テンプレート名と仕訳明細は必須です',
        },
        { status: 400 }
      );
    }

    const input: CreateAccountingTemplateInput = {
      name: body.name,
      description: body.description,
      matchCondition: body.matchCondition || {},
      priority: body.priority || 0,
      entries: body.entries,
      descriptionTemplate: body.descriptionTemplate || { template: '{date} {payeeName}への支払い' },
      freeeSettings: body.freeeSettings,
      isActive: body.isActive ?? true,
    };

    const template = await createAccountingTemplate(
      input,
      body.createdBy,
      body.createdByName
    );

    return NextResponse.json({
      success: true,
      template,
    });
  } catch (error) {
    console.error('[AccountingTemplates] 作成エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '作成に失敗しました',
      },
      { status: 500 }
    );
  }
}
