-- =============================================================
-- 原始表格存储权限配置（Supabase SQL Editor 执行一次即可）
--
-- 目标：excel-raw 存储桶，用于按【月份】存放 薪资计算/考勤管理 的原始 Excel。
--
-- 权限（用 auth.jwt() 判断角色，不查 auth.users，避免 permission denied）：
--   - 上传/写入：仅 人事专员(hr_staff) / 管理员(admin)
--   - 读取/下载/预览：所有已登录用户
--   - 删除：仅 人事专员/管理员
--
-- 幂等：先 drop 旧策略再建，可重复执行。
-- =============================================================

-- 0) 若 bucket 未创建，取消下面注释执行
-- select storage.create_bucket('excel-raw', public := true);

-- 1) 删除旧策略（避免重复/旧的 auth.users 版本冲突）
drop policy if exists "excel_raw_upload_hr" on storage.objects;
drop policy if exists "excel_raw_update_hr" on storage.objects;
drop policy if exists "excel_raw_read_all" on storage.objects;
drop policy if exists "excel_raw_delete_hr" on storage.objects;

-- 2) 上传/覆盖（人事专员/管理员）
create policy "excel_raw_upload_hr"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'excel-raw'
  and (auth.jwt() -> 'user_metadata' ->> 'role') in ('hr_staff', 'admin')
);

create policy "excel_raw_update_hr"
on storage.objects for update
to authenticated
using (
  bucket_id = 'excel-raw'
  and (auth.jwt() -> 'user_metadata' ->> 'role') in ('hr_staff', 'admin')
);

-- 3) 读取（所有已登录用户）
create policy "excel_raw_read_all"
on storage.objects for select
to authenticated
using (bucket_id = 'excel-raw');

-- 4) 删除（人事专员/管理员）
create policy "excel_raw_delete_hr"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'excel-raw'
  and (auth.jwt() -> 'user_metadata' ->> 'role') in ('hr_staff', 'admin')
);

-- 5) 使 bucket 公共可读（无需登录即可下载/预览）
update storage.buckets set public = true where id = 'excel-raw';
