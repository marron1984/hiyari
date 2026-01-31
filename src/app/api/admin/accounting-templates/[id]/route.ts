// ======== 仕訳テンプレート個別API ========

import { NextRequest, NextResponse } from 'next/server';
import {
  getAccountingTemplate,
  updateAccountingTemplate,
  deleteAccountingTemplate,
} from '@/lib/accounting-template';
import type { UpdateAccountingTemplateInput } from '@/types/accounting-template';

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/admin/accounting-templates/[id]
 * テンプレート取得
 */
export async function GET(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const template = await getAccountingTemplate(id);

    if (!template) {
      return NextResponse.json(
        {
          success: false,
          error: 'テンプレートが見つかりません',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      template,
    });
  } catch (error) {
    console.error('[AccountingTemplates] 取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '取得に失敗しました',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/accounting-templates/[id]
 * テンプレート更新
 */
export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const body = await request.json();

    // 存在チェック
    const existing = await getAccountingTemplate(id);
    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'テンプレートが見つかりません',
        },
        { status: 404 }
      );
    }

    const input: UpdateAccountingTemplateInput = {
      name: body.name,
      description: body.description,
      matchCondition: body.matchCondition,
      priority: body.priority,
      entries: body.entries,
      descriptionTemplate: body.descriptionTemplate,
      freeeSettings: body.freeeSettings,
      isActive: body.isActive,
    };

    await updateAccountingTemplate(id, input);

    const updated = await getAccountingTemplate(id);

    return NextResponse.json({
      success: true,
      template: updated,
    });
  } catch (error) {
    console.error('[AccountingTemplates] 更新エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '更新に失敗しました',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/accounting-templates/[id]
 * テンプレート削除
 */
export async function DELETE(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;

    // 存在チェック
    const existing = await getAccountingTemplate(id);
    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'テンプレートが見つかりません',
        },
        { status: 404 }
      );
    }

    await deleteAccountingTemplate(id);

    return NextResponse.json({
      success: true,
      message: 'テンプレートを削除しました',
    });
  } catch (error) {
    console.error('[AccountingTemplates] 削除エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '削除に失敗しました',
      },
      { status: 500 }
    );
  }
}
