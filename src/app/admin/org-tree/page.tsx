'use client';

import { useState, useEffect } from 'react';
import {
  Building2,
  Briefcase,
  MapPin,
  Users,
  UserCheck,
  MoreHorizontal,
  Plus,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Edit,
  Trash2,
  Crown,
  X,
  Check,
  AlertCircle,
  Move,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

// ========== 型定義 ==========

type OrgUnitType = 'corp' | 'business' | 'site' | 'dept' | 'team' | 'other';
type RoleInOrg = 'member' | 'leader' | 'manager' | 'executive' | 'other';
type OrgManagerType = 'manager' | 'approver' | 'owner' | 'other';

interface OrgUnit {
  id: string;
  name: string;
  type: OrgUnitType;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OrgUnitWithChildren extends OrgUnit {
  children: OrgUnitWithChildren[];
}

interface UserOrgMembership {
  id: string;
  userId: string;
  userName: string | null;
  orgUnitId: string;
  orgUnitName: string | null;
  roleInOrg: RoleInOrg;
  isPrimary: boolean;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OrgManager {
  id: string;
  orgUnitId: string;
  userId: string;
  userName: string | null;
  type: OrgManagerType;
  createdAt: string;
}

interface OrgStats {
  totalUnits: number;
  activeUnits: number;
  totalMemberships: number;
  totalManagers: number;
  byType: Record<OrgUnitType, number>;
}

// ========== 設定 ==========

const TYPE_CONFIG: Record<OrgUnitType, { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  corp: { label: '法人', icon: <Building2 className="w-4 h-4" />, color: 'text-purple-700', bgColor: 'bg-purple-50' },
  business: { label: '事業', icon: <Briefcase className="w-4 h-4" />, color: 'text-blue-700', bgColor: 'bg-blue-50' },
  site: { label: '拠点', icon: <MapPin className="w-4 h-4" />, color: 'text-green-700', bgColor: 'bg-green-50' },
  dept: { label: '部署', icon: <Users className="w-4 h-4" />, color: 'text-amber-700', bgColor: 'bg-amber-50' },
  team: { label: 'チーム', icon: <UserCheck className="w-4 h-4" />, color: 'text-cyan-700', bgColor: 'bg-cyan-50' },
  other: { label: 'その他', icon: <MoreHorizontal className="w-4 h-4" />, color: 'text-zinc-600', bgColor: 'bg-zinc-50' },
};

const ROLE_IN_ORG_LABELS: Record<RoleInOrg, string> = {
  member: 'メンバー',
  leader: 'リーダー',
  manager: '管理者',
  executive: '責任者',
  other: 'その他',
};

const MANAGER_TYPE_LABELS: Record<OrgManagerType, string> = {
  manager: '管理者',
  approver: '承認者',
  owner: 'オーナー',
  other: 'その他',
};

// ========== ユーティリティ ==========

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ========== コンポーネント ==========

interface TreeNodeProps {
  node: OrgUnitWithChildren;
  level: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (unit: OrgUnit) => void;
  selectedId: string | null;
}

function TreeNode({ node, level, expandedIds, onToggle, onSelect, selectedId }: TreeNodeProps) {
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const config = TYPE_CONFIG[node.type];
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-colors ${
          isSelected ? 'bg-blue-100 border border-blue-300' : 'hover:bg-zinc-50'
        } ${!node.isActive ? 'opacity-50' : ''}`}
        style={{ paddingLeft: `${level * 24 + 12}px` }}
        onClick={() => onSelect(node)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(node.id);
          }}
          className={`w-5 h-5 flex items-center justify-center ${hasChildren ? '' : 'invisible'}`}
        >
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className={`w-6 h-6 rounded flex items-center justify-center ${config.bgColor}`}>
          <span className={config.color}>{config.icon}</span>
        </div>
        <span className="flex-1 font-medium text-zinc-900">{node.name}</span>
        <span className={`px-2 py-0.5 rounded text-xs ${config.bgColor} ${config.color}`}>
          {config.label}
        </span>
        {!node.isActive && (
          <span className="px-2 py-0.5 rounded text-xs bg-zinc-200 text-zinc-600">無効</span>
        )}
      </div>
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onSelect={onSelect}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CreateOrgModalProps {
  isOpen: boolean;
  parentUnit: OrgUnit | null;
  allUnits: OrgUnit[];
  onClose: () => void;
  onCreated: () => void;
}

function CreateOrgModal({ isOpen, parentUnit, allUnits, onClose, onCreated }: CreateOrgModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<OrgUnitType>('dept');
  const [parentId, setParentId] = useState<string | null>(parentUnit?.id ?? null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setParentId(parentUnit?.id ?? null);
  }, [parentUnit]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          type,
          parentId,
          description: description || null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || '作成に失敗しました');
      }

      onCreated();
      onClose();
      setName('');
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">組織を追加</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              組織名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="例: 営業部"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              種別 <span className="text-red-500">*</span>
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as OrgUnitType)}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {Object.entries(TYPE_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">親組織</label>
            <select
              value={parentId ?? ''}
              onChange={(e) => setParentId(e.target.value || null)}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">（ルート / 最上位）</option>
              {allUnits.filter((u) => u.isActive).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}（{TYPE_CONFIG[unit.type].label}）
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">説明</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="組織の説明（任意）"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-zinc-600 hover:text-zinc-800"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? '作成中...' : <><Plus className="w-4 h-4" />作成</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface OrgDetailPanelProps {
  unit: OrgUnit;
  allUnits: OrgUnit[];
  onClose: () => void;
  onUpdate: () => void;
}

function OrgDetailPanel({ unit, allUnits, onClose, onUpdate }: OrgDetailPanelProps) {
  const [members, setMembers] = useState<UserOrgMembership[]>([]);
  const [managers, setManagers] = useState<OrgManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'members' | 'managers'>('info');

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(unit.name);
  const [editType, setEditType] = useState(unit.type);
  const [editDescription, setEditDescription] = useState(unit.description || '');

  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTargetId, setMoveTargetId] = useState<string | null>(unit.parentId);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);

  const config = TYPE_CONFIG[unit.type];

  useEffect(() => {
    fetchDetails();
  }, [unit.id]);

  async function fetchDetails() {
    setLoading(true);
    try {
      const res = await fetch(`/api/org/${unit.id}`);
      const data = await res.json();
      if (data.success) {
        setMembers(data.members || []);
        setManagers(data.managers || []);
      }
    } catch (err) {
      console.error('Failed to fetch details:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEdit() {
    try {
      const res = await fetch(`/api/org/${unit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          type: editType,
          description: editDescription || null,
        }),
      });
      if (res.ok) {
        setEditing(false);
        onUpdate();
      }
    } catch (err) {
      console.error('Failed to update:', err);
    }
  }

  function handleDeactivate() {
    setShowDeactivateConfirm(true);
  }

  async function executeDeactivate() {
    try {
      const res = await fetch(`/api/org/${unit.id}/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deactivate' }),
      });
      if (res.ok) {
        onUpdate();
      }
    } catch (err) {
      console.error('Failed to deactivate:', err);
    } finally {
      setShowDeactivateConfirm(false);
    }
  }

  async function handleReactivate() {
    try {
      const res = await fetch(`/api/org/${unit.id}/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reactivate' }),
      });
      if (res.ok) {
        onUpdate();
      }
    } catch (err) {
      console.error('Failed to reactivate:', err);
    }
  }

  async function handleMove() {
    try {
      const res = await fetch(`/api/org/${unit.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newParentId: moveTargetId }),
      });
      if (res.ok) {
        setShowMoveModal(false);
        onUpdate();
      }
    } catch (err) {
      console.error('Failed to move:', err);
    }
  }

  return (
    <div className="bg-white border-l border-zinc-200 h-full flex flex-col">
      {/* ヘッダー */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-200">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.bgColor}`}>
            <span className={config.color}>{config.icon}</span>
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900">{unit.name}</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded ${config.bgColor} ${config.color}`}>
                {config.label}
              </span>
              {!unit.isActive && (
                <span className="px-2 py-0.5 rounded bg-zinc-200 text-zinc-600">無効</span>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* タブ */}
      <div className="flex border-b border-zinc-200">
        {(['info', 'members', 'managers'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 ${
              activeTab === tab
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {tab === 'info' ? '基本情報' : tab === 'members' ? `メンバー (${members.length})` : `責任者 (${managers.length})`}
          </button>
        ))}
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center py-8 text-zinc-500">読み込み中...</div>
        ) : activeTab === 'info' ? (
          <div className="space-y-4">
            {editing ? (
              <>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">組織名</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full border border-zinc-300 rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">種別</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as OrgUnitType)}
                    className="w-full border border-zinc-300 rounded px-3 py-2 text-sm"
                  >
                    {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                      <option key={key} value={key}>{cfg.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">説明</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={2}
                    className="w-full border border-zinc-300 rounded px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center justify-center gap-1"
                  >
                    <Check className="w-4 h-4" />
                    保存
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-3 py-2 text-zinc-600 hover:text-zinc-800 text-sm"
                  >
                    キャンセル
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">説明</div>
                  <div className="text-sm text-zinc-900">{unit.description || '-'}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">作成日</div>
                    <div className="text-sm text-zinc-900">{formatDate(unit.createdAt)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 mb-1">更新日</div>
                    <div className="text-sm text-zinc-900">{formatDate(unit.updatedAt)}</div>
                  </div>
                </div>
                <div className="pt-4 border-t border-zinc-200 space-y-2">
                  <button
                    onClick={() => setEditing(true)}
                    className="w-full px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded flex items-center justify-center gap-2"
                  >
                    <Edit className="w-4 h-4" />
                    編集
                  </button>
                  <button
                    onClick={() => setShowMoveModal(true)}
                    className="w-full px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 rounded flex items-center justify-center gap-2"
                  >
                    <Move className="w-4 h-4" />
                    移動
                  </button>
                  {unit.isActive ? (
                    <button
                      onClick={handleDeactivate}
                      className="w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      無効化
                    </button>
                  ) : (
                    <button
                      onClick={handleReactivate}
                      className="w-full px-3 py-2 text-sm text-green-600 hover:bg-green-50 rounded flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      再有効化
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : activeTab === 'members' ? (
          <div className="space-y-2">
            {members.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">メンバーがいません</div>
            ) : (
              members.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2 px-3 bg-zinc-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center">
                      <Users className="w-4 h-4 text-zinc-500" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-zinc-900">
                        {m.userName || m.userId}
                        {m.isPrimary && (
                          <span className="ml-2 text-xs text-amber-600">主所属</span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500">{ROLE_IN_ORG_LABELS[m.roleInOrg]}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {managers.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">責任者がいません</div>
            ) : (
              managers.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2 px-3 bg-zinc-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                      <Crown className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-zinc-900">{m.userName || m.userId}</div>
                      <div className="text-xs text-zinc-500">{MANAGER_TYPE_LABELS[m.type]}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 無効化確認 */}
      <ConfirmDialog
        open={showDeactivateConfirm}
        title="組織の無効化"
        message={`「${unit.name}」を無効化しますか？`}
        confirmLabel="無効化する"
        variant="danger"
        onConfirm={executeDeactivate}
        onCancel={() => setShowDeactivateConfirm(false)}
      />

      {/* 移動モーダル */}
      {showMoveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-zinc-200">
              <h3 className="font-semibold text-zinc-900">組織を移動</h3>
              <button onClick={() => setShowMoveModal(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-zinc-600">
                「{unit.name}」の親組織を選択してください。
              </p>
              <select
                value={moveTargetId ?? ''}
                onChange={(e) => setMoveTargetId(e.target.value || null)}
                className="w-full border border-zinc-300 rounded-lg px-3 py-2"
              >
                <option value="">（ルート / 最上位）</option>
                {allUnits.filter((u) => u.isActive && u.id !== unit.id).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}（{TYPE_CONFIG[u.type].label}）
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowMoveModal(false)}
                  className="px-4 py-2 text-zinc-600 hover:text-zinc-800"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleMove}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  移動
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== メインページ ==========

export default function OrgTreePage() {
  const [tree, setTree] = useState<OrgUnitWithChildren[]>([]);
  const [allUnits, setAllUnits] = useState<OrgUnit[]>([]);
  const [stats, setStats] = useState<OrgStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedUnit, setSelectedUnit] = useState<OrgUnit | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  useEffect(() => {
    fetchData();
  }, [includeInactive]);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (includeInactive) params.set('includeInactive', 'true');

      const [treeRes, unitsRes] = await Promise.all([
        fetch(`/api/org/tree?${params.toString()}`),
        fetch(`/api/org?${params.toString()}`),
      ]);

      const [treeData, unitsData] = await Promise.all([treeRes.json(), unitsRes.json()]);

      if (treeData.success) {
        setTree(treeData.tree || []);
        setStats(treeData.stats || null);
        // 初期展開: ルートを展開
        if (expandedIds.size === 0) {
          const rootIds = (treeData.tree || []).map((n: OrgUnitWithChildren) => n.id);
          setExpandedIds(new Set(rootIds));
        }
      }
      if (unitsData.success) {
        setAllUnits(unitsData.units || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }

  function handleToggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleExpandAll() {
    const allIds = new Set(allUnits.map((u) => u.id));
    setExpandedIds(allIds);
  }

  function handleCollapseAll() {
    setExpandedIds(new Set());
  }

  return (
    <div className="h-full flex flex-col">
      {/* ヘッダー */}
      <div className="p-6 border-b border-zinc-200 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">組織ツリー</h1>
            <p className="text-zinc-600 mt-1">組織構造・所属・責任者を管理</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-600">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
                className="rounded border-zinc-300"
              />
              無効を含む
            </label>
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200"
            >
              <RefreshCw className="w-4 h-4" />
              更新
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              追加
            </button>
          </div>
        </div>

        {/* 統計サマリー */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mt-4">
            <div className="bg-zinc-50 rounded-lg p-3">
              <div className="text-xs text-zinc-500">総組織数</div>
              <div className="text-xl font-bold text-zinc-900">{stats.totalUnits}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-xs text-green-600">有効</div>
              <div className="text-xl font-bold text-green-700">{stats.activeUnits}</div>
            </div>
            {Object.entries(stats.byType).map(([type, count]) => {
              if (count === 0) return null;
              const cfg = TYPE_CONFIG[type as OrgUnitType];
              return (
                <div key={type} className={`${cfg.bgColor} rounded-lg p-3`}>
                  <div className={`text-xs ${cfg.color}`}>{cfg.label}</div>
                  <div className={`text-xl font-bold ${cfg.color}`}>{count}</div>
                </div>
              );
            })}
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-xs text-blue-600">所属</div>
              <div className="text-xl font-bold text-blue-700">{stats.totalMemberships}</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="text-xs text-amber-600">責任者</div>
              <div className="text-xl font-bold text-amber-700">{stats.totalManagers}</div>
            </div>
          </div>
        )}
      </div>

      {/* メインコンテンツ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ツリービュー */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-zinc-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          ) : tree.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>組織がありません</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 text-blue-600 hover:underline"
              >
                最初の組織を作成する
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={handleExpandAll}
                  className="text-xs text-blue-600 hover:underline"
                >
                  すべて展開
                </button>
                <span className="text-zinc-300">|</span>
                <button
                  onClick={handleCollapseAll}
                  className="text-xs text-blue-600 hover:underline"
                >
                  すべて折りたたむ
                </button>
              </div>
              <div className="bg-white border border-zinc-200 rounded-lg">
                {tree.map((node) => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    level={0}
                    expandedIds={expandedIds}
                    onToggle={handleToggle}
                    onSelect={setSelectedUnit}
                    selectedId={selectedUnit?.id ?? null}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* 詳細パネル */}
        {selectedUnit && (
          <div className="w-96 flex-shrink-0">
            <OrgDetailPanel
              unit={selectedUnit}
              allUnits={allUnits}
              onClose={() => setSelectedUnit(null)}
              onUpdate={() => {
                fetchData();
                // 選択を維持するため、更新後に再取得
                const updated = allUnits.find((u) => u.id === selectedUnit.id);
                if (updated) setSelectedUnit(updated);
              }}
            />
          </div>
        )}
      </div>

      {/* モーダル */}
      <CreateOrgModal
        isOpen={showCreateModal}
        parentUnit={selectedUnit}
        allUnits={allUnits}
        onClose={() => setShowCreateModal(false)}
        onCreated={fetchData}
      />
    </div>
  );
}
