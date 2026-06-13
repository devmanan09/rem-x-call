import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronDown, RefreshCw, X } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../lib/api';

// ─── Tooltip ─────────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-[12px] font-bold text-gray-800 shadow-lg ring-1 ring-gray-100">
      <p className="mb-1 text-gray-500">{label}</p>
      {payload.map((entry) => (
        <div key={`${entry.name}-${entry.value}`} className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: {entry.value}
        </div>
      ))}
    </div>
  );
};

// ─── Skeleton ────────────────────────────────────────────────────────────────
const Skeleton = ({ className }) => (
  <div className={`animate-pulse rounded bg-gray-200 ${className}`} />
);

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : '—');
const fmtCurrency = (n) =>
  typeof n === 'number'
    ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';

// ─── Period options ───────────────────────────────────────────────────────────
const CALL_PERIODS = [
  { label: 'Last 7 days',  value: '7d' },
  { label: 'Last 14 days', value: '14d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 60 days', value: '60d' },
  { label: 'Last 90 days', value: '90d' },
  { label: 'Overall',      value: 'overall' },
];

// ─── Generic dropdown ────────────────────────────────────────────────────────
const Dropdown = ({ label, icon, value, options, onSelect, onClear }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find((o) => String(o.id) === String(value));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex min-w-0 items-center justify-between gap-2 rounded-xl px-3 py-2 text-[12px] font-bold transition-colors hover:bg-gray-100 ${
          selected ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-[#f8f9fb] text-gray-700'
        }`}
      >
        {icon}
        <span className="truncate">{selected ? selected.name : label}</span>
        {selected ? (
          <X
            className="h-3.5 w-3.5 shrink-0 text-gray-400 hover:text-red-500"
            onClick={(e) => { e.stopPropagation(); onClear(); setOpen(false); }}
          />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 max-h-52 w-48 overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-lg">
          {options.length === 0 ? (
            <p className="px-4 py-3 text-[11px] text-gray-400">No options</p>
          ) : (
            options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => { onSelect(opt.id); setOpen(false); }}
                className={`w-full px-4 py-2.5 text-left text-[12px] font-bold transition-colors hover:bg-gray-50 ${
                  String(value) === String(opt.id) ? 'text-green-600' : 'text-gray-700'
                }`}
              >
                {opt.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ─── Date range picker ────────────────────────────────────────────────────────
const DateRangeFilter = ({ dateFrom, dateTo, onChange, onClear }) => {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(dateFrom || '');
  const [to, setTo]     = useState(dateTo   || '');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isActive = dateFrom || dateTo;

  const apply = () => { onChange(from, to); setOpen(false); };
  const clear  = () => { setFrom(''); setTo(''); onClear(); setOpen(false); };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex min-w-0 items-center justify-between gap-2 rounded-xl px-3 py-2 text-[12px] font-bold transition-colors hover:bg-gray-100 ${
          isActive ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-[#f8f9fb] text-gray-700'
        }`}
      >
        <span className="truncate">
          {isActive ? `${dateFrom || '…'} → ${dateTo || '…'}` : 'Date range'}
        </span>
        {isActive ? (
          <X
            className="h-3.5 w-3.5 shrink-0 text-gray-400 hover:text-red-500"
            onClick={(e) => { e.stopPropagation(); clear(); }}
          />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-64 rounded-xl border border-gray-100 bg-white p-4 shadow-lg">
          <p className="mb-3 text-[11px] font-bold text-gray-500">Date Range</p>
          <div className="flex flex-col gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-bold text-gray-400">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-bold text-gray-700 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold text-gray-400">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-bold text-gray-700 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-200"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={apply}
              disabled={!from && !to}
              className="flex-1 rounded-lg bg-green-500 px-3 py-2 text-[11px] font-bold text-white transition-colors hover:bg-green-600 disabled:opacity-50"
            >
              Apply
            </button>
            <button
              onClick={clear}
              className="rounded-lg border border-gray-200 px-3 py-2 text-[11px] font-bold text-gray-600 transition-colors hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const Reports = () => {
  const [callPeriod, setCallPeriod]               = useState('30d');
  const [showPeriodMenu, setShowPeriodMenu]        = useState(false);
  const periodRef = useRef(null);

  // Filters
  const [selectedCompany, setSelectedCompany]     = useState('');
  const [selectedAgent, setSelectedAgent]         = useState('');
  const [dateFrom, setDateFrom]                   = useState('');
  const [dateTo, setDateTo]                       = useState('');

  // Filter options
  const [companies, setCompanies]                 = useState([]);
  const [agents, setAgents]                       = useState([]);

  // Call stats
  const [callStats, setCallStats]                 = useState(null);
  const [callChartData, setCallChartData]         = useState([]);
  const [callLoading, setCallLoading]             = useState(true);
  const [callError, setCallError]                 = useState(null);

  // Revenue
  const [revenueData, setRevenueData]             = useState(null);
  const [revenueChartData, setRevenueChartData]   = useState([]);
  const [revenueLoading, setRevenueLoading]       = useState(true);
  const [revenueError, setRevenueError]           = useState(null);

  // Close period dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (periodRef.current && !periodRef.current.contains(e.target)) setShowPeriodMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Load filter options once ──────────────────────────────────────────────
  useEffect(() => {
    api.get('/reports/filter-options').then(({ data }) => {
      setCompanies(data.companies || []);
      setAgents(data.agents || []);
    }).catch(() => {});
  }, []);

  // ── Fetch call stats ──────────────────────────────────────────────────────
  const fetchCallStats = useCallback(async () => {
    setCallLoading(true);
    setCallError(null);
    try {
      const params = { period: callPeriod };
      if (selectedCompany) params.companyId = selectedCompany;
      if (selectedAgent)   params.agentId   = selectedAgent;
      if (dateFrom)        params.dateFrom   = dateFrom;
      if (dateTo)          params.dateTo     = dateTo;

      const { data } = await api.get('/reports/call-stats', { params });
      setCallStats(data.stats || []);
      setCallChartData(data.chartData || []);
    } catch {
      setCallError('Failed to load call statistics.');
    } finally {
      setCallLoading(false);
    }
  }, [callPeriod, selectedCompany, selectedAgent, dateFrom, dateTo]);

  // ── Fetch revenue ─────────────────────────────────────────────────────────
  const fetchRevenue = useCallback(async () => {
    setRevenueLoading(true);
    setRevenueError(null);
    try {
      const params = {};
      if (selectedCompany) params.companyId = selectedCompany;
      if (dateFrom)        params.dateFrom   = dateFrom;
      if (dateTo)          params.dateTo     = dateTo;

      const { data } = await api.get('/reports/revenue', { params });
      setRevenueData(data);
      setRevenueChartData(data.chartData || []);
    } catch {
      setRevenueError('Failed to load revenue data.');
    } finally {
      setRevenueLoading(false);
    }
  }, [selectedCompany, dateFrom, dateTo]);

  useEffect(() => { fetchCallStats(); }, [fetchCallStats]);
  useEffect(() => { fetchRevenue();   }, [fetchRevenue]);

  const selectedPeriodLabel = CALL_PERIODS.find((p) => p.value === callPeriod)?.label || 'Last 30 days';

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 bg-[#f4f5f7] py-4 pb-6 animate-in fade-in duration-500">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full min-w-0 flex-col gap-3 rounded-2xl border bg-white p-3 shadow-sm ring-1 ring-gray-100 sm:flex-row sm:items-center lg:w-auto">
          <h1 className="text-[20px] font-[790] tracking-tight text-gray-900 sm:border-r sm:border-gray-100 sm:px-4">
            Reports &amp; Analytics
          </h1>
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto">
            {/* Company filter */}
            <Dropdown
              label="Company"
              icon={
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[8px] text-blue-600">
                  C
                </span>
              }
              value={selectedCompany}
              options={companies}
              onSelect={setSelectedCompany}
              onClear={() => setSelectedCompany('')}
            />

            {/* Agent filter */}
            <Dropdown
              label="Agent name"
              value={selectedAgent}
              options={agents}
              onSelect={setSelectedAgent}
              onClear={() => setSelectedAgent('')}
            />

            {/* Date range filter */}
            <DateRangeFilter
              dateFrom={dateFrom}
              dateTo={dateTo}
              onChange={(from, to) => { setDateFrom(from); setDateTo(to); }}
              onClear={() => { setDateFrom(''); setDateTo(''); }}
            />
          </div>
        </div>

        {/* Period selector */}
        <div className="relative" ref={periodRef}>
          <button
            onClick={() => setShowPeriodMenu((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[13px] font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 sm:w-auto"
          >
            {selectedPeriodLabel} <ChevronDown className="h-4 w-4 text-gray-400" />
          </button>
          {showPeriodMenu && (
            <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg">
              {CALL_PERIODS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setCallPeriod(opt.value); setShowPeriodMenu(false); }}
                  className={`w-full px-4 py-2.5 text-left text-[12px] font-bold transition-colors hover:bg-gray-50 ${
                    callPeriod === opt.value ? 'text-green-600' : 'text-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Call Statistics ───────────────────────────────────────────────────── */}
      <section
        className="block w-full min-w-0 rounded-[20px] p-1 shadow-sm sm:rounded-[24px]"
        style={{ background: 'linear-gradient(90deg, #ADF808 19%, #5AD43D 89%)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 sm:px-6">
          <h2 className="text-[16px] font-bold text-[#1a1a1a]">Call Statistics</h2>
          {callError && (
            <button onClick={fetchCallStats} className="flex items-center gap-1 text-[11px] font-bold text-red-600 hover:underline">
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          )}
        </div>

        <div className="min-h-[520px] rounded-[20px] bg-white shadow-inner ring-1 ring-gray-100 sm:rounded-[24px]">
          <div className="flex flex-col p-5 sm:p-6 md:p-8">
            <h3 className="mb-6 text-[13px] font-bold text-gray-400 sm:mb-8">Contacts Overview</h3>

            {callError ? (
              <p className="text-[13px] text-red-500">{callError}</p>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                {callLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex flex-col gap-2">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-8 w-24" />
                        <Skeleton className="h-2.5 w-16" />
                      </div>
                    ))
                  : (callStats || []).map((stat) => (
                      <div key={stat.label} className="flex flex-col">
                        <span className="mb-1 text-[12px] font-bold text-gray-500">{stat.label}</span>
                        <div className="flex flex-wrap items-end gap-2">
                          <span className="text-[28px] font-[790] leading-none tracking-tight text-gray-900 sm:text-[32px]">
                            {fmt(stat.value)}
                          </span>
                          <span className={`pb-1 text-[10px] font-bold ${stat.up ? 'text-green-500' : 'text-red-500'}`}>
                            {stat.up ? '+' : '-'} {stat.trend}%
                          </span>
                        </div>
                        <span className="mt-0.5 text-[10px] font-medium text-gray-400">Vs previous period</span>
                      </div>
                    ))}
              </div>
            )}

            <div className="my-6 h-px w-full bg-gray-100 sm:my-8" />

            <h3 className="mb-6 text-[13px] font-bold text-gray-400">Total Calls</h3>
            <div className="company-table-scroll w-full overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
              <div className="h-[240px] min-w-[520px] sm:min-w-0">
                {callLoading ? (
                  <Skeleton className="h-full w-full rounded-xl" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={callChartData} barSize={28}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 'bold' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 'bold' }} dx={-10} allowDecimals={false} />
                      <RechartsTooltip cursor={{ fill: 'transparent' }} content={<CustomTooltip />} />
                      <Bar dataKey="value" name="Calls" fill="#8bed21" radius={[10, 10, 10, 10]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Generated Revenue ─────────────────────────────────────────────────── */}
      <section className="flex w-full min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between sm:px-2">
          <h2 className="text-[22px] font-[790] tracking-tight text-gray-900">Generated Revenue</h2>
          {revenueError && (
            <button onClick={fetchRevenue} className="flex items-center gap-1 text-[11px] font-bold text-red-600 hover:underline">
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          )}
        </div>

        <div
          className="flex w-full min-w-0 flex-col overflow-hidden rounded-[20px] shadow-sm sm:rounded-[24px]"
          style={{ background: 'linear-gradient(90deg, #ADF808 19%, #5AD43D 89%)' }}
        >
          <div className="grid shrink-0 grid-cols-1 gap-4 px-5 py-5 sm:grid-cols-2 sm:px-8 lg:flex lg:items-center lg:gap-12">
            <div className="min-w-0">
              <span className="mb-1 block text-[13px] font-bold text-gray-800 opacity-90">Total Revenue</span>
              {revenueLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="flex flex-wrap items-end gap-2 text-[#1a1a1a] sm:gap-3">
                  <div className="mb-1.5 h-3 w-3 rounded-sm bg-[#58c005]" />
                  <span className="text-[26px] font-[790] leading-none tracking-tight sm:text-[28px]">
                    {fmtCurrency(revenueData?.totalRevenue)}
                  </span>
                  {revenueData && (
                    <span className={`pb-1 text-[11px] font-bold opacity-80 ${revenueData.revenueTrend >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                      {revenueData.revenueTrend >= 0 ? '+' : ''}{revenueData.revenueTrend}% vs last month
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="min-w-0">
              <span className="mb-1 block text-[13px] font-bold text-gray-800 opacity-90">Refunded</span>
              {revenueLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <div className="flex flex-wrap items-end gap-2 text-[#1a1a1a] sm:gap-3">
                  <div className="mb-1.5 h-3 w-3 rounded-sm bg-white" />
                  <span className="text-[26px] font-[790] leading-none tracking-tight sm:text-[28px]">
                    {fmtCurrency(revenueData?.totalRefunded)}
                  </span>
                  {revenueData && (
                    <span className={`pb-1 text-[11px] font-bold opacity-80 ${revenueData.refundedTrend >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                      {revenueData.refundedTrend >= 0 ? '+' : ''}{revenueData.refundedTrend}% vs last month
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="m-1 flex flex-col rounded-[20px] bg-white p-5 shadow-inner ring-1 ring-gray-100 sm:rounded-[24px] sm:p-6 md:p-8">
            <div className="mb-4 flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-sm bg-[#58c005]" />
                <span className="text-[11px] font-bold text-gray-500">This Year</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-sm bg-[#bbf7d0]" />
                <span className="text-[11px] font-bold text-gray-500">Previous Year</span>
              </div>
            </div>

            <div className="company-table-scroll w-full overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
              <div className="h-[320px] min-w-[680px] sm:min-w-0">
                {revenueLoading ? (
                  <Skeleton className="h-full w-full rounded-xl" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={revenueChartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical stroke="#E5E7EB" horizontal={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 'bold' }} dy={15} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11, fontWeight: 'bold' }} dx={-10} tickFormatter={(v) => `$${v}`} allowDecimals={false} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="current" name="This Year" stroke="#58c005" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: '#58c005', stroke: '#fff', strokeWidth: 2 }} />
                      <Line type="monotone" dataKey="previous" name="Previous Year" stroke="#bbf7d0" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: '#bbf7d0', stroke: '#fff', strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Reports;
