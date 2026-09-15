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
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
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
    await requireAdmin(req);

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

    return json({ error: '未知请求' }, 400);
  } catch (e: any) {
    const msg = e.message || '操作失败';
    const status = msg === '无管理员权限' ? 403 : msg === '未登录' || msg === '登录已过期' ? 401 : 500;
    return json({ error: msg }, status);
  }
});
