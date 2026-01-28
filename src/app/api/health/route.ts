import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { isLineWorksConfigured } from '@/lib/lineworks';

/**
 * ヘルスチェックエンドポイント
 * GET /api/health
 *
 * サーバーの状態を確認し、問題箇所を特定するために使用
 */

// 必須環境変数のリスト
const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
];

// 本番環境で追加で必要な環境変数
const PRODUCTION_ENV_VARS = [
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
];

interface ExternalIntegration {
  status: 'enabled' | 'dry-run' | 'disabled';
  configured: boolean;
}

interface FeatureFlag {
  enabled: boolean;
}

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  time: string;
  app_env: string;
  commit_sha: string | null;
  auth_health: {
    status: 'OK' | 'NG';
    reason?: string;
  };
  db_health: {
    status: 'OK' | 'NG';
    reason?: string;
    latency_ms?: number;
  };
  external_integrations: {
    lineworks: ExternalIntegration;
    freee: ExternalIntegration;
    google_sheets: ExternalIntegration;
  };
  feature_flags: {
    FEATURE_APPROVALS_V2: FeatureFlag;
    FEATURE_AI_VP: FeatureFlag;
    FEATURE_DOCS: FeatureFlag;
    FEATURE_NYUKYO_LOCK: FeatureFlag;
  };
  env_missing: string[];
  checks: {
    firebase_config: boolean;
    server_time: boolean;
  };
}

// 環境に応じた外部送信の状態を判定
function getExternalSendStatus(isConfigured: boolean): 'enabled' | 'dry-run' | 'disabled' {
  if (!isConfigured) {
    return 'disabled';
  }

  const appEnv = process.env.APP_ENV || process.env.VERCEL_ENV || 'development';
  const isProduction = appEnv === 'production';
  const externalSendEnabled = process.env.EXTERNAL_SEND_ENABLED === 'true';

  // Productionかつ EXTERNAL_SEND_ENABLED=true の場合のみ enabled
  if (isProduction && externalSendEnabled) {
    return 'enabled';
  }

  // 設定はあるがdry-run
  return 'dry-run';
}

// Feature flagのチェック
function getFeatureFlag(envVarName: string): FeatureFlag {
  const value = process.env[envVarName];
  return {
    enabled: value === 'true' || value === '1',
  };
}

export async function GET() {
  const startTime = Date.now();

  // 環境変数チェック
  const missingEnvVars: string[] = [];
  const appEnv = process.env.APP_ENV || process.env.VERCEL_ENV || 'development';
  const isProduction = appEnv === 'production';

  // 必須環境変数のチェック
  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missingEnvVars.push(envVar);
    }
  }

  // 本番環境では追加の環境変数もチェック
  if (isProduction) {
    for (const envVar of PRODUCTION_ENV_VARS) {
      if (!process.env[envVar]) {
        missingEnvVars.push(envVar);
      }
    }
  }

  // Firebase設定のチェック
  const firebaseConfigValid = Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );

  // 認証ヘルスチェック
  let authHealth: HealthCheckResult['auth_health'] = { status: 'OK' };
  if (!firebaseConfigValid) {
    authHealth = {
      status: 'NG',
      reason: 'Firebase configuration missing or invalid',
    };
  }

  // DBヘルスチェック（実際にFirestoreへ接続テスト）
  let dbHealth: HealthCheckResult['db_health'] = { status: 'OK' };
  const dbStartTime = Date.now();

  if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    dbHealth = {
      status: 'NG',
      reason: 'Firestore project ID not configured',
    };
  } else {
    try {
      const adminDb = getAdminDb();
      // シンプルな読み取りテスト
      await adminDb.collection('_health').doc('ping').get();
      dbHealth = {
        status: 'OK',
        latency_ms: Date.now() - dbStartTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      dbHealth = {
        status: 'NG',
        reason: `Firestore connection failed: ${message.substring(0, 100)}`,
        latency_ms: Date.now() - dbStartTime,
      };
    }
  }

  // 外部連携の状態
  const lineworksConfigured = isLineWorksConfigured();
  const freeeConfigured = Boolean(process.env.FREEE_CLIENT_ID && process.env.FREEE_CLIENT_SECRET);
  const googleSheetsConfigured = Boolean(process.env.GOOGLE_SHEETS_CREDENTIALS);

  const externalIntegrations: HealthCheckResult['external_integrations'] = {
    lineworks: {
      status: getExternalSendStatus(lineworksConfigured),
      configured: lineworksConfigured,
    },
    freee: {
      status: getExternalSendStatus(freeeConfigured),
      configured: freeeConfigured,
    },
    google_sheets: {
      status: getExternalSendStatus(googleSheetsConfigured),
      configured: googleSheetsConfigured,
    },
  };

  // Feature flags
  const featureFlags: HealthCheckResult['feature_flags'] = {
    FEATURE_APPROVALS_V2: getFeatureFlag('FEATURE_APPROVALS_V2'),
    FEATURE_AI_VP: getFeatureFlag('FEATURE_AI_VP'),
    FEATURE_DOCS: getFeatureFlag('FEATURE_DOCS'),
    FEATURE_NYUKYO_LOCK: getFeatureFlag('FEATURE_NYUKYO_LOCK'),
  };

  // 全体ステータスの判定
  let overallStatus: HealthCheckResult['status'] = 'healthy';
  if (authHealth.status === 'NG' || dbHealth.status === 'NG') {
    overallStatus = 'unhealthy';
  } else if (missingEnvVars.length > 0) {
    overallStatus = 'degraded';
  }

  const result: HealthCheckResult = {
    status: overallStatus,
    time: new Date().toISOString(),
    app_env: appEnv,
    commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    auth_health: authHealth,
    db_health: dbHealth,
    external_integrations: externalIntegrations,
    feature_flags: featureFlags,
    env_missing: missingEnvVars,
    checks: {
      firebase_config: firebaseConfigValid,
      server_time: true,
    },
  };

  // レスポンスヘッダーにタイミング情報を追加
  const responseTime = Date.now() - startTime;

  return NextResponse.json(result, {
    status: overallStatus === 'unhealthy' ? 503 : 200,
    headers: {
      'X-Response-Time': `${responseTime}ms`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
