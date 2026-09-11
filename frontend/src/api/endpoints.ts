import api from './client';

// ====== 公司简称对应表 ======
export const fetchCompanyMapping = () =>
  api.get('/company_mapping?select=*&order=sort_order');

// ====== 公司（兼容旧接口，返回简称对应表） ======
export const fetchCompanies = () =>
  api.get('/company_mapping?select=*&order=sort_order').then(r => ({
    data: {
      total: r.data.length,
      companies: r.data.map((c: any) => ({
        code: c.display_value,
        full_name: c.full_name,
        short_name: c.display_value,
        region: c.region,
      })),
    }
  }));

// ====== 员工花名册 ======
export const fetchEmployees = (params?: { pay_company?: string; is_active?: boolean; search?: string }) => {
  let query = '/employees?select=*';
  if (params?.pay_company) query += `&pay_company=eq.${encodeURIComponent(params.pay_company)}`;
  if (params?.search) query += `&or=(name.ilike.*${params.search}*)`;
  query += '&order=id';
  return api.get(query);
};

export const createEmployee = (data: any) =>
  api.post('/employees', data);

export const updateEmployee = (id: number, data: any) =>
  api.patch(`/employees?id=eq.${id}`, data);

export const deleteEmployee = (id: number) =>
  api.patch(`/employees?id=eq.${id}`, { is_disabled: true });

// ====== 福利套 ======
export const fetchWelfareSets = () =>
  api.get('/welfare_sets?select=*&order=name');

// ====== 社保记录 ======
export const fetchSocialRecords = (period: string) =>
  api.get(`/social_records?select=*&period=eq.${period}&order=unique_hash`);

// ====== 考勤记录 ======
export const fetchAttendanceRecords = (period: string) =>
  api.get(`/attendance_records?select=*&period=eq.${period}&order=unique_hash`);

export const upsertAttendance = (data: any) =>
  api.post('/attendance_records', data);

// ====== 薪资记录 ======
export const fetchSalaryRecords = (period: string) =>
  api.get(`/salary_records?select=*&period=eq.${period}&order=unique_hash`);

// ====== 报表/数据总览 ======
export const fetchCompanySummary = (period: string) =>
  api.get(`/salary_records?select=wage_subtotal,net_pay,total_cost,unique_hash&period=eq.${period}`)
    .then(r => {
      // Flat summary — just return the data for now, dashboard will aggregate
      const records = r.data;
      const totalWages = records.reduce((s: number, rec: any) => s + (rec.wage_subtotal || 0), 0);
      const totalNetPay = records.reduce((s: number, rec: any) => s + (rec.net_pay || 0), 0);
      const totalCost = records.reduce((s: number, rec: any) => s + (rec.total_cost || 0), 0);
      return {
        data: {
          period,
          employee_count: records.length,
          total_wages: totalWages,
          total_net_pay: totalNetPay,
          total_cost: totalCost,
        }
      };
    });
