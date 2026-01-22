#!/bin/bash

# Firebase Storage CORS設定適用スクリプト
# 使用前にGoogle Cloud SDKをインストールし、認証を完了してください

set -e

PROJECT_ID="hiyari-7f082"
BUCKET_NAME="hiyari-7f082.firebasestorage.app"

echo "Firebase Storage CORS設定を適用します..."
echo "バケット: gs://${BUCKET_NAME}"
echo ""

# 認証状態を確認
if ! gcloud auth list 2>/dev/null | grep -q 'ACTIVE'; then
    echo "エラー: Google Cloud認証が必要です"
    echo "次のコマンドを実行してください: gcloud auth login"
    exit 1
fi

# プロジェクトを設定
gcloud config set project "${PROJECT_ID}"

# CORS設定を適用
gsutil cors set cors.json "gs://${BUCKET_NAME}"

echo ""
echo "CORS設定が適用されました。"
echo ""
echo "設定を確認するには:"
echo "  gsutil cors get gs://${BUCKET_NAME}"
