/**
 * 書類管理 Firestore正規化のUnit test
 *
 * テスト対象:
 * 1. normalizeForFirestore: undefinedをFirestoreに渡さない
 * 2. ネストされたオブジェクトの正規化
 * 3. 配列内のundefinedの除去
 */

import { normalizeForFirestore } from '@/lib/document';

describe('normalizeForFirestore', () => {
  test('undefinedフィールドを除去する', () => {
    const input = {
      name: 'テスト',
      note: undefined,
      status: 'MISSING',
    };

    const result = normalizeForFirestore(input);

    expect(result).toEqual({
      name: 'テスト',
      status: 'MISSING',
    });
    expect('note' in result).toBe(false);
  });

  test('nullは保持する', () => {
    const input = {
      name: 'テスト',
      note: null,
      dueDate: null,
    };

    const result = normalizeForFirestore(input);

    expect(result).toEqual({
      name: 'テスト',
      note: null,
      dueDate: null,
    });
  });

  test('空文字は保持する', () => {
    const input = {
      name: 'テスト',
      note: '',
    };

    const result = normalizeForFirestore(input);

    expect(result).toEqual({
      name: 'テスト',
      note: '',
    });
  });

  test('0は保持する', () => {
    const input = {
      count: 0,
      version: 1,
    };

    const result = normalizeForFirestore(input);

    expect(result).toEqual({
      count: 0,
      version: 1,
    });
  });

  test('falseは保持する', () => {
    const input = {
      required: false,
      active: true,
    };

    const result = normalizeForFirestore(input);

    expect(result).toEqual({
      required: false,
      active: true,
    });
  });

  test('ネストされたオブジェクトのundefinedも除去する', () => {
    const input = {
      name: 'テスト',
      metadata: {
        key: 'value',
        optional: undefined,
        nested: {
          a: 1,
          b: undefined,
        },
      },
    };

    const result = normalizeForFirestore(input);

    expect(result).toEqual({
      name: 'テスト',
      metadata: {
        key: 'value',
        nested: {
          a: 1,
        },
      },
    });
  });

  test('配列内のundefinedを除去する', () => {
    const input = {
      tags: ['a', undefined, 'b', undefined, 'c'],
    };

    const result = normalizeForFirestore(input);

    expect(result).toEqual({
      tags: ['a', 'b', 'c'],
    });
  });

  test('配列内のオブジェクトのundefinedも除去する', () => {
    const input = {
      items: [
        { id: 1, note: undefined },
        { id: 2, note: 'test' },
      ],
    };

    const result = normalizeForFirestore(input);

    expect(result).toEqual({
      items: [
        { id: 1 },
        { id: 2, note: 'test' },
      ],
    });
  });

  test('Dateオブジェクトは保持する', () => {
    const date = new Date('2026-01-15T00:00:00Z');
    const input = {
      createdAt: date,
      name: 'テスト',
    };

    const result = normalizeForFirestore(input);

    expect(result.createdAt).toBe(date);
    expect(result.name).toBe('テスト');
  });

  test('空オブジェクトは空オブジェクトを返す', () => {
    const result = normalizeForFirestore({});
    expect(result).toEqual({});
  });

  test('全てundefinedの場合は空オブジェクトを返す', () => {
    const input = {
      a: undefined,
      b: undefined,
      c: undefined,
    };

    const result = normalizeForFirestore(input);

    expect(result).toEqual({});
  });
});

describe('書類自動生成のペイロード正規化', () => {
  test('書類生成時の典型的なペイロードを正規化', () => {
    const input = {
      tenantId: 'tenant1',
      ownerType: 'RESIDENT',
      ownerId: 'prospect123',
      ownerName: '山田太郎',
      docType: 'RESIDENT_CONTRACT',
      docTypeName: '入居契約書',
      status: 'MISSING',
      dueDate: undefined,
      signedRequired: true,
      note: undefined,
      fileUrl: undefined,
    };

    const result = normalizeForFirestore(input);

    expect(result).toEqual({
      tenantId: 'tenant1',
      ownerType: 'RESIDENT',
      ownerId: 'prospect123',
      ownerName: '山田太郎',
      docType: 'RESIDENT_CONTRACT',
      docTypeName: '入居契約書',
      status: 'MISSING',
      signedRequired: true,
    });

    // undefinedフィールドが除去されていることを確認
    expect('dueDate' in result).toBe(false);
    expect('note' in result).toBe(false);
    expect('fileUrl' in result).toBe(false);
  });

  test('APIからnullが渡された場合は保持する', () => {
    const input = {
      tenantId: 'tenant1',
      ownerType: 'RESIDENT',
      ownerId: 'prospect123',
      ownerName: null,  // APIがnullを明示的に渡す場合
      docType: 'RESIDENT_CONTRACT',
      status: 'MISSING',
      dueDate: null,    // 期限なし
      signedRequired: false,
    };

    const result = normalizeForFirestore(input);

    expect(result).toEqual({
      tenantId: 'tenant1',
      ownerType: 'RESIDENT',
      ownerId: 'prospect123',
      ownerName: null,
      docType: 'RESIDENT_CONTRACT',
      status: 'MISSING',
      dueDate: null,
      signedRequired: false,
    });
  });
});

describe('イベント記録のJSON正規化', () => {
  test('prevJson/nextJsonのundefinedをnullに変換', () => {
    const sanitizeForJson = (obj: unknown): unknown => {
      if (obj === null || obj === undefined) return null;
      return JSON.parse(JSON.stringify(obj, (_, v) => v === undefined ? null : v));
    };

    expect(sanitizeForJson(undefined)).toBe(null);
    expect(sanitizeForJson(null)).toBe(null);
    expect(sanitizeForJson({ a: 1, b: undefined })).toEqual({ a: 1, b: null });
  });
});
