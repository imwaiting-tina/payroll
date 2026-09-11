import axios from 'axios';
import { API_BASE_URL, SCF_CONFIG } from '../config';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'apikey': SCF_CONFIG.supabaseAnonKey,
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

