/**
 * 文書コンテンツ Firestoreリポジトリ
 *
 * PROD-003: 本番永続化
 *
 * Ticket 096: 契約改訂時の差分表示
 *
 * コレクション: documents（文書メタデータ + バージョン管理）
 *   - documents: 文書メタデータ
 *   - document_versions: 文書バージョン
 */

import { getAdminDb } from '@/lib/firebase-admin';

// ========== 型定義 ==========

/**
 * 文書バージョン
 */
export interface DocumentVersion {
  id: string;              // documentVersionId
  documentId: string;      // 親ドキュメントID
  version: number;         // バージョン番号
  title: string;
  content: string;         // markdown/html 形式の本文
  summary: string;         // 概要
  createdAt: string;
  updatedAt: string;
}

/**
 * 文書メタデータ
 */
export interface Document {
  id: string;
  title: string;
  description: string;
  currentVersionId: string;
  versions: string[];      // バージョンID一覧（新しい順）
  createdAt: string;
  updatedAt: string;
}

// ========== 定数 ==========

const DOCUMENTS_COLLECTION = 'doc_metadata';
const VERSIONS_COLLECTION = 'document_versions';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

// ========== コンバーター ==========

function docToDocument(doc: FirebaseFirestore.DocumentSnapshot): Document {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    title: data.title ?? '',
    description: data.description ?? '',
    currentVersionId: data.currentVersionId ?? '',
    versions: data.versions ?? [],
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

function docToVersion(doc: FirebaseFirestore.DocumentSnapshot): DocumentVersion {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    documentId: data.documentId ?? '',
    version: data.version ?? 0,
    title: data.title ?? '',
    content: data.content ?? '',
    summary: data.summary ?? '',
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

// ========== CRUD ==========

/**
 * 文書バージョンを取得
 */
export async function getDocumentVersion(versionId: string): Promise<DocumentVersion | null> {
  const db = getAdminDb();
  const doc = await db.collection(VERSIONS_COLLECTION).doc(versionId).get();
  if (!doc.exists) return null;
  return docToVersion(doc);
}

/**
 * 文書を取得
 */
export async function getDocument(documentId: string): Promise<Document | null> {
  const db = getAdminDb();
  const doc = await db.collection(DOCUMENTS_COLLECTION).doc(documentId).get();
  if (!doc.exists) return null;
  return docToDocument(doc);
}

/**
 * 文書の全バージョンを取得（新しい順）
 */
export async function getDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  const document = await getDocument(documentId);
  if (!document) return [];

  const versions: DocumentVersion[] = [];
  for (const vId of document.versions) {
    const version = await getDocumentVersion(vId);
    if (version) {
      versions.push(version);
    }
  }

  return versions;
}

/**
 * 旧バージョンを取得（現在のバージョンの1つ前）
 */
export async function getPreviousVersion(
  documentId: string,
  currentVersionId: string
): Promise<DocumentVersion | null> {
  const versions = await getDocumentVersions(documentId);
  const currentIndex = versions.findIndex((v) => v.id === currentVersionId);

  if (currentIndex === -1 || currentIndex >= versions.length - 1) {
    return null; // 現在のバージョンがない、または最古のバージョン
  }

  return versions[currentIndex + 1];
}

/**
 * documentId から旧バージョンIDを探す（user_onboarding から）
 *
 * signedVersionIds: ユーザーが署名済みの documentVersionId 一覧
 * currentVersionId: 現在の必須 documentVersionId
 */
export async function findPreviousSignedVersion(
  documentId: string,
  currentVersionId: string,
  signedVersionIds: string[]
): Promise<DocumentVersion | null> {
  const versions = await getDocumentVersions(documentId);

  // 現在のバージョンを確認
  const currentVersion = await getDocumentVersion(currentVersionId);
  if (!currentVersion) return null;

  // 現在のバージョンより古いバージョンで、署名済みのものを探す
  for (const version of versions) {
    if (version.id !== currentVersionId && signedVersionIds.includes(version.id)) {
      return version;
    }
  }

  // 署名済みがなければ、1つ前のバージョン
  return getPreviousVersion(documentId, currentVersionId);
}

// ========== シードデータ ==========

export async function seedDocuments(): Promise<void> {
  const db = getAdminDb();

  // 既存データがあればスキップ
  const existing = await db.collection(DOCUMENTS_COLLECTION).limit(1).get();
  if (!existing.empty) return;

  const timestamp = now();
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const batch = db.batch();

  // 入社誓約書 v1
  const employmentOathV1: DocumentVersion = {
    id: 'docv_employment_oath_v1',
    documentId: 'doc_employment_oath',
    version: 1,
    title: '入社誓約書',
    summary: '入社に際しての基本的な誓約事項',
    content: `# 入社誓約書\n\n私は、貴社に入社するにあたり、以下の事項を誓約いたします。\n\n## 第1条（就業規則の遵守）\n貴社の就業規則およびその他の諸規程を遵守し、誠実に職務を遂行いたします。\n\n## 第2条（秘密保持）\n業務上知り得た貴社の機密情報および個人情報を、在職中はもとより退職後も第三者に漏洩いたしません。\n\n## 第3条（競業避止）\n在職中は、貴社の事前の承諾なく、競業他社への就職、役員就任、または競業事業を行いません。\n\n## 第4条（損害賠償）\n故意または重大な過失により貴社に損害を与えた場合は、その損害を賠償いたします。\n\n以上`,
    createdAt: oneMonthAgo,
    updatedAt: oneMonthAgo,
  };

  // 入社誓約書 v2
  const employmentOathV2: DocumentVersion = {
    id: 'docv_employment_oath_v2',
    documentId: 'doc_employment_oath',
    version: 2,
    title: '入社誓約書',
    summary: '入社に際しての基本的な誓約事項（改訂版）',
    content: `# 入社誓約書\n\n私は、貴社に入社するにあたり、以下の事項を誓約いたします。\n\n## 第1条（就業規則の遵守）\n貴社の就業規則およびその他の諸規程を遵守し、誠実に職務を遂行いたします。\n\n## 第2条（秘密保持）\n業務上知り得た貴社の機密情報および個人情報を、在職中はもとより退職後も第三者に漏洩いたしません。\n\n## 第2条の2（情報セキュリティ）【新設】\n貴社の定める情報セキュリティポリシーを遵守し、業務で使用するデバイスおよびアカウントの適切な管理を行います。\n\n## 第3条（競業避止）\n在職中は、貴社の事前の承諾なく、競業他社への就職、役員就任、または競業事業を行いません。\n\n## 第3条の2（副業・兼業）【新設】\n副業・兼業を行う場合は、事前に所定の届出を行い、承認を得るものとします。\n\n## 第4条（損害賠償）\n故意または重大な過失により貴社に損害を与えた場合は、その損害を賠償いたします。\n\n## 第5条（ハラスメント防止）【新設】\n職場におけるハラスメント行為を行わず、良好な職場環境の維持に努めます。\n\n以上`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  // 労働契約書 v1
  const laborContractV1: DocumentVersion = {
    id: 'docv_labor_contract_v1',
    documentId: 'doc_labor_contract',
    version: 1,
    title: '労働契約書',
    summary: '労働条件に関する基本契約',
    content: `# 労働契約書\n\n株式会社〇〇（以下「甲」という）と従業員（以下「乙」という）は、以下のとおり労働契約を締結する。\n\n## 第1条（契約期間）\n期間の定めなし\n\n## 第2条（就業場所）\n甲の本社および甲の指定する場所\n\n## 第3条（業務内容）\n甲の指示する業務\n\n## 第4条（労働時間）\n1. 始業時刻：9時00分\n2. 終業時刻：18時00分\n3. 休憩時間：12時00分〜13時00分\n\n## 第5条（休日）\n土曜日、日曜日、国民の祝日、年末年始\n\n## 第6条（賃金）\n別途定める賃金規程による\n\n以上`,
    createdAt: oneMonthAgo,
    updatedAt: oneMonthAgo,
  };

  // 機密保持誓約書 v1
  const confidentialityV1: DocumentVersion = {
    id: 'docv_confidentiality_v1',
    documentId: 'doc_confidentiality',
    version: 1,
    title: '機密保持誓約書',
    summary: '機密情報の取り扱いに関する誓約',
    content: `# 機密保持誓約書\n\n私は、業務上知り得た機密情報について、以下のとおり誓約いたします。\n\n## 第1条（機密情報の定義）\n機密情報とは、以下の情報をいいます：\n- 顧客情報、取引先情報\n- 技術情報、ノウハウ\n- 経営情報、財務情報\n- その他、貴社が機密と指定した情報\n\n## 第2条（秘密保持義務）\n機密情報を厳重に管理し、正当な理由なく第三者に開示・漏洩いたしません。\n\n## 第3条（返還義務）\n退職時には、機密情報を含む一切の資料を返還いたします。\n\n以上`,
    createdAt: oneMonthAgo,
    updatedAt: oneMonthAgo,
  };

  // バージョンを保存
  batch.set(db.collection(VERSIONS_COLLECTION).doc(employmentOathV1.id), employmentOathV1);
  batch.set(db.collection(VERSIONS_COLLECTION).doc(employmentOathV2.id), employmentOathV2);
  batch.set(db.collection(VERSIONS_COLLECTION).doc(laborContractV1.id), laborContractV1);
  batch.set(db.collection(VERSIONS_COLLECTION).doc(confidentialityV1.id), confidentialityV1);

  // 文書メタデータを保存
  batch.set(db.collection(DOCUMENTS_COLLECTION).doc('doc_employment_oath'), {
    id: 'doc_employment_oath',
    title: '入社誓約書',
    description: '入社に際しての誓約事項',
    currentVersionId: 'docv_employment_oath_v2',
    versions: ['docv_employment_oath_v2', 'docv_employment_oath_v1'],
    createdAt: oneMonthAgo,
    updatedAt: timestamp,
  });

  batch.set(db.collection(DOCUMENTS_COLLECTION).doc('doc_labor_contract'), {
    id: 'doc_labor_contract',
    title: '労働契約書',
    description: '労働条件に関する契約',
    currentVersionId: 'docv_labor_contract_v1',
    versions: ['docv_labor_contract_v1'],
    createdAt: oneMonthAgo,
    updatedAt: oneMonthAgo,
  });

  batch.set(db.collection(DOCUMENTS_COLLECTION).doc('doc_confidentiality'), {
    id: 'doc_confidentiality',
    title: '機密保持誓約書',
    description: '機密情報の取り扱い',
    currentVersionId: 'docv_confidentiality_v1',
    versions: ['docv_confidentiality_v1'],
    createdAt: oneMonthAgo,
    updatedAt: oneMonthAgo,
  });

  await batch.commit();
  console.log('[Documents:Firestore] Seeded document versions');
}
