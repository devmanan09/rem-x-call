import React, { useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useUnreadMessageCount } from '../hooks/useUnreadMessageCount';
import { useNotifications } from '../hooks/useNotifications';
import {
  LayoutDashboard, MessageSquare, Inbox, Users, Building2, LogOut,
  PieChart, CreditCard, Settings, PanelLeft, ChevronRight, LayoutGrid, ChevronDown
} from 'lucide-react';
import InboxPanel from './InboxPanel';
import { useAuth } from '../context/AuthContext';

// A local Logo variation specifically for the dashboard (horizontal layout with text)
const DashboardLogo = () => (
  <div className="flex items-center gap-3">
    <img src="/dashboard-logo.svg" alt="RemXCall Logo" className="h-9 w-9 shrink-0" />
    <span className="font-display font-[900] text-[24px] tracking-[-0.03em] text-[#1a1a1a]">RemXCall</span>
  </div>
);

const getUserDisplayName = (user) => {
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return fullName || user?.username || user?.email || 'Admin';
};

const navLinks = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Messages', path: '/messages', icon: MessageSquare },
  { name: 'Notifications', action: 'toggle_notifications', icon: Inbox },
  { 
    name: 'Contact Management', 
    icon: Users,
    hasSubmenu: true,
    subLinks: [
      { name: 'Unassigned Contacts', path: '/contacts/unassigned' },
      { name: 'Assigned Contacts', path: '/contacts/assigned' },
      { name: 'Call Log', path: '/contacts/log' }
    ]
  },
  { 
    name: 'Company Management', 
    icon: Building2, 
    hasSubmenu: true,
    subLinks: [
      { name: 'All companies', path: '/companies/all' },
      { name: 'Active companies', path: '/companies/active' },
      { name: 'Pending invites', path: '/companies/pending' },
      { name: 'Subscriptions', path: '/companies/subscriptions' }
    ]
  },
  { name: 'Reports & Analytics', path: '/reports', icon: PieChart },
  { name: 'Subscriptions & Billing', path: '/billing', icon: CreditCard },
];

