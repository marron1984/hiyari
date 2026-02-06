/**
 * 文書コンテンツ リポジトリ
 *
 * Ticket 096: 契約改訂時の差分表示
 *
 * 文書のバージョン管理とコンテンツ取得
 */

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

// ========== インメモリストア ==========

const documentsStore = new Map<string, Document>();
const versionsStore = new Map<string, DocumentVersion>();

// ========== CRUD ==========

/**
 * 文書バージョンを取得
 */
export function getDocumentVersion(versionId: string): DocumentVersion | null {
  return versionsStore.get(versionId) ?? null;
}

/**
 * 文書を取得
 */
export function getDocument(documentId: string): Document | null {
  return documentsStore.get(documentId) ?? null;
}

/**
 * 文書の全バージョンを取得（新しい順）
 */
export function getDocumentVersions(documentId: string): DocumentVersion[] {
  const doc = documentsStore.get(documentId);
  if (!doc) return [];

  return doc.versions
    .map((vId) => versionsStore.get(vId))
    .filter((v): v is DocumentVersion => v !== null);
}

/**
 * 旧バージョンを取得（現在のバージョンの1つ前）
 */
export function getPreviousVersion(
  documentId: string,
  currentVersionId: string
): DocumentVersion | null {
  const versions = getDocumentVersions(documentId);
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
export function findPreviousSignedVersion(
  documentId: string,
  currentVersionId: string,
  signedVersionIds: string[]
): DocumentVersion | null {
  const versions = getDocumentVersions(documentId);

  // 現在のバージョンより古いバージョンで、署名済みのものを探す
  const currentVersion = versionsStore.get(currentVersionId);
  if (!currentVersion) return null;

  for (const version of versions) {
    // 現在のバージョン以外で、署名済みのもの
    if (version.id !== currentVersionId && signedVersionIds.includes(version.id)) {
      return version;
    }
  }

  // 署名済みがなければ、1つ前のバージョン
  return getPreviousVersion(documentId, currentVersionId);
}

// ========== シードデータ ==========

export function seedDocuments(): void {
  if (documentsStore.size > 0) return;

  const now = new Date().toISOString();
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 入社誓約書
  const employmentOathV1: DocumentVersion = {
    id: 'docv_employment_oath_v1',
    documentId: 'doc_employment_oath',
    version: 1,
    title: '入社誓約書',
    summary: '入社に際しての基本的な誓約事項',
    content: `# 入社誓約書

私は、貴社に入社するにあたり、以下の事項を誓約いたします。

## 第1条（就業規則の遵守）
貴社の就業規則およびその他の諸規程を遵守し、誠実に職務を遂行いたします。

## 第2条（秘密保持）
業務上知り得た貴社の機密情報および個人情報を、在職中はもとより退職後も第三者に漏洩いたしません。

## 第3条（競業避止）
在職中は、貴社の事前の承諾なく、競業他社への就職、役員就任、または競業事業を行いません。

## 第4条（損害賠償）
故意または重大な過失により貴社に損害を与えた場合は、その損害を賠償いたします。

以上`,
    createdAt: oneMonthAgo,
    updatedAt: oneMonthAgo,
  };

  const employmentOathV2: DocumentVersion = {
    id: 'docv_employment_oath_v2',
    documentId: 'doc_employment_oath',
    version: 2,
    title: '入社誓約書',
    summary: '入社に際しての基本的な誓約事項（改訂版）',
    content: `# 入社誓約書

私は、貴社に入社するにあたり、以下の事項を誓約いたします。

## 第1条（就業規則の遵守）
貴社の就業規則およびその他の諸規程を遵守し、誠実に職務を遂行いたします。

## 第2条（秘密保持）
業務上知り得た貴社の機密情報および個人情報を、在職中はもとより退職後も第三者に漏洩いたしません。

## 第2条の2（情報セキュリティ）【新設】
貴社の定める情報セキュリティポリシーを遵守し、業務で使用するデバイスおよびアカウントの適切な管理を行います。

## 第3条（競業避止）
在職中は、貴社の事前の承諾なく、競業他社への就職、役員就任、または競業事業を行いません。

## 第3条の2（副業・兼業）【新設】
副業・兼業を行う場合は、事前に所定の届出を行い、承認を得るものとします。

## 第4条（損害賠償）
故意または重大な過失により貴社に損害を与えた場合は、その損害を賠償いたします。

## 第5条（ハラスメント防止）【新設】
職場におけるハラスメント行為を行わず、良好な職場環境の維持に努めます。

以上`,
    createdAt: now,
    updatedAt: now,
  };

  // 労働契約書
  const laborContractV1: DocumentVersion = {
    id: 'docv_labor_contract_v1',
    documentId: 'doc_labor_contract',
    version: 1,
    title: '労働契約書',
    summary: '労働条件に関する基本契約',
    content: `# 労働契約書

株式会社〇〇（以下「甲」という）と従業員（以下「乙」という）は、以下のとおり労働契約を締結する。

## 第1条（契約期間）
期間の定めなし

## 第2条（就業場所）
甲の本社および甲の指定する場所

## 第3条（業務内容）
甲の指示する業務

## 第4条（労働時間）
1. 始業時刻：9時00分
2. 終業時刻：18時00分
3. 休憩時間：12時00分〜13時00分

## 第5条（休日）
土曜日、日曜日、国民の祝日、年末年始

## 第6条（賃金）
別途定める賃金規程による

以上`,
    createdAt: oneMonthAgo,
    updatedAt: oneMonthAgo,
  };

  // 機密保持誓約書
  const confidentialityV1: DocumentVersion = {
    id: 'docv_confidentiality_v1',
    documentId: 'doc_confidentiality',
    version: 1,
    title: '機密保持誓約書',
    summary: '機密情報の取り扱いに関する誓約',
    content: `# 機密保持誓約書

私は、業務上知り得た機密情報について、以下のとおり誓約いたします。

## 第1条（機密情報の定義）
機密情報とは、以下の情報をいいます：
- 顧客情報、取引先情報
- 技術情報、ノウハウ
- 経営情報、財務情報
- その他、貴社が機密と指定した情報

## 第2条（秘密保持義務）
機密情報を厳重に管理し、正当な理由なく第三者に開示・漏洩いたしません。

## 第3条（返還義務）
退職時には、機密情報を含む一切の資料を返還いたします。

以上`,
    createdAt: oneMonthAgo,
    updatedAt: oneMonthAgo,
  };

  // ストアに登録
  versionsStore.set(employmentOathV1.id, employmentOathV1);
  versionsStore.set(employmentOathV2.id, employmentOathV2);
  versionsStore.set(laborContractV1.id, laborContractV1);
  versionsStore.set(confidentialityV1.id, confidentialityV1);

  documentsStore.set('doc_employment_oath', {
    id: 'doc_employment_oath',
    title: '入社誓約書',
    description: '入社に際しての誓約事項',
    currentVersionId: 'docv_employment_oath_v2',
    versions: ['docv_employment_oath_v2', 'docv_employment_oath_v1'],
    createdAt: oneMonthAgo,
    updatedAt: now,
  });

  documentsStore.set('doc_labor_contract', {
    id: 'doc_labor_contract',
    title: '労働契約書',
    description: '労働条件に関する契約',
    currentVersionId: 'docv_labor_contract_v1',
    versions: ['docv_labor_contract_v1'],
    createdAt: oneMonthAgo,
    updatedAt: oneMonthAgo,
  });

  documentsStore.set('doc_confidentiality', {
    id: 'doc_confidentiality',
    title: '機密保持誓約書',
    description: '機密情報の取り扱い',
    currentVersionId: 'docv_confidentiality_v1',
    versions: ['docv_confidentiality_v1'],
    createdAt: oneMonthAgo,
    updatedAt: oneMonthAgo,
  });

  console.log('[Documents] Seeded document versions');
}

// ========== クリア（テスト用） ==========

export function clearDocumentsStore(): void {
  documentsStore.clear();
  versionsStore.clear();
}

// 初期シード
seedDocuments();
