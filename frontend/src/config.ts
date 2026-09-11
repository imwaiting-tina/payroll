/**
 * 应用配置 — 所有 API 地址统一在这里管理
 */
const PROXY_URL = 'https://1466594404-6b17scw4l5.ap-guangzhou.tencentscf.com';

const SUPABASE_URL = 'https://avuldnywmiflbmmlgmas.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2dWxkbnl3bWlmbGJtbWxnbWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzY0NDgsImV4cCI6MjEwMTkxMjQ0OH0.8qqzH3zMc274Di-TK_6huMhrOWppJI1L3tjIfcBV2ts';

export const API_BASE_URL = `${PROXY_URL}/rest/v1`;
export const AUTH_URL    = `${PROXY_URL}/auth/v1`;

export const SCF_CONFIG = {
  supabaseUrl:      SUPABASE_URL,
  supabaseAnonKey:  SUPABASE_ANON_KEY,
  supabaseRestUrl:  `${SUPABASE_URL}/rest/v1`,
  supabaseAuthUrl:  `${SUPABASE_URL}/auth/v1`,
};

export default { API_BASE_URL, AUTH_URL, SCF_CONFIG };
