'use client';

import { Card, CardContent } from '@/components/ui';
import {
  ArrowUp,
  ArrowDown,
  Shield,
  AlertTriangle,
  Eye,
  Link as LinkIcon,
  Settings,
  XCircle,
  CheckCircle,
  Info,
} from 'lucide-react';

/**
 * AA 判断と責任のOS
 *
 * 思想：
 * - 判断は下から上へ流れる
 * - 責任は経営で止まる（現場に押し戻さない）
 * - 迷ったら止まり、上位に返す
 */

// 各層の定義
interface LayerDefinition {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  bgColor: string;
  borderColor: string;
  points: string[];
}

const LAYERS: LayerDefinition[] = [
  {
    id: 'executive',
    title: '経営',
    subtitle: '最終決定層',
    color: 'text-blue-800',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    points: [
      '最終判断を下す',
      '責任を引き受ける',
      '仕組みを修正する',
    ],
  },
  {
    id: 'manager',
    title: '管理者',
    subtitle: '判断中継層',
    color: 'text-green-800',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-300',
    points: [
      '判断をつなぐ',
      '抱え込まない',
      '上位に返す',
    ],
  },
  {
    id: 'field',
    title: '現場',
    subtitle: '事実収集層',
    color: 'text-amber-800',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    points: [
      '事実を拾う',
      '結論は出さない',
      '迷ったら止まる',
    ],
  },
];

// NG表現
const NG_EXPRESSIONS = [
  { text: '独断', description: '一人で判断を完結させる' },
  { text: '抱え込み', description: '問題を自分だけで抱える' },
  { text: '責任の押し戻し', description: '判断責任を下位層に返す' },
];

export default function DecisionOSPage() {
  return (
    <main className="pb-8">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-zinc-900 mb-2">
            AA 判断と責任のOS
          </h1>
          <p className="text-lg text-zinc-600">
            オペレーティングシステム
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-zinc-100 rounded-full">
            <ArrowUp className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-zinc-700">
              判断は下から上へ、責任は上で止まる
            </span>
            <Shield className="w-4 h-4 text-blue-600" />
          </div>
        </div>

        {/* 説明カード */}
        <Card className="mb-8 bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">この図について</p>
                <p className="text-blue-700">
                  新人・現場・管理者が「判断はどう流れ、責任はどこにあるのか」を
                  一目で理解するための図です。迷ったときはこの流れに立ち返ってください。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* メインフロー図 */}
        <div className="relative mb-8">
          {/* 判断の流れ（上向き矢印）- 左側 */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 flex flex-col items-center text-blue-600">
            <ArrowUp className="w-6 h-6" />
            <div className="writing-mode-vertical text-xs font-medium mt-2 [writing-mode:vertical-rl]">
              判断の流れ
            </div>
            <ArrowUp className="w-6 h-6 mt-2" />
          </div>

          {/* 責任の所在（下向き矢印）- 右側 */}
          <div className="absolute right-0 top-8 flex flex-col items-center text-red-600">
            <Shield className="w-6 h-6" />
            <div className="text-xs font-medium mt-1 [writing-mode:vertical-rl]">
              責任の所在
            </div>
            <div className="mt-2 text-xs text-red-500 [writing-mode:vertical-rl]">
              ここで止まる
            </div>
          </div>

          {/* 層カード */}
          <div className="mx-12 space-y-4">
            {LAYERS.map((layer, index) => (
              <div key={layer.id}>
                <Card className={`${layer.bgColor} ${layer.borderColor} border-2`}>
                  <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row md:items-start gap-4">
                      {/* タイトル部分 */}
                      <div className="md:w-32 flex-shrink-0">
                        <h2 className={`text-xl font-bold ${layer.color}`}>
                          {layer.title}
                        </h2>
                        <p className="text-sm text-zinc-500 mt-0.5">
                          {layer.subtitle}
                        </p>
                      </div>

                      {/* ポイント */}
                      <div className="flex-1">
                        <ul className="space-y-2">
                          {layer.points.map((point, pointIndex) => (
                            <li
                              key={pointIndex}
                              className="flex items-center gap-2 text-zinc-700"
                            >
                              <CheckCircle className={`w-4 h-4 flex-shrink-0 ${layer.color}`} />
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* 経営層には責任マーク */}
                      {layer.id === 'executive' && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-blue-100 rounded-lg border border-blue-300">
                          <Shield className="w-5 h-5 text-blue-700" />
                          <span className="text-sm font-medium text-blue-800">
                            責任はここで止まる
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* 矢印（最後以外） */}
                {index < LAYERS.length - 1 && (
                  <div className="flex justify-center py-2">
                    <div className="flex flex-col items-center text-zinc-400">
                      <ArrowUp className="w-5 h-5" />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* フィードバックループ */}
        <Card className="mb-8 border-2 border-dashed border-zinc-300">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-zinc-100 rounded-lg">
                <Settings className="w-5 h-5 text-zinc-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-zinc-800 mb-2 flex items-center gap-2">
                  フィードバック
                  <span className="text-sm font-normal text-zinc-500">
                    経営 → 現場
                  </span>
                </h3>
                <p className="text-zinc-600">
                  判断の結果を受けて、経営は<strong>手順・ルール・構造を修正</strong>し、
                  現場が同じ迷いを抱えないよう仕組みを改善します。
                </p>
                <div className="mt-3 flex items-center gap-2 text-sm text-zinc-500">
                  <ArrowDown className="w-4 h-4" />
                  <span>仕組みの改善は上から下へ流れる</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* NG表現 */}
        <Card className="mb-8 bg-red-50 border-red-200 border-2">
          <CardContent className="p-5">
            <h3 className="font-bold text-red-800 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              NG表現（やってはいけないこと）
            </h3>
            <div className="grid md:grid-cols-3 gap-4">
              {NG_EXPRESSIONS.map((ng) => (
                <div
                  key={ng.text}
                  className="flex items-start gap-3 p-3 bg-white rounded-lg border border-red-200"
                >
                  <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-800">{ng.text}</p>
                    <p className="text-sm text-red-600 mt-0.5">{ng.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* OK表現 */}
        <Card className="mb-8 bg-green-50 border-green-200 border-2">
          <CardContent className="p-5">
            <h3 className="font-bold text-green-800 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              OK表現（推奨される行動）
            </h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-green-200">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-800">止まって相談</p>
                  <p className="text-sm text-green-600 mt-0.5">迷ったら判断せず上位に確認</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-green-200">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-800">事実だけ報告</p>
                  <p className="text-sm text-green-600 mt-0.5">結論は出さず事実を正確に伝える</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-green-200">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-800">速やかに上げる</p>
                  <p className="text-sm text-green-600 mt-0.5">判断事項は抱え込まず共有</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* フッター */}
        <div className="text-center text-sm text-zinc-500">
          <p>AA.OS.HUB — 判断は、ひとりで背負わない。責任は、最後まで引き受ける。</p>
        </div>
      </div>
    </main>
  );
}
