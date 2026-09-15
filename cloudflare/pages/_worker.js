/**
 * Cloudflare Pages — Advanced Mode Worker：同源 Supabase 代理
 *
 * 作用：把前端对 Supabase 的请求（/rest/v1、/auth/v1、/storage/v1）在本域内
 *       转发到 Supabase 主域，其余请求交给 Pages 静态资源。
 * 好处：与前端**同源**（https://staff.hro.net.cn/rest/v1/...）
 *       → 不需要 CORS、不依赖 *.workers.dev（国内常被 DNS 污染）
 *
 * 部署：本文件由 cloudflare/deploy-cloudflare.sh 拷贝为 dist/_worker.js 后
 *      随 `wrangler pages deploy dist` 一起上传（Advanced Mode 要求放在输出目录根）。
 */

const SUPABASE_URL = 'https://avuldnywmiflbmmlgmas.supabase.co';

// 只代理这四类路径，其它一律走静态资源（functions = 账号管理 Edge Function）
const API_PATH = /^\/(rest|auth|storage|functions)\//;

// 不需要转发的请求头（Cloudflare / 浏览器上下文相关）
const STRIP_HEADERS = ['origin', 'referer', 'cf-connecting-ip', 'cf-ray', 'cf-ipcountry', 'cf-worker'];

async function proxyToSupabase(request, url) {
  const target = `${SUPABASE_URL}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  headers.set('host', new URL(SUPABASE_URL).host);
  for (const h of STRIP_HEADERS) headers.delete(h);

  const hasBody = !['GET', 'HEAD'].includes(request.method);

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,   // 流式转发，大文件（Excel）不占内存
      redirect: 'manual',
    });

    const responseHeaders = new Headers(upstream.headers);

    // 同源代理：去掉 Set-Cookie 的 Domain，让 cookie 落在本域
    const cookies = typeof upstream.headers.getSetCookie === 'function'
      ? upstream.headers.getSetCookie()
      : [];
    if (cookies.length) {
      responseHeaders.delete('set-cookie');
      for (const cookie of cookies) {
        responseHeaders.append('set-cookie', cookie.replace(/;\s*domain=[^;]*/i, ''));
      }
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (API_PATH.test(url.pathname)) {
      return proxyToSupabase(request, url);
    }

    const response = await env.ASSETS.fetch(request);

    // SPA 回退：_redirects 对 Functions 请求不生效，这里自己兜底
    if (response.status === 404 && (request.headers.get('accept') || '').includes('text/html')) {
      return env.ASSETS.fetch(new URL('/index.html', url.origin).toString());
    }

    return response;
  },
};
