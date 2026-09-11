-- =============================================================
-- 同步脚本：把「上海开弈人力资源研究院」简称改为「研究院」后，
-- 将 salary_records / attendance_records / employee_welfare_records
-- 三张关联表里 24 人的 unique_hash 从旧值「开弈人力资源」批量替换为新值「研究院」。
--
-- 说明：这 24 人的 unique_hash 由「姓名|发薪公司简称|入职日期」的 SHA-256 前 16 位生成。
--       简称变更后 hash 随之变化，必须把三张关联表里的旧 hash 一起更新，否则工资/考勤/福利关联断开。
-- 安全校验：新 hash 在三张表均不存在（不会撞车），24 人内部也无重复。
-- 幂等：只替换旧 hash，已替换为新的不会重复命中。
--
-- 使用方式：在 Supabase 控制台 SQL Editor 粘贴整段执行即可（或 psql）。
-- =============================================================

-- 1) 建临时映射表：旧 hash -> 新 hash
CREATE TEMP TABLE hash_map (old_hash text PRIMARY KEY, new_hash text NOT NULL);

INSERT INTO hash_map (old_hash, new_hash) VALUES
('c58d6673c7c2a1e6', '68d3fd10c7d894f3'), -- 王妤扬
('34d10d9a95b41197', '415cd36266522da3'), -- 曹保兵
('11425c10b06fcafd', '584384a9c594c506'), -- 杜宪
('ea04d4ff15fcb437', '29110bc50cd98340'), -- 樊涛
('18fe68168b1195fb', '3cb9cb2a9018b1ed'), -- 葛豪平
('5e03d48a1b0a3128', '3d08ca12f2a3d44c'), -- 侯心怡
('dbc1c7364e07313e', '4b09b107f4e2e058'), -- 黄一萧
('9e27bfdca818a1bf', 'c841c8abf73caaeb'), -- 姜启志
('3ec3b478970151ac', '765dfb05dbdd0269'), -- 李家东
('5e6aba8821ec6a22', '48ee5b9dba892e39'), -- 李晓晓
('11258bae31d23700', '08087398c843e85b'), -- 卢素丹
('053202592855e13f', '18fcb7c67b3f3a9d'), -- 芦智蔚
('566f2eea5c199d68', '4664063407dfbe1e'), -- 裘碧钰
('7de47e4b39e6ca81', 'aec0bba323770113'), -- 沈丽霞
('a5bfd8f50a3b8b9d', '3d19eaad84f769ea'), -- 施宏宇
('a497397a52c21bbf', '459247b500ea06be'), -- 宋广忠
('c59547e1ad659592', 'b986be6e3c96644b'), -- 孙文丽
('cff1db8e0cb2d551', '1df513df64db23fe'), -- 陶桔林
('66b39b693854b4cb', 'c5314c7c5d5e61f8'), -- 王倩
('b011038c0455077e', '3987e29803f3c40d'), -- 肖宝仙
('aee0e96aecdcd546', '9c824c1f5b903aa3'), -- 徐丽红
('5a902ebda66ed8b1', '3bb0290dfa4d3068'), -- 闫秀文
('4641fa477dd2dd9d', '7ceeb497aa6f3d90'), -- 杨漾
('4027052bc0710964', '4f9eece6c41b013a'); -- 张家喜

-- 2) 同步三张关联表
UPDATE salary_records s
SET unique_hash = m.new_hash
FROM hash_map m
WHERE s.unique_hash = m.old_hash;

UPDATE attendance_records a
SET unique_hash = m.new_hash
FROM hash_map m
WHERE a.unique_hash = m.old_hash;

UPDATE employee_welfare_records w
SET unique_hash = m.new_hash
FROM hash_map m
WHERE w.unique_hash = m.old_hash;

-- 3) 校验：三表里是否还残留旧 hash（应为 0）
SELECT 'salary_records' AS tbl, count(*) AS remain_old
FROM salary_records WHERE unique_hash IN (SELECT old_hash FROM hash_map)
UNION ALL
SELECT 'attendance_records', count(*) FROM attendance_records WHERE unique_hash IN (SELECT old_hash FROM hash_map)
UNION ALL
SELECT 'employee_welfare_records', count(*) FROM employee_welfare_records WHERE unique_hash IN (SELECT old_hash FROM hash_map);

-- 4) 清理临时表（可选）
-- DROP TABLE hash_map;
