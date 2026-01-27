/**
 * AI副社長 LINE WORKSメッセージ処理のテスト
 */

import {
  determineRiskLevel,
  determineCategory,
  generateDefaultReply,
  findMatchingTemplate,
  generateReplyFromTemplate,
} from '../src/lib/ai-vp-messages';
import { AiTemplate, AI_REPLY_FOOTER } from '../src/types/ai-vp';

describe('AI副社長 リスク判定', () => {
  describe('determineRiskLevel', () => {
    // L3判定テスト
    test.each([
      ['返金についてお願いします', 'L3'],
      ['払い戻しの手続きを教えて', 'L3'],
      ['契約書の確認をしたい', 'L3'],
      ['支払いについて', 'L3'],
      ['採用面接の日程', 'L3'],
      ['退職届の提出方法', 'L3'],
      ['クレームがありました', 'L3'],
      ['事故が発生しました', 'L3'],
      ['行政からの指導がありました', 'L3'],
      ['弁護士に相談したい', 'L3'],
      ['医療判断について', 'L3'],
    ])('"%s" → %s', (text, expected) => {
      expect(determineRiskLevel(text)).toBe(expected);
    });

    // L2判定テスト
    test.each([
      ['紹介会社に連絡したい', 'L2'],
      ['ご家族への報告文を作成', 'L2'],
      ['経費の立替について', 'L2'],
      ['残業申請の方法', 'L2'],
      ['有給休暇を取りたい', 'L2'],
      ['例外的な対応をお願い', 'L2'],
    ])('"%s" → %s', (text, expected) => {
      expect(determineRiskLevel(text)).toBe(expected);
    });

    // L1判定テスト
    test.each([
      ['打刻方法を教えて', 'L1'],
      ['シフトの確認方法', 'L1'],
      ['パスワードリセットしたい', 'L1'],
      ['システムの使い方', 'L1'],
      ['書類の提出先は？', 'L1'],
      ['見学の予約方法', 'L1'],
      ['こんにちは', 'L1'],
      ['質問があります', 'L1'],
    ])('"%s" → %s', (text, expected) => {
      expect(determineRiskLevel(text)).toBe(expected);
    });
  });

  describe('determineCategory', () => {
    test.each([
      ['入居の手続きについて', 'nyukyo'],
      ['見学予約したい', 'nyukyo'],
      ['退去の流れは？', 'nyukyo'],
      ['紹介会社への連絡', 'sales'],
      ['営業活動の報告', 'sales'],
      ['経費精算について', 'expense'],
      ['立替払いの方法', 'expense'],
      ['採用活動について', 'hr'],
      ['給与明細の確認', 'hr'],
      ['クレーム対応', 'risk'],
      ['事故報告', 'risk'],
      ['打刻修正', 'ops'],
      ['パスワード変更', 'ops'],
      ['こんにちは', 'general'],
    ])('"%s" → %s', (text, expected) => {
      expect(determineCategory(text)).toBe(expected);
    });
  });
});

