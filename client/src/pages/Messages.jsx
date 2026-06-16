import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { Search, ArrowUp, ChevronLeft, Paperclip } from 'lucide-react';
import { api } from '../lib/api';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket';
import { useAuth } from '../context/AuthContext';

const fmtTime = (value) => {
  if (!value) return '--:--';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '--:--';
  return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatRelativeTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) {
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
  }
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  if (diffMonths < 12) {
    return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const threadAvatar = (label) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(label || 'User')}&background=f4f5f7`;

const isImageUrl = (url) => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url || '');

const Messages = () => {
  const location = useLocation();
  const isAgentDesk = location.pathname.startsWith('/agent');
  const { user, token } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [activeCompanyId, setActiveCompanyId] = useState(null);
  const [messagesByCompany, setMessagesByCompany] = useState({});
  const [inputText, setInputText] = useState('');
  const [isMobileChatActive, setIsMobileChatActive] = useState(false);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [convoPage, setConvoPage] = useState(1);
  const [convoPageSize] = useState(10);
  const [convoPagination, setConvoPagination] = useState({ page: 1, pageSize: 10, totalItems: 0, totalPages: 1 });
  const [searchParams, setSearchParams] = useSearchParams();
  const searchText = searchParams.get('q') ?? '';
  const debouncedSearch = useDebouncedValue(searchText, 300);

  const setThreadSearch = (value) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const v = String(value ?? '');
        if (v.trim()) next.set('q', v);
        else next.delete('q');
        return next;
      },
      { replace: true }
    );
  };
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerUser, setPeerUser] = useState(null);
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const typingStopTimerRef = useRef(null);
  const activeCompanyIdRef = useRef(null);
  const fetchConversationsRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;
  activeCompanyIdRef.current = activeCompanyId;

  const isAdmin = user?.role === 'admin';
  const agentCompanyId = user?.companyId ?? null;

  const upsertMessage = useCallback((companyId, incomingMessage) => {
    if (!companyId || !incomingMessage?.id) return;
    setMessagesByCompany((prev) => {
      const current = prev[companyId] || [];
      const existsIndex = current.findIndex((item) => item.id === incomingMessage.id);
      const next =
        existsIndex >= 0
          ? current.map((item, idx) => (idx === existsIndex ? { ...item, ...incomingMessage } : item))
          : [...current, incomingMessage];

      next.sort((a, b) => {
        const aTime = new Date(a.sentAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.sentAt || b.createdAt || 0).getTime();
        if (aTime !== bTime) return aTime - bTime;
        return (a.id || 0) - (b.id || 0);
      });

      return { ...prev, [companyId]: next };
    });

    setConversations((prevConvos) => {
      const exists = prevConvos.some((c) => c.company?.id === companyId);
      let updatedConvos = [...prevConvos];

      if (exists) {
        updatedConvos = prevConvos.map((c) => {
          if (c.company?.id === companyId) {
            const prevTime = c.lastMessage
              ? new Date(c.lastMessage.sentAt || c.lastMessage.createdAt || 0).getTime()
              : 0;
            const newTime = new Date(incomingMessage.sentAt || incomingMessage.createdAt || 0).getTime();
            if (newTime >= prevTime) {
              return { ...c, lastMessage: incomingMessage };
            }
          }
          return c;
        });
      } else {
        // Conversation does not exist in current page view; trigger a refetch of list
        fetchConversationsRef.current?.();
      }

      updatedConvos.sort((a, b) => {
        const aTime = a.lastMessage ? new Date(a.lastMessage.sentAt || a.lastMessage.createdAt || 0).getTime() : 0;
        const bTime = b.lastMessage ? new Date(b.lastMessage.sentAt || b.lastMessage.createdAt || 0).getTime() : 0;
        return bTime - aTime;
      });

      return updatedConvos;
    });
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoadingThreads(true);
    setLoadError('');
    try {
      const { data } = await api.get('/messages/conversations', {
        params: {
          page: convoPage,
          pageSize: convoPageSize,
          q: debouncedSearch.trim() || undefined,
        },
      });
      const items = Array.isArray(data?.conversations) ? data.conversations : [];
      setConversations(items);
      setConvoPagination(
        data?.pagination || {
          page: convoPage,
          pageSize: convoPageSize,
          totalItems: items.length,
          totalPages: 1,
        }
      );
      setActiveCompanyId((prev) => {
        if (prev && items.some((c) => c.company?.id === prev)) return prev;
        return items[0]?.company?.id ?? null;
      });
    } catch (error) {
      setLoadError(error?.response?.data?.message || 'Failed to load conversations.');
    } finally {
      setIsLoadingThreads(false);
    }
  }, [isAdmin, convoPage, convoPageSize, debouncedSearch]);

  const fetchMessages = useCallback(
    async (companyId) => {
      if (!companyId) return;
      setIsLoadingMessages(true);
      setLoadError('');
      try {
        const params = isAdmin ? { companyId } : {};
        const { data } = await api.get('/messages', { params });
        const items = Array.isArray(data?.messages) ? data.messages : [];
        setMessagesByCompany((prev) => ({ ...prev, [companyId]: items }));
        try {
          await api.post('/messages/read', { companyId });
        } catch {
          /* ignore mark-read errors */
        }
        window.dispatchEvent(new CustomEvent('remxcall:messages-changed'));
      } catch (error) {
        setLoadError(error?.response?.data?.message || 'Failed to load messages.');
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [isAdmin]
  );

  const fetchPeer = useCallback(async () => {
    if (!token) return;
    try {
      const params = isAdmin && activeCompanyId ? { companyId: activeCompanyId } : {};
      if (isAdmin && !activeCompanyId) {
        setPeerUser(null);
        return;
      }
      const { data } = await api.get('/messages/peer', { params });
      setPeerUser(data?.peer || null);
    } catch {
      setPeerUser(null);
    }
  }, [token, isAdmin, activeCompanyId]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchConversations();
  }, [isAdmin, fetchConversations]);

  useEffect(() => {
    setConvoPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (isAdmin || !agentCompanyId) return;
    setActiveCompanyId(agentCompanyId);
    setConversations([
      {
        company: { id: agentCompanyId, name: 'Admin' },
        agent: { id: user?.id, username: user?.username, email: user?.email },
        lastMessage: null,
      },
    ]);
  }, [isAdmin, agentCompanyId, user?.email, user?.id, user?.username]);

  useEffect(() => {
    fetchPeer();
  }, [fetchPeer]);

  useEffect(() => {
    if (!token) return undefined;

    const socket = connectSocket(token);
    if (!socket) return undefined;

    const onConnect = () => setIsSocketConnected(true);
    const onDisconnect = () => setIsSocketConnected(false);
    const onCreated = (payload) => {
      const message = payload?.message;
      if (!message?.companyId) return;
      upsertMessage(message.companyId, message);
      if (message.senderUserId !== userIdRef.current) {
        window.dispatchEvent(new CustomEvent('remxcall:messages-changed'));
        if (message.companyId === activeCompanyIdRef.current) {
          api
            .post('/messages/read', { companyId: message.companyId })
            .then(() => window.dispatchEvent(new CustomEvent('remxcall:messages-changed')))
            .catch(() => {});
        }
      }
    };
    const onStatusUpdated = (payload) => {
      const message = payload?.message;
      if (!message?.companyId) return;
      upsertMessage(message.companyId, message);
    };
    const onTyping = (payload) => {
      if (!payload?.companyId || payload.companyId !== activeCompanyIdRef.current) return;
      if (payload.userId === user?.id) return;
      setPeerTyping(Boolean(payload.typing));
    };
    const onOnlineList = (list) => {
      setOnlineUserIds(new Set((list || []).map(Number)));
    };
    const onOnlineStatus = (payload) => {
      const { userId, online } = payload || {};
      if (!userId) return;
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        if (online) next.add(Number(userId));
        else next.delete(Number(userId));
        return next;
      });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('messages:created', onCreated);
    socket.on('messages:status-updated', onStatusUpdated);
    socket.on('messages:typing', onTyping);
    socket.on('users:online-list', onOnlineList);
    socket.on('users:online-status', onOnlineStatus);
    setIsSocketConnected(socket.connected);
    socket.emit('users:request-online');

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('messages:created', onCreated);
      socket.off('messages:status-updated', onStatusUpdated);
      socket.off('messages:typing', onTyping);
      socket.off('users:online-list', onOnlineList);
      socket.off('users:online-status', onOnlineStatus);
      disconnectSocket();
    };
  }, [token, upsertMessage, user?.id]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !activeCompanyId) return undefined;
    socket.emit('messages:join', { companyId: activeCompanyId });
    return () => {
      socket.emit('messages:leave', { companyId: activeCompanyId });
    };
  }, [activeCompanyId]);

  useEffect(() => {
    if (!activeCompanyId) return;
    fetchMessages(activeCompanyId);
  }, [activeCompanyId, fetchMessages]);

  useEffect(() => {
    setPeerTyping(false);
  }, [activeCompanyId]);

  const activeMessages = useMemo(
    () => messagesByCompany[activeCompanyId] || [],
    [messagesByCompany, activeCompanyId]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [activeMessages, activeCompanyId, isLoadingMessages]);

  const emitTypingStart = useCallback(() => {
    const socket = getSocket();
    if (!socket || !activeCompanyId) return;
    socket.emit('typing:start', { companyId: activeCompanyId });
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
    }
    typingStopTimerRef.current = setTimeout(() => {
      socket.emit('typing:stop', { companyId: activeCompanyId });
    }, 2800);
  }, [activeCompanyId]);

  const emitTypingStop = useCallback(() => {
    const socket = getSocket();
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (!socket || !activeCompanyId) return;
    socket.emit('typing:stop', { companyId: activeCompanyId });
  }, [activeCompanyId]);

  const activeThread = useMemo(
    () => conversations.find((row) => row.company?.id === activeCompanyId) || null,
    [conversations, activeCompanyId]
  );

  const isCurrentPeerOnline = useMemo(() => {
    if (!activeThread) return false;
    const peerId = isAdmin ? activeThread?.agent?.id : peerUser?.id;
    return Boolean(peerId && onlineUserIds.has(peerId));
  }, [activeThread, isAdmin, peerUser, onlineUserIds]);

  const peerTypingLabel = useMemo(() => {
    if (!isAdmin) return peerUser?.username || 'Admin';
    return activeThread?.agent?.username || 'Agent';
  }, [isAdmin, activeThread, peerUser]);

  const handleSelectThread = (companyId) => {
    setActiveCompanyId(companyId);
    setIsMobileChatActive(true);
    setInputText('');
    emitTypingStop();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeCompanyId) return;
    setUploadingFile(true);
    setLoadError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const { data } = await api.post('/messages/upload', body, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      if (data?.url) {
        setPendingAttachment({ url: data.url, originalName: data.originalName || file.name });
      }
    } catch (error) {
      setLoadError(error?.response?.data?.message || 'Could not upload file.');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSendMessage = async () => {
    const content = inputText.trim();
    if ((!content && !pendingAttachment) || !activeCompanyId || isSending) return;

    emitTypingStop();
    setIsSending(true);
    setLoadError('');
    try {
      const body = isAdmin
        ? {
            companyId: activeCompanyId,
            ...(content ? { content } : {}),
            ...(pendingAttachment
              ? { attachmentUrl: pendingAttachment.url, attachmentOriginalName: pendingAttachment.originalName }
              : {}),
          }
        : {
            ...(content ? { content } : {}),
            ...(pendingAttachment
              ? { attachmentUrl: pendingAttachment.url, attachmentOriginalName: pendingAttachment.originalName }
              : {}),
          };
      const { data } = await api.post('/messages', body);
      if (data?.message) {
        upsertMessage(activeCompanyId, data.message);
      }
      setInputText('');
      setPendingAttachment(null);
    } catch (error) {
      setLoadError(error?.response?.data?.message || 'Failed to send message.');
    } finally {
      setIsSending(false);
    }
  };

  const handleInputChange = (e) => {
    setInputText(e.target.value);
    if (e.target.value.trim()) {
      emitTypingStart();
    } else {
      emitTypingStop();
    }
  };

  const headerTitle = useMemo(() => {
    if (!activeThread || !activeCompanyId) return 'Messages';
    if (isAgentDesk || !isAdmin) {
      return peerUser?.username || 'Admin';
    }
    return activeThread?.company?.name || 'Messages';
  }, [activeThread, activeCompanyId, isAgentDesk, isAdmin, peerUser]);

  const headerSubtitle = useMemo(() => {
    if (!activeThread || !activeCompanyId) return '';
    if (isAgentDesk || !isAdmin) {
      return peerUser?.email || 'Platform administrator';
    }
    return activeThread?.agent?.email || 'Company thread';
  }, [activeThread, activeCompanyId, isAgentDesk, isAdmin, peerUser]);

  const showAgentDeskError = isAgentDesk && !isAdmin && !agentCompanyId;
  const canSend =
    activeCompanyId &&
    !showAgentDeskError &&
    (inputText.trim().length > 0 || pendingAttachment) &&
    !isSending;

  return (
    <div className="w-full h-[calc(100vh-170px)] md:h-full flex flex-col md:flex-row gap-6 animate-in fade-in duration-500 overflow-hidden">
      <div
        className={`w-full md:w-[320px] lg:w-[350px] bg-white rounded-[24px] shadow-sm ring-1 ring-gray-100 flex flex-col shrink-0 overflow-hidden h-full ${
          isMobileChatActive ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="p-4 lg:p-6 pb-4 shrink-0">
          <h2 className="text-[24px] lg:text-[28px] font-display font-[900] text-[#1a1a1a] tracking-tight mb-5">Messages</h2>
          {isAdmin && !isAgentDesk && (
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search company or agent"
                value={searchText}
                onChange={(e) => setThreadSearch(e.target.value)}
                className="w-full bg-[#f8f9fb] border border-gray-200 py-2.5 pl-10 pr-4 rounded-xl text-[13px] font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#8bed21]/40 focus:border-transparent transition-shadow"
              />
            </div>
          )}
        </div>

        <div className="px-4 pb-2 text-[11px] font-semibold text-gray-500">
          {isSocketConnected ? 'Live updates connected' : 'Connecting live updates...'}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
          {showAgentDeskError && (
            <p className="text-sm font-semibold text-red-600 px-2 py-2 leading-relaxed">
              Your agent account is not linked to a company yet. Ask your administrator to add your company (with your email) under Company Management, or check the invite email for your login.
            </p>
          )}

          {isAdmin && isLoadingThreads && <p className="text-sm font-semibold text-gray-500 px-2 py-2">Loading threads...</p>}
          {isAdmin && !isLoadingThreads && conversations.length === 0 && !showAgentDeskError && (
            <p className="text-sm font-semibold text-gray-500 px-2 py-2">No companies yet.</p>
          )}

          {conversations.map((row) => {
            const cid = row.company?.id;
            const preview = (messagesByCompany[cid] || []).slice(-1)[0];
            const lastMsg = preview || row.lastMessage;
            const label = isAgentDesk && !isAdmin ? peerUser?.username || 'Admin' : row.company?.name || 'Company';
            const isPeerOnline = isAdmin
              ? (row.agent?.id && onlineUserIds.has(row.agent.id))
              : (peerUser?.id && onlineUserIds.has(peerUser.id));

            const avatarSrc = isAdmin
              ? (row.agent?.profileImageUrl || threadAvatar(label))
              : (peerUser?.profileImageUrl || threadAvatar(label));

            return (
              <button
                key={cid}
                type="button"
                onClick={() => handleSelectThread(cid)}
                className={`w-full text-left p-3 rounded-2xl flex items-start gap-3 transition-colors ${
                  activeCompanyId === cid ? 'bg-gray-50' : 'hover:bg-gray-50/50'
                }`}
              >
                <div className="relative shrink-0 mt-0.5">
                  <img src={avatarSrc} alt="" className="w-10 h-10 rounded-full object-cover" />
                  <span className={`absolute top-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white ${isPeerOnline ? 'bg-[#10b981]' : 'bg-gray-300'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <h3 className="text-[14px] font-bold text-gray-900 truncate pr-2">{label}</h3>
                    <span className="text-[11px] font-medium text-gray-400 shrink-0">
                      {formatRelativeTime(lastMsg?.sentAt || lastMsg?.createdAt)}
                    </span>
                  </div>
                  <p className="text-[13px] font-medium text-gray-500 truncate">
                    {lastMsg?.attachmentOriginalName && !lastMsg?.content
                      ? `📎 ${lastMsg.attachmentOriginalName}`
                      : lastMsg?.content || row.agent?.username || 'Open conversation'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        {isAdmin && (
          <div className="px-4 pb-4 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={convoPagination.page <= 1}
              onClick={() => setConvoPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-bold text-gray-700 disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-[11px] font-semibold text-gray-500">
              {convoPagination.page}/{convoPagination.totalPages}
            </span>
            <button
              type="button"
              disabled={convoPagination.page >= convoPagination.totalPages}
              onClick={() => setConvoPage((p) => Math.min(convoPagination.totalPages, p + 1))}
              className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-bold text-gray-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <div
        className={`flex-1 bg-white rounded-[24px] shadow-sm ring-1 ring-gray-100 flex flex-col overflow-hidden h-full ${
          !isMobileChatActive ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="h-[76px] flex items-center px-4 lg:px-6 border-b border-gray-50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsMobileChatActive(false)}
              className="md:hidden p-2 -ml-2 text-gray-500 hover:text-gray-900 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            {activeThread && activeCompanyId ? (
              <>
                <div className="relative shrink-0">
                  <img 
                    src={
                      isAdmin
                        ? (activeThread?.agent?.profileImageUrl || threadAvatar(headerTitle))
                        : (peerUser?.profileImageUrl || threadAvatar(headerTitle))
                    } 
                    alt="" 
                    className="w-10 h-10 rounded-full object-cover" 
                  />
                  <span className={`absolute top-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white ${isCurrentPeerOnline ? 'bg-[#10b981]' : 'bg-gray-300'}`} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-bold text-gray-900 leading-tight truncate">{headerTitle}</h2>
                  <p className="text-[12px] font-medium text-gray-500 truncate">
                    {isCurrentPeerOnline ? 'Online' : headerSubtitle}
                  </p>
                </div>
              </>
            ) : (
              <h2 className="text-[15px] font-bold text-gray-700">Select a thread to start messaging</h2>
            )}
          </div>
        </div>

        {peerTyping && (
          <div className="px-6 pt-3 text-[12px] font-semibold text-gray-500">
            {peerTypingLabel} is typing…
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {loadError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
              {loadError}
            </div>
          )}

          {activeCompanyId && isLoadingMessages && <p className="text-sm font-semibold text-gray-500">Loading messages...</p>}

          {activeCompanyId && !isLoadingMessages && activeMessages.length === 0 && (
            <p className="text-sm font-semibold text-gray-500">No messages yet. Send the first message.</p>
          )}

          {activeMessages.map((msg) => {
            const isMine = msg.senderUserId === user?.id;
            const senderName = isMine ? 'You' : msg.sender?.username || 'User';
            return (
              <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                <div
                  className={`${
                    isMine ? 'bg-[#f4f5f7] text-gray-800 rounded-tr-sm' : 'bg-[#2c7a1c] text-white rounded-tl-sm'
                  } px-5 py-3 rounded-2xl max-w-[78%]`}
                >
                  {msg.content ? <p className="text-[14px] font-medium whitespace-pre-wrap break-words">{msg.content}</p> : null}
                  {msg.attachmentUrl ? (
                    <div className={msg.content ? 'mt-2' : ''}>
                      {isImageUrl(msg.attachmentUrl) ? (
                        <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" className="block">
                          <img
                            src={msg.attachmentUrl}
                            alt={msg.attachmentOriginalName || ''}
                            className="rounded-xl max-w-full max-h-56 object-contain"
                          />
                        </a>
                      ) : (
                        <a
                          href={msg.attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={`text-[13px] font-semibold underline break-all ${
                            isMine ? 'text-gray-800' : 'text-white'
                          }`}
                        >
                          📎 {msg.attachmentOriginalName || 'Download attachment'}
                        </a>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-[11px] font-medium text-gray-400">
                  <span>{senderName}</span>
                  <span>{fmtTime(msg.sentAt || msg.createdAt)}</span>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 pt-2 shrink-0 bg-white border-t border-gray-50/80">
          {pendingAttachment && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2 text-[12px] font-semibold text-gray-700">
              <span className="truncate">📎 {pendingAttachment.originalName}</span>
              <button
                type="button"
                onClick={() => setPendingAttachment(null)}
                className="text-gray-500 hover:text-gray-900 shrink-0"
              >
                Remove
              </button>
            </div>
          )}
          <div className="relative flex items-center gap-1 rounded-[20px] border border-gray-200/90 bg-[#f8f9fb] p-2 pr-2 shadow-sm transition-[box-shadow,border-color] focus-within:border-gray-300 focus-within:shadow-md">
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
            <button
              type="button"
              aria-label="Attach file"
              disabled={!activeCompanyId || showAgentDeskError || uploadingFile}
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 p-2 rounded-xl text-gray-500 hover:bg-gray-200/60 hover:text-gray-900 disabled:opacity-40"
            >
              <Paperclip className="w-5 h-5" strokeWidth={2} />
            </button>
            <input
              type="text"
              placeholder={uploadingFile ? 'Uploading…' : 'Type message'}
              value={inputText}
              onChange={handleInputChange}
              onBlur={() => emitTypingStop()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) handleSendMessage();
              }}
              disabled={!activeCompanyId || showAgentDeskError || uploadingFile}
              className="min-w-0 flex-1 bg-transparent border-0 py-2 px-1 text-[14px] font-medium text-gray-900 placeholder:text-gray-400 outline-none focus:ring-0 focus-visible:ring-0 disabled:opacity-50"
            />
            <button
              type="button"
              aria-label="Send message"
              disabled={!canSend || uploadingFile}
              onClick={handleSendMessage}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 ${
                canSend ? 'bg-black text-white hover:bg-gray-800' : 'bg-gray-800 text-white opacity-80'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <ArrowUp className="w-4 h-4" strokeWidth={3} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Messages;
