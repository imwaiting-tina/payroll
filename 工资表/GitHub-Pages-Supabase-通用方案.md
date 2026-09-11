# GitHub Pages + Supabase 全栈部署通用方案

## 一句话概述

代码放 GitHub，数据存 Supabase，前端用 GitHub Pages 部署。零服务器成本，适合内部工具、数据后台、管理系统。

## 每个组件干什么

| 组件 | 角色 | 免费额度 |
|------|------|----------|
| **GitHub** | 存放代码、版本管理 | 无限私有仓库 |
| **GitHub Pages** | 托管前端网页，免费域名 `xxx.github.io` | 无限流量 |
| **Supabase** | PostgreSQL 数据库 + 用户登录 + API | 500MB 数据库、5万月活用户 |

## 与 Streamlit 的对比

| | Streamlit Cloud | GitHub Pages + Supabase |
|---|---|---|
| 前端 | Python 自动生成，样式受限 | HTML/CSS/JS 手写，完全自由 |
| 数据库 | 无（靠 CSV 文件） | PostgreSQL，支持多人并发 |
| 用户登录 | 自己写代码 | Supabase Auth 内置 |
| 部署 | 自动从 GitHub 部署 | 推送代码自动更新 |
| 适合场景 | 快速原型、单人使用 | 长期项目、多人协作 |

## 搭建步骤

### 第一步：注册 Supabase

1. 打开 https://supabase.com ，用 GitHub 账号登录
2. 新建项目，设置数据库密码
3. 在 SQL Editor 里建表
4. 在 Authentication 里开启邮箱/密码登录
5. 在 Table Editor 里配置 Row Level Security（行级权限）

### 第二步：写前端代码

AI 可以直接生成全套代码，需要告诉 AI 以下信息：

```
请帮我用 GitHub Pages + Supabase 搭建一个 [系统名称]。

技术栈：
- 纯静态前端：一个 index.html + CSS + JS（不需要框架）
- 数据库：Supabase PostgreSQL
- 部署：GitHub Pages

功能需求：
1. [列出来]
2. [列出来]

数据库表结构：
[贴 CREATE TABLE 语句]

Supabase 项目信息：
- URL: https://xxxxx.supabase.co
- anon key: xxxxx

权限要求：
- [角色A] 可以看全部数据
- [角色B] 只能看自己的数据
```

### 第三步：部署

1. 新建 GitHub 仓库
2. 把 `index.html` 推送到仓库
3. Settings → Pages → Source 选 `main` 分支 → Save
4. 等一两分钟，即可通过 `https://用户名.github.io/仓库名` 访问

## Supabase 行级权限（RLS）示例

```sql
-- 管理员看全部
CREATE POLICY "admin_all" ON your_table
  FOR ALL TO authenticated
  USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

-- 普通用户只看自己
CREATE POLICY "user_own" ON your_table
  FOR SELECT TO authenticated
  USING (name = auth.jwt()->>'name');
```

## 注意事项

1. Supabase 免费版数据库 500MB，每月数据量不大的场景完全够用
2. 密码等敏感信息不要写在 HTML 里，用 Supabase Auth 处理
3. 如果有 Python 脚本需要运行（如解密 Excel），需要额外部署一个小后端，不能放 Pages
4. 前端拿到数据后在前端计算统计/聚合，不需要后端接口

---

> 这份文档是通用模板。把方括号 `[xxx]` 里的内容替换成你的实际信息，复制给下一个 AI，它就能帮你写出完整的前端代码。
