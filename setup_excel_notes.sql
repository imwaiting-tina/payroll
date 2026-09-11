-- =============================================================
-- 原始表格备注映射表（Supabase SQL Editor 执行一次）
--
-- 用途：把"上传时应显示的备注"存下来，因为 Supabase Storage 对象名不允许中文，
--       所以展示/下载都用这张表里的中文备注，存储名用系统英文安全名。
-- =============================================================

create table if not exists public.raw_excel_notes (
  id          bigserial primary key,
  module      text not null,      -- 'payroll' | 'attendance'
  period      text not null,      -- 'YYYY-MM'
  object_name text not null,      -- Storage 里的英文安全名
  note        text not null,      -- 用户填的中文备注（如 6月考勤表）
  created_at  timestamptz default now(),
  unique(module, period, object_name)
);

-- 开放 RLS，仅允许读取（写入走 service_role，或放开给 hr_staff）
alter table public.raw_excel_notes enable row level security;

-- 允许已登录用户读取（所有人可看备注）
create policy "raw_excel_notes_read_all"
on public.raw_excel_notes for select
to authenticated
using (true);

-- 允许人事专员/管理员写入备注（用 auth.jwt() 判断角色）
create policy "raw_excel_notes_write_hr"
on public.raw_excel_notes for insert
to authenticated
with check (
  (auth.jwt() -> 'user_metadata' ->> 'role') in ('hr_staff', 'admin')
);
