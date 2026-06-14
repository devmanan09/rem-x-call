import axios from 'axios';

const rawBase = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '';

export const api = axios.create({
  baseURL: rawBase ? `${rawBase}/v1` : '/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    if (status === 401 && typeof window !== 'undefined') {
      const hadToken = localStorage.getItem('remxcall_access_token');
      if (hadToken) {
        localStorage.removeItem('remxcall_access_token');
        localStorage.removeItem('remxcall_user');
        if (window.location.pathname !== '/login') {
          window.location.assign('/login');
        }
      }
    }
    // 403 from deactivated company — force logout with message
    if (status === 403 && typeof window !== 'undefined') {
      const msg = error?.response?.data?.message || '';
      if (msg.includes('subscription')) {
        localStorage.removeItem('remxcall_access_token');
        localStorage.removeItem('remxcall_user');
        if (window.location.pathname !== '/login') {
          sessionStorage.setItem('remxcall_login_error', msg);
          window.location.assign('/login');
        }
      }
    }
    return Promise.reject(error);
  }
);

export function setAuthToken(token) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}
