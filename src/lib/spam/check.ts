/**
 * スパムチェック関数
 *
 * Ticket 077: 迷惑フィルタ（NGワード/連投/ブラックリスト）
 *
 * checkSpam(payload, context) -> { ok, action, reason }
 */

import type {
  SpamCheckResult,
  SpamCheckContext,
  SpamCheckPayload,
} from './types';
import {
  IP_RATE_LIMIT,
  EMAIL_RATE_LIMIT,
  PHONE_RATE_LIMIT,
} from './types';
import {
  listRules,
  isBlocked,
  checkRateLimit,
  logSpamEvent,
  seedSpamRulesIfEmpty,
  hashEmail,
  hashPhone,
  hashValue,
  maskIp,
  hashUserAgent,
} from './repo';

// ========== ペイロードヒント生成 ==========

function generatePayloadHint(payload: SpamCheckPayload): string {
  const parts: string[] = [];
  if (payload.name) parts.push(`name:${payload.name.slice(0, 10)}`);
  if (payload.email) parts.push(`email:***`);
  if (payload.phone) parts.push(`phone:***`);
  if (payload.memo) parts.push(`memo:${payload.memo.slice(0, 20)}`);
  return parts.join(', ').slice(0, 100);
}

// ========== メインチェック関数 ==========

/**
 * スパムチェックを実行
 *
 * @param payload チェック対象のペイロード
 * @param context リクエストコンテキスト（IP、UserAgent、path）
 * @returns チェック結果
 */
export function checkSpam(
  payload: SpamCheckPayload,
  context: SpamCheckContext
): SpamCheckResult {
  // シードデータ確認
  seedSpamRulesIfEmpty();

  const ipHint = maskIp(context.ip);
  const userAgentHash = hashUserAgent(context.userAgent);
  const emailHash = payload.email ? hashEmail(payload.email) : null;
  const phoneHash = payload.phone ? hashPhone(payload.phone) : null;
  const payloadHint = generatePayloadHint(payload);

  // ========== 1. ブロックリストチェック ==========

  // IPブロックリスト
  if (context.ip) {
    const ipBlock = isBlocked('ip', context.ip);
    if (ipBlock.blocked) {
      logSpamEvent({
        action: 'block',
        reason: `Blocklist: IP (${ipBlock.entry?.reason})`,
        ipHint,
        userAgentHash,
        emailHash,
        phoneHash,
        payloadHint,
        path: context.path,
        ruleId: null,
      });
      return {
        ok: false,
        action: 'block',
        reason: 'アクセスが制限されています',
        ruleId: null,
      };
    }
  }

  // メールブロックリスト
  if (payload.email) {
    const emailBlock = isBlocked('email', payload.email);
    if (emailBlock.blocked) {
      logSpamEvent({
        action: 'block',
        reason: `Blocklist: Email (${emailBlock.entry?.reason})`,
        ipHint,
        userAgentHash,
        emailHash,
        phoneHash,
        payloadHint,
        path: context.path,
        ruleId: null,
      });
      return {
        ok: false,
        action: 'block',
        reason: 'このメールアドレスからの問い合わせは受け付けておりません',
        ruleId: null,
      };
    }
  }

  // 電話ブロックリスト
  if (payload.phone) {
    const phoneBlock = isBlocked('phone', payload.phone);
    if (phoneBlock.blocked) {
      logSpamEvent({
        action: 'block',
        reason: `Blocklist: Phone (${phoneBlock.entry?.reason})`,
        ipHint,
        userAgentHash,
        emailHash,
        phoneHash,
        payloadHint,
        path: context.path,
        ruleId: null,
      });
      return {
        ok: false,
        action: 'block',
        reason: 'この電話番号からの問い合わせは受け付けておりません',
        ruleId: null,
      };
    }
  }

  // refブロックリスト
  if (payload.ref) {
    const refBlock = isBlocked('ref', payload.ref);
    if (refBlock.blocked) {
      logSpamEvent({
        action: 'block',
        reason: `Blocklist: Ref (${refBlock.entry?.reason})`,
        ipHint,
        userAgentHash,
        emailHash,
        phoneHash,
        payloadHint,
        path: context.path,
        ruleId: null,
      });
      return {
        ok: false,
        action: 'block',
        reason: '無効な紹介コードです',
        ruleId: null,
      };
    }
  }

  // ========== 2. レートリミットチェック ==========

  // IPレートリミット
  if (context.ip) {
    const ipKey = `rate:ip:${hashValue(context.ip)}`;
    const ipRate = checkRateLimit(ipKey, IP_RATE_LIMIT.windowMs, IP_RATE_LIMIT.maxRequests);
    if (!ipRate.allowed) {
      logSpamEvent({
        action: 'throttle',
        reason: `Rate limit: IP (${ipRate.count}/${IP_RATE_LIMIT.maxRequests})`,
        ipHint,
        userAgentHash,
        emailHash,
        phoneHash,
        payloadHint,
        path: context.path,
        ruleId: null,
      });
      return {
        ok: false,
        action: 'throttle',
        reason: '連続送信を制限しています。しばらく時間をおいてからお試しください。',
        ruleId: null,
      };
    }
  }

  // メールレートリミット
  if (payload.email) {
    const emailKey = `rate:email:${hashEmail(payload.email)}`;
    const emailRate = checkRateLimit(emailKey, EMAIL_RATE_LIMIT.windowMs, EMAIL_RATE_LIMIT.maxRequests);
    if (!emailRate.allowed) {
      logSpamEvent({
        action: 'throttle',
        reason: `Rate limit: Email (${emailRate.count}/${EMAIL_RATE_LIMIT.maxRequests})`,
        ipHint,
        userAgentHash,
        emailHash,
        phoneHash,
        payloadHint,
        path: context.path,
        ruleId: null,
      });
      return {
        ok: false,
        action: 'throttle',
        reason: 'このメールアドレスからの送信が一時的に制限されています。',
        ruleId: null,
      };
    }
  }

  // 電話レートリミット
  if (payload.phone) {
    const phoneKey = `rate:phone:${hashPhone(payload.phone)}`;
    const phoneRate = checkRateLimit(phoneKey, PHONE_RATE_LIMIT.windowMs, PHONE_RATE_LIMIT.maxRequests);
    if (!phoneRate.allowed) {
      logSpamEvent({
        action: 'throttle',
        reason: `Rate limit: Phone (${phoneRate.count}/${PHONE_RATE_LIMIT.maxRequests})`,
        ipHint,
        userAgentHash,
        emailHash,
        phoneHash,
        payloadHint,
        path: context.path,
        ruleId: null,
      });
      return {
        ok: false,
        action: 'throttle',
        reason: 'この電話番号からの送信が一時的に制限されています。',
        ruleId: null,
      };
    }
  }

  // ========== 3. NGワード/正規表現チェック ==========

  const rules = listRules(true); // 有効なルールのみ

  // チェック対象フィールドを結合
  const textToCheck = [
    payload.name ?? '',
    payload.memo ?? '',
    payload.conditions ?? '',
  ].join(' ');

  for (const rule of rules) {
    let matched = false;

    if (rule.type === 'ng_word') {
      // 単純な部分一致
      matched = textToCheck.toLowerCase().includes(rule.pattern.toLowerCase());
    } else if (rule.type === 'regex') {
      // 正規表現マッチ
      try {
        const regex = new RegExp(rule.pattern, 'i');
        matched = regex.test(textToCheck);
      } catch {
        // 無効な正規表現は無視
        console.warn(`[Spam] Invalid regex: ${rule.pattern}`);
      }
    }

    if (matched) {
      const action = rule.severity === 'block' ? 'block' : 'warn';

      logSpamEvent({
        action,
        reason: `Rule matched: ${rule.type}:${rule.pattern}`,
        ipHint,
        userAgentHash,
        emailHash,
        phoneHash,
        payloadHint,
        path: context.path,
        ruleId: rule.id,
      });

      if (rule.severity === 'block') {
        return {
          ok: false,
          action: 'block',
          reason: '不適切な内容が含まれています',
          ruleId: rule.id,
        };
      }

      // warn の場合は通すが、警告を記録（最初のwarnで返す）
      // 複数のwarnがあっても1つ目で判定
      return {
        ok: true, // 通す
        action: 'warn',
        reason: `Warning: ${rule.description || rule.pattern}`,
        ruleId: rule.id,
      };
    }
  }

  // ========== 4. すべてOK ==========

  return {
    ok: true,
    action: 'allow',
    reason: null,
    ruleId: null,
  };
}

