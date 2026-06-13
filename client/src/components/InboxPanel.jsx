import React, { useState } from 'react';
import { ChevronDown, Inbox as InboxIcon, MessageSquare, Archive, Check, Binoculars } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';

const FilterDropdown = ({ filter, setFilter }) => {
  const [isOpen, setIsOpen] = useState(false);

  const options = [
    { label: 'All Notifications', value: 'all', icon: InboxIcon },
    { label: 'Unread', value: 'unread', icon: MessageSquare },
    { label: 'Archived', value: 'archived', icon: Binoculars },
  ];

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-700 hover:text-gray-900 transition-colors focus:outline-none flex items-center justify-center"
        aria-label="Filter"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2.6665 3.3335L13.3332 3.3335" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 8L4 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M5.3335 12.6665L10.6668 12.6665" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.08)] ring-1 ring-gray-100 py-2.5 z-50">
            <div className="px-4 py-1.5 text-[11px] font-bold text-gray-400 tracking-wider uppercase">
              Filter
            </div>
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setFilter(opt.value); setIsOpen(false); }}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <opt.icon className="w-4 h-4 text-gray-500" strokeWidth={2} />
                  <span className={`text-[13px] ${filter === opt.value ? 'font-bold text-gray-900' : 'font-semibold text-gray-600'}`}>
                    {opt.label}
                  </span>
                </div>
                {filter === opt.value && <Check className="w-4 h-4 text-gray-900" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const InboxPanel = ({ isOpen }) => {
  const [filter, setFilter] = useState('all');
  const { notifications, markRead, archiveNotif, unarchiveNotif, markAllRead, loading } = useNotifications(filter);

  return (
    <div className={`absolute top-[76px] bottom-0 left-0 w-full sm:w-[420px] bg-white shadow-[10px_0_40px_rgba(0,0,0,0.04)] border-r border-gray-100 z-40 transition-transform duration-300 ease-out flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between border-b border-gray-50 shrink-0">
        <div className="flex flex-col">
          <h2 className="text-[17px] font-['SF_Compact',_system-ui] font-[790] text-gray-900 tracking-tight">Inbox</h2>
          {filter === 'unread' && notifications.length > 0 && (
            <button 
              onClick={markAllRead}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 text-left mt-0.5"
            >
              Mark all as read
            </button>
          )}
        </div>
        <FilterDropdown filter={filter} setFilter={setFilter} />
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto">
        {loading && notifications.length === 0 ? (
          <div className="p-6 text-center text-[13px] text-gray-400 font-semibold">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="p-10 text-center flex flex-col items-center justify-center gap-2 mt-24">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-black">
              <path d="M4.5 12.75l6 6 9-13.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h3 className="text-[17px] font-bold text-gray-900 mt-4">You're all caught up</h3>
            <p className="text-[13px] font-medium text-gray-400 text-center max-w-[260px] mt-1 leading-relaxed">
              You'll be notified here for @mentions, page activity, and more
            </p>
          </div>
        ) : (
          notifications.map(notif => {
            const timeStr = new Date(notif.createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });

            return (
              <div 
                key={notif.id} 
                onClick={() => { if (!notif.isRead) markRead(notif.id); }}
                className={`px-6 py-5 border-b border-gray-50 flex gap-4 hover:bg-gray-50/50 transition-colors cursor-pointer group relative ${!notif.isRead ? 'bg-blue-50/10' : ''}`}
              >
                <div className="relative shrink-0">
                  {notif.senderAvatarUrl ? (
                    <img 
                      src={notif.senderAvatarUrl} 
                      alt="" 
                      className="w-10 h-10 rounded-full object-cover border border-gray-100"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        if (e.target.nextSibling) {
                          e.target.nextSibling.style.display = 'flex';
                        }
                      }}
                    />
                  ) : null}
                  <div 
                    style={{ display: notif.senderAvatarUrl ? 'none' : 'flex' }}
                    className="w-10 h-10 rounded-full bg-[#f0fce8] text-[#5AD43D] flex items-center justify-center font-bold text-[14px]"
                  >
                    {notif.title ? notif.title[0].toUpperCase() : 'N'}
                  </div>
                  {!notif.isRead && (
                     <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-[#ef4444] border-2 border-white rounded-full"></div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <p className="text-[13px] text-gray-800 leading-snug pr-2">
                      <span className="font-bold text-gray-900">{notif.title}</span>
                    </p>
                    <span className="text-[11px] font-semibold text-gray-400 shrink-0 mt-0.5">
                      {timeStr}
                    </span>
                  </div>
                  <p className="text-[13px] font-semibold text-gray-500 mb-1">
                    {notif.body}
                  </p>
                  
                  {/* Action buttons */}
                  <div className="flex items-center gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {filter === 'archived' ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          unarchiveNotif(notif.id);
                        }}
                        className="text-[11px] font-bold text-blue-500 hover:text-blue-700 flex items-center gap-1"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        Unarchive
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          archiveNotif(notif.id);
                        }}
                        className="text-[11px] font-bold text-red-500 hover:text-red-700 flex items-center gap-1"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default InboxPanel;