const DashboardLayout = () => {
  const unreadMessages = useUnreadMessageCount();
  const { unreadCount } = useNotifications();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState({ 'Contact Management': true });
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const profileMenuRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const headerAvatarSrc =
    user?.profileImageUrl ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.username || user?.email || 'User')}&background=e5e7eb&color=374151&size=128`;

  // Find current nav for header. Check subLinks if present.
  let currentNav = navLinks.find((link) => link.path && location.pathname.startsWith(link.path));
  if (!currentNav && location.pathname.startsWith('/settings')) {
    currentNav = { name: 'Settings', path: '/settings', subLinks: undefined };
  }
  if (!currentNav) {
    for (const link of navLinks) {
      if (link.subLinks) {
        const matchingSub = link.subLinks.find(sub => location.pathname.startsWith(sub.path));
        if (matchingSub) {
          currentNav = link;
          break;
        }
      }
    }
  }
  currentNav = currentNav || navLinks[0];

  const toggleSubmenu = (menuName) => {
    setExpandedMenus(prev => ({ ...prev, [menuName]: !prev[menuName] }));
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

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
    <div className="flex h-screen h-dvh min-h-0 w-full bg-[#f4f5f7] font-['Inter',_system-ui,_sans-serif] overflow-hidden relative">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-[55] transition-opacity duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        bg-[#f4f5f7] h-full flex flex-col pt-6 pb-8 transition-all duration-300 shrink-0 z-[60]
        fixed lg:relative
        ${isSidebarOpen 
          ? 'w-[260px] px-4 border-r border-gray-200/50 translate-x-0 opacity-100' 
          : 'w-0 lg:w-0 px-0 border-r-0 -translate-x-full lg:-translate-x-full opacity-0 overflow-hidden'
        }
      `}>
        <div className="px-2 mb-8 whitespace-nowrap">
          <DashboardLogo />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto pr-2 whitespace-nowrap scrollbar-hide">
          {navLinks.map((link, idx) => {
            if (link.divider) return null;
            if (link.hidden) return null;
            
            if (link.action === 'toggle_notifications') {
              return (
                <button
                  key={link.name}
                  onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                  className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-all ${isNotificationsOpen ? 'bg-[#1a1a1a] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'}`}
                >
                  <div className="flex items-center gap-3">
                    <link.icon className="w-4 h-4 shrink-0" />
                    <span>{link.name}</span>
                  </div>
                  {unreadCount > 0 && (
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md leading-none h-5 flex items-center justify-center min-w-[20px] shadow-[0_0_0_2px_#f4f5f7] border ${isNotificationsOpen ? 'bg-white text-gray-900 border-white' : 'bg-[#1a1a1a] text-white border-gray-700'}`}>
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            }

            if (link.hasSubmenu) {
              const isExpanded = expandedMenus[link.name];
              const isAnyChildActive = link.subLinks.some(sub => location.pathname.startsWith(sub.path));
              return (
                <div key={link.name} className="flex flex-col space-y-1">
                  <button
                    onClick={() => toggleSubmenu(link.name)}
                    className={`flex items-center w-full px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-all ${isExpanded || isAnyChildActive ? 'bg-white shadow-sm ring-1 ring-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'}`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <link.icon className="w-4 h-4 shrink-0" />
                      <div className="flex items-center gap-1.5">
                        <span>{link.name}</span>
                        {!isExpanded && !isAnyChildActive && (
                          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="flex flex-col pl-10 pr-2 pt-1 pb-2 space-y-1 w-full">
                      {link.subLinks.map(subLink => (
                        <NavLink
                          key={subLink.name}
                          to={subLink.path}
                          className={({ isActive }) => `
                            block w-full py-2.5 px-3 rounded-xl text-[13px] font-semibold transition-all
                            ${isActive 
                              ? 'bg-[#1a1a1a] text-white shadow-md' 
                              : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100/50'
                            }
                          `}
                        >
                          {subLink.name}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            const isMsgsNav = link.path === '/messages';
            const msgsActive = location.pathname.startsWith('/messages');
            const msgBadge = isMsgsNav ? unreadMessages : 0;
            const showMsgBadge = msgBadge > 0;
            const staticBadge = !isMsgsNav ? link.badge : 0;
            const showStatic = staticBadge > 0;

            return (
              <NavLink
                key={link.name}
                to={link.path}
                className={({ isActive }) => `
                  flex items-center justify-between px-3 py-2.5 rounded-xl text-[14px] font-semibold transition-all
                  ${isActive 
                    ? 'bg-[#1a1a1a] text-white shadow-sm' 
                    : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <link.icon className="w-4 h-4 shrink-0" />
                  <span>{link.name}</span>
                </div>
                {showMsgBadge && (
                  <span
                    className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md leading-none h-5 flex items-center justify-center min-w-[20px] shadow-[0_0_0_2px_#f4f5f7] border ${
                      msgsActive ? 'bg-white text-gray-900 border-white' : 'bg-[#1a1a1a] text-white border-gray-700'
                    }`}
                  >
                    {msgBadge > 9 ? '9+' : msgBadge}
                  </span>
                )}
                {!showMsgBadge && showStatic && (
                  <span className="bg-[#1a1a1a] text-white text-[11px] font-bold px-1.5 py-0.5 rounded-md leading-none h-5 flex items-center justify-center min-w-[20px] shadow-[0_0_0_2px_#f4f5f7] border border-gray-700">
                    {staticBadge}
                  </span>
                )}
                {link.hasArrow && <ChevronRight className="w-4 h-4 text-gray-400" />}
              </NavLink>
            );
          })}
        </nav>

        <div ref={profileMenuRef} className="mt-auto border-t border-gray-200/50 pt-4">
          {isProfileMenuOpen && (
            <div className="mb-3 overflow-hidden rounded-xl bg-white text-gray-900 shadow-xl shadow-black/10 ring-1 ring-black/10">
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="truncate text-[14px] font-bold leading-tight">{getUserDisplayName(user)}</p>
                <p className="truncate text-[12px] font-medium text-gray-500">{user?.email || 'No email'}</p>
              </div>
              <NavLink
                to="/settings"
                className="flex w-full items-center gap-3 px-4 py-3 text-[14px] font-semibold text-gray-700 transition hover:bg-gray-50"
                onClick={() => setIsProfileMenuOpen(false)}
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
            className="flex w-full min-w-0 items-center gap-3 rounded-xl bg-white px-3 py-3 text-left text-gray-900 shadow-sm ring-1 ring-gray-200/70 transition hover:bg-gray-50"
            aria-expanded={isProfileMenuOpen}
          >
            <img
              src={headerAvatarSrc}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full border-2 border-white bg-gray-200 object-cover shadow-sm ring-1 ring-gray-200/80"
              key={user?.profileImageUrl || user?.id || 'avatar-sidebar'}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold leading-tight">{getUserDisplayName(user)}</p>
              <p className="truncate text-[12px] font-medium text-gray-500">{user?.email || 'No email'}</p>
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#f4f5f7]">
        <InboxPanel isOpen={isNotificationsOpen} />
        
        {/* Top Header */}
        <header className="h-[76px] shrink-0 flex items-center justify-between px-4 lg:px-8 bg-[#f4f5f7] border-b border-gray-200/50 lg:border-none">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="text-gray-500 hover:text-gray-900 p-1 rounded-md transition-colors"
            >
              <PanelLeft className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex items-center gap-2 font-semibold text-[13px]">
              {location.pathname.startsWith('/settings') ? (
                <>
                  <span className="text-gray-500">Dashboard</span>
                  <span className="text-gray-300">/</span>
                  <span className="flex items-center gap-1.5 text-gray-900">
                    <Settings className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
                    Settings
                  </span>
                </>
              ) : (
                <>
                  <LayoutGrid className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-500">{currentNav.name}</span>
                  {currentNav.subLinks && location.pathname !== currentNav.path && (
                    <>
                      <span className="text-gray-300">/</span>
                      <span className="line-clamp-1 text-gray-900">
                        {currentNav.subLinks.find((s) => location.pathname.startsWith(s.path))?.name || 'All'}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
            {/* Mobile Title */}
            <h1 className="sm:hidden font-display font-[900] text-[18px] text-gray-900">
              {location.pathname.startsWith('/settings') ? 'Settings' : currentNav.name}
            </h1>
          </div>
        </header>

        {/* Scrolls here: gray bg is the main column; white cards move inside this area */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pb-12 pt-2 [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
