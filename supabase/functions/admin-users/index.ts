// ============================================================
// admin-users — 账号管理 Edge Function
//
// 作用：把 Supabase 的 service_role / secret 密钥从浏览器移到服务端。
//   前端 AccountManagement.tsx 只调用本函数（同源 /functions/v1/admin-users），
//   本函数用服务端密钥调用 Supabase Auth Admin API，密钥不暴露给客户端。
//
// 部署后，在 Supabase 控制台 → Edge Functions → admin-users → Settings → Secrets
//   添加 ADMIN_SECRET_KEY = 你的 sb_secret_... （或 service_role）密钥。
// ============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// 机密密钥：只存在于本函数的 Secret，绝不下发前端
const SECRET_KEY = Deno.env.get('ADMIN_SECRET_KEY')!;

const admin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// 校验调用者是登录态且为 admin 角色（用调用者自己的 JWT）
async function requireAdmin(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('未登录');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error('登录已过期');
  if (data.user.user_metadata?.role !== 'admin') throw new Error('无管理员权限');
  return data.user;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const caller = await requireAdmin(req);

    if (req.method === 'GET') {
      // 列出账号
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 100 });
      if (error) throw error;
      return json({ users: data.users });
    }

    if (req.method === 'POST') {
      // 创建账号
      const { email, password, role } = await req.json();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: role || 'hr_staff' },
      });
      if (error) throw error;
      return json({ user: data.user });
    }

    if (req.method === 'PATCH') {
      // 更新账号：改角色 / 重置密码 / 停用启用
      const { id, role, password, ban_duration } = await req.json();
      if (!id) throw new Error('缺少用户 id');
      const attrs: Record<string, unknown> = {};
      if (role !== undefined) attrs.user_metadata = { role };
      if (password !== undefined) attrs.password = password;
      if (ban_duration !== undefined) attrs.ban_duration = ban_duration;
      const { data, error } = await admin.auth.admin.updateUserById(id, attrs);
      if (error) throw error;
      return json({ user: data.user });
    }

    if (req.method === 'DELETE') {
      // 删除账号：只允许删除已停用的账号，且不能删自己 / 最后一名管理员
      const { id } = await req.json();
      if (!id) throw new Error('缺少用户 id');
      if (id === caller.id) throw new Error('不能删除自己的账号');

      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data.user) throw new Error('账号不存在');

      // banned_until 可能是已经过期的历史值，必须判断是否仍在停用期内
      const bannedUntil = data.user.banned_until;
      const isBanned = !!bannedUntil && new Date(bannedUntil).getTime() > Date.now();
      if (!isBanned) throw new Error('只能删除已停用的账号');

      // 最后一名管理员保护（只统计未停用的管理员）
      if (data.user.user_metadata?.role === 'admin') {
        const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
        if (listErr) throw listErr;
        const activeAdmins = list.users.filter((u) => {
          const b = u.banned_until;
          const banned = !!b && new Date(b).getTime() > Date.now();
          return u.user_metadata?.role === 'admin' && !banned;
        });
        if (activeAdmins.length <= 1) throw new Error('不能删除最后一名管理员');
      }

      const { error: delErr } = await admin.auth.admin.deleteUser(id);
      if (delErr) throw delErr;
      return json({ ok: true });
    }

    return json({ error: '未知请求' }, 400);
  } catch (e: any) {
    const msg = e.message || '操作失败';
    const badRequest = [
      '缺少用户 id', '账号不存在', '只能删除已停用的账号',
      '不能删除自己的账号', '不能删除最后一名管理员',
    ].includes(msg);
    const status = msg === '无管理员权限' ? 403
      : msg === '未登录' || msg === '登录已过期' ? 401
      : badRequest ? 400
      : 500;
    return json({ error: msg }, status);
  }
});
