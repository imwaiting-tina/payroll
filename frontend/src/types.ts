/* 全局类型定义 — v2 */

export interface Company {
  code: string;
  full_name: string;
  short_name: string;
  region: string;
  category: string;
  social_policy: string;
  finance_contact?: string;
  seal_person?: string;
  is_active: boolean;
}

// ====== 员工花名册 ======
export interface Employee {
  id: number;
  unique_hash: string;
  name: string;
  status: '在职' | '离职';
  cost_center?: string;
  pay_company: string;          // 发薪公司（简称）
  tax_method: 'normal' | 'service' | 'non_taxable' | 'intern' | 'flexible' | 'cash';
  department?: string;
  report_to?: string;
  position?: string;
  job_level: string;            // 职级 Ⅰ-Ⅶ
  attendance_type: string;      // 考勤制：全日制/非全日制/代收代付残疾人/不定时工作制
  basic_salary?: number;        // 基本工资（后续板块数据来源）
  provision_welfare?: number;   // 预提福利费（花名册导入，链接到数据总览 summary）
  entry_date: string;           // 入职日期
  leave_date?: string;          // 离职日期
  is_disabled: boolean;
  created_at: string;
}

// ====== 公司简称对应表 ======
export interface CompanyMapping {
  id: number;
  display_value: string;   // 简称
  full_name: string;       // 全称
  region?: string;
  sort_order: number;
}

// ====== 社保福利套 ======
export interface SocialWelfareSet {
  id: number;
  code: string;
  name: string;
  region?: string;
  is_builtin: boolean;
  effective_date?: string;
  expiry_date?: string;
  status: string;
  base_min?: number | null;
  base_max?: number | null;
  allow_special_base: boolean;
  pension_enabled: boolean;
  medical_enabled: boolean;
  unemployment_enabled: boolean;
  injury_enabled: boolean;
  maternity_enabled: boolean;
  // 各险种最低基数（个人和公司一致）
  pension_base_min?: number | null;
  medical_base_min?: number | null;
  unemployment_base_min?: number | null;
  injury_base_min?: number | null;
  maternity_base_min?: number | null;
  pension_rate_p: number;
  medical_rate_p: number;
  medical_fixed_p: number;
  unemployment_rate_p: number;
  pension_rate_c: number;
  medical_rate_c: number;
  unemployment_rate_c: number;
  injury_rate_c: number;
  maternity_rate_c: number;
  rounding_method: string;
  rounding_precision: number;
  allow_override_round: boolean;
  remark?: string;
}

// ====== 公积金福利套 ======
export interface HousingFundSet {
  id: number;
  code: string;
  name: string;
  region?: string;
  is_builtin: boolean;
  effective_date?: string;
  expiry_date?: string;
  status: string;
  base_min?: number | null;
  base_max?: number | null;
  supp_base_source: string;
  allow_stop_supp: boolean;
  normal_rate_p: number;
  normal_rate_c: number;
  supp_enabled: boolean;
  supp_rate_p: number;
  supp_rate_c: number;
  normal_round_method: string;
  normal_round_precision: number;
  supp_round_method: string;
  supp_round_precision: number;
  remark?: string;
}

// ====== 员工福利缴纳记录 ======
export interface EmployeeWelfareRecord {
  id: number;
  unique_hash: string;
  period: string;
  effective_month?: string;
  expiry_month?: string;
  social_welfare_code?: string;
  housing_fund_code?: string;
  social_status?: string;
  housing_status?: string;
  social_no_reason?: string;
  housing_no_reason?: string;
  no_pay_start_month?: string;
  no_pay_end_month?: string;
  social_base?: number;
  housing_base?: number;
  supp_enabled: boolean;
  supp_base?: number;
  // 社保金额快照
  pension_p_amt: number;
  medical_p_amt: number;
  unemployment_p_amt: number;
  pension_c_amt: number;
  medical_c_amt: number;
  unemployment_c_amt: number;
  injury_c_amt: number;
  maternity_c_amt: number;
  // 公积金金额快照
  normal_housing_p_amt: number;
  normal_housing_c_amt: number;
  supp_housing_p_amt: number;
  supp_housing_c_amt: number;
  // 汇总
  personal_social_total: number;
  personal_housing_total: number;
  personal_total: number;
  company_social_total: number;
  company_housing_total: number;
  company_total: number;
  data_status: string;
  snapshot?: any;
  remark?: string;
  last_calc_time?: string;
}

