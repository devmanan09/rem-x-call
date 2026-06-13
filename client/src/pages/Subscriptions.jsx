import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, MoreVertical, Edit2, Trash2, Mail, Calendar, X, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import PaginationFooter from '../components/PaginationFooter';

const Subscriptions = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const qRaw = searchParams.get('q') ?? '';
  const debouncedQ = useDebouncedValue(qRaw, 300);

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

  const [plans, setPlans] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 5, totalItems: 0, totalPages: 1 });
  const [loadError, setLoadError] = useState('');
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSub, setEditingSub] = useState(null);
  const [deletingSub, setDeletingSub] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    priceMonthly: '',
    billingCycle: 'monthly',
    maxAgents: '',
    contactLimitLabel: '',
    dialerEnabled: true,
    chatEnabled: true,
    recordingEnabled: false,
    whiteLabelEnabled: false,
    isActive: true,
  });

  const fetchPlans = useCallback(async () => {
    setLoadError('');
    try {
      const { data } = await api.get('/subscription-plans', {
        params: { page, pageSize, q: debouncedQ.trim() || undefined },
      });
      setPlans(Array.isArray(data?.plans) ? data.plans : []);
      setPagination(
        data?.pagination || {
          page,
          pageSize,
          totalItems: Array.isArray(data?.plans) ? data.plans.length : 0,
          totalPages: 1,
        }
      );
    } catch (e) {
      setLoadError(e?.response?.data?.message || 'Failed to load subscription plans.');
    }
  }, [page, pageSize, debouncedQ]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ]);

  const toggleActionMenu = (id) => {
    setActiveMenuId(activeMenuId === id ? null : id);
  };

  const openAdd = () => {
    setForm({
      name: '',
      priceMonthly: '',
      billingCycle: 'monthly',
      maxAgents: '5',
      contactLimitLabel: '',
      dialerEnabled: true,
      chatEnabled: true,
      recordingEnabled: false,
      whiteLabelEnabled: false,
      isActive: true,
    });
    setEditingSub(null);
    setShowAddModal(true);
  };

  const openEdit = (sub) => {
    setForm({
      name: sub.name || '',
      priceMonthly: sub.priceMonthly != null ? String(sub.priceMonthly) : '',
      billingCycle: sub.billingCycle === 'yearly' ? 'yearly' : 'monthly',
      maxAgents: sub.maxAgents != null ? String(sub.maxAgents) : '',
      contactLimitLabel: sub.contactLimitLabel || '',
      dialerEnabled: Boolean(sub.dialerEnabled),
      chatEnabled: Boolean(sub.chatEnabled),
      recordingEnabled: Boolean(sub.recordingEnabled),
      whiteLabelEnabled: Boolean(sub.whiteLabelEnabled),
      isActive: sub.isActive !== false,
    });
    setEditingSub(sub);
    setShowAddModal(true);
  };

  const savePlan = async () => {
    // ── Validate before saving ──────────────────────────────────
    const errors = [];
    if (!form.name.trim()) errors.push('Plan name is required.');

    const price = Number.parseFloat(form.priceMonthly);
    if (form.priceMonthly === '' || Number.isNaN(price)) errors.push('Price is required.');
    else if (price < 0) errors.push('Price cannot be negative.');

    const agents = Number.parseInt(form.maxAgents, 10);
    if (form.maxAgents === '' || Number.isNaN(agents)) errors.push('Agent limit is required.');
    else if (agents < 0) errors.push('Agent limit cannot be negative.');

    const contactLimit = form.contactLimitLabel !== '' ? Number.parseInt(form.contactLimitLabel, 10) : null;
    if (form.contactLimitLabel !== '' && (Number.isNaN(contactLimit) || contactLimit < 0)) {
      errors.push('Contact limit cannot be negative.');
    }

    if (errors.length > 0) {
      setLoadError(errors.join(' '));
      return;
    }

    setSaving(true);
    setLoadError('');
    try {
      const payload = {
        name: form.name.trim(),
        priceMonthly: price,
        billingCycle: form.billingCycle,
        maxAgents: agents,
        contactLimitLabel: contactLimit !== null ? String(contactLimit.toLocaleString()) : null,
        dialerEnabled: form.dialerEnabled,
        chatEnabled: form.chatEnabled,
        recordingEnabled: form.recordingEnabled,
        whiteLabelEnabled: form.whiteLabelEnabled,
        isActive: form.isActive,
      };
      if (editingSub) {
        await api.patch(`/subscription-plans/${editingSub.id}`, payload);
      } else {
        await api.post('/subscription-plans', payload);
      }
      setShowAddModal(false);
      setEditingSub(null);
      await fetchPlans();
    } catch (e) {
      setLoadError(e?.response?.data?.message || 'Could not save plan.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingSub) return;
    setSaving(true);
    setLoadError('');
    try {
      await api.delete(`/subscription-plans/${deletingSub.id}`);
      setDeletingSub(null);
      await fetchPlans();
    } catch (e) {
      setLoadError(e?.response?.data?.message || 'Could not delete plan.');
    } finally {
      setSaving(false);
    }
  };

  const rows = plans.map((sub) => ({
    id: sub.id,
    plan: sub.name,
    price: `$${Number(sub.priceMonthly || 0).toFixed(0)}`,
    billing: sub.billingCycle === 'yearly' ? 'Yearly' : 'Monthly',
    agentLimit: sub.maxAgents === 0 ? '0' : String(sub.maxAgents),
    contactLimit: sub.contactLimitLabel || '—',
    dialer: sub.dialerEnabled,
    chat: sub.chatEnabled,
    recording: sub.recordingEnabled,
    whitelabel: sub.whiteLabelEnabled,
    status: sub.isActive ? 'Active' : 'Inactive',
    _raw: sub,
  }));

  return (
    <div className="w-full bg-white rounded-[24px] shadow-sm ring-1 ring-gray-100 min-h-full p-4 md:p-8 flex flex-col animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 mt-2">
        <h1 className="text-[24px] md:text-[32px] font-display font-[900] text-[#1a1a1a] tracking-tight">
          Subscriptions
        </h1>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
        <div className="relative w-full sm:w-[240px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={qRaw}
            onChange={(e) => setListQuery(e.target.value)}
            placeholder="Search plans"
            className="w-full bg-[#f8f9fb] border border-gray-200 py-2.5 pl-10 pr-4 rounded-xl text-[13px] font-semibold text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-[#7ae230]"
          />
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#8bed21] to-[#5AD43D] text-gray-900 shadow-sm rounded-xl text-[13px] font-bold hover:opacity-90 transition-all active:scale-[0.98] w-max"
        >
          <Plus className="w-4 h-4" strokeWidth={3} />
          Add New Subscription
        </button>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
          {loadError}
        </div>
      )}

      <div className="flex-1 w-full overflow-x-auto rounded-xl ring-1 ring-gray-200/50">
        <table className="w-full text-left border-collapse whitespace-nowrap">
          <thead>
            <tr className="border-b border-gray-100 bg-[#f8f9fb] text-[11px] font-bold text-gray-500">
              <th className="font-medium px-5 py-4">
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5" /> Plan Name
                </div>
              </th>
              <th className="font-medium px-5 py-4">Price</th>
              <th className="font-medium px-5 py-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" /> Billing Cycle
                </div>
              </th>
              <th className="font-medium px-5 py-4">Agent Limit</th>
              <th className="font-medium px-5 py-4">Contact Limit</th>
              <th className="font-medium px-5 py-4">Dialer</th>
              <th className="font-medium px-5 py-4">Chat</th>
              <th className="font-medium px-5 py-4">Recording</th>
              <th className="font-medium px-5 py-4">White Label</th>
              <th className="font-medium px-5 py-4">Status</th>
              <th className="font-medium px-5 py-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((sub, idx) => (
              <tr
                key={sub.id}
                className={`${idx !== rows.length - 1 ? 'border-b border-gray-50' : ''} hover:bg-gray-50/50`}
              >
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] font-bold text-gray-700">{sub.plan}</span>
                  </div>
                </td>
                <td className="px-5 py-4 text-[13px] font-bold text-gray-700">{sub.price}</td>
                <td className="px-5 py-4 text-[13px] font-bold text-gray-700">{sub.billing}</td>
                <td className="px-5 py-4 text-[13px] font-bold text-gray-700">{sub.agentLimit}</td>
                <td className="px-5 py-4 text-[13px] font-bold text-gray-700">{sub.contactLimit}</td>
                <td className="px-5 py-4 text-[13px] font-bold text-gray-700">{sub.dialer ? 'On' : 'Off'}</td>
                <td className="px-5 py-4 text-[13px] font-bold text-gray-700">{sub.chat ? 'On' : 'Off'}</td>
                <td className="px-5 py-4 text-[13px] font-bold text-gray-700">{sub.recording ? 'On' : 'Off'}</td>
                <td className="px-5 py-4 text-[13px] font-bold text-gray-700">{sub.whitelabel ? 'On' : 'Off'}</td>
                <td className="px-5 py-4">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${sub._raw.isActive ? 'text-[#22c55e]' : 'text-gray-400'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${sub._raw.isActive ? 'bg-[#22c55e]' : 'bg-gray-400'}`} />
                    {sub.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-center relative">
                  <button
                    type="button"
                    onClick={() => toggleActionMenu(sub.id)}
                    className="p-1 hover:bg-gray-100 rounded-md text-gray-500"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {activeMenuId === sub.id && (
                    <div className="absolute right-12 top-10 w-44 bg-white rounded-2xl shadow-xl ring-1 ring-gray-100 py-2 z-20 animate-in fade-in zoom-in-95 duration-200">
                      <button
                        type="button"
                        onClick={() => {
                          openEdit(sub._raw);
                          setActiveMenuId(null);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-bold text-gray-700 hover:bg-gray-50 transition-colors text-left"
                      >
                        <Edit2 className="w-4 h-4" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setActiveMenuId(null);
                          try {
                            await api.patch(`/subscription-plans/${sub.id}`, { isActive: !sub._raw.isActive });
                            await fetchPlans();
                          } catch (e) {
                            setLoadError(e?.response?.data?.message || 'Failed to update status.');
                          }
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-bold text-gray-700 hover:bg-gray-50 transition-colors text-left"
                      >
                        {sub._raw.isActive ? (
                          <><span className="text-base">⏸</span> Deactivate</>
                        ) : (
                          <><span className="text-base">▶</span> Activate</>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeletingSub(sub._raw);
                          setActiveMenuId(null);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-bold text-[#ef4444] hover:bg-red-50 transition-colors text-left"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationFooter
        page={pagination.page}
        pageSize={pagination.pageSize || 10}
        totalItems={pagination.totalItems || 0}
        totalPages={pagination.totalPages || 1}
        itemLabel="plans"
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />

      {(showAddModal || editingSub) && (
        <div
          className="fixed inset-0 bg-[#000000]/30 backdrop-blur-sm z-[999] flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddModal(false);
              setEditingSub(null);
            }
          }}
        >
          <div className="bg-white rounded-[24px] shadow-xl w-full max-w-md p-6 relative animate-in zoom-in-95 duration-200 my-auto max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                setShowAddModal(false);
                setEditingSub(null);
              }}
              className="absolute top-6 right-6 text-gray-400 hover:text-gray-900 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-[20px] font-bold text-gray-900 mb-0.5 tracking-tight">
              {editingSub ? 'Edit Subscription' : 'Add New Subscription'}
            </h2>
            <p className="text-[13px] font-medium text-gray-400 mb-6">
              {editingSub ? 'Update plan details.' : 'Enter plan details.'}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-bold text-gray-500 mb-1.5">Plan Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-[#f8f9fb] border border-gray-200 py-3 px-4 rounded-xl text-[14px] font-semibold text-gray-900 focus:ring-2 focus:ring-[#7ae230] transition-shadow"
                />
              </div>

              <div>
                <label className="block text-[13px] font-bold text-gray-500 mb-1.5">Price (USD / month)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.priceMonthly}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || Number.parseFloat(v) >= 0) setForm((f) => ({ ...f, priceMonthly: v }));
                  }}
                  className="w-full bg-[#f8f9fb] border border-gray-200 py-3 px-4 rounded-xl text-[14px] font-semibold text-gray-900 focus:ring-2 focus:ring-[#7ae230] transition-shadow"
                />
              </div>

              <div>
                <label className="block text-[13px] font-bold text-gray-500 mb-1.5">Billing Cycle</label>
                <select
                  value={form.billingCycle}
                  onChange={(e) => setForm((f) => ({ ...f, billingCycle: e.target.value }))}
                  className="w-full bg-[#f8f9fb] border border-gray-200 py-3 px-4 rounded-xl text-[14px] font-semibold text-gray-900 focus:ring-2 focus:ring-[#7ae230] transition-shadow appearance-none"
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-bold text-gray-500 mb-1.5">Max agents (0 = unlimited)</label>
                <input
                  type="number"
                  min="0"
                  value={form.maxAgents}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || Number.parseInt(v, 10) >= 0) setForm((f) => ({ ...f, maxAgents: v }));
                  }}
                  className="w-full bg-[#f8f9fb] border border-gray-200 py-3 px-4 rounded-xl text-[14px] font-semibold text-gray-900 focus:ring-2 focus:ring-[#7ae230] transition-shadow"
                />
              </div>

              <div>
                <label className="block text-[13px] font-bold text-gray-500 mb-1.5">Contact limit (label)</label>
                <input
                  type="number"
                  min="0"
                  value={form.contactLimitLabel}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '' || Number.parseInt(v, 10) >= 0) setForm((f) => ({ ...f, contactLimitLabel: v }));
                  }}
                  placeholder="e.g. 10000"
                  className="w-full bg-[#f8f9fb] border border-gray-200 py-3 px-4 rounded-xl text-[14px] font-semibold text-gray-900 focus:ring-2 focus:ring-[#7ae230] transition-shadow"
                />
              </div>

              <div className="pt-2">
                <label className="block text-[13px] font-bold text-gray-500 mb-3">Features</label>
                {[
                  { key: 'dialerEnabled', label: 'Dialer' },
                  { key: 'chatEnabled', label: 'Chat' },
                  { key: 'recordingEnabled', label: 'Recording' },
                  { key: 'whiteLabelEnabled', label: 'White Label' },
                ].map((feature) => (
                  <div key={feature.key} className="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0">
                    <span className="text-[14px] font-bold text-gray-800">{feature.label}</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={form[feature.key]}
                        onChange={(e) => setForm((f) => ({ ...f, [feature.key]: e.target.checked }))}
                      />
                      <div className="w-9 h-5 bg-[#1a1a1a] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#22c55e]" />
                    </label>
                  </div>
                ))}
              </div>

              {/* Plan Status */}
              <div className="flex justify-between items-center rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div>
                  <p className="text-[13px] font-bold text-gray-800">Plan Status</p>
                  <p className="text-[11px] font-medium text-gray-400 mt-0.5">
                    {form.isActive ? 'Plan is visible to new companies.' : 'Plan is hidden from new companies.'}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  />
                  <div className="w-9 h-5 bg-[#1a1a1a] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#22c55e]" />
                </label>
              </div>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={savePlan}
              className="w-full mt-8 px-4 py-3.5 bg-gradient-to-r from-[#ADF808] to-[#5AD43D] text-gray-900 text-[14px] font-bold rounded-xl hover:opacity-90 transition-opacity shadow-sm disabled:opacity-50"
            >
              {editingSub ? 'Update subscription' : 'Add subscription'}
            </button>
          </div>
        </div>
      )}

      {deletingSub && (
        <div
          className="fixed inset-0 bg-[#000000]/30 backdrop-blur-sm z-[999] flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDeletingSub(null); }}
        >
          <div className="bg-white rounded-[32px] shadow-xl w-full max-w-[400px] p-8 relative flex flex-col items-center animate-in zoom-in-95 duration-200">
            <div className="relative mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-[0_0_25px_rgba(239,68,68,0.5)] z-10 relative">
                <Trash2 className="w-7 h-7 text-white" />
              </div>
              <div className="absolute inset-0 bg-red-600 blur-xl opacity-30 rounded-full" />
            </div>

            <h2 className="text-[22px] font-bold text-gray-900 mb-2 tracking-tight">Delete subscription</h2>
            <p className="text-[13px] font-medium text-gray-500 mb-8 text-center px-4 leading-relaxed">
              Are you sure you want to delete this plan?
            </p>

            <div className="flex items-center gap-4 w-full">
              <button
                type="button"
                onClick={() => setDeletingSub(null)}
                className="flex-1 py-3.5 bg-white border-2 border-gray-100 text-gray-700 text-[14px] font-bold rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={confirmDelete}
                className="flex-1 py-3.5 bg-[#dc2626] text-white text-[14px] font-bold rounded-xl hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Subscriptions;
