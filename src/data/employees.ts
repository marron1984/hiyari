// ======== 従業員・事業所シードデータ ========

// 事業所データ
export const BRANCHES_SEED = [
  {
    id: 'management',
    name: 'マネジメント本部',
    tenantId: 'defaultTenant',
    headcount: 5,
  },
  {
    id: 'eekaigo',
    name: 'ええかいご',
    tenantId: 'defaultTenant',
    headcount: 22,
  },
  {
    id: 'eesumai',
    name: 'ええすまい',
    tenantId: 'defaultTenant',
    headcount: 1,
  },
  {
    id: 'eesupport',
    name: 'ええさぽーと',
    tenantId: 'defaultTenant',
    headcount: 1,
  },
  {
    id: 'eekango',
    name: 'ええかんご',
    tenantId: 'defaultTenant',
    headcount: 10,
  },
];

// 資格タイプ
export type QualificationType =
  | 'なし'
  | '初任者'
  | '実務者'
  | 'ヘルパー２級'
  | '介護福祉士'
  | 'EPA介護福祉士'
  | '特定活動'
  | '看護師'
  | 'OT'
  | 'PT'
  | 'ST';

// 雇用形態
export type EmploymentType = '役員' | '正社員' | 'パート' | '契約社員';

// 従業員データ
export interface EmployeeSeed {
  name: string;
  age: number;
  qualification: QualificationType;
  employmentType: EmploymentType;
  branchId: string;
  notes: string;
  employeeCode: string;
}

// 事業所IDマッピング
const BRANCH_MAP: Record<string, string> = {
  'マネジメント本部': 'management',
  'ええかいご': 'eekaigo',
  'ええすまい': 'eesumai',
  'ええさぽーと': 'eesupport',
  'ええかんご': 'eekango',
};