// ====== 社保管理 ======
export interface SocialRecord {
  id: number;
  unique_hash: string;
  period: string;
  welfare_set: string;
  social_base?: number;
  housing_fund_base?: number;
  // 个人
  pension_p?: number;
  medical_p?: number;
  unemployment_p?: number;
  housing_fund_p?: number;
  supp_housing_p?: number;
  // 公司
  pension_c?: number;
  medical_c?: number;
  unemployment_c?: number;
  injury_c?: number;
  maternity_c?: number;
  housing_fund_c?: number;
  supp_housing_c?: number;
  created_at: string;
  updated_at: string;
}

// ====== 福利套设置 ======
export interface WelfareSet {
  id: number;
  name: string;
  region: string;
  description?: string;
  // 个人费率
  pension_rate_p: number;
  medical_rate_p: number;
  medical_fixed_p: number;
  unemployment_rate_p: number;
  housing_fund_rate_p: number;
  supp_housing_rate_p: number;
  // 公司费率
  pension_rate_c: number;
  medical_rate_c: number;
  unemployment_rate_c: number;
  injury_rate_c: number;
  maternity_rate_c: number;
  housing_fund_rate_c: number;
  supp_housing_rate_c: number;
  rounding_method: 'ROUND' | 'ROUNDUP' | 'ROUND_1DEC';
  is_active: boolean;
}

// ====== 考勤管理 ======
export interface AttendanceRecord {
  id: number;
  unique_hash: string;
  period: string;
  employee_no: string;
  name: string;
  basic_salary?: number;
  attendance_wage?: number;
  sick_days: number;
  sick_adjust: number;
  personal_days: number;
  personal_adjust: number;
  annual_leave: number;
  compensatory_leave: number;
  absenteeism_days: number;
  funeral_leave: number;
  parental_leave: number;
  marriage_leave: number;
  maternity_leave: number;
  adjust_type?: string;
  adjust_amount?: number;
  regular_overtime_days?: number;
  weekend_overtime_days?: number;
  holiday_overtime_days?: number;
  guard_overtime_days?: number;
  overtime_hours?: number;
  hourly_rate?: number;
  on_off_adjust: number;
}

// ====== 薪资计算 ======
export interface SalaryRecord {
  id: number;
  unique_hash: string;
  period: string;
  month_number: number;
  // 收入项
  base_salary?: number;
  allowance_supp?: number;
  attendance_adjust?: number;
  other_adjust?: number;
  insurance_amount?: number;
  kpi_provision?: number;
  monthly_wage?: number;
  office_comm?: number;
  performance_pay?: number;
  apartment_comm?: number;
  talent_kpi?: number;
  heat_allowance?: number;
  other_allowance?: number;
  security_bonus?: number;
  cleaning_bonus?: number;
  wage_subtotal?: number;
  // 社保基数
  social_base?: number;
  housing_fund_base?: number;
  // 个人福利
  pension_p?: number;
  medical_p?: number;
  unemployment_p?: number;
  housing_fund_p?: number;
  supp_housing_p?: number;
  // 隐藏 — 专项扣除
  cumul_child_edu?: number;
  cumul_mortgage?: number;
  cumul_rent?: number;
  cumul_elder_care?: number;
  cumul_continuing_edu?: number;
  // 隐藏 — 个税中间值
  month_taxable_wage?: number;
  cumul_income?: number;
  taxable_income?: number;
  cumul_tax_paid?: number;
  // 当月个税
  monthly_tax?: number;
  insurance_adjust?: number;
  net_pay?: number;
  // 公司福利
  pension_c?: number;
  medical_c?: number;
  unemployment_c?: number;
  injury_c?: number;
  maternity_c?: number;
  housing_fund_c?: number;
  supp_housing_c?: number;
  // 企业成本
  total_cost?: number;
  provision_welfare?: number;
  is_locked: boolean;
}
