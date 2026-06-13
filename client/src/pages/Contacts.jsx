import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { 
  Search, Download, Upload, Plus, MoreVertical, Edit2, Trash2, Mail, Phone, Calendar, 
  Link as LinkIcon, Building2, UserX, Users, Eye, Play, X, Pause, ChevronDown, UserPlus
} from 'lucide-react';
import { api } from '../lib/api';
import { countries } from 'countries-list';
import PaginationFooter from '../components/PaginationFooter';

const EMPTY_NEW_CONTACT_FORM = {
  fullName: '',
  countryCode: '+92',
  phoneNumber: '',
  companyName: '',
};

const EMPTY_EDIT_CONTACT_FORM = {
  fullName: '',
  countryCode: '+92',
  phoneNumber: '',
  companyName: '',
};

const fmtDate = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const COUNTRY_CODE_OPTIONS = Object.entries(countries)
  .flatMap(([iso2, country]) =>
    (country.phone || []).map((dial) => {
      const code = `+${dial}`;
      return { value: code, label: `${iso2} ${code}`, dialCode: code };
    })
  )
  .filter((v, i, arr) => arr.findIndex((x) => x.value === v.value) === i)
  .sort((a, b) => a.value.localeCompare(b.value));

const PHONE_PREFIXES_DESC = [...COUNTRY_CODE_OPTIONS]
  .sort((a, b) => b.value.length - a.value.length)
  .map((opt) => opt.value);

const splitPhone = (phone) => {
  const raw = typeof phone === 'string' ? phone.trim() : '';
  if (!raw) return { countryCode: '+92', phoneNumber: '' };

  const match = PHONE_PREFIXES_DESC.find((prefix) => raw.startsWith(prefix));
  if (match) {
    return { countryCode: match, phoneNumber: raw.slice(match.length) };
  }

  return { countryCode: '+92', phoneNumber: raw.replace(/\D/g, '') };
};

const parseCsvLine = (line) => {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
};