// 従業員シードデータ
export const EMPLOYEES_SEED: EmployeeSeed[] = [
  // マネジメント本部
  { name: '大石 崇敬', age: 42, qualification: 'なし', employmentType: '役員', branchId: 'management', notes: '社長', employeeCode: 'EMP001' },
  { name: '吉田 俊輔', age: 41, qualification: '実務者', employmentType: '役員', branchId: 'management', notes: '副社長', employeeCode: 'EMP002' },
  { name: '力久 凌太郎', age: 27, qualification: 'なし', employmentType: '正社員', branchId: 'management', notes: '', employeeCode: 'EMP036' },
  { name: '鳥羽慧子', age: 30, qualification: 'なし', employmentType: '正社員', branchId: 'management', notes: '', employeeCode: 'EMP037' },
  { name: '藤原 洋', age: 41, qualification: 'なし', employmentType: '正社員', branchId: 'management', notes: 'ホープ', employeeCode: 'EMP038' },

  // ええかいご
  { name: '拔屋 壮勇', age: 28, qualification: '介護福祉士', employmentType: '正社員', branchId: 'eekaigo', notes: 'マネージャー', employeeCode: 'EMP003' },
  { name: '宮井 望', age: 51, qualification: '実務者', employmentType: '正社員', branchId: 'eekaigo', notes: '休職中', employeeCode: 'EMP005' },
  { name: '松川 朱理', age: 39, qualification: '初任者', employmentType: '正社員', branchId: 'eekaigo', notes: '責任者', employeeCode: 'EMP006' },
  { name: '長田 由美', age: 52, qualification: '介護福祉士', employmentType: '正社員', branchId: 'eekaigo', notes: '', employeeCode: 'EMP007' },
  { name: '岩谷 桃子', age: 28, qualification: '介護福祉士', employmentType: '正社員', branchId: 'eekaigo', notes: '責任者', employeeCode: 'EMP009' },
  { name: 'ジャン', age: 24, qualification: 'EPA介護福祉士', employmentType: '正社員', branchId: 'eekaigo', notes: '', employeeCode: 'EMP010' },
  { name: 'タン', age: 24, qualification: 'EPA介護福祉士', employmentType: '正社員', branchId: 'eekaigo', notes: '', employeeCode: 'EMP011' },
  { name: 'リン', age: 29, qualification: 'EPA介護福祉士', employmentType: '正社員', branchId: 'eekaigo', notes: '', employeeCode: 'EMP012' },
  { name: 'ウィン', age: 23, qualification: '特定活動', employmentType: '正社員', branchId: 'eekaigo', notes: '', employeeCode: 'EMP013' },
  { name: '野田淳子', age: 53, qualification: '介護福祉士', employmentType: '正社員', branchId: 'eekaigo', notes: '', employeeCode: 'EMP014' },
  { name: '横山琴美', age: 27, qualification: '初任者', employmentType: 'パート', branchId: 'eekaigo', notes: '', employeeCode: 'EMP015' },
  { name: '北谷英子', age: 52, qualification: '介護福祉士', employmentType: 'パート', branchId: 'eekaigo', notes: '', employeeCode: 'EMP016' },
  { name: '今田慶子', age: 46, qualification: 'ヘルパー２級', employmentType: 'パート', branchId: 'eekaigo', notes: '', employeeCode: 'EMP017' },
  { name: '仲田真弓', age: 40, qualification: '初任者', employmentType: 'パート', branchId: 'eekaigo', notes: '', employeeCode: 'EMP018' },
  { name: '田坂 亜希子', age: 47, qualification: '介護福祉士', employmentType: 'パート', branchId: 'eekaigo', notes: '夜勤専従', employeeCode: 'EMP019' },
  { name: '森光 希久子', age: 32, qualification: '看護師', employmentType: 'パート', branchId: 'eekaigo', notes: '夜勤専従', employeeCode: 'EMP020' },
  { name: 'タム', age: 25, qualification: 'なし', employmentType: 'パート', branchId: 'eekaigo', notes: 'サポーター', employeeCode: 'EMP021' },
  { name: 'ニュン', age: 24, qualification: 'なし', employmentType: 'パート', branchId: 'eekaigo', notes: 'サポーター', employeeCode: 'EMP022' },
  { name: '山本 三津恵', age: 56, qualification: '看護師', employmentType: 'パート', branchId: 'eekaigo', notes: '夜勤専従', employeeCode: 'EMP023' },
  { name: '熊野 ほのか', age: 28, qualification: '看護師', employmentType: 'パート', branchId: 'eekaigo', notes: '夜勤専従', employeeCode: 'EMP025' },

  // ええすまい
  { name: '生田 友哉', age: 30, qualification: '介護福祉士', employmentType: '正社員', branchId: 'eesumai', notes: 'マネージャー', employeeCode: 'EMP004' },

  // ええさぽーと
  { name: '櫻井 冬弥', age: 29, qualification: '実務者', employmentType: '正社員', branchId: 'eesupport', notes: '', employeeCode: 'EMP008' },

  // ええかんご
  { name: '松本 颯希', age: 29, qualification: '看護師', employmentType: '正社員', branchId: 'eekango', notes: 'マネージャー', employeeCode: 'EMP026' },
  { name: '園田 沙耶香', age: 26, qualification: '看護師', employmentType: '正社員', branchId: 'eekango', notes: 'リーダー', employeeCode: 'EMP027' },
  { name: '松村 知恵', age: 55, qualification: '看護師', employmentType: '正社員', branchId: 'eekango', notes: '責任者', employeeCode: 'EMP028' },
  { name: '木田 かおり', age: 50, qualification: '看護師', employmentType: '正社員', branchId: 'eekango', notes: '', employeeCode: 'EMP029' },
  { name: '福岡 志保', age: 27, qualification: '看護師', employmentType: '正社員', branchId: 'eekango', notes: '', employeeCode: 'EMP030' },
  { name: '小野 真由子', age: 37, qualification: '看護師', employmentType: '正社員', branchId: 'eekango', notes: '', employeeCode: 'EMP031' },
  { name: '市川 晴那', age: 29, qualification: '看護師', employmentType: '正社員', branchId: 'eekango', notes: '', employeeCode: 'EMP032' },
  { name: '井伊 真理恵', age: 35, qualification: '看護師', employmentType: '正社員', branchId: 'eekango', notes: '', employeeCode: 'EMP033' },
  { name: '坂本 嗣門', age: 28, qualification: 'OT', employmentType: '正社員', branchId: 'eekango', notes: '', employeeCode: 'EMP034' },
];

// 従業員コードから名前を取得するマップ
export const EMPLOYEE_NAME_MAP = new Map<string, string>(
  EMPLOYEES_SEED.map((e) => [e.employeeCode, e.name])
);

// 従業員名からコードを取得するマップ
export const EMPLOYEE_CODE_MAP = new Map<string, string>(
  EMPLOYEES_SEED.map((e) => [e.name, e.employeeCode])
);

// 事業所別従業員リスト
export function getEmployeesByBranch(branchId: string): EmployeeSeed[] {
  return EMPLOYEES_SEED.filter((e) => e.branchId === branchId);
}

// 雇用形態別従業員リスト
export function getEmployeesByEmploymentType(type: EmploymentType): EmployeeSeed[] {
  return EMPLOYEES_SEED.filter((e) => e.employmentType === type);
}

// 正社員のみ
export function getFullTimeEmployees(): EmployeeSeed[] {
  return EMPLOYEES_SEED.filter((e) => e.employmentType === '正社員' || e.employmentType === '役員');
}

// パートのみ
export function getPartTimeEmployees(): EmployeeSeed[] {
  return EMPLOYEES_SEED.filter((e) => e.employmentType === 'パート');
}