/**
 * verify用の軽量チェック（IPレートリミットのみ）
 */
export function checkSpamForVerify(context: SpamCheckContext): SpamCheckResult {
  seedSpamRulesIfEmpty();

  const ipHint = maskIp(context.ip);
  const userAgentHash = hashUserAgent(context.userAgent);

  // IPブロックリスト
  if (context.ip) {
    const ipBlock = isBlocked('ip', context.ip);
    if (ipBlock.blocked) {
      logSpamEvent({
        action: 'block',
        reason: `Blocklist: IP (${ipBlock.entry?.reason})`,
        ipHint,
        userAgentHash,
        emailHash: null,
        phoneHash: null,
        payloadHint: null,
        path: context.path,
        ruleId: null,
      });
      return {
        ok: false,
        action: 'block',
        reason: 'アクセスが制限されています',
        ruleId: null,
      };
    }
  }

  // verify用のIPレートリミット（10分で10回、より緩め）
  if (context.ip) {
    const ipKey = `rate:verify:ip:${hashValue(context.ip)}`;
    const ipRate = checkRateLimit(ipKey, 10 * 60 * 1000, 10);
    if (!ipRate.allowed) {
      logSpamEvent({
        action: 'throttle',
        reason: `Rate limit: Verify IP (${ipRate.count}/10)`,
        ipHint,
        userAgentHash,
        emailHash: null,
        phoneHash: null,
        payloadHint: null,
        path: context.path,
        ruleId: null,
      });
      return {
        ok: false,
        action: 'throttle',
        reason: '確認リクエストが一時的に制限されています。',
        ruleId: null,
      };
    }
  }

  return {
    ok: true,
    action: 'allow',
    reason: null,
    ruleId: null,
  };
}
