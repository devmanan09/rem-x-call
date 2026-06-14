import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useUnreadMessageCount } from '../hooks/useUnreadMessageCount';
import { useNotifications } from '../hooks/useNotifications';
import {
  LayoutDashboard,
  MessageSquare,
  Inbox,
  Users,
  Package,
  PieChart,
  CreditCard,
  Settings,
  PanelLeft,
  LayoutGrid,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import InboxPanel from './InboxPanel';
import { useAuth } from '../context/AuthContext';

const getSidebarBrandName = (name) => {
  const words = String(name || 'RemXCall')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words[0] || 'RemXCall';
};

const getUserDisplayName = (user) => {
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return fullName || user?.username || user?.email || 'Agent';
};

const AgentLogo = ({ user, whiteLabelEnabled }) => (
  <div className="flex min-w-0 items-center gap-3">
    <img
      src={whiteLabelEnabled && user?.company?.whiteLabelLogoUrl ? user.company.whiteLabelLogoUrl : '/dashboard-logo.svg'}
      alt={user?.company?.name || 'RemXCall'}
      className="h-9 w-9 shrink-0 rounded-md object-cover"
    />
    <span
      className="block min-w-0 max-w-[170px] truncate font-display text-[22px] font-[900] tracking-normal text-white"
      style={whiteLabelEnabled && user?.company?.brandFont ? { fontFamily: user.company.brandFont } : undefined}
      title={user?.company?.name || 'RemXCall'}
    >
      {getSidebarBrandName(user?.company?.name)}
    </span>
  </div>
);

const baseNav = [
  { name: 'Dashboard', path: '/agent/dashboard', icon: LayoutDashboard },
  { name: 'Messages', path: '/agent/messages', icon: MessageSquare },
  { name: 'Notifications', action: 'toggle_notifications', icon: Inbox },
  { name: 'Contact Management', path: '/agent/contacts', icon: Users },
  { name: 'Product Management', path: '/agent/products', icon: Package },
  { name: 'Reports & Analytics', path: '/agent/reports', icon: PieChart },
  { name: 'Subscriptions & Billing', path: '/agent/billing', icon: CreditCard },
];

const itemClass = (isActive) =>
  `flex items-center justify-between gap-2 w-full px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-all duration-200 ${
    isActive ? 'bg-white text-[#0a0a0a] shadow-lg shadow-black/20' : 'text-gray-400 hover:bg-white/10 hover:text-white'
  }`;

export default function AgentDashboardLayout() {
  const unreadMessages = useUnreadMessageCount();
  const { unreadCount } = useNotifications();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const profileMenuRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const headerAvatarSrc =
    user?.profileImageUrl ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.username || user?.email || 'User')}&background=e5e7eb&color=374151&size=128`;
  const whiteLabelEnabled = Boolean(user?.company?.subscriptionPlan?.whiteLabelEnabled);
  const primary = whiteLabelEnabled ? user?.company?.primaryBrandColor || '#000000' : '#000000';
  const secondary = whiteLabelEnabled ? user?.company?.secondaryBrandColor || '#111111' : '#111111';
  const sidebarStyle = {
    background: `linear-gradient(180deg, ${primary} 0%, ${secondary} 100%)`,
    ...(whiteLabelEnabled && user?.company?.brandFont ? { fontFamily: user.company.brandFont } : {}),
  };

  const breadcrumb = useMemo(() => {
    const path = location.pathname;
    const seg = baseNav.find((n) => n.path && path.startsWith(n.path));
    if (seg) return ['Dashboard', seg.name];
    if (path.startsWith('/agent/settings')) return ['Dashboard', 'Settings'];
    return ['Dashboard'];
  }, [location.pathname]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  /** Only collapse the drawer on small screens after navigation — desktop sidebar stays open. */
  const closeSidebarIfMobile = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setIsSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!isProfileMenuOpen) return undefined;
    const onPointerDown = (event) => {
      if (profileMenuRef.current?.contains(event.target)) return;
      setIsProfileMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isProfileMenuOpen]);

  // Close notifications panel on route change
  useEffect(() => {
    setIsNotificationsOpen(false);
  }, [location.pathname]);

  return (
    <div className="relative flex h-screen h-dvh min-h-0 w-full overflow-hidden bg-[#f4f5f7] font-sans">
      {isSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-[55]"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden
        />
      )}
      {/* <view>Test</view> */}
      <aside
        className={`
        bg-black h-full flex flex-col pt-6 pb-8 transition-all duration-300 shrink-0 z-[60]
        fixed lg:relative border-r border-white/5
        ${
          isSidebarOpen
            ? 'w-[260px] px-4 translate-x-0 opacity-100'
            : '-translate-x-full w-0 px-0 opacity-0 overflow-hidden lg:translate-x-0 lg:w-[260px] lg:px-4 lg:opacity-100 lg:overflow-visible'
        }
      `}
        style={sidebarStyle}
      >
        <div className="mb-10 min-w-0 overflow-hidden px-2">
          <AgentLogo user={user} whiteLabelEnabled={whiteLabelEnabled} />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto pr-1 scrollbar-hide">
          {baseNav.map((link) => {
            if (link.action === 'toggle_notifications') {
              return (
                <button
                  key={link.name}
                  type="button"
                  onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                  className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-all ${
                    isNotificationsOpen
                      ? 'bg-white text-[#0a0a0a] shadow-lg'
                      : 'text-gray-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <link.icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{link.name}</span>
                  </div>
                  {unreadCount > 0 && (
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full min-w-[22px] text-center ${
                        isNotificationsOpen ? 'bg-gray-900 text-white' : 'bg-white/15 text-white'
                      }`}
                    >
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            }

            const isMsgsNav = link.path === '/agent/messages';
            const msgBadge = isMsgsNav ? unreadMessages : 0;
            const showMsgBadge = msgBadge > 0;
            const staticBadge = !isMsgsNav ? link.badge : 0;
            const showStatic = staticBadge > 0;

            return (
              <NavLink
                key={link.name}
                to={link.path}
                className={({ isActive }) => itemClass(isActive)}
                onClick={closeSidebarIfMobile}
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3 min-w-0">
                      <link.icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{link.name}</span>
                    </div>
                    {showMsgBadge ? (
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          isActive ? 'bg-gray-200 text-gray-900' : 'bg-white/15 text-white'
                        }`}
                      >
                        {msgBadge > 9 ? '9+' : msgBadge}
                      </span>
                    ) : showStatic ? (
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          isActive ? 'bg-gray-200 text-gray-900' : 'bg-white/15 text-white'
                        }`}
                      >
                        {staticBadge}
                      </span>
                    ) : null}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div ref={profileMenuRef} className="mt-auto border-t border-white/10 pt-4">
          {isProfileMenuOpen && (
            <div className="mb-3 overflow-hidden rounded-xl bg-white text-gray-900 shadow-xl shadow-black/25 ring-1 ring-black/10">
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="truncate text-[14px] font-bold leading-tight">{getUserDisplayName(user)}</p>
                <p className="truncate text-[12px] font-medium text-gray-500">{user?.email || 'No email'}</p>
              </div>
              <NavLink
                to="/agent/settings"
                className="flex w-full items-center gap-3 px-4 py-3 text-[14px] font-semibold text-gray-700 transition hover:bg-gray-50"
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  closeSidebarIfMobile();
                }}
              >
                <Settings className="h-4 w-4 shrink-0 text-gray-500" />
                <span className="truncate">Settings</span>
              </NavLink>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="truncate">{isLoggingOut ? 'Signing out...' : 'Sign out'}</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsProfileMenuOpen((open) => !open)}
            className="flex w-full min-w-0 items-center gap-3 rounded-xl bg-white/5 px-3 py-3 text-left text-white ring-1 ring-white/10 transition hover:bg-white/10"
            aria-expanded={isProfileMenuOpen}
          >
            <img
              src={headerAvatarSrc}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full border border-white/20 bg-white/20 object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold leading-tight">{getUserDisplayName(user)}</p>
              <p className="truncate text-[12px] font-medium text-white/60">{user?.email || 'No email'}</p>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-white/60 transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </aside>

      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f4f5f7]">
        <InboxPanel isOpen={isNotificationsOpen} />

        <header className="h-[76px] shrink-0 flex items-center justify-between px-4 lg:px-8 bg-[#f4f5f7] border-b border-gray-200/50 lg:border-none">
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="text-gray-500 hover:text-gray-900 p-1 rounded-md transition-colors shrink-0"
              aria-label="Toggle sidebar"
            >
              <PanelLeft className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-[13px] font-semibold text-gray-500 truncate">
              <LayoutGrid className="w-4 h-4 shrink-0 text-gray-400" />
              {breadcrumb.map((part, i) => (
                <span key={part} className="flex items-center gap-2 min-w-0">
                  {i > 0 && <span className="h-4 w-px shrink-0 bg-gray-300" aria-hidden />}
                  <span className={i === breadcrumb.length - 1 ? 'text-gray-900 truncate' : 'truncate'}>{part}</span>
                </span>
              ))}
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pb-12 pt-4 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] lg:px-8 lg:pt-2">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
