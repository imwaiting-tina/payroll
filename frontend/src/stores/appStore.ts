import { create } from 'zustand';
import type { Company, Employee } from '../types';

interface AppStore {
  // 当前选中公司
  selectedCompany: string | null;
  setSelectedCompany: (code: string | null) => void;

  // 当前薪资月份（全局月份选择器，所有模块共用）
  currentPeriod: string;
  setCurrentPeriod: (period: string) => void;

  // 员工缓存
  employees: Employee[];
  setEmployees: (emps: Employee[]) => void;

  // 公司缓存
  companies: Company[];
  setCompanies: (companies: Company[]) => void;

  // 加载状态
  loading: boolean;
  setLoading: (v: boolean) => void;
}

const now = new Date();
const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

export const useStore = create<AppStore>((set) => ({
  selectedCompany: null,
  setSelectedCompany: (code) => set({ selectedCompany: code }),

  currentPeriod: defaultPeriod,
  setCurrentPeriod: (period) => set({ currentPeriod: period }),

  employees: [],
  setEmployees: (employees) => set({ employees }),

  companies: [],
  setCompanies: (companies) => set({ companies }),

  loading: false,
  setLoading: (loading) => set({ loading }),
}));

