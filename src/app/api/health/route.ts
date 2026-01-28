import { NextResponse } from 'next/server';

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
  };
  env_missing: string[];
  checks: {
    firebase_config: boolean;
    server_time: boolean;
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

  // DBヘルスチェック（Firestoreはクライアントサイドのため、設定の存在確認のみ）
  let dbHealth: HealthCheckResult['db_health'] = { status: 'OK' };
  if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    dbHealth = {
      status: 'NG',
      reason: 'Firestore project ID not configured',
    };
  }

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
