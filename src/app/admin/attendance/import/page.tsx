'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Button, Card, Select } from '@/components/ui';
import { ShiftImportRow, ShiftType, SHIFT_TYPES } from '@/types/attendance';

// Excel読み込みはクライアントサイドでxlsxライブラリを使用
// 本番環境ではnpm install xlsxが必要

interface ParsedRow {
  rowNumber: number;
  employeeCode: string;
  workDate: string;
  plannedStart: string;
  plannedEnd: string;
  breakMinutes: number;
  shiftType: ShiftType;
  isValid: boolean;
  error?: string;
}

export default function ShiftImportPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ファイル選択
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
      setError('Excelファイル（.xlsx, .xls）を選択してください');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setParsedData([]);
  };

  // ファイル解析（デモ用：実際にはxlsxライブラリを使用）
  const handleParse = useCallback(async () => {
    if (!file) return;

    setError(null);

    try {
      // デモデータ（実際にはExcelを解析）
      // npm install xlsx でライブラリをインストール後、以下のようなコードで解析
      /*
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet);
      */

      // デモ用のサンプルデータ
      const demoData: ParsedRow[] = [
        {
          rowNumber: 2,
          employeeCode: 'EMP001',
          workDate: '2024-01-15',
          plannedStart: '09:00',
          plannedEnd: '18:00',
          breakMinutes: 60,
          shiftType: '日勤',
          isValid: true,
        },
        {
          rowNumber: 3,
          employeeCode: 'EMP002',
          workDate: '2024-01-15',
          plannedStart: '07:00',
          plannedEnd: '16:00',
          breakMinutes: 60,
          shiftType: '早番',
          isValid: true,
        },
        {
          rowNumber: 4,
          employeeCode: 'EMP003',
          workDate: '2024-01-15',
          plannedStart: '22:00',
          plannedEnd: '07:00',
          breakMinutes: 60,
          shiftType: '夜勤',
          isValid: true,
        },
      ];

      setParsedData(demoData);
      setSuccess('ファイルを読み込みました。内容を確認して登録してください。');
    } catch (err) {
      console.error('Failed to parse file:', err);
      setError('ファイルの読み込みに失敗しました');
    }
  }, [file]);

  // シフト登録
  const handleImport = async () => {
    if (parsedData.length === 0) return;

    setImporting(true);
    setError(null);
    setSuccess(null);

    try {
      // 実際の登録処理
      // await importShifts(validRows, userMap, userProfile.tenantId);

      // デモ用
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setSuccess(`${parsedData.filter((r) => r.isValid).length}件のシフトを登録しました`);
      setParsedData([]);
      setFile(null);
    } catch (err) {
      console.error('Failed to import:', err);
      setError('登録に失敗しました');
    } finally {
      setImporting(false);
    }
  };

  if (!isAdmin) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50">
          <Header />
          <main className="max-w-4xl mx-auto px-4 py-6">
            <div className="text-center py-12">
              <p className="text-gray-600">このページは管理者のみアクセスできます</p>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Header />

        <main className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold">シフト取込</h1>
            <Button variant="secondary" onClick={() => router.push('/admin/attendance')}>
              戻る
            </Button>
          </div>

          {/* 説明 */}
          <Card className="mb-6">
            <div className="p-4">
              <h2 className="font-semibold mb-3">Excelファイルの形式</h2>
              <p className="text-sm text-gray-600 mb-4">
                以下の列を含むExcelファイルをアップロードしてください。
                1行目はヘッダー行として扱われます。
              </p>
              <div className="overflow-x-auto">
                <table className="text-sm border">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="border px-3 py-2">従業員コード</th>
                      <th className="border px-3 py-2">勤務日</th>
                      <th className="border px-3 py-2">開始時刻</th>
                      <th className="border px-3 py-2">終了時刻</th>
                      <th className="border px-3 py-2">休憩（分）</th>
                      <th className="border px-3 py-2">勤務区分</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border px-3 py-2">EMP001</td>
                      <td className="border px-3 py-2">2024-01-15</td>
                      <td className="border px-3 py-2">09:00</td>
                      <td className="border px-3 py-2">18:00</td>
                      <td className="border px-3 py-2">60</td>
                      <td className="border px-3 py-2">日勤</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-4 text-sm text-gray-500">
                <p>対応勤務区分: {SHIFT_TYPES.join(', ')}</p>
              </div>
            </div>
          </Card>

          {/* ファイルアップロード */}
          <Card className="mb-6">
            <div className="p-4">
              <h2 className="font-semibold mb-3">ファイル選択</h2>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                  {error}
                </div>
              )}

              {success && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
                  {success}
                </div>
              )}

              <div className="flex items-center gap-4">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-lg file:border-0
                    file:text-sm file:font-medium
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100"
                />
                <Button
                  onClick={handleParse}
                  disabled={!file}
                  variant="secondary"
                >
                  読込
                </Button>
              </div>
            </div>
          </Card>

          {/* プレビュー */}
          {parsedData.length > 0 && (
            <Card className="mb-6">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold">
                    プレビュー（{parsedData.filter((r) => r.isValid).length} / {parsedData.length} 件）
                  </h2>
                  <Button
                    onClick={handleImport}
                    disabled={importing || parsedData.filter((r) => r.isValid).length === 0}
                  >
                    {importing ? '登録中...' : '登録する'}
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">行</th>
                        <th className="px-3 py-2 text-left">従業員</th>
                        <th className="px-3 py-2 text-left">日付</th>
                        <th className="px-3 py-2 text-left">時間</th>
                        <th className="px-3 py-2 text-left">休憩</th>
                        <th className="px-3 py-2 text-left">区分</th>
                        <th className="px-3 py-2 text-left">状態</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {parsedData.map((row) => (
                        <tr
                          key={row.rowNumber}
                          className={row.isValid ? '' : 'bg-red-50'}
                        >
                          <td className="px-3 py-2">{row.rowNumber}</td>
                          <td className="px-3 py-2">{row.employeeCode}</td>
                          <td className="px-3 py-2">{row.workDate}</td>
                          <td className="px-3 py-2">
                            {row.plannedStart} - {row.plannedEnd}
                          </td>
                          <td className="px-3 py-2">{row.breakMinutes}分</td>
                          <td className="px-3 py-2">{row.shiftType}</td>
                          <td className="px-3 py-2">
                            {row.isValid ? (
                              <span className="text-green-600">OK</span>
                            ) : (
                              <span className="text-red-600">{row.error}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}

          {/* 注意事項 */}
          <Card>
            <div className="p-4">
              <h2 className="font-semibold mb-3">注意事項</h2>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>・同じ従業員・同じ日付のシフトが既に存在する場合は上書きされます</li>
                <li>・夜勤など日跨ぎのシフトは、開始日を勤務日として登録されます</li>
                <li>・従業員コードは事前にシステムに登録されている必要があります</li>
                <li>・大量のデータを一度に登録する場合は、処理に時間がかかることがあります</li>
              </ul>
            </div>
          </Card>
        </main>
      </div>
    </AuthGuard>
  );
}
