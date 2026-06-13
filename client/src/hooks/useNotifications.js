import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

/**
 * Hook to manage user notifications (polling, filtering, read/archive status).
 */
export function useNotifications(filter = 'all', intervalMs = 30000) {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!token) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    try {
      setLoading(true);
      const { data } = await api.get(`/notifications?filter=${filter}&page=1&pageSize=50`);
      setNotifications(data?.data || []);
      setUnreadCount(Number(data?.unreadCount) || 0);
    } catch (err) {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [token, filter]);

  const markRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      window.dispatchEvent(new Event('remxcall:notifications-changed'));
    } catch {
      // Ignore
    }
  };

  const archiveNotif = async (id) => {
    try {
      await api.patch(`/notifications/${id}/archive`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      window.dispatchEvent(new Event('remxcall:notifications-changed'));
    } catch {
      // Ignore
    }
  };

  const unarchiveNotif = async (id) => {
    try {
      await api.patch(`/notifications/${id}/unarchive`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      window.dispatchEvent(new Event('remxcall:notifications-changed'));
    } catch {
      // Ignore
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      window.dispatchEvent(new Event('remxcall:notifications-changed'));
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, intervalMs);
    const onFocus = () => fetchNotifications();
    const onChanged = () => fetchNotifications();

    window.addEventListener('focus', onFocus);
    window.addEventListener('remxcall:notifications-changed', onChanged);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('remxcall:notifications-changed', onChanged);
    };
  }, [fetchNotifications, intervalMs]);

  return {
    notifications,
    unreadCount,
    loading,
    refresh: fetchNotifications,
    markRead,
    archiveNotif,
    unarchiveNotif,
    markAllRead,
  };
}
