import axios from 'axios';

const SUPABASE_URL = 'https://avuldnywmiflbmmlgmas.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2dWxkbnl3bWlmbGJtbWxnbWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMzY0NDgsImV4cCI6MjEwMTkxMjQ0OH0.8qqzH3zMc274Di-TK_6huMhrOWppJI1L3tjIfcBV2ts';

const api = axios.create({
  baseURL: `${SUPABASE_URL}/rest/v1`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('supabase_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('supabase_token');
      window.location.hash = '#/login';
    }
    return Promise.reject(error);
  }
);

export default api;

