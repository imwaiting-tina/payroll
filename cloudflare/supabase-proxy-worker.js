/**
 * Cloudflare Worker — Supabase API 代理
 *
 * 作用：替换原有的「腾讯云 SCF 云函数代理」，把前端对 Supabase 的请求
 *      （/rest/v1、/auth/v1、/storage/v1）透传到 Supabase 主域，
 *      并处理 CORS、透传 apikey / Authorization / x-upsert 等请求头。
 *
 * 前端 config.ts 里的 PROXY_URL 指向这个 Worker 的地址即可。
 */

// Supabase 主域（数据库 + Auth + Storage）
const SUPABASE_URL = 'https://avuldnywmiflbmmlgmas.supabase.co';

// 允许的 CORS 头
const ALLOW_HEADERS = 'Content-Type, Authorization, apikey, x-upsert, preference, range, accept, cache-control';
const ALLOW_METHODS = 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': ALLOW_METHODS,
  'Access-Control-Allow-Headers': ALLOW_HEADERS,
  'Access-Control-Expose-Headers': 'Content-Range, Range, Link',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 只允许转发到 Supabase 的 rest/auth/storage 路径
    const path = url.pathname;
    if (!/^\/(rest|auth|storage)\//.test(path)) {
      return new Response(JSON.stringify({ error: 'Not allowed' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 目标地址：Supabase 主域 + 原始路径 + 查询串
    const target = `${SUPABASE_URL}${path}${url.search}`;

    // 复制请求头，替换 host 为 Supabase
    const headers = new Headers(request.headers);
    headers.set('host', new URL(SUPABASE_URL).host);
    // 取消防火墙可能带的跨域引用
    headers.delete('origin');
    // Cloudflare 的 cf 头不需要转发
    headers.delete('cf-connecting-ip');
    headers.delete('cf-ray');

    try {
      const upstream = await fetch(target, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD', 'OPTIONS'].includes(request.method)
          ? undefined
          : await request.arrayBuffer(),
        redirect: 'manual',
      });

      // 返回上游结果，加上 CORS 头
      const responseHeaders = new Headers(upstream.headers);
      Object.keys(corsHeaders).forEach((k) => responseHeaders.set(k, corsHeaders[k]));
      // 透传 content-range（分页用）
      responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Range, Link');

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};