const Contacts = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qRaw = searchParams.get('q') ?? '';
  const debouncedSearch = useDebouncedValue(qRaw, 300);

  const setListQuery = (value) => {
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

  const currentTab = location.pathname.split('/').pop() || 'unassigned';

  const [activeMenuId, setActiveMenuId] = useState(null);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [deletingContact, setDeletingContact] = useState(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [activeAssignId, setActiveAssignId] = useState(null);
  
  // Bulk actions state
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [showAssignMenu, setShowAssignMenu] = useState(false);

  // Call Log specific states
  const [activePlayerId, setActivePlayerId] = useState(null);
  const [openFilter, setOpenFilter] = useState(null);
  const [unassignedContacts, setUnassignedContacts] = useState([]);
  const [assignedContacts, setAssignedContacts] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [pageSize, setPageSize] = useState(5);
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationByTab, setPaginationByTab] = useState({
    unassigned: { page: 1, pageSize: 5, totalItems: 0, totalPages: 1 },
    assigned: { page: 1, pageSize: 5, totalItems: 0, totalPages: 1 },
    log: { page: 1, pageSize: 5, totalItems: 0, totalPages: 1 },
  });
  const [newContactForm, setNewContactForm] = useState(EMPTY_NEW_CONTACT_FORM);
  const [newContactErrors, setNewContactErrors] = useState({});
  const [newContactApiError, setNewContactApiError] = useState('');
  const [isCreatingContact, setIsCreatingContact] = useState(false);
  const [editContactForm, setEditContactForm] = useState(EMPTY_EDIT_CONTACT_FORM);
  const [editContactErrors, setEditContactErrors] = useState({});
  const [editContactApiError, setEditContactApiError] = useState('');
  const [isUpdatingContact, setIsUpdatingContact] = useState(false);
  const [agents, setAgents] = useState([]);
  const [agentSearch, setAgentSearch] = useState('');
  const [actionInfo, setActionInfo] = useState('');
  const actionInfoTimerRef = useRef(null);
  const fileInputRef = useRef(null);

  const showActionInfo = (msg) => {
    setActionInfo(msg);
    if (actionInfoTimerRef.current) clearTimeout(actionInfoTimerRef.current);
    actionInfoTimerRef.current = setTimeout(() => setActionInfo(''), 3000);
  };

  const agentOptions = useMemo(() => {
    const fromApi = agents.map((agent) => ({
      id: agent.id,
      name: agent.username || agent.email || `User ${agent.id}`,
      img: `https://i.pravatar.cc/150?u=agent-${agent.id}`,
    }));
    const q = agentSearch.trim().toLowerCase();
    if (!q) return fromApi;
    return fromApi.filter((agent) => agent.name.toLowerCase().includes(q));
  }, [agents, agentSearch]);

  const fetchContacts = async (tab, page = currentPage, search = debouncedSearch) => {
    const { data } = await api.get('/contacts', {
      params: { tab, page, pageSize, search: search.trim() || undefined },
    });
    return {
      items: Array.isArray(data?.contacts) ? data.contacts : [],
      pagination:
        data?.pagination || {
          page,
          pageSize,
          totalItems: Array.isArray(data?.contacts) ? data.contacts.length : 0,
          totalPages: 1,
        },
    };
  };

  const fetchCallLogs = async (page = currentPage, search = debouncedSearch) => {
    const { data } = await api.get('/contacts/call-logs', {
      params: { page, pageSize, search: search.trim() || undefined },
    });
    return {
      items: Array.isArray(data?.callLogs) ? data.callLogs : [],
      pagination:
        data?.pagination || {
          page,
          pageSize,
          totalItems: Array.isArray(data?.callLogs) ? data.callLogs.length : 0,
          totalPages: 1,
        },
    };
  };

  const fetchAgents = async () => {
    const { data } = await api.get('/contacts/agents', { params: { page: 1, pageSize: 100 } });
    return Array.isArray(data?.agents) ? data.agents : [];
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      setLoadError('');
      try {
        if (currentTab === 'log') {
          const logs = await fetchCallLogs(currentPage, debouncedSearch);
          if (!cancelled) {
            setCallLogs(logs.items);
            setPaginationByTab((prev) => ({ ...prev, log: logs.pagination }));
          }
        } else if (currentTab === 'assigned') {
          const result = await fetchContacts('assigned', currentPage, debouncedSearch);
          if (!cancelled) {
            setAssignedContacts(result.items);
            setPaginationByTab((prev) => ({ ...prev, assigned: result.pagination }));
          }
        } else {
          const result = await fetchContacts('unassigned', currentPage, debouncedSearch);
          if (!cancelled) {
            setUnassignedContacts(result.items);
            setPaginationByTab((prev) => ({ ...prev, unassigned: result.pagination }));
          }
        }
      } catch (error) {
        if (!cancelled) {
          if (error?.response?.status === 401) {
            navigate('/login', { replace: true });
          } else {
            setLoadError(error?.response?.data?.message || 'Failed to load contacts data.');
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [currentTab, navigate, currentPage, pageSize, debouncedSearch]);

  useEffect(() => {
    setCurrentPage(1);
  }, [currentTab, debouncedSearch]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const users = await fetchAgents();
        if (!cancelled) setAgents(users);
      } catch (error) {
        if (!cancelled && error?.response?.status === 401) {
          navigate('/login', { replace: true });
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const toggleActionMenu = (id) => {
    setActiveMenuId(activeMenuId === id ? null : id);
  };

  const handleSelectContact = (id) => {
    setSelectedContacts(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const toggleAllContacts = (list) => {
    if (selectedContacts.length === list.length) setSelectedContacts([]);
    else setSelectedContacts(list.map(c => c.id));
  };

  const refreshCurrentTab = async () => {
    if (currentTab === 'log') {
      const logs = await fetchCallLogs(currentPage, debouncedSearch);
      setCallLogs(logs.items);
      setPaginationByTab((prev) => ({ ...prev, log: logs.pagination }));
      return;
    }
    const targetTab = currentTab === 'assigned' ? 'assigned' : 'unassigned';
    const result = await fetchContacts(targetTab, currentPage, debouncedSearch);
    if (currentTab === 'assigned') {
      setAssignedContacts(result.items);
      setPaginationByTab((prev) => ({ ...prev, assigned: result.pagination }));
    } else {
      setUnassignedContacts(result.items);
      setPaginationByTab((prev) => ({ ...prev, unassigned: result.pagination }));
    }
  };

  const handleAssignContact = async (contactId, agentUserId) => {
    try {
      await api.post(`/contacts/${contactId}/assign`, { agentUserId });
      setActiveAssignId(null);
      setShowAssignMenu(false);
      setSelectedContacts([]);
      await refreshCurrentTab();
    } catch (error) {
      setLoadError(error?.response?.data?.message || 'Failed to assign contact.');
    }
  };

  const handleUnassignContact = async (contactId) => {
    try {
      await api.post(`/contacts/${contactId}/unassign`);
      setActiveMenuId(null);
      await refreshCurrentTab();
    } catch (error) {
      setLoadError(error?.response?.data?.message || 'Failed to unassign contact.');
    }
  };

  const handleDeleteContact = async (contactId) => {
    const targetIds = contactId ? [contactId] : selectedContacts;
    if (targetIds.length === 0) {
      setDeletingContact(null);
      setLoadError('No contact selected for deletion.');
      return;
    }

    setDeletingContact(null);
    setLoadError('');
    try {
      await Promise.all(targetIds.map((id) => api.delete(`/contacts/${id}`)));
      setSelectedContacts([]);
      showActionInfo(targetIds.length > 1 ? `${targetIds.length} contacts deleted.` : 'Contact deleted successfully.');
      await refreshCurrentTab();
    } catch (error) {
      setLoadError(error?.response?.data?.message || 'Failed to delete contact.');
    }
  };

  const handleCreateContact = async () => {
    const nextErrors = {};
    if (!newContactForm.fullName.trim()) nextErrors.fullName = 'Contact name is required.';
    if (!newContactForm.countryCode.trim()) nextErrors.countryCode = 'Country code is required.';
    if (!newContactForm.phoneNumber.trim()) nextErrors.phone = 'Phone number is required.';
    if (newContactForm.phoneNumber.trim() && newContactForm.phoneNumber.trim().length < 7) {
      nextErrors.phone = 'Phone number looks too short.';
    }
    if (!newContactForm.companyName.trim()) nextErrors.companyName = 'Company name is required.';

    if (Object.keys(nextErrors).length > 0) {
      setNewContactErrors(nextErrors);
      return;
    }

    setNewContactErrors({});
    setNewContactApiError('');
    setIsCreatingContact(true);
    try {
      await api.post('/contacts', {
        fullName: newContactForm.fullName.trim(),
        phone: `${newContactForm.countryCode}${newContactForm.phoneNumber.trim()}`,
        companyName: newContactForm.companyName.trim(),
      });
      setShowAddContact(false);
      setNewContactForm(EMPTY_NEW_CONTACT_FORM);
      setNewContactErrors({});
      setNewContactApiError('');
      showActionInfo('Contact created successfully.');
      await refreshCurrentTab();
    } catch (error) {
      setNewContactApiError(error?.response?.data?.message || 'Failed to create contact.');
    } finally {
      setIsCreatingContact(false);
    }
  };

  const openEditModal = (contact) => {
    const split = splitPhone(contact.phone);
    setEditingContact(contact);
    setEditContactForm({
      fullName: contact.fullName || '',
      countryCode: split.countryCode,
      phoneNumber: split.phoneNumber,
      companyName: contact.companyName || '',
    });
    setEditContactErrors({});
    setEditContactApiError('');
  };

  const handleUpdateContact = async () => {
    if (!editingContact) return;

    const nextErrors = {};
    if (!editContactForm.fullName.trim()) nextErrors.fullName = 'Contact name is required.';
    if (!editContactForm.countryCode.trim()) nextErrors.countryCode = 'Country code is required.';
    if (!editContactForm.phoneNumber.trim()) nextErrors.phone = 'Phone number is required.';
    if (editContactForm.phoneNumber.trim() && editContactForm.phoneNumber.trim().length < 7) {
      nextErrors.phone = 'Phone number looks too short.';
    }
    if (!editContactForm.companyName.trim()) nextErrors.companyName = 'Company name is required.';

    if (Object.keys(nextErrors).length > 0) {
      setEditContactErrors(nextErrors);
      return;
    }

    setEditContactErrors({});
    setEditContactApiError('');
    setIsUpdatingContact(true);
    try {
      const payload = {};
      if (editContactForm.fullName.trim() !== (editingContact.fullName || '')) payload.fullName = editContactForm.fullName.trim();
      const mergedPhone = `${editContactForm.countryCode}${editContactForm.phoneNumber.trim()}`;
      if (mergedPhone !== (editingContact.phone || '')) payload.phone = mergedPhone;
      if (editContactForm.companyName.trim() !== (editingContact.companyName || '')) payload.companyName = editContactForm.companyName.trim();

      if (Object.keys(payload).length === 0) {
        setEditingContact(null);
        return;
      }

      await api.patch(`/contacts/${editingContact.id}`, payload);
      setEditingContact(null);
      setEditContactForm(EMPTY_EDIT_CONTACT_FORM);
      showActionInfo('Contact updated successfully.');
      await refreshCurrentTab();
    } catch (error) {
      setEditContactApiError(error?.response?.data?.message || 'Failed to update contact.');
    } finally {
      setIsUpdatingContact(false);
    }
  };

  const exportContactsCsv = async () => {
    try {
      const tab = currentTab === 'assigned' ? 'assigned' : 'unassigned';
      const result = await fetchContacts(tab, 1);
      const items = result.items;
      const rows = [
        ['fullName', 'phone', 'companyName', 'status', 'createdAt'].join(','),
        ...items.map((c) => [c.fullName, c.phone, c.companyName, c.status, c.createdAt]
          .map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`)
          .join(',')),
      ];
      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contacts-${tab}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showActionInfo('Contacts exported successfully.');
      setShowImportMenu(false);
    } catch (error) {
      setLoadError(error?.response?.data?.message || 'Failed to export contacts.');
    }
  };

  const importContactsCsv = async (file) => {
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) {
      setLoadError('CSV file is empty.');
      return;
    }

    const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
    const fullNameIdx = header.indexOf('fullname');
    const phoneIdx = header.indexOf('phone');
    const companyIdx = header.indexOf('companyname');
    const statusIdx = header.indexOf('status');
    if (fullNameIdx === -1 || phoneIdx === -1 || companyIdx === -1) {
      setLoadError('CSV must include fullName, phone and companyName columns.');
      return;
    }

    let imported = 0;
    for (let i = 1; i < lines.length; i += 1) {
      const cols = parseCsvLine(lines[i]);
      const payload = {
        fullName: (cols[fullNameIdx] || '').replace(/^"|"$/g, ''),
        phone: (cols[phoneIdx] || '').replace(/^"|"$/g, ''),
        companyName: (cols[companyIdx] || '').replace(/^"|"$/g, ''),
      };
      const statusRaw = statusIdx >= 0 ? (cols[statusIdx] || '').replace(/^"|"$/g, '') : '';
      if (statusRaw) payload.status = statusRaw;

      if (payload.fullName && payload.phone && payload.companyName) {
        await api.post('/contacts', payload);
        imported += 1;
      }
    }

    await refreshCurrentTab();
    setShowImportMenu(false);
    showActionInfo(`Imported ${imported} contacts.`);
  };

  const tabs = [
    { id: 'unassigned', label: 'Unassigned Contacts' },
    { id: 'assigned', label: 'Assigned Contacts' },
    { id: 'log', label: 'Call Log' }
  ];
  const activePagination = paginationByTab[currentTab] || { page: 1, totalPages: 1 };

  return (
    <div className="w-full bg-white rounded-[20px] shadow-sm ring-1 ring-gray-100 min-h-full p-4 sm:p-6 md:p-8 flex flex-col animate-in fade-in duration-500">
      
      <h1 className="text-[28px] leading-tight sm:text-[32px] font-display font-[900] text-[#1a1a1a] tracking-tight mb-6 sm:mb-8 mt-1 sm:mt-2">
        Contact Management
      </h1>

      {/* Top Section */}
      <div className="flex flex-col gap-5 mb-6">
        
        {/* Row 1: Tabs & Right Actions */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          
          {/* Tabs */}
          <div className="grid w-full grid-cols-3 gap-2 border-b border-gray-100 pb-3 sm:flex sm:w-auto sm:items-center sm:pb-2 xl:pb-0 xl:border-b-0">
            {tabs.map(tab => (
              <Link 
                key={tab.id}
                to={{
                  pathname: `/contacts/${tab.id}`,
                  search: searchParams.toString() ? `?${searchParams.toString()}` : '',
                }}
                className={`flex min-h-[54px] items-center justify-center rounded-xl px-2 py-2 text-center text-[12px] font-bold leading-snug transition-all sm:min-h-0 sm:px-4 sm:text-[13px] ${
                  currentTab === tab.id 
                  ? 'bg-[#8bed21] text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>

          {selectedContacts.length > 0 ? (
            <div className="flex flex-col gap-3 animate-in slide-in-from-right-2 duration-300 sm:flex-row sm:items-center sm:gap-6">
              <span className="px-3 py-1.5 bg-gray-100 rounded-lg text-[13px] font-bold text-gray-800 border border-gray-200 shadow-sm">
                {selectedContacts.length} selected
              </span>
              
              <div className="relative">
                 <button onClick={() => setShowAssignMenu(!showAssignMenu)} className="flex items-center gap-2 text-[13px] font-bold text-gray-600 hover:text-gray-900 transition-colors">
                   <Users className="w-4 h-4" /> Assign to agent
                 </button>
                 {showAssignMenu && (
                   <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl ring-1 ring-gray-100 py-3 z-30 max-h-80 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
                     <div className="px-3 pb-2 mb-2 border-b border-gray-50">
                       <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                         <input value={agentSearch} onChange={(e) => setAgentSearch(e.target.value)} type="text" placeholder="Search agent" className="w-full bg-[#f8f9fb] border border-gray-200 py-2 pl-9 pr-3 rounded-lg text-[13px] font-semibold text-gray-900 focus:ring-2 focus:ring-[#7ae230]" />
                       </div>
                     </div>
                    {agentOptions.map(agent => (
                      <button key={agent.id} onClick={async () => {
                        try {
                          await Promise.all(selectedContacts.map((contactId) => api.post(`/contacts/${contactId}/assign`, { agentUserId: agent.id })));
                          setShowAssignMenu(false);
                          setSelectedContacts([]);
                          await refreshCurrentTab();
                        } catch (error) {
                          setLoadError(error?.response?.data?.message || 'Failed to assign selected contacts.');
                        }
                      }} className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors text-left">
                         <img src={agent.img} className="w-6 h-6 rounded-full" />
                         <span className="text-[13px] font-bold text-gray-700">{agent.name}</span>
                       </button>
                     ))}
                     {agentOptions.length === 0 && (
                      <p className="px-4 py-2 text-xs font-semibold text-gray-500">No agents available.</p>
                     )}
                   </div>
                 )}
              </div>

              <button onClick={() => { setDeletingContact({ id: null, name: `${selectedContacts.length} items` }); setShowAssignMenu(false); }} className="flex items-center gap-2 text-[13px] font-bold text-[#ef4444] hover:text-red-700 transition-colors">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-3 animate-in fade-in duration-300 sm:flex-row sm:flex-wrap sm:items-center xl:w-auto xl:justify-end">
              {currentTab === 'log' ? (
                <>
                  <div className="relative w-full sm:w-auto">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={qRaw} onChange={(e) => setListQuery(e.target.value)} placeholder="Search contact" className="w-full sm:w-[240px] bg-[#f8f9fb] border border-gray-200 py-2.5 pl-10 pr-4 rounded-xl text-[13px] font-semibold text-gray-900 focus:ring-2 focus:ring-[#7ae230]" />
                  </div>
                  <div className="relative w-full sm:w-auto">
                    <button onClick={() => setOpenFilter(openFilter === 'month' ? null : 'month')} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 bg-[#f8f9fb] border border-gray-200 shadow-sm rounded-xl text-[13px] font-bold text-gray-700 hover:bg-gray-100 transition-colors sm:min-w-[120px]">
                      This Month
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </button>
                    {openFilter === 'month' && (
                      <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl ring-1 ring-gray-100 py-2 z-30 animate-in fade-in zoom-in-95 duration-200">
                        {['This Week', 'This Month', 'Last 3 Months', 'This Year'].map((opt, i) => (
                          <button key={i} onClick={() => setOpenFilter(null)} className="w-full text-left px-4 py-2.5 text-[13px] font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="relative w-full sm:w-auto">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={qRaw} onChange={(e) => setListQuery(e.target.value)} placeholder="Search contact" className="w-full sm:w-[240px] bg-[#f8f9fb] border border-gray-200 py-2.5 pl-10 pr-4 rounded-xl text-[13px] font-semibold text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-[#7ae230] transition-shadow" />
                  </div>

                  <div className="relative w-full sm:w-auto">
                    <button onClick={() => setShowImportMenu(!showImportMenu)} className="flex w-full items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 shadow-sm rounded-xl text-[13px] font-bold text-gray-700 hover:bg-gray-50 transition-colors sm:w-auto">
                       <Download className="w-4 h-4 text-gray-500" /> Import contact list
                    </button>
                    {showImportMenu && (
                      <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-lg ring-1 ring-gray-100 py-2 z-10 animate-in fade-in zoom-in-95 duration-200">
                        <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                          <Download className="w-4 h-4" /> Import contact
                        </button>
                        <button onClick={exportContactsCsv} className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                          <Upload className="w-4 h-4" /> Export contact
                        </button>
                      </div>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      try {
                        await importContactsCsv(file);
                      } catch (error) {
                        setLoadError(error?.response?.data?.message || error?.message || 'Failed to import contacts.');
                      }
                    }}
                  />

                  <button 
              onClick={() => setShowAddContact(true)}
              className="flex w-full items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#8bed21] to-[#5AD43D] text-gray-900 shadow-sm rounded-xl text-[13px] font-bold hover:opacity-90 transition-all active:scale-[0.98] whitespace-nowrap sm:w-auto"
            >
              <Plus className="w-4 h-4" strokeWidth={3} />
              Add New Contact
            </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Row 2: Call Log Special Filters (Shown on next line) */}
        {currentTab === 'log' && selectedContacts.length === 0 && (
          <div className="grid grid-cols-1 gap-3 animate-in fade-in duration-300 sm:grid-cols-2 lg:flex lg:items-center lg:gap-4">
            {/* Company Filter Dropdown */}
            <div className="relative">
              <button onClick={() => setOpenFilter(openFilter === 'company' ? null : 'company')} className="flex w-full items-center gap-2 px-3 py-2.5 bg-[#f8f9fb] rounded-xl text-[13px] font-bold text-gray-700 hover:bg-gray-100 transition-colors justify-between lg:min-w-[140px]">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#0B1221] flex items-center justify-center text-[10px] text-white font-black shadow-sm tracking-tighter">C</span>
                  Company
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {openFilter === 'company' && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-xl ring-1 ring-gray-100 py-2 z-30 animate-in fade-in zoom-in-95 duration-200">
                  {['Business Name', 'Tech Solutions', 'Quick Delivery', 'Health Services'].map((opt, i) => (
                    <button key={i} onClick={() => setOpenFilter(null)} className="w-full text-left px-4 py-2.5 text-[13px] font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Assigned Agent Filter Dropdown */}
            <div className="relative">
              <button onClick={() => setOpenFilter(openFilter === 'agent' ? null : 'agent')} className="flex w-full items-center justify-between gap-4 px-4 py-2.5 bg-[#f8f9fb] rounded-xl text-[13px] font-bold text-gray-700 hover:bg-gray-100 transition-colors lg:min-w-[160px]">
                Assigned Agent
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {openFilter === 'agent' && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-xl ring-1 ring-gray-100 py-2 z-30 animate-in fade-in zoom-in-95 duration-200">
                  {['Emily Johnson', 'Daniel Lee', 'Christina Williams'].map((opt, i) => (
                    <button key={i} onClick={() => setOpenFilter(null)} className="w-full text-left px-4 py-2.5 text-[13px] font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Call Outcome Filter Dropdown */}
            <div className="relative">
              <button onClick={() => setOpenFilter(openFilter === 'outcome' ? null : 'outcome')} className="flex w-full items-center justify-between gap-4 px-4 py-2.5 bg-[#f8f9fb] rounded-xl text-[13px] font-bold text-gray-700 hover:bg-gray-100 transition-colors lg:min-w-[150px]">
                Call Outcome
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {openFilter === 'outcome' && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-xl ring-1 ring-gray-100 py-2 z-30 animate-in fade-in zoom-in-95 duration-200">
                  {['Connected', 'Missed Call', 'Call Recording', 'No Answer'].map((opt, i) => (
                    <button key={i} onClick={() => setOpenFilter(null)} className="w-full text-left px-4 py-2.5 text-[13px] font-bold text-gray-700 hover:bg-gray-50 transition-colors">
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {loadError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
          {loadError}
        </div>
      )}

      {actionInfo && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-semibold text-green-700">
          {actionInfo}
        </div>
      )}

      {isLoading && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-600">
          Loading contacts...
        </div>
      )}

      {/* Main Content Area */}
      <div className="company-table-scroll flex-1 w-full overflow-x-auto rounded-xl ring-1 ring-gray-200/50 [-webkit-overflow-scrolling:touch]">
        
        {/* Unassigned Contacts */}
        {currentTab === 'unassigned' && (
          <table className="min-w-[860px] w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 text-[12px] font-bold text-gray-400">
                <th className="font-medium p-4 py-3">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" onChange={() => toggleAllContacts(unassignedContacts)} checked={selectedContacts.length === unassignedContacts.length && unassignedContacts.length > 0} className="w-4 h-4 rounded text-[#1a1a1a] border-gray-300 focus:ring-[#1a1a1a] cursor-pointer" />
                    <Mail className="w-3.5 h-3.5"/> Contact Name
                  </div>
                </th>
                <th className="font-medium p-4 py-3"><div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5"/> Phone Number</div></th>
                <th className="font-medium p-4 py-3"><div className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5"/> Company</div></th>
                <th className="font-medium p-4 py-3"><div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5"/> Added Date</div></th>
                <th className="font-medium p-4 py-3"><div className="flex items-center gap-2"> Assign contact</div></th>
                <th className="font-medium p-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {unassignedContacts.map((contact, idx) => (
                <tr key={contact.id} className={`${idx !== unassignedContacts.length -1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50/50 ${selectedContacts.includes(contact.id) ? 'bg-blue-50/20' : ''}`}>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={selectedContacts.includes(contact.id)} onChange={() => handleSelectContact(contact.id)} className="w-4 h-4 rounded text-[#1a1a1a] border-gray-300 focus:ring-[#1a1a1a] cursor-pointer shadow-sm" />
                      <span className="text-[13px] font-bold text-gray-700">{contact.fullName}</span>
                    </div>
                  </td>
                  <td className="p-4 text-[13px] font-bold text-gray-600">{contact.phone}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                       <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(contact.companyName || 'CN')}&background=f4f5f7`} alt={contact.companyName} className="w-5 h-5 rounded-sm object-cover" />
                       <span className="text-[13px] font-bold text-gray-700">{contact.companyName}</span>
                    </div>
                  </td>
                  <td className="p-4 text-[13px] font-bold text-gray-600">{fmtDate(contact.createdAt)}</td>
                  <td className="p-4 relative">
                    <button 
                      onClick={() => setActiveAssignId(activeAssignId === contact.id ? null : contact.id)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                        activeAssignId === contact.id 
                          ? 'bg-white border-2 text-[#22c55e] border-[#22c55e] border-dashed ring-4 ring-green-50' 
                          : 'bg-[#f4f5f7] text-[#22c55e] hover:bg-gray-200 border border-gray-200'
                      }`}
                    >
                      {activeAssignId === contact.id ? (
                        <UserPlus className="w-3.5 h-3.5" />
                      ) : (
                        <LinkIcon className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {activeAssignId === contact.id && (
                      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl ring-1 ring-gray-100 py-3 z-30 max-h-80 overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-3 pb-2 mb-2 border-b border-gray-50">
                          <div className="relative">
                             <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                             <input value={agentSearch} onChange={(e) => setAgentSearch(e.target.value)} type="text" placeholder="Search agent" className="w-full bg-[#f8f9fb] border border-gray-200 py-2 pl-9 pr-3 rounded-lg text-[13px] font-semibold text-gray-900 focus:ring-2 focus:ring-[#7ae230]" />
                          </div>
                        </div>
                        {agentOptions.map(agent => (
                          <button key={agent.id} onClick={() => handleAssignContact(contact.id, agent.id)} className="w-full flex items-center gap-3 px-4 py-2 hover:bg-[#f8f9fb] transition-colors text-left">
                            <img src={agent.img} className="w-6 h-6 rounded-full" />
                            <span className="text-[13px] font-bold text-gray-700">{agent.name}</span>
                          </button>
                        ))}
                        {agentOptions.length === 0 && (
                          <p className="px-4 py-2 text-xs font-semibold text-gray-500">No agents available.</p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-center relative">
                    <button onClick={() => toggleActionMenu(contact.id)} className="p-1 hover:bg-gray-100 rounded-md text-gray-500">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {activeMenuId === contact.id && (
                      <div className="absolute right-12 top-10 w-40 bg-white rounded-2xl shadow-xl ring-1 ring-gray-100 py-2 z-20 animate-in fade-in zoom-in-95 duration-200">
                        <button onClick={() => { openEditModal(contact); setActiveMenuId(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-bold text-gray-700 hover:bg-gray-50 transition-colors text-left">
                          <Edit2 className="w-4 h-4" /> Edit contact
                        </button>
                        <button onClick={() => { setDeletingContact(contact); setActiveMenuId(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-bold text-[#ef4444] hover:bg-red-50 transition-colors text-left">
                          <Trash2 className="w-4 h-4" /> Delete contact
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Assigned Contacts */}
        {currentTab === 'assigned' && (
          <table className="min-w-[1180px] w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] font-bold text-gray-400">
                <th className="font-medium p-4 py-3">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" onChange={() => toggleAllContacts(assignedContacts)} checked={selectedContacts.length === assignedContacts.length && assignedContacts.length > 0} className="w-4 h-4 rounded text-[#1a1a1a] border-gray-300 focus:ring-[#1a1a1a] cursor-pointer" />
                    <Mail className="w-3.5 h-3.5"/> Contact Name
                  </div>
                </th>
                <th className="font-medium p-4 py-3"><div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5"/> Phone Number</div></th>
                <th className="font-medium p-4 py-3"><div className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5"/> Assigned Company</div></th>
                <th className="font-medium p-4 py-3"><div className="flex items-center gap-2"><UserX className="w-3.5 h-3.5"/> Assigned Agent</div></th>
                <th className="font-medium p-4 py-3"><div className="flex items-center gap-2">Sold Products</div></th>
                <th className="font-medium p-4 py-3"><div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5"/> Last Called</div></th>
                <th className="font-medium p-4 py-3"><div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5"/> Last Outcome</div></th>
                <th className="font-medium p-4 py-3"><div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5"/> Status</div></th>
                <th className="font-medium p-4 py-3"><div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5"/> Created Date</div></th>
                <th className="font-medium p-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {assignedContacts.map((contact) => (
                <tr key={contact.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={selectedContacts.includes(contact.id)} onChange={() => handleSelectContact(contact.id)} className="w-4 h-4 rounded text-[#1a1a1a] border-gray-300 focus:ring-[#1a1a1a] cursor-pointer" />
                      <span className="text-[13px] font-bold text-gray-700">{contact.fullName}</span>
                    </div>
                  </td>
                  <td className="p-4 text-[13px] font-bold text-gray-600">{contact.phone}</td>
                  <td className="p-4 text-[13px] font-bold text-gray-700">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px] text-blue-600 font-bold">{(contact.companyName || 'C')[0]}</span>
                      {contact.companyName}
                    </div>
                  </td>
                  <td className="p-4 text-[13px] font-bold text-gray-700">
                    <div className="flex items-center gap-2">
                       <img src={`https://i.pravatar.cc/150?u=${contact.assignedAgentId || contact.id}`} className="w-5 h-5 rounded-full object-cover" />
                       {contact.assignedAgent?.username || '—'}
                    </div>
                  </td>
                  <td className="p-4 text-[13px] font-bold text-gray-600">None</td>
                  <td className="p-4 text-[13px] font-bold text-gray-600">-</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold text-gray-500 bg-gray-100`}>
                      <span className={`w-1.5 h-1.5 rounded-full bg-gray-400`}></span>
                      Not Called
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#22c55e]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]"></span>
                      {contact.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="p-4 text-[13px] font-bold text-gray-600">{fmtDate(contact.createdAt)}</td>
                  <td className="p-4 text-center relative">
                    <button onClick={() => toggleActionMenu(contact.id)} className="p-1 hover:bg-gray-100 rounded-md text-gray-500">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {activeMenuId === contact.id && (
                      <div className="absolute right-12 top-10 w-48 bg-white rounded-2xl shadow-xl ring-1 ring-gray-100 py-2 z-20 animate-in fade-in zoom-in-95 duration-200">
                        <button onClick={() => handleUnassignContact(contact.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-bold text-gray-700 hover:bg-gray-50 transition-colors text-left">
                          <UserX className="w-4 h-4" /> Unassign contact
                        </button>
                        <button onClick={() => { setDeletingContact(contact); setActiveMenuId(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-bold text-[#ef4444] hover:bg-red-50 transition-colors text-left">
                          <Trash2 className="w-4 h-4" /> Delete contact
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Call Log Component */}
        {currentTab === 'log' && (
          <table className="min-w-[1280px] w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 text-[11px] font-bold text-gray-400">
                <th className="font-medium p-4 py-3">
                   <div className="flex items-center gap-3">
                     <input type="checkbox" onChange={() => toggleAllContacts(callLogs)} checked={selectedContacts.length === callLogs.length && callLogs.length > 0} className="w-4 h-4 rounded text-[#1a1a1a] border-gray-300" />
                     Call ID
                   </div>
                </th>
                <th className="font-medium p-4 py-3"><div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5"/> Date & Time</div></th>
                <th className="font-medium p-4 py-3">Agent / Company</th>
                <th className="font-medium p-4 py-3">Contact Name</th>
                <th className="font-medium p-4 py-3">Phone Number</th>
                <th className="font-medium p-4 py-3">Duration</th>
                <th className="font-medium p-4 py-3">Outcome</th>
                <th className="font-medium p-4 py-3">Recording</th>
                <th className="font-medium p-4 py-3">Status</th>
                <th className="font-medium p-4 py-3">Flagged Calls</th>
                <th className="font-medium p-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {callLogs.map((log) => (
                <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={selectedContacts.includes(log.id)} onChange={() => handleSelectContact(log.id)} className="w-4 h-4 rounded text-[#1a1a1a] border-gray-300" />
                      <span className="text-[13px] font-bold text-gray-700">#CD-{String(log.id).padStart(6, '0')}</span>
                    </div>
                  </td>
                  <td className="p-4 text-[13px] font-bold text-gray-700">{new Date(log.startedAt).toLocaleString()}</td>
                  <td className="p-4 text-[13px] font-bold text-gray-700">{log.contact?.companyName || '-'}</td>
                  <td className="p-4 text-[13px] font-bold text-gray-700">{log.contact?.fullName || '-'}</td>
                  <td className="p-4 text-[13px] font-bold text-gray-600">{log.contact?.phone || '-'}</td>
                  <td className="p-4 text-[13px] font-bold text-gray-700">{Math.round((log.durationSeconds || 0) / 60)} minute</td>
                  <td className="p-4">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-gray-700">
                       <span className={`w-2 h-2 rounded-full ${String(log.outcome).toLowerCase().includes('connected') ? 'bg-[#22c55e]' : String(log.outcome).toLowerCase().includes('missed') ? 'bg-[#ef4444]' : 'bg-yellow-400'}`}></span>
                       {log.outcome}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="relative">
                      {log.recordingUrl ? (
                        <button onClick={() => setActivePlayerId(activePlayerId === log.id ? null : log.id)} className="flex items-center gap-1.5 text-[12px] font-bold text-gray-700 hover:text-gray-900 transition-colors">
                          <Play className="w-3.5 h-3.5" /> Play
                        </button>
                      ) : (
                        <span className="text-[12px] font-bold text-gray-400">No Recording</span>
                      )}
                      
                      {/* Audio Player Popover */}
                      {activePlayerId === log.id && (
                         <div className="absolute right-0 top-1/2 -translate-y-1/2 ml-4 w-72 bg-white rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.12)] ring-1 ring-gray-100 p-3 z-30 animate-in fade-in slide-in-from-left-2 duration-200">
                           <div className="flex items-center justify-between mb-2">
                             <div className="flex items-center gap-2">
                               <div className="w-2 h-2 rounded-full bg-[#22c55e]"></div>
                               <span className="text-[11px] font-bold text-gray-500">Call Recording</span>
                             </div>
                             <button onClick={() => setActivePlayerId(null)} className="text-gray-400 hover:text-gray-900">
                               <X className="w-3.5 h-3.5" />
                             </button>
                           </div>
                           <div className="flex items-center gap-2">
                             <button className="w-6 h-6 rounded-full flex items-center justify-center border border-gray-200 hover:bg-gray-50 transition-colors">
                               <Pause className="w-2.5 h-2.5 text-gray-700" fill="currentColor" />
                             </button>
                             <span className="text-[10px] font-bold text-gray-600 tabular-nums">00:00</span>
                             <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden relative">
                               <div className="absolute top-0 left-0 h-full w-1/3 bg-[#8bed21]"></div>
                             </div>
                             <span className="text-[10px] font-bold text-gray-400 tabular-nums">04:02</span>
                           </div>
                         </div>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${log.status === 'completed' ? 'text-[#22c55e] bg-green-50' : log.status === 'missed' ? 'text-[#ef4444] bg-red-50' : 'text-yellow-600 bg-yellow-50'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${log.status === 'completed' ? 'bg-[#22c55e]' : log.status === 'missed' ? 'bg-[#ef4444]' : 'bg-yellow-500'}`}></span>
                      {log.status === 'in_progress' ? 'In-Progress' : log.status === 'completed' ? 'Completed' : 'Missed Call'}
                    </span>
                  </td>
                  <td className="p-4 text-[13px] font-bold text-gray-500">
                    {log.flaggedNote !== 'None' ? (
                      <span className="flex items-center gap-1.5 text-[#ef4444]">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                        {log.flaggedNote}
                      </span>
                    ) : 'None'}
                  </td>
                  <td className="p-4 text-center">
                    <button className="p-1 text-gray-400 hover:text-gray-900 transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

      </div>

      <PaginationFooter
        page={activePagination.page || currentPage}
        pageSize={activePagination.pageSize || 10}
        totalItems={activePagination.totalItems || 0}
        totalPages={activePagination.totalPages || 1}
        itemLabel={currentTab === 'log' ? 'logs' : 'contacts'}
        onPageChange={setCurrentPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setCurrentPage(1);
        }}
      />

      {/* Add New Contact Modal */}
      {showAddContact && (
        <div className="fixed inset-0 bg-[#000000]/30 backdrop-blur-sm z-[999] flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowAddContact(false); setNewContactErrors({}); setNewContactApiError(''); setNewContactForm(EMPTY_NEW_CONTACT_FORM); } }}
        >
          <div className="bg-white rounded-[24px] shadow-xl w-full max-w-md p-6 relative animate-in zoom-in-95 duration-200">
            <button onClick={() => { setShowAddContact(false); setNewContactErrors({}); setNewContactApiError(''); setNewContactForm(EMPTY_NEW_CONTACT_FORM); }} className="absolute top-6 right-6 text-gray-400 hover:text-gray-900 transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-[20px] font-bold text-gray-900 mb-0.5 tracking-tight">Add New Contact</h2>
            <p className="text-[13px] font-medium text-gray-400 mb-6">Enter all the necessary details.</p>

            {newContactApiError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {newContactApiError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-bold text-gray-600 mb-1.5">Contact Name</label>
                <input
                  value={newContactForm.fullName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewContactForm((prev) => ({ ...prev, fullName: value }));
                    if (newContactErrors.fullName) setNewContactErrors((prev) => ({ ...prev, fullName: '' }));
                  }}
                  type="text"
                  placeholder="Christina Williams"
                  className={`w-full bg-[#f8f9fb] border py-3 px-4 rounded-xl text-[14px] font-semibold text-gray-900 placeholder:text-gray-400 focus:ring-2 transition-shadow ${newContactErrors.fullName ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#7ae230]'}`}
                />
                {newContactErrors.fullName && (
                  <p className="mt-1 text-xs font-semibold text-red-600">{newContactErrors.fullName}</p>
                )}
              </div>
              <div>
                <label className="block text-[13px] font-bold text-gray-600 mb-1.5">Phone number</label>
                <div className="flex gap-2">
                  <select
                    value={newContactForm.countryCode}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNewContactForm((prev) => ({ ...prev, countryCode: value }));
                      if (newContactErrors.countryCode) setNewContactErrors((prev) => ({ ...prev, countryCode: '' }));
                    }}
                    className={`w-28 bg-[#f8f9fb] border py-3 px-2 rounded-xl text-[13px] font-semibold text-gray-900 focus:ring-2 transition-shadow text-center shrink-0 ${newContactErrors.countryCode ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#7ae230]'}`}
                  >
                    {COUNTRY_CODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={newContactForm.phoneNumber}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '');
                      setNewContactForm((prev) => ({ ...prev, phoneNumber: value }));
                      if (newContactErrors.phone) setNewContactErrors((prev) => ({ ...prev, phone: '' }));
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={15}
                    placeholder="3270283098"
                    className={`flex-1 bg-[#f8f9fb] border py-3 px-4 rounded-xl text-[14px] font-semibold text-gray-900 placeholder:text-gray-400 focus:ring-2 transition-shadow ${newContactErrors.phone ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#7ae230]'}`}
                  />
                </div>
                {newContactErrors.countryCode && (
                  <p className="mt-1 text-xs font-semibold text-red-600">{newContactErrors.countryCode}</p>
                )}
                {newContactErrors.phone && (
                  <p className="mt-1 text-xs font-semibold text-red-600">{newContactErrors.phone}</p>
                )}
              </div>
              <div>
                <label className="block text-[13px] font-bold text-gray-600 mb-1.5">Company Name</label>
                <input
                  value={newContactForm.companyName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNewContactForm((prev) => ({ ...prev, companyName: value }));
                    if (newContactErrors.companyName) setNewContactErrors((prev) => ({ ...prev, companyName: '' }));
                  }}
                  type="text"
                  placeholder="Business Name"
                  className={`w-full bg-[#f8f9fb] border py-3 px-4 rounded-xl text-[14px] font-semibold text-gray-900 placeholder:text-gray-400 focus:ring-2 transition-shadow ${newContactErrors.companyName ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#7ae230]'}`}
                />
                {newContactErrors.companyName && (
                  <p className="mt-1 text-xs font-semibold text-red-600">{newContactErrors.companyName}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-8">
              <button onClick={() => { setShowAddContact(false); setNewContactErrors({}); setNewContactApiError(''); setNewContactForm(EMPTY_NEW_CONTACT_FORM); }} className="flex-1 px-4 py-3 bg-white border border-gray-200 text-gray-700 text-[14px] font-bold rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button disabled={isCreatingContact} onClick={handleCreateContact} className="flex-1 px-4 py-3 bg-gradient-to-r from-[#ADF808] to-[#5AD43D] text-gray-900 text-[14px] font-bold rounded-xl hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity shadow-sm">
                {isCreatingContact ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingContact && (
        <div className="fixed inset-0 bg-[#000000]/30 backdrop-blur-sm z-[999] flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setEditingContact(null); setEditContactErrors({}); setEditContactApiError(''); setEditContactForm(EMPTY_EDIT_CONTACT_FORM); } }}
        >
          <div className="bg-white rounded-[24px] shadow-xl w-full max-w-md p-6 relative animate-in zoom-in-95 duration-200">
            <button onClick={() => { setEditingContact(null); setEditContactErrors({}); setEditContactApiError(''); setEditContactForm(EMPTY_EDIT_CONTACT_FORM); }} className="absolute top-6 right-6 text-gray-400 hover:text-gray-900 transition-colors">
               <X className="w-5 h-5" />
            </button>
            <h2 className="text-[20px] font-bold text-gray-900 mb-0.5 tracking-tight">Update Contact</h2>
            <p className="text-[13px] font-medium text-gray-400 mb-6">Feel free to change any contact info you want!</p>

            {editContactApiError && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {editContactApiError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-bold text-gray-600 mb-1.5">Contact Name</label>
                <input
                  value={editContactForm.fullName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEditContactForm((prev) => ({ ...prev, fullName: value }));
                    if (editContactErrors.fullName) setEditContactErrors((prev) => ({ ...prev, fullName: '' }));
                  }}
                  type="text"
                  className={`w-full bg-[#f8f9fb] border py-3 px-4 rounded-xl text-[14px] font-semibold text-gray-900 placeholder:text-gray-400 focus:ring-2 transition-shadow ${editContactErrors.fullName ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#7ae230]'}`}
                />
                {editContactErrors.fullName && <p className="mt-1 text-xs font-semibold text-red-600">{editContactErrors.fullName}</p>}
              </div>
              <div>
                <label className="block text-[13px] font-bold text-gray-600 mb-1.5">Phone number</label>
                <div className="flex gap-2">
                  <select
                    value={editContactForm.countryCode}
                    onChange={(e) => {
                      const value = e.target.value;
                      setEditContactForm((prev) => ({ ...prev, countryCode: value }));
                      if (editContactErrors.countryCode) setEditContactErrors((prev) => ({ ...prev, countryCode: '' }));
                    }}
                    className={`w-28 bg-[#f8f9fb] border py-3 px-2 rounded-xl text-[13px] font-semibold text-gray-900 focus:ring-2 transition-shadow text-center shrink-0 ${editContactErrors.countryCode ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#7ae230]'}`}
                  >
                    {COUNTRY_CODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={editContactForm.phoneNumber}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '');
                      setEditContactForm((prev) => ({ ...prev, phoneNumber: value }));
                      if (editContactErrors.phone) setEditContactErrors((prev) => ({ ...prev, phone: '' }));
                    }}
                    inputMode="numeric"
                    maxLength={15}
                    type="text"
                    className={`flex-1 bg-[#f8f9fb] border py-3 px-4 rounded-xl text-[14px] font-semibold text-gray-900 focus:ring-2 transition-shadow ${editContactErrors.phone ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#7ae230]'}`}
                  />
                </div>
                {editContactErrors.countryCode && <p className="mt-1 text-xs font-semibold text-red-600">{editContactErrors.countryCode}</p>}
                {editContactErrors.phone && <p className="mt-1 text-xs font-semibold text-red-600">{editContactErrors.phone}</p>}
              </div>
              <div>
                <label className="block text-[13px] font-bold text-gray-600 mb-1.5">Company Name</label>
                <input
                  value={editContactForm.companyName}
                  onChange={(e) => {
                    const value = e.target.value;
                    setEditContactForm((prev) => ({ ...prev, companyName: value }));
                    if (editContactErrors.companyName) setEditContactErrors((prev) => ({ ...prev, companyName: '' }));
                  }}
                  type="text"
                  className={`w-full bg-[#f8f9fb] border py-3 px-4 rounded-xl text-[14px] font-semibold text-gray-900 focus:ring-2 transition-shadow ${editContactErrors.companyName ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:ring-[#7ae230]'}`}
                />
                {editContactErrors.companyName && <p className="mt-1 text-xs font-semibold text-red-600">{editContactErrors.companyName}</p>}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-8">
              <button onClick={() => { setEditingContact(null); setEditContactErrors({}); setEditContactApiError(''); setEditContactForm(EMPTY_EDIT_CONTACT_FORM); }} className="flex-1 px-4 py-3 bg-white border border-gray-200 text-gray-700 text-[14px] font-bold rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button disabled={isUpdatingContact} onClick={handleUpdateContact} className="flex-1 px-4 py-3 bg-gradient-to-r from-[#ADF808] to-[#5AD43D] text-gray-900 text-[14px] font-bold rounded-xl hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity shadow-sm">
                {isUpdatingContact ? 'Updating...' : 'Update Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deletingContact && (
        <div className="fixed inset-0 bg-[#000000]/30 backdrop-blur-sm z-[999] flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDeletingContact(null); }}
        >
          <div className="bg-white rounded-[32px] shadow-xl w-full max-w-[400px] p-8 relative flex flex-col items-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
               <Trash2 className="w-7 h-7 text-[#dc2626]" />
            </div>
            
            <h2 className="text-[22px] font-bold text-gray-900 mb-2 tracking-tight">
              {deletingContact?.id ? 'Delete Contact' : 'Delete Contacts'}
            </h2>
            <p className="text-[13px] font-medium text-gray-500 mb-8 text-center px-4 leading-relaxed">
              {deletingContact?.id
                ? 'Are you sure you want to delete this contact?'
                : `Are you sure you want to delete ${deletingContact?.name || 'these contacts'}?`}
            </p>

            <div className="flex items-center gap-4 w-full">
              <button onClick={() => setDeletingContact(null)} className="flex-1 py-3.5 bg-white border-2 border-gray-100 text-gray-700 text-[14px] font-bold rounded-xl hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDeleteContact(deletingContact?.id)} className="flex-1 py-3.5 bg-[#dc2626] text-white text-[14px] font-bold rounded-xl hover:bg-red-700 transition-colors shadow-sm">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Contacts;
