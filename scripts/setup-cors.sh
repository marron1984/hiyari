#!/bin/bash
# Firebase Storage CORS設定スクリプト
#
# 使用方法:
# 1. Google Cloud SDKをインストール: https://cloud.google.com/sdk/docs/install
# 2. 認証: gcloud auth login
# 3. プロジェクト設定: gcloud config set project hiyari-7f082
# 4. このスクリプトを実行: ./scripts/setup-cors.sh

# プロジェクトID（必要に応じて変更）
PROJECT_ID="${FIREBASE_PROJECT_ID:-hiyari-7f082}"
BUCKET_NAME="${PROJECT_ID}.firebasestorage.app"

echo "Firebase Storage CORS設定を適用中..."
echo "プロジェクト: ${PROJECT_ID}"
echo "バケット: ${BUCKET_NAME}"

# cors.jsonを適用
gsutil cors set cors.json gs://${BUCKET_NAME}

if [ $? -eq 0 ]; then
  echo "✅ CORS設定が正常に適用されました"
  echo ""
  echo "現在のCORS設定を確認:"
  gsutil cors get gs://${BUCKET_NAME}
else
  echo "❌ CORS設定の適用に失敗しました"
  echo ""
  echo "以下を確認してください:"
  echo "1. gcloud認証が完了しているか"
  echo "2. プロジェクトIDが正しいか"
  echo "3. バケット名が正しいか（.appspot.com または .firebasestorage.app）"
  echo ""
  echo "バケット名が異なる場合は以下も試してください:"
  echo "gsutil cors set cors.json gs://${PROJECT_ID}.appspot.com"
  exit 1
fi