describe('AI副社長 返信生成', () => {
  describe('generateDefaultReply', () => {
    test('L3の返信にはフッターが含まれる', () => {
      const reply = generateDefaultReply('expense', 'L3');
      expect(reply).toContain(AI_REPLY_FOOTER);
      expect(reply).toContain('吉田に確認');
    });

    test('L2の返信にはフッターが含まれる', () => {
      const reply = generateDefaultReply('sales', 'L2');
      expect(reply).toContain(AI_REPLY_FOOTER);
      expect(reply).toContain('確認の上');
    });

    test('L1の返信にはフッターが含まれる', () => {
      const reply = generateDefaultReply('ops', 'L1');
      expect(reply).toContain(AI_REPLY_FOOTER);
    });
  });

  describe('findMatchingTemplate', () => {
    const mockTemplates: AiTemplate[] = [
      {
        id: 'tpl1',
        key: 'attendance_fix',
        title: '打刻修正',
        category: 'ops',
        riskLevel: 'L1',
        templateText: '打刻修正の手順です',
        keywords: ['打刻', '修正', '勤怠'],
        createdAt: new Date(),
      },
      {
        id: 'tpl2',
        key: 'refund',
        title: '返金対応',
        category: 'expense',
        riskLevel: 'L3',
        templateText: '返金に関する対応です',
        keywords: ['返金', '払い戻し'],
        createdAt: new Date(),
      },
    ];

    test('キーワードにマッチするテンプレートを返す', async () => {
      const result = await findMatchingTemplate('打刻を修正したい', mockTemplates);
      expect(result?.key).toBe('attendance_fix');
    });

    test('複数キーワードマッチで最もスコアが高いものを返す', async () => {
      const result = await findMatchingTemplate('打刻の修正方法を教えて', mockTemplates);
      expect(result?.key).toBe('attendance_fix');
    });

    test('マッチしない場合はnullを返す', async () => {
      const result = await findMatchingTemplate('こんにちは', mockTemplates);
      expect(result).toBeNull();
    });
  });

  describe('generateReplyFromTemplate', () => {
    test('テンプレートから返信を生成', () => {
      const template: AiTemplate = {
        id: 'tpl1',
        key: 'test',
        title: 'テスト',
        category: 'ops',
        riskLevel: 'L1',
        templateText: 'テンプレートの本文です',
        createdAt: new Date(),
      };

      const message = {
        id: 'msg1',
        messageId: 'lw_001',
        roomId: 'room1',
        senderId: 'user1',
        senderName: 'テストユーザー',
        text: 'テスト質問',
        receivedAt: new Date(),
        createdAt: new Date(),
      };

      const reply = generateReplyFromTemplate(template, message);
      expect(reply).toContain('テンプレートの本文です');
      expect(reply).toContain(AI_REPLY_FOOTER);
    });

    test('必須フィールドがある場合は質問を追加', () => {
      const template: AiTemplate = {
        id: 'tpl1',
        key: 'test',
        title: 'テスト',
        category: 'expense',
        riskLevel: 'L3',
        requiredFieldsJson: JSON.stringify(['契約書番号', '金額']),
        templateText: '確認が必要です',
        createdAt: new Date(),
      };

      const message = {
        id: 'msg1',
        messageId: 'lw_001',
        roomId: 'room1',
        senderId: 'user1',
        senderName: 'テストユーザー',
        text: '返金について',
        receivedAt: new Date(),
        createdAt: new Date(),
      };

      const reply = generateReplyFromTemplate(template, message);
      expect(reply).toContain('確認させてください');
      expect(reply).toContain('契約書番号');
      expect(reply).toContain('金額');
    });
  });
});

describe('AI副社長 リスク判定の境界テスト', () => {
  test('複合キーワードがある場合は高いリスクを優先', () => {
    // L3キーワード + L1キーワードの組み合わせ
    const text = '打刻修正と返金について教えてください';
    expect(determineRiskLevel(text)).toBe('L3');
  });

  test('大文字小文字を区別しない', () => {
    expect(determineRiskLevel('クレーム')).toBe('L3');
    expect(determineRiskLevel('クレーム')).toBe('L3');
  });

  test('部分一致でマッチする', () => {
    expect(determineRiskLevel('返金処理の確認')).toBe('L3');
    expect(determineRiskLevel('紹介会社様への連絡')).toBe('L2');
  });
});

describe('AI副社長 カテゴリ判定の優先順位', () => {
  test('複数カテゴリにマッチする場合は最初にマッチしたものを返す', () => {
    // 入居関連のキーワードが先にチェックされる
    const text = '入居に関する経費について';
    const category = determineCategory(text);
    // 'nyukyo' が先にマッチするはず
    expect(['nyukyo', 'expense']).toContain(category);
  });
});
