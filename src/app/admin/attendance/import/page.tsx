'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Button, Card } from '@/components/ui';
import { ShiftType, SHIFT_TYPES } from '@/types/attendance';
import { importShifts } from '@/lib/attendance';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Upload, FileText, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';

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

// CSVの1行をパース
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// 日付の妥当性チェック (YYYY-MM-DD)
function isValidDate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !isNaN(Date.parse(dateStr));
}

// 時刻の妥当性チェック (HH:MM)
function isValidTime(timeStr: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(timeStr);
}

export default function ShiftImportPage() {
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    importedRows: number;
    errors: { row: number; message: string }[];
  } | null>(null);

  // ファイル選択
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv') && !selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
      setError('CSVファイル（.csv）を選択してください');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setParsedData([]);
    setImportResult(null);
    setSuccess(null);
  };

  // CSVファイル解析
  const handleParse = useCallback(async () => {
    if (!file) return;

    setError(null);
    setSuccess(null);

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((line) => line.trim());

      if (lines.length < 2) {
        setError('データがありません（ヘッダー行 + 1件以上のデータが必要です）');
        return;
      }

      // ヘッダー行を解析してカラム位置を特定
      const headerCols = parseCSVLine(lines[0]).map((h) => h.replace(/^"|"$/g, '').trim());

      // カラム名マッピング
      const colMap: Record<string, number> = {};
      const aliases: Record<string, string[]> = {
        employeeCode: ['従業員コード', '社員コード', 'コード', 'employee_code', 'employeeCode'],
        workDate: ['勤務日', '日付', '出勤日', 'work_date', 'workDate', 'date'],
        plannedStart: ['開始時刻', '開始', '出勤', 'start', 'plannedStart', 'planned_start'],
        plannedEnd: ['終了時刻', '終了', '退勤', 'end', 'plannedEnd', 'planned_end'],
        breakMinutes: ['休憩', '休憩（分）', '休憩分', 'break', 'breakMinutes', 'break_minutes'],
        shiftType: ['勤務区分', 'シフト', '区分', 'shift', 'shiftType', 'shift_type'],
      };

      for (const [key, names] of Object.entries(aliases)) {
        const idx = headerCols.findIndex((h) =>
          names.some((name) => h === name || h.includes(name))
        );
        if (idx >= 0) {
          colMap[key] = idx;
        }
      }

      // 位置ベースのフォールバック（ヘッダーが見つからない場合）
      if (Object.keys(colMap).length < 3) {
        // 位置ベースで割り当て
        if (headerCols.length >= 6) {
          colMap.employeeCode = 0;
          colMap.workDate = 1;
          colMap.plannedStart = 2;
          colMap.plannedEnd = 3;
          colMap.breakMinutes = 4;
          colMap.shiftType = 5;
        } else {
          setError('ヘッダー行のカラムが不足しています（最低6列必要）');
          return;
        }
      }

      const rows: ParsedRow[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 4 || cols.every((c) => !c)) continue; // 空行スキップ

        const employeeCode = cols[colMap.employeeCode] || '';
        const workDate = cols[colMap.workDate] || '';
        const plannedStart = cols[colMap.plannedStart] || '';
        const plannedEnd = cols[colMap.plannedEnd] || '';
        const breakStr = cols[colMap.breakMinutes] || '60';
        const shiftTypeStr = cols[colMap.shiftType] || '日勤';

        const errors: string[] = [];

        if (!employeeCode) errors.push('従業員コードが空');
        if (!isValidDate(workDate)) errors.push('日付形式エラー');
        if (!isValidTime(plannedStart)) errors.push('開始時刻エラー');
        if (!isValidTime(plannedEnd)) errors.push('終了時刻エラー');

        const breakMinutes = parseInt(breakStr, 10);
        if (isNaN(breakMinutes) || breakMinutes < 0) errors.push('休憩分が不正');

        const shiftType = (SHIFT_TYPES.includes(shiftTypeStr as ShiftType)
          ? shiftTypeStr
          : '日勤') as ShiftType;

        rows.push({
          rowNumber: i + 1,
          employeeCode,
          workDate,
          plannedStart,
          plannedEnd,
          breakMinutes: isNaN(breakMinutes) ? 60 : breakMinutes,
          shiftType,
          isValid: errors.length === 0,
          error: errors.length > 0 ? errors.join(', ') : undefined,
        });
      }

      if (rows.length === 0) {
        setError('有効なデータ行がありません');
        return;
      }

      setParsedData(rows);
      const validCount = rows.filter((r) => r.isValid).length;
      setSuccess(`${rows.length}行を読み込みました（有効: ${validCount}件）`);
    } catch (err) {
      console.error('Failed to parse file:', err);
      setError('ファイルの読み込みに失敗しました');
    }
  }, [file]);

  // シフト登録
  const handleImport = async () => {
    if (parsedData.length === 0 || !user || !db) return;

    const validRows = parsedData.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setError('有効なデータがありません');
      return;
    }

    setImporting(true);
    setError(null);
    setSuccess(null);

    try {
      // 従業員コード → userId, branchId マッピングを構築
      const userMap = new Map<string, { userId: string; branchId: string }>();
      const usersSnap = await getDocs(
        query(collection(db, 'users'), where('tenantId', '==', user.tenantId))
      );
      for (const doc of usersSnap.docs) {
        const data = doc.data();
        const code = data.employeeCode || data.email;
        if (code) {
          userMap.set(code, { userId: doc.id, branchId: data.branchId || '' });
        }
      }

      // importShifts で一括登録
      const result = await importShifts(
        validRows.map((r) => ({
          employeeCode: r.employeeCode,
          workDate: r.workDate,
          plannedStart: r.plannedStart,
          plannedEnd: r.plannedEnd,
          breakMinutes: r.breakMinutes,
          shiftType: r.shiftType,
        })),
        userMap,
        user.tenantId
      );

      setImportResult({
        importedRows: result.importedRows,
        errors: result.errors,
      });

      if (result.errors.length > 0) {
        setSuccess(`${result.importedRows}件を登録しました（${result.errors.length}件のエラー）`);
      } else {
        setSuccess(`${result.importedRows}件のシフトを登録しました`);
        setParsedData([]);
        setFile(null);
      }
    } catch (err) {
      console.error('Failed to import:', err);
      setError('登録に失敗しました: ' + (err instanceof Error ? err.message : '不明なエラー'));
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
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={() => router.push('/admin/attendance')}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <h1 className="text-xl font-bold">シフト取込</h1>
            </div>
          </div>

          {/* 説明 */}
          <Card className="mb-6">
            <div className="p-4">
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                CSVファイルの形式
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                以下の列を含むCSVファイルをアップロードしてください。
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
                      <td className="border px-3 py-2">2026-01-15</td>
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
                <p className="mt-1">日付形式: YYYY-MM-DD / 時刻形式: HH:MM</p>
              </div>
            </div>
          </Card>

          {/* ファイルアップロード */}
          <Card className="mb-6">
            <div className="p-4">
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <Upload className="w-4 h-4" />
                ファイル選択
              </h2>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {success && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span className="text-sm">{success}</span>
                </div>
              )}

              <div className="flex items-center gap-4">
                <input
                  type="file"
                  accept=".csv"
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

          {/* インポート結果のエラー */}
          {importResult && importResult.errors.length > 0 && (
            <Card className="mb-6">
              <div className="p-4">
                <h2 className="font-semibold mb-3 text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  登録時エラー（{importResult.errors.length}件）
                </h2>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {importResult.errors.map((err, idx) => (
                    <p key={idx} className="text-sm text-red-600">
                      行 {err.row}: {err.message}
                    </p>
                  ))}
                </div>
              </div>
            </Card>
          )}

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
                              <span className="text-green-600 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> OK
                              </span>
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
                <li>・CSVはUTF-8エンコーディングで保存してください</li>
              </ul>
            </div>
          </Card>
        </main>
      </div>
    </AuthGuard>
  );
}
