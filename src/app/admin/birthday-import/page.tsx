'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Upload,
  FileText,
  Check,
  X,
  AlertCircle,
  RefreshCw,
  Download,
} from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import {
  uploadBirthdayPdf,
  saveBirthdayImportLog,
  getBirthdayImportLogs,
  findClientsByName,
  findProfilesByName,
  updateClientBirthdays,
  updateProfileBirthdays,
} from '@/lib/repositories/birthday';
import { extractTextFromPdfBuffer, extractPersonsFromText } from '@/lib/pdf-parser';
import {
  BirthdayImportLog,
  ExtractedPerson,
  ImportDetail,
  Client,
  Profile,
} from '@/types/database';
import { formatDateJP } from '@/lib/utils';

type TargetType = 'clients' | 'profiles';

interface PreviewRow extends ExtractedPerson {
  status: 'match' | 'new' | 'skip' | 'error';
  matched_id?: string;
  matched_name?: string;
  error?: string;
  selected: boolean;
}

function BirthdayImportContent() {
  const router = useRouter();
  const { profile, organization, isAdmin } = useSupabaseAuth();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'complete'>('upload');
  const [targetType, setTargetType] = useState<TargetType>('clients');
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [importLogs, setImportLogs] = useState<BirthdayImportLog[]>([]);
  const [uploadedFilePath, setUploadedFilePath] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);

  // 権限チェック
  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-gray-500">この機能は管理者のみ利用可能です</p>
            <Button className="mt-4" onClick={() => router.push('/dashboard')}>
              ダッシュボードに戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fetchImportLogs = useCallback(async () => {
    if (!organization) return;

    try {
      const result = await getBirthdayImportLogs(organization.id, 1, 10);
      setImportLogs(result.data);
    } catch (error) {
      console.error('Error fetching import logs:', error);
    }
  }, [organization]);

  useEffect(() => {
    fetchImportLogs();
  }, [fetchImportLogs]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organization || !profile) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('PDFファイルを選択してください');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      alert('ファイルサイズは20MB以下にしてください');
      return;
    }

    setLoading(true);
    try {
      // PDFをアップロード
      const filePath = await uploadBirthdayPdf(organization.id, profile.id, file);
      if (!filePath) {
        throw new Error('ファイルのアップロードに失敗しました');
      }
      setUploadedFilePath(filePath);
      setUploadedFileName(file.name);

      // PDFからテキスト抽出
      const buffer = await file.arrayBuffer();
      const text = await extractTextFromPdfBuffer(buffer);

      // 人物と誕生日を抽出
      const persons = extractPersonsFromText(text);

      if (persons.length === 0) {
        alert('PDFから誕生日情報を抽出できませんでした');
        setLoading(false);
        return;
      }

      // 既存データとマッチング
      const names = persons.map((p) => p.name);
      let matchedMap: Map<string, Client | Profile>;

      if (targetType === 'clients') {
        matchedMap = await findClientsByName(organization.id, names);
      } else {
        matchedMap = await findProfilesByName(organization.id, names);
      }

      // プレビューデータ作成
      const preview: PreviewRow[] = persons.map((person) => {
        const matched = matchedMap.get(person.name);

        if (matched) {
          return {
            ...person,
            status: 'match',
            matched_id: matched.id,
            matched_name: 'name' in matched ? matched.name : matched.display_name,
            selected: true,
          };
        } else {
          return {
            ...person,
            status: 'skip',
            selected: false,
          };
        }
      });

      setPreviewRows(preview);
      setStep('preview');
    } catch (error) {
      console.error('Error processing PDF:', error);
      alert('PDFの処理中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleRowSelect = (index: number, selected: boolean) => {
    setPreviewRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, selected } : row))
    );
  };

  const handleSelectAll = (selected: boolean) => {
    setPreviewRows((prev) =>
      prev.map((row) => ({
        ...row,
        selected: row.status === 'match' ? selected : false,
      }))
    );
  };

  const handleImport = async () => {
    if (!organization || !profile) return;

    const selectedRows = previewRows.filter(
      (row) => row.selected && row.status === 'match' && row.matched_id && row.birthday
    );

    if (selectedRows.length === 0) {
      alert('インポートする項目を選択してください');
      return;
    }

    if (!confirm(`${selectedRows.length}件の誕生日情報をインポートしますか？`)) {
      return;
    }

    setLoading(true);
    try {
      const updates = selectedRows.map((row) => ({
        id: row.matched_id!,
        birthday: row.birthday!,
      }));

      let result: { success: number; failed: number };

      if (targetType === 'clients') {
        result = await updateClientBirthdays(updates);
      } else {
        result = await updateProfileBirthdays(updates);
      }

      // インポートログ保存
      const details: ImportDetail[] = previewRows.map((row, index) => ({
        row_number: index + 1,
        name: row.name,
        birthday: row.birthday,
        status: row.selected && row.status === 'match' ? 'success' : 'skipped',
        matched_id: row.matched_id,
        error: row.error,
      }));

      await saveBirthdayImportLog(
        organization.id,
        profile.id,
        uploadedFilePath,
        uploadedFileName,
        targetType,
        details
      );

      setImportResult(result);
      setStep('complete');
      fetchImportLogs();
    } catch (error) {
      console.error('Error importing:', error);
      alert('インポート中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setStep('upload');
    setPreviewRows([]);
    setUploadedFilePath('');
    setUploadedFileName('');
    setImportResult(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/dashboard')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">誕生日PDF取込</h1>
          <p className="text-sm text-gray-500 mt-1">
            PDFから誕生日情報を抽出して登録します
          </p>
        </div>
      </div>

      {/* ステップ表示 */}
      <div className="flex items-center gap-4 mb-6">
        {['upload', 'preview', 'complete'].map((s, index) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === s
                  ? 'bg-blue-600 text-white'
                  : index < ['upload', 'preview', 'complete'].indexOf(step)
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {index < ['upload', 'preview', 'complete'].indexOf(step) ? (
                <Check className="w-4 h-4" />
              ) : (
                index + 1
              )}
            </div>
            {index < 2 && <div className="w-12 h-0.5 bg-gray-200 mx-2" />}
          </div>
        ))}
      </div>

      {/* アップロードステップ */}
      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>PDFファイルのアップロード</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Select
              label="取込対象"
              value={targetType}
              onChange={(e) => setTargetType(e.target.value as TargetType)}
              options={[
                { value: 'clients', label: '利用者' },
                { value: 'profiles', label: '職員' },
              ]}
            />

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">
                PDFファイルをドラッグ＆ドロップ
                <br />
                または
              </p>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={loading}
                />
                <Button disabled={loading}>
                  {loading ? 'アップロード中...' : 'ファイルを選択'}
                </Button>
              </label>
              <p className="text-xs text-gray-500 mt-4">
                対応形式: PDF（20MB以下）
                <br />
                名簿や一覧表など、氏名と生年月日が含まれるPDFをアップロードしてください
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* プレビューステップ */}
      {step === 'preview' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>抽出結果の確認</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => handleSelectAll(true)}>
                全て選択
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleSelectAll(false)}>
                選択解除
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1">
                <Badge variant="success">マッチ</Badge>
                {previewRows.filter((r) => r.status === 'match').length}件
              </span>
              <span className="flex items-center gap-1">
                <Badge variant="default">スキップ</Badge>
                {previewRows.filter((r) => r.status === 'skip').length}件
              </span>
            </div>

            <div className="max-h-96 overflow-y-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left w-12">選択</th>
                    <th className="p-2 text-left">抽出名</th>
                    <th className="p-2 text-left">生年月日</th>
                    <th className="p-2 text-left">マッチ結果</th>
                    <th className="p-2 text-left">信頼度</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={index} className="border-t">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={(e) => handleRowSelect(index, e.target.checked)}
                          disabled={row.status !== 'match'}
                        />
                      </td>
                      <td className="p-2">{row.name}</td>
                      <td className="p-2">
                        {row.birthday || '-'}
                        {row.original_birthday_text && row.original_birthday_text !== row.birthday && (
                          <span className="text-xs text-gray-400 ml-1">
                            ({row.original_birthday_text})
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        {row.status === 'match' ? (
                          <span className="text-green-600">
                            <Check className="w-4 h-4 inline mr-1" />
                            {row.matched_name}
                          </span>
                        ) : (
                          <span className="text-gray-400">
                            <X className="w-4 h-4 inline mr-1" />
                            マッチなし
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${row.confidence * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={resetForm}>
                やり直す
              </Button>
              <Button
                onClick={handleImport}
                loading={loading}
                disabled={previewRows.filter((r) => r.selected).length === 0}
              >
                {previewRows.filter((r) => r.selected).length}件をインポート
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 完了ステップ */}
      {step === 'complete' && importResult && (
        <Card>
          <CardContent className="py-12 text-center">
            <Check className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">インポート完了</h2>
            <p className="text-gray-600 mb-4">
              成功: {importResult.success}件 / 失敗: {importResult.failed}件
            </p>
            <Button onClick={resetForm}>
              <RefreshCw className="w-4 h-4 mr-2" />
              別のファイルをインポート
            </Button>
          </CardContent>
        </Card>
      )}

      {/* インポート履歴 */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>インポート履歴</CardTitle>
        </CardHeader>
        <CardContent>
          {importLogs.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              インポート履歴はありません
            </p>
          ) : (
            <div className="space-y-2">
              {importLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">{log.file_name}</p>
                      <p className="text-xs text-gray-500">
                        {log.target_type === 'clients' ? '利用者' : '職員'} •
                        成功 {log.success_rows}件 / 失敗 {log.failed_rows}件 •
                        {formatDateJP(log.imported_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function BirthdayImportPage() {
  return (
    <AuthGuard requireAdmin>
      <BirthdayImportContent />
    </AuthGuard>
  );
}
