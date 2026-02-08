/**
 * @jest-environment node
 */
import {
  escapeHtml,
  sanitizeString,
  sanitizeNumber,
  isValidEmail,
  isValidDocumentId,
  pickFields,
  isValidDateString,
  isValidUrl,
} from '../src/lib/sanitize';

describe('escapeHtml', () => {
  it('HTML特殊文字をエスケープする', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('アンパサンドをエスケープする', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  it('シングルクォートをエスケープする', () => {
    expect(escapeHtml("it's")).toBe('it&#x27;s');
  });

  it('安全な文字列はそのまま返す', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('sanitizeString', () => {
  it('文字列をトリムする', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  it('長さ制限を適用する', () => {
    expect(sanitizeString('abcdefghij', 5)).toBe('abcde');
  });

  it('null を null として返す', () => {
    expect(sanitizeString(null)).toBeNull();
  });

  it('undefined を null として返す', () => {
    expect(sanitizeString(undefined)).toBeNull();
  });

  it('空文字列を null として返す', () => {
    expect(sanitizeString('')).toBeNull();
    expect(sanitizeString('   ')).toBeNull();
  });

  it('非文字列を null として返す', () => {
    expect(sanitizeString(123)).toBeNull();
    expect(sanitizeString({})).toBeNull();
  });
});

describe('sanitizeNumber', () => {
  it('数値をそのまま返す', () => {
    expect(sanitizeNumber(42)).toBe(42);
  });

  it('文字列の数値をパースする', () => {
    expect(sanitizeNumber('42')).toBe(42);
  });

  it('範囲外の値を拒否する', () => {
    expect(sanitizeNumber(100, { min: 0, max: 50 })).toBeNull();
    expect(sanitizeNumber(-1, { min: 0 })).toBeNull();
  });

  it('デフォルト値を使う', () => {
    expect(sanitizeNumber(null, { defaultValue: 0 })).toBe(0);
    expect(sanitizeNumber('abc', { defaultValue: 10 })).toBe(10);
  });

  it('NaN を拒否する', () => {
    expect(sanitizeNumber('abc')).toBeNull();
    expect(sanitizeNumber(NaN)).toBeNull();
  });

  it('Infinity を拒否する', () => {
    expect(sanitizeNumber(Infinity)).toBeNull();
    expect(sanitizeNumber(-Infinity)).toBeNull();
  });
});

describe('isValidEmail', () => {
  it('有効なメールを受け入れる', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('user+tag@example.co.jp')).toBe(true);
  });

  it('無効なメールを拒否する', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('user')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('user @example.com')).toBe(false);
  });
});

describe('isValidDocumentId', () => {
  it('有効なIDを受け入れる', () => {
    expect(isValidDocumentId('abc123')).toBe(true);
    expect(isValidDocumentId('my-doc-id')).toBe(true);
    expect(isValidDocumentId('my_doc_id')).toBe(true);
  });

  it('無効なIDを拒否する', () => {
    expect(isValidDocumentId('')).toBe(false);
    expect(isValidDocumentId('a'.repeat(129))).toBe(false);
    expect(isValidDocumentId('doc id')).toBe(false);
    expect(isValidDocumentId('doc/id')).toBe(false);
    expect(isValidDocumentId('../etc/passwd')).toBe(false);
  });
});

describe('pickFields', () => {
  it('許可されたフィールドのみを返す', () => {
    const body = { name: 'test', age: 30, secret: 'hidden' };
    const result = pickFields(body, ['name', 'age']);
    expect(result).toEqual({ name: 'test', age: 30 });
    expect(result).not.toHaveProperty('secret');
  });

  it('存在しないフィールドはスキップする', () => {
    const body = { name: 'test' };
    const result = pickFields(body, ['name', 'age']);
    expect(result).toEqual({ name: 'test' });
  });
});

describe('isValidDateString', () => {
  it('有効な日付文字列を受け入れる', () => {
    expect(isValidDateString('2026-01-15')).toBe(true);
    expect(isValidDateString('2025-12-31')).toBe(true);
  });

  it('無効な形式を拒否する', () => {
    expect(isValidDateString('2026/01/15')).toBe(false);
    expect(isValidDateString('01-15-2026')).toBe(false);
    expect(isValidDateString('2026-1-5')).toBe(false);
    expect(isValidDateString('not-a-date')).toBe(false);
  });
});

describe('isValidUrl', () => {
  it('有効なURLを受け入れる', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://localhost:3000')).toBe(true);
  });

  it('無効なURLを拒否する', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
  });
});
