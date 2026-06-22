import axios from 'axios';

// In Docker/production: VITE_API_URL is left unset and nginx proxies /api → backend.
// In local dev (no Docker): set VITE_API_URL=http://localhost:8080/api in frontend/.env.local
const baseURL = import.meta.env.VITE_API_URL ?? '/api';

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('chess_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
