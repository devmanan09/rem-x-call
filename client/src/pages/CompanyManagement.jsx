import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { api } from '../lib/api';
import { countries } from 'countries-list';
import PaginationFooter from '../components/PaginationFooter';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Search, Plus, MoreVertical, UserX, Trash2, 
  ChevronLeft, Upload, Phone, Calendar, User, Landmark, CreditCard, Clock, ArrowUpRight, Check, ChevronDown, Eye, CircleX, PencilLine, Ban, KeyRound
} from 'lucide-react';

const fmtDate = (v) =>
  v
    ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

const COUNTRY_CODE_OPTIONS = Object.entries(countries)
  .flatMap(([iso2, country]) =>
    (country.phone || []).map((dial) => ({ value: `+${dial}`, label: `${iso2} +${dial}` }))
  )
  .filter((v, i, arr) => arr.findIndex((x) => x.value === v.value) === i)
  .sort((a, b) => a.value.localeCompare(b.value));

/** Split stored E.164-ish phone into dial code + national digits for the country select + number fields. */
const splitE164Phone = (full) => {
  const s = String(full || '').trim();
  if (!s) return { agentCountryCode: '+27', agentPhoneNumber: '' };
  if (!s.startsWith('+')) {
    return { agentCountryCode: '+27', agentPhoneNumber: s.replace(/\D/g, '') };
  }
  const sorted = [...COUNTRY_CODE_OPTIONS].sort((a, b) => b.value.length - a.value.length);
  for (const { value } of sorted) {
    if (s.startsWith(value)) {
      return { agentCountryCode: value, agentPhoneNumber: s.slice(value.length).replace(/\D/g, '') };
    }
  }
  return { agentCountryCode: '+27', agentPhoneNumber: s.replace(/\D/g, '') };
};

const formatAgentListName = (agent) => {
  if (!agent) return '—';
  if (agent.displayName) return agent.displayName;
  const full = `${agent.firstName || ''} ${agent.lastName || ''}`.trim();
  return full || agent.username || '—';
};

const FLOATING_MENU_W = 224;
const FLOATING_MENU_H = 280;

const rectFromEl = (el) => {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
};

const floatingMenuStyle = (rect) => {
  if (!rect) return { top: 0, left: 0 };
  const openUp = rect.bottom + FLOATING_MENU_H > window.innerHeight - 10;
  const top = openUp ? rect.top - FLOATING_MENU_H - 6 : rect.bottom + 6;
  const left = Math.min(Math.max(8, rect.right - FLOATING_MENU_W), window.innerWidth - FLOATING_MENU_W - 8);
  return { top, left };
};

const createEmptyInviteForm = () => ({
  companyName: '',
  companyBusinessEmail: '',
  agentEmail: '',
  agentFirstName: '',
  agentLastName: '',
  agentCountryCode: '+27',
  agentPhoneNumber: '',
  subscriptionPlanId: '',
  trialDays: '0',
  discountPercent: '0',
  enableWhiteLabel: false,
  whiteLabelLogoUrl: '',
  primaryBrandColor: '#4ade80',
  secondaryBrandColor: '#3b82f6',
  brandFont: 'Inter',
});

const computeRenewalDate = (company) => {
  if (company?.trialEndsAt) return company.trialEndsAt;
  const created = company?.createdAt ? new Date(company.createdAt) : null;
  if (!created || Number.isNaN(created.getTime())) return null;
  const billing = company?.subscriptionPlan?.billingCycle;
  if (billing === 'yearly') {
    created.setFullYear(created.getFullYear() + 1);
  } else {
    created.setMonth(created.getMonth() + 1);
  }
  return created.toISOString();
};

// --- Subcomponents ---

const PlanBadge = ({ plan }) => {
  const styles = {
    'Premium': 'bg-[#8bed21] text-gray-900',
    'Standard': 'bg-[#1a1a1a] text-white',
    'Basic': 'bg-gray-100 text-gray-700'
  };
  return (
    <span className={`px-3 py-1 rounded-md text-[11px] font-bold ${styles[plan] || styles['Basic']}`}>
      {plan}
    </span>
  );
};

const StatusBadge = ({ status }) => {
  const normalized = String(status || '').trim().toLowerCase();
  const isPositive = ['active', 'completed', 'paid', 'sent'].includes(normalized);
  const isNeutral = ['in-progress', 'trial', 'pending'].includes(normalized);
  const isNegative = ['expired', 'failed', 'not started', 'not active', 'cancelled', 'paused'].includes(normalized);

  const colorClass = isPositive ? 'text-[#22c55e] bg-green-50' : 
                     isNegative ? 'text-[#ef4444] bg-red-50' :
                     isNeutral ? 'text-orange-500 bg-orange-50' : 'text-gray-500 bg-gray-50';

  const dotClass = isPositive ? 'bg-[#22c55e]' : 
                   isNegative ? 'bg-[#ef4444]' :
                   isNeutral ? 'bg-orange-500' : 'bg-gray-400';

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${colorClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`}></span>
      {status}
    </div>
  );
};

// --- View Components ---

const AllCompaniesTable = ({
  data,
  actionMenuOpenId,
  onOpenActionMenu,
  onViewDetails,
  onEditCompany,
  onDeactivateCompany,
  onResendPassword,
  onDeleteCompany,
  actionBusyId,
  selectedIds,
  onToggleRow,
  onToggleSelectAllPage,
  allPageSelected,
  somePageSelected,
}) => {
  const headerSelectRef = useRef(null);
  useEffect(() => {
    const el = headerSelectRef.current;
    if (el) el.indeterminate = Boolean(somePageSelected && !allPageSelected);
  }, [somePageSelected, allPageSelected]);

  return (
    <div className="min-w-max">
      <table className="min-w-[1720px] w-full text-left border-collapse whitespace-nowrap">
        <thead>
          <tr className="border-b border-gray-100 text-[12px] font-bold text-gray-400 bg-white">
            <th className="w-12 p-4 pl-4 text-center">
              <input
                ref={headerSelectRef}
                type="checkbox"
                checked={allPageSelected}
                onChange={onToggleSelectAllPage}
                className="h-4 w-4 rounded border-gray-300"
                aria-label="Select all companies on this page"
              />
            </th>
            <th className="p-4 pl-2 font-medium">
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5" /> Agent Name
              </div>
            </th>
            <th className="p-4 font-medium">Company Name</th>
            <th className="p-4 font-medium">Business email</th>
            <th className="p-4 font-medium">Agent email</th>
            <th className="p-4 font-medium">
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5" /> Phone
              </div>
            </th>
            <th className="p-4 font-medium">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" /> Date
              </div>
            </th>
            <th className="p-4 font-medium">Subscription Plan</th>
            <th className="p-4 font-medium">Sold Products</th>
            <th className="p-4 font-medium">Assigned Contacts</th>
            <th className="p-4 font-medium">Status</th>
            <th className="p-4 font-medium">Declined calls</th>
            <th className="p-4 pr-6 text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          {data.map((comp) => (
            <tr key={comp.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
              <td className="p-4 pl-4 text-center">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(comp.id)}
                  onChange={() => onToggleRow(comp.id)}
                  className="h-4 w-4 rounded border-gray-300"
                  aria-label={`Select ${comp.companyName}`}
                />
              </td>
              <td className="p-4 pl-2 text-[13px] font-bold text-gray-700">{comp.agentName}</td>
              <td className="p-4">
                <div className="flex items-center gap-2">
                  <img src={comp.logo} className="h-5 w-5 rounded-sm bg-gray-100 object-cover" alt="" />
                  <span className="text-[13px] font-bold text-gray-700">{comp.companyName}</span>
                </div>
              </td>
              <td className="p-4 text-[13px] font-bold text-gray-500">{comp.businessEmail}</td>
              <td className="p-4 text-[13px] font-bold text-gray-500">{comp.email}</td>
              <td className="p-4 text-[13px] font-bold text-gray-500">{comp.phone}</td>
              <td className="p-4 text-[13px] font-bold text-gray-500">{comp.date}</td>
              <td className="p-4">
                <PlanBadge plan={comp.plan} />
              </td>
              <td className="p-4 text-[13px] font-bold text-gray-500">{comp.sold}</td>
              <td className="p-4 text-[13px] font-bold text-gray-500">{comp.assigned}</td>
              <td className="p-4">
                <StatusBadge status={comp.status} />
              </td>
              <td className="p-4 text-[13px] font-bold text-gray-500">{comp.declined}</td>
              <td className="p-4 pr-6 text-center">
                <button
                  type="button"
                  data-company-action-trigger="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenActionMenu(comp.id, rectFromEl(e.currentTarget));
                  }}
                  className={`rounded-md p-1 text-gray-400 hover:bg-gray-100 ${actionMenuOpenId === comp.id ? 'bg-gray-100' : ''}`}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ActiveCompaniesTable = ({ data }) => (
  <div className="min-w-max pb-3">
  <table className="min-w-[1200px] w-full text-left border-collapse whitespace-nowrap">
    <thead>
      <tr className="border-b border-gray-100 text-[12px] font-bold text-gray-400 bg-white">
        <th className="p-4 pl-6 font-medium"><div className="flex items-center gap-2"><User className="w-3.5 h-3.5"/> Agent Name</div></th>
        <th className="p-4 font-medium">Company Name</th>
        <th className="p-4 font-medium">Status</th>
        <th className="p-4 font-medium">Today Calls</th>
        <th className="p-4 font-medium">Connected Calls</th>
        <th className="p-4 font-medium">Failed Calls</th>
        <th className="p-4 font-medium">Avg Call Duration</th>
        <th className="p-4 pr-6 text-center">Action</th>
      </tr>
    </thead>
    <tbody>
      {data.map((comp) => (
        <tr key={comp.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
          <td className="p-4 pl-6 text-[13px] font-bold text-gray-700">{comp.agentName}</td>
          <td className="p-4">
            <div className="flex items-center gap-2">
              <img src={comp.logo} className="w-5 h-5 rounded-sm object-cover bg-gray-100" />
              <span className="text-[13px] font-bold text-gray-700">{comp.companyName}</span>
            </div>
          </td>
          <td className="p-4"><StatusBadge status={comp.status} /></td>
          <td className="p-4 text-[13px] font-bold text-gray-500">{comp.todayCalls}</td>
          <td className="p-4 text-[13px] font-bold text-gray-500">{comp.connectedCalls}</td>
          <td className="p-4 text-[13px] font-bold text-gray-500">{comp.failedCalls}</td>
          <td className="p-4 text-[13px] font-bold text-gray-500">{comp.avgDuration}</td>
          <td className="p-4 pr-6 text-center relative">
            <button className="p-1 hover:bg-gray-100 rounded-md text-gray-400">
              <MoreVertical className="w-4 h-4" />
            </button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
  </div>
);

const PendingTable = ({ data, onResendInvite, onCancelInvite, actionBusyId }) => (
  <div className="min-w-max pb-3">
  <table className="min-w-[1200px] w-full text-left border-collapse whitespace-nowrap">
    <thead>
      <tr className="border-b border-gray-100 text-[12px] font-bold text-gray-400 bg-white">
        <th className="p-4 pl-6 font-medium"><div className="flex items-center gap-2"><User className="w-3.5 h-3.5"/> Agent Name</div></th>
        <th className="p-4 font-medium">Company Name</th>
        <th className="p-4 font-medium">Subscription Plan</th>
        <th className="p-4 font-medium">Invite Status</th>
        <th className="p-4 font-medium">Invited On</th>
        <th className="p-4 font-medium">Remind</th>
        <th className="p-4 pr-6 text-center">Action</th>
      </tr>
    </thead>
    <tbody>
      {data.map((comp) => (
        <tr key={comp.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
          <td className="p-4 pl-6 text-[13px] font-bold text-gray-700">{comp.agentName}</td>
          <td className="p-4 text-[13px] font-bold text-gray-700">{comp.companyName}</td>
          <td className="p-4"><PlanBadge plan={comp.plan} /></td>
          <td className="p-4 text-[13px] font-bold text-gray-500">{comp.inviteStatus}</td>
          <td className="p-4"><StatusBadge status={comp.invitedOn} /></td>
          <td className="p-4 text-[13px] font-bold text-gray-500">{comp.remind}</td>
          <td className="p-4 pr-6 text-center">
            <button
              type="button"
              disabled={actionBusyId === comp.id}
              onClick={() => onResendInvite(comp.id)}
              className="px-3 py-1 bg-black text-white text-[11px] font-bold rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-60"
            >
              Resend invite
            </button>
            <button
              type="button"
              disabled={actionBusyId === comp.id}
              onClick={() => onCancelInvite(comp.id)}
              className="ml-2 text-[11px] font-bold text-[#ef4444] hover:underline disabled:opacity-60"
            >
              Cancel invite
            </button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
  </div>
);

const SubscriptionsTable = ({
  data,
  onViewDetails,
  onOpenActionsMenu,
  actionMenuOpenId,
  onMarkPaid,
  onCancelSubscription,
  onUpdateSubscription,
  actionBusyId,
}) => (
  <div className="min-w-max pb-3">
  <table className="min-w-[1200px] w-full text-left border-collapse whitespace-nowrap">
    <thead>
      <tr className="border-b border-gray-100 text-[12px] font-bold text-gray-400 bg-white">
        <th className="p-4 pl-6 font-medium">Company Name</th>
        <th className="p-4 font-medium">Subscription Plan</th>
        <th className="p-4 font-medium">Billing Cycle</th>
        <th className="p-4 font-medium">Price</th>
        <th className="p-4 font-medium">Start Date</th>
        <th className="p-4 font-medium">Renewal Date</th>
        <th className="p-4 font-medium">Status</th>
        <th className="p-4 pr-6 text-center">Action</th>
      </tr>
    </thead>
    <tbody>
      {data.map((sub) => (
        <tr key={sub.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
          <td className="p-4 pl-6 text-[13px] font-bold text-gray-700">{sub.companyName}</td>
          <td className="p-4 text-[13px] font-bold text-gray-700">{sub.plan}</td>
          <td className="p-4 text-[13px] font-bold text-gray-500">{sub.billing}</td>
          <td className="p-4 text-[13px] font-bold text-gray-700">{sub.price}</td>
          <td className="p-4 text-[13px] font-bold text-gray-500">{sub.start}</td>
          <td className="p-4 text-[13px] font-bold text-gray-500">{sub.renewal}</td>
          <td className="p-4"><StatusBadge status={sub.status} /></td>
          <td className="p-4 pr-6 text-center">
            <button
              type="button"
              data-company-action-trigger="true"
              onClick={(e) => {
                e.stopPropagation();
                onOpenActionsMenu(sub.id, rectFromEl(e.currentTarget));
              }}
              className={`rounded-md p-1 text-gray-400 hover:bg-gray-100 ${actionMenuOpenId === sub.id ? 'bg-gray-100' : ''}`}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
  </div>
);

const CompanyDetailsView = ({ company, onBack, onToggleSubscription, onUpgradeSubscription, actionBusy }) => (
  <div className="flex flex-col animate-in fade-in slide-in-from-right-4 duration-300">
    <button onClick={onBack} className="flex items-center gap-2 text-[13px] font-bold text-gray-500 hover:text-gray-900 mb-6 lg:mb-8 transition-colors">
      <ChevronLeft className="w-4 h-4" /> Back
    </button>

    <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-12">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
            <Landmark className="w-8 h-8 text-blue-400" />
        </div>
        <div>
           <p className="text-[12px] font-bold text-gray-400 mb-1">Joined On: {fmtDate(company?.createdAt)}</p>
           <h2 className="text-[28px] font-display font-[900] text-gray-900 leading-none">{company.companyName}</h2>
        </div>
      </div>
      <div className="flex items-center gap-3">
         <button
           type="button"
           disabled={actionBusy}
           onClick={onToggleSubscription}
           className="px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-[13px] font-bold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-60"
         >
           {String(company?.status || '').toLowerCase() === 'paused' ? 'Resume subscription' : 'Pause subscription'}
         </button>
         <button
           type="button"
           disabled={actionBusy}
           onClick={onUpgradeSubscription}
           className="px-5 py-2.5 bg-black text-white rounded-xl text-[13px] font-bold hover:bg-gray-900 transition-colors shadow-sm disabled:opacity-60"
         >
           Upgrade Plan
         </button>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-y-6 mb-12 max-w-4xl">
       <div className="flex flex-col">
          <span className="text-[13px] font-bold text-gray-400 mb-1">Agent Name:</span>
          <span className="text-[14px] font-bold text-gray-900">{company?.agentName || '—'}</span>
       </div>
       <div className="flex flex-col">
          <span className="text-[13px] font-bold text-gray-400 mb-1">Business email:</span>
          <span className="text-[14px] font-bold text-gray-900 break-all">{company?.businessEmail || '—'}</span>
       </div>
       <div className="flex flex-col">
          <span className="text-[13px] font-bold text-gray-400 mb-1">Agent email (login):</span>
          <span className="text-[14px] font-bold text-gray-900 break-all">{company?.agentEmail || '—'}</span>
       </div>
       <div className="flex flex-col">
          <span className="text-[13px] font-bold text-gray-400 mb-1">Current Plan:</span>
          <span className="text-[14px] font-bold text-gray-900">{company?.plan || '—'}</span>
       </div>
       <div className="flex flex-col">
          <span className="text-[13px] font-bold text-gray-400 mb-1">Status:</span>
          <StatusBadge status={company?.status || '—'} />
       </div>
       <div className="flex flex-col">
          <span className="text-[13px] font-bold text-gray-400 mb-1">Billing Cycle:</span>
          <span className="text-[14px] font-bold text-gray-900">{company?.billing || '—'}</span>
       </div>
       <div className="flex flex-col">
          <span className="text-[13px] font-bold text-gray-400 mb-1">Next Payment:</span>
          <span className="text-[14px] font-[900] text-gray-900">{company?.renewal || '—'}</span>
       </div>
    </div>

    <div className="w-full bg-white rounded-2xl ring-1 ring-gray-100 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
            <thead>
                <tr className="border-b border-gray-100 bg-[#f8f9fb] text-[11px] font-bold text-gray-400">
                    <th className="p-4 pl-6"><div className="flex items-center gap-2"><CreditCard className="w-3 h-3"/> Subscription Plan</div></th>
                    <th className="p-4"><div className="flex items-center gap-2"><Clock className="w-3 h-3"/> Billing Cycle</div></th>
                    <th className="p-4"><div className="flex items-center gap-2"><Landmark className="w-3 h-3"/> Price</div></th>
                    <th className="p-4"><div className="flex items-center gap-2"><Calendar className="w-3 h-3"/> Start Date</div></th>
                    <th className="p-4"><div className="flex items-center gap-2"><Calendar className="w-3 h-3"/> Renewal Date</div></th>
                    <th className="p-4">Status</th>
                    <th className="p-4 pr-6 text-center">Action</th>
                </tr>
            </thead>
            <tbody>
                {[company].filter(Boolean).map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                        <td className="p-4 pl-6 text-[13px] font-bold text-gray-700">{row.plan}</td>
                        <td className="p-4"><span className="px-3 py-1 bg-gray-50 rounded-lg text-[11px] font-bold text-gray-500">{row.cycle}</span></td>
                        <td className="p-4 text-[13px] font-bold text-gray-900">{row.price}</td>
                        <td className="p-4 text-[13px] font-bold text-gray-500">{row.start}</td>
                        <td className="p-4 text-[13px] font-bold text-gray-500">{row.renewal}</td>
                        <td className="p-4"><StatusBadge status={row.status} /></td>
                        <td className="p-4 pr-6 text-center"><MoreVertical className="w-4 h-4 text-gray-400 mx-auto" /></td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
  </div>
);

// --- Form sub-components (defined OUTSIDE main component to prevent focus loss on re-render) ---

const InputField = ({ label, hint, error, children }) => (
  <div>
    <label className="block text-[13px] font-bold text-gray-700 mb-1">{label}</label>
    {hint && <p className="mb-1.5 text-[11px] font-medium text-gray-400">{hint}</p>}
    {children}
    {error && <p className="mt-1 text-[11px] font-semibold text-red-500 flex items-center gap-1">⚠ {error}</p>}
  </div>
);

const inputCls = (err) =>
  `w-full bg-white border py-2.5 px-4 rounded-xl text-[13px] font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-shadow ${
    err ? 'border-red-300 focus:ring-red-200' : 'border-gray-200 focus:ring-[#7ae230] hover:border-gray-300'
  }`;

const SectionCard = ({ number, title, subtitle, icon, children }) => (
  <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-hidden">
    <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1a1a1a] text-white text-[13px] font-black">
        {number}
      </div>
      <div>
        <h2 className="text-[14px] font-black text-gray-900 tracking-tight">{title}</h2>
        <p className="text-[11px] font-medium text-gray-400 mt-0.5">{subtitle}</p>
      </div>
      <div className="ml-auto text-gray-200">{icon}</div>
    </div>
    <div className="p-6 space-y-4">{children}</div>
  </div>
);

// --- Main Page Component ---

export default function CompanyManagement() {
  const { tabId } = useParams();
  const currentTab = tabId || 'all';
  const navigate = useNavigate();
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

  const [apiCompanies, setApiCompanies] = useState([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [inviteForm, setInviteForm] = useState(createEmptyInviteForm());
  const [formErrors, setFormErrors] = useState({});
  const [companyErr, setCompanyErr] = useState('');
  const [companySaving, setCompanySaving] = useState(false);
  const [actionBusyId, setActionBusyId] = useState(null);
  /** Row action menu: fixed portal so it is not clipped by table overflow; rect from getBoundingClientRect */
  const [actionMenu, setActionMenu] = useState(null);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 5, totalItems: 0, totalPages: 1 });
  const fileInputRef = useRef(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [viewMode, setViewMode] = useState('list'); // 'list', 'add', 'edit', 'details'
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [updateSubscriptionForm, setUpdateSubscriptionForm] = useState({
    companyId: null,
    subscriptionPlanId: '',
    trialDays: '0',
    discountPercent: '0',
  });
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  useEffect(() => {
    if (!actionMenu) return undefined;
    const handleDocMouseDown = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-company-floating-menu="true"]')) return;
      if (target.closest('[data-company-action-trigger="true"]')) return;
      setActionMenu(null);
    };
    const handleEsc = (event) => {
      if (event.key === 'Escape') setActionMenu(null);
    };
    const handleScroll = () => setActionMenu(null);
    document.addEventListener('mousedown', handleDocMouseDown);
    document.addEventListener('keydown', handleEsc);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleDocMouseDown);
      document.removeEventListener('keydown', handleEsc);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [actionMenu]);

  const loadCompanies = useCallback(async () => {
    setCompanyErr('');
    try {
      const { data } = await api.get('/companies', {
        params: { tab: currentTab, page, pageSize, q: debouncedQ.trim() || undefined },
      });
      setApiCompanies(Array.isArray(data?.companies) ? data.companies : []);
      setPagination(
        data?.pagination || {
          page,
          pageSize,
          totalItems: Array.isArray(data?.companies) ? data.companies.length : 0,
          totalPages: 1,
        }
      );
    } catch (e) {
      setCompanyErr(e?.response?.data?.message || 'Failed to load companies.');
    }
  }, [currentTab, page, pageSize, debouncedQ]);

  useEffect(() => {
    if (viewMode === 'list') {
      loadCompanies();
    }
  }, [viewMode, currentTab, loadCompanies]);

  useEffect(() => {
    setPage(1);
  }, [currentTab, debouncedQ]);

  useEffect(() => {
    if (viewMode !== 'add' && viewMode !== 'edit' && viewMode !== 'updateSubscription') return;
    let cancelled = false;
    (async () => {
      setCompanyErr('');
      try {
        const { data } = await api.get('/subscription-plans?activeOnly=true');
        if (!cancelled) {
          setSubscriptionPlans(Array.isArray(data?.plans) ? data.plans : []);
        }
      } catch (e) {
        if (!cancelled) {
          setCompanyErr(e?.response?.data?.message || 'Failed to load subscription plans. Create plans under Subscriptions & Billing first.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewMode]);

  const selectedPlan = useMemo(
    () => subscriptionPlans.find((p) => String(p.id) === String(inviteForm.subscriptionPlanId)) || null,
    [subscriptionPlans, inviteForm.subscriptionPlanId]
  );
  const planIncludesWhiteLabel = Boolean(selectedPlan?.whiteLabelEnabled);

  useEffect(() => {
    if (planIncludesWhiteLabel) return;
    setInviteForm((prev) => ({
      ...prev,
      enableWhiteLabel: false,
      whiteLabelLogoUrl: '',
      primaryBrandColor: '#4ade80',
      secondaryBrandColor: '#3b82f6',
      brandFont: 'Inter',
    }));
  }, [planIncludesWhiteLabel]);

  const allTableData = apiCompanies.map((c) => ({
    id: c.id,
    agentName: formatAgentListName(c.agent),
    companyName: c.name,
    businessEmail: c.businessEmail?.trim() ? c.businessEmail : '—',
    email: c.agent?.email || '—',
    phone: c.agent?.phone?.trim() ? c.agent.phone : '—',
    date: c.createdAt
      ? new Date(c.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—',
    plan: c.subscriptionPlan?.name || '—',
    subscriptionPlanId: c.subscriptionPlan?.id || null,
    sold: '—',
    assigned: '—',
    status: c.subscriptionStatus || (c.inviteStatus === 'pending' ? 'pending' : 'active'),
    declined: '—',
    logo: c.whiteLabelLogoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name || 'Co')}&background=f4f5f7`,
    companyId: c.id,
    createdAt: c.createdAt,
    inviteStatus: c.inviteStatus,
    invitedOn: fmtDate(c.inviteSentAt),
    remind: 'Now',
    billing: c.subscriptionPlan?.billingCycle === 'yearly' ? 'Yearly' : 'Monthly',
    price: `$${Number(c.subscriptionPlan?.priceMonthly || 0).toFixed(0)}`,
    renewal: fmtDate(computeRenewalDate(c)),
    discountPercent: Number(c.discountPercent || 0),
  }));

  const activeCompanies = useMemo(
    () =>
      allTableData.map((row) => ({
        ...row,
        todayCalls: row.todayCalls || 0,
        connectedCalls: row.connectedCalls || 0,
        failedCalls: row.failedCalls || 0,
        avgDuration: row.avgDuration || '0:00',
      })),
    [allTableData]
  );

  const pendingCompanies = useMemo(() => allTableData, [allTableData]);

  const subscriptionRows = useMemo(
    () =>
      allTableData.map((row) => ({
        ...row,
        id: row.companyId,
        start: row.createdAt ? fmtDate(row.createdAt) : '—',
      })),
    [allTableData]
  );

  // ── PDF Export ────────────────────────────────────────────────────────────
  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const tabLabels = { all: 'All Companies', active: 'Active Companies', pending: 'Pending Invites', subscriptions: 'Subscriptions' };
    const title = tabLabels[currentTab] || 'Companies';
    const exportedAt = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, 18);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150);
    doc.text(`Exported: ${exportedAt}`, 14, 25);
    doc.setTextColor(0);

    let columns = [];
    let rows = [];

    if (currentTab === 'all') {
      columns = ['Agent Name', 'Company', 'Business Email', 'Agent Email', 'Phone', 'Date', 'Plan', 'Status', 'Billing'];
      rows = allTableData.map((r) => [r.agentName, r.companyName, r.businessEmail, r.email, r.phone, r.date, r.plan, r.status, r.billing]);
    } else if (currentTab === 'active') {
      columns = ['Agent Name', 'Company', 'Status', 'Today Calls', 'Connected', 'Failed', 'Avg Duration'];
      rows = activeCompanies.map((r) => [r.agentName, r.companyName, r.status, r.todayCalls, r.connectedCalls, r.failedCalls, r.avgDuration]);
    } else if (currentTab === 'pending') {
      columns = ['Agent Name', 'Company', 'Plan', 'Invite Status', 'Invited On'];
      rows = pendingCompanies.map((r) => [r.agentName, r.companyName, r.plan, r.inviteStatus, r.invitedOn]);
    } else if (currentTab === 'subscriptions') {
      columns = ['Company', 'Plan', 'Billing', 'Price', 'Start', 'Renewal', 'Status'];
      rows = subscriptionRows.map((r) => [r.companyName, r.plan, r.billing, `$${r.price}`, r.start, r.renewal, r.status]);
    }

    autoTable(doc, {
      startY: 30,
      head: [columns],
      body: rows,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [26, 26, 26], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 249, 251] },
      rowPageBreak: 'auto',
    });

    doc.save(`${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.pdf`);
  };

  useEffect(() => {
    setSelectedCompanyIds([]);
  }, [currentTab, page, viewMode]);

  const pageCompanyIds = useMemo(() => {
    if (currentTab !== 'all') return [];
    return apiCompanies.map((c) => c.id);
  }, [apiCompanies, currentTab]);

  const allPageSelected =
    pageCompanyIds.length > 0 && pageCompanyIds.every((id) => selectedCompanyIds.includes(id));
  const somePageSelected = pageCompanyIds.some((id) => selectedCompanyIds.includes(id));

  const toggleCompanyRowSelect = (id) => {
    setSelectedCompanyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllCompaniesOnPage = () => {
    if (allPageSelected) {
      setSelectedCompanyIds((prev) => prev.filter((id) => !pageCompanyIds.includes(id)));
    } else {
      setSelectedCompanyIds((prev) => [...new Set([...prev, ...pageCompanyIds])]);
    }
  };

  const updateCompany = async (companyId, payload) => {
    setActionBusyId(companyId);
    setCompanyErr('');
    try {
      await api.patch(`/companies/${companyId}`, payload);
      await loadCompanies();
      if (selectedCompany?.id === companyId) {
        const { data } = await api.get(`/companies/${companyId}`);
        const c = data?.company;
        setSelectedCompany({
          id: c.id,
          companyId: c.id,
          companyName: c.name,
          businessEmail: c.businessEmail || '',
          agentName: formatAgentListName(c.agent),
          agentEmail: c.agent?.email || '',
          plan: c.subscriptionPlan?.name || '—',
          subscriptionPlanId: c.subscriptionPlan?.id || null,
          billing: c.subscriptionPlan?.billingCycle === 'yearly' ? 'Yearly' : 'Monthly',
          price: `$${Number(c.subscriptionPlan?.priceMonthly || 0).toFixed(0)}`,
          start: fmtDate(c.createdAt),
          renewal: fmtDate(computeRenewalDate(c)),
          cycle: c.subscriptionPlan?.billingCycle === 'yearly' ? 'Yearly' : 'Monthly',
          status: c.subscriptionStatus || 'active',
          discountPercent: Number(c.discountPercent || 0),
          createdAt: c.createdAt,
        });
      }
    } catch (e) {
      setCompanyErr(e?.response?.data?.message || 'Failed to update company.');
    } finally {
      setActionBusyId(null);
      setActionMenu(null);
    }
  };

  const handleResendInvite = async (companyId) => {
    setActionBusyId(companyId);
    setCompanyErr('');
    try {
      await api.post(`/companies/${companyId}/resend-invite`);
      await loadCompanies();
    } catch (e) {
      setCompanyErr(e?.response?.data?.message || 'Failed to resend invite.');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleCancelInvite = async (companyId) => {
    setActionBusyId(companyId);
    setCompanyErr('');
    try {
      await api.post(`/companies/${companyId}/cancel-invite`);
      await loadCompanies();
    } catch (e) {
      setCompanyErr(e?.response?.data?.message || 'Failed to cancel invite.');
    } finally {
      setActionBusyId(null);
    }
  };

  const handleEditCompany = async (companyId) => {
    setActionMenu(null);
    setCompanyErr('');
    try {
      const { data } = await api.get(`/companies/${companyId}`);
      const c = data?.company;
      if (!c) {
        setCompanyErr('Company not found.');
        return;
      }
      setSelectedCompany({
        id: c.id,
        companyId: c.id,
        companyName: c.name,
      });
      setInviteForm({
        companyName: c.name || '',
        companyBusinessEmail: c.businessEmail || '',
        agentEmail: c.agent?.email || '',
        agentFirstName: c.agent?.firstName || '',
        agentLastName: c.agent?.lastName || '',
        ...splitE164Phone(c.agent?.phone),
        subscriptionPlanId: c.subscriptionPlan?.id ? String(c.subscriptionPlan.id) : '',
        trialDays: '0',
        discountPercent: String(Number(c.discountPercent || 0)),
        enableWhiteLabel: Boolean(c.whiteLabelLogoUrl || c.primaryBrandColor || c.secondaryBrandColor || c.brandFont),
        whiteLabelLogoUrl: c.whiteLabelLogoUrl || '',
        primaryBrandColor: c.primaryBrandColor || '#4ade80',
        secondaryBrandColor: c.secondaryBrandColor || '#3b82f6',
        brandFont: c.brandFont || 'Inter',
      });
      setFormErrors({});
      setViewMode('edit');
    } catch (e) {
      setCompanyErr(e?.response?.data?.message || 'Failed to load company.');
    }
  };

  const handleDeactivateCompany = async (companyId) => {
    const company = allTableData.find((c) => c.id === companyId);
    const currentStatus = String(company?.status || '').toLowerCase();
    const isActive = currentStatus === 'active' || currentStatus === 'trial';
    await updateCompany(companyId, { subscriptionStatus: isActive ? 'paused' : 'active' });
  };

  const handleResendPassword = async (companyId) => {
    setActionMenu(null);
    await handleResendInvite(companyId);
  };

  const handleDeleteCompany = async (companyId) => {
    setActionBusyId(companyId);
    setCompanyErr('');
    try {
      await api.delete(`/companies/${companyId}`);
      if (selectedCompany?.companyId === companyId) {
        setSelectedCompany(null);
        setViewMode('list');
      }
      await loadCompanies();
    } catch (e) {
      setCompanyErr(e?.response?.data?.message || 'Failed to delete company.');
    } finally {
      setActionBusyId(null);
      setActionMenu(null);
    }
  };

  const handleBulkDeleteCompanies = async () => {
    if (!selectedCompanyIds.length) return;
    const n = selectedCompanyIds.length;
    if (
      !window.confirm(
        `Permanently delete ${n} compan${n === 1 ? 'y' : 'ies'}? This cannot be undone.`
      )
    ) {
      return;
    }
    setCompanyErr('');
    setCompanySaving(true);
    try {
      const idsSnapshot = [...selectedCompanyIds];
      await api.post('/companies/bulk-delete', { companyIds: idsSnapshot });
      setSelectedCompanyIds([]);
      setActionMenu(null);
      if (selectedCompany && idsSnapshot.includes(selectedCompany.companyId)) {
        setSelectedCompany(null);
        setViewMode('list');
      }
      await loadCompanies();
    } catch (e) {
      setCompanyErr(e?.response?.data?.message || 'Bulk delete failed.');
    } finally {
      setCompanySaving(false);
    }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    setUploadingLogo(true);
    setCompanyErr('');
    try {
      const body = new FormData();
      body.append('file', file);
      const { data } = await api.post('/companies/upload-logo', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data?.url) {
        setInviteForm((f) => ({ ...f, whiteLabelLogoUrl: data.url }));
      }
    } catch (e) {
      setCompanyErr(e?.response?.data?.message || 'Failed to upload logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const submitInviteCompany = async () => {
    const nextErrors = {};
    if (!inviteForm.companyName.trim()) nextErrors.companyName = 'Company name is required.';
    if (!inviteForm.companyBusinessEmail.trim()) nextErrors.companyBusinessEmail = 'Business email is required.';
    if (!inviteForm.agentEmail.trim()) nextErrors.agentEmail = 'Personal email is required.';
    if (!inviteForm.agentFirstName.trim()) nextErrors.agentFirstName = 'Agent first name is required.';
    if (!inviteForm.agentLastName.trim()) nextErrors.agentLastName = 'Agent last name is required.';
    if (!inviteForm.agentPhoneNumber.trim()) nextErrors.agentPhone = 'Phone number is required.';
    setCompanySaving(true);
    setCompanyErr('');
    const subscriptionPlanId = Number.parseInt(inviteForm.subscriptionPlanId, 10);
    if (Number.isNaN(subscriptionPlanId) || subscriptionPlanId <= 0) nextErrors.subscriptionPlanId = 'Subscription plan is required.';
    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      setCompanyErr('Please fill the required fields.');
      setCompanySaving(false);
      return;
    }
    setFormErrors({});
    try {
      await api.post('/companies', {
        companyName: inviteForm.companyName.trim(),
        businessEmail: inviteForm.companyBusinessEmail.trim(),
        agentEmail: inviteForm.agentEmail.trim(),
        agentFirstName: inviteForm.agentFirstName.trim(),
        agentLastName: inviteForm.agentLastName.trim(),
        agentPhone: `${inviteForm.agentCountryCode}${inviteForm.agentPhoneNumber.trim()}`,
        subscriptionPlanId,
        trialDays: Number.parseInt(inviteForm.trialDays, 10) || 0,
        discountPercent: Number.parseFloat(inviteForm.discountPercent) || 0,
        whiteLabelLogoUrl: planIncludesWhiteLabel && inviteForm.enableWhiteLabel ? inviteForm.whiteLabelLogoUrl || undefined : null,
        primaryBrandColor: planIncludesWhiteLabel && inviteForm.enableWhiteLabel ? inviteForm.primaryBrandColor || undefined : null,
        secondaryBrandColor: planIncludesWhiteLabel && inviteForm.enableWhiteLabel ? inviteForm.secondaryBrandColor || undefined : null,
        brandFont: planIncludesWhiteLabel && inviteForm.enableWhiteLabel ? inviteForm.brandFont || undefined : null,
      });
      setShowSuccessModal(true);
      await loadCompanies();
    } catch (e) {
      setCompanyErr(e?.response?.data?.message || 'Could not create company.');
    } finally {
      setCompanySaving(false);
    }
  };

  const submitEditCompany = async () => {
    if (!selectedCompany?.companyId) {
      setCompanyErr('No company selected for editing.');
      return;
    }
    const subscriptionPlanId = Number.parseInt(inviteForm.subscriptionPlanId, 10);
    const nextErrors = {};
    if (!inviteForm.companyName.trim()) nextErrors.companyName = 'Company name is required.';
    if (!inviteForm.companyBusinessEmail.trim()) nextErrors.companyBusinessEmail = 'Business email is required.';
    if (!inviteForm.agentEmail.trim()) nextErrors.agentEmail = 'Personal email is required.';
    if (!inviteForm.agentFirstName.trim()) nextErrors.agentFirstName = 'Agent first name is required.';
    if (!inviteForm.agentLastName.trim()) nextErrors.agentLastName = 'Agent last name is required.';
    if (!inviteForm.agentPhoneNumber.trim()) nextErrors.agentPhone = 'Phone number is required.';
    if (Number.isNaN(subscriptionPlanId) || subscriptionPlanId <= 0) nextErrors.subscriptionPlanId = 'Subscription plan is required.';
    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      setCompanyErr('Please fix the highlighted fields.');
      return;
    }
    setFormErrors({});

    setCompanySaving(true);
    setCompanyErr('');
    try {
      await updateCompany(selectedCompany.companyId, {
        companyName: inviteForm.companyName.trim(),
        businessEmail: inviteForm.companyBusinessEmail.trim(),
        agentEmail: inviteForm.agentEmail.trim(),
        agentFirstName: inviteForm.agentFirstName.trim(),
        agentLastName: inviteForm.agentLastName.trim(),
        agentPhone: `${inviteForm.agentCountryCode}${inviteForm.agentPhoneNumber.trim()}`,
        subscriptionPlanId,
        trialDays: Number.parseInt(inviteForm.trialDays, 10) || 0,
        discountPercent: Number.parseFloat(inviteForm.discountPercent) || 0,
        whiteLabelLogoUrl: planIncludesWhiteLabel && inviteForm.enableWhiteLabel ? inviteForm.whiteLabelLogoUrl || null : null,
        primaryBrandColor: planIncludesWhiteLabel && inviteForm.enableWhiteLabel ? inviteForm.primaryBrandColor || null : null,
        secondaryBrandColor: planIncludesWhiteLabel && inviteForm.enableWhiteLabel ? inviteForm.secondaryBrandColor || null : null,
        brandFont: planIncludesWhiteLabel && inviteForm.enableWhiteLabel ? inviteForm.brandFont || null : null,
      });
      setViewMode('list');
      await loadCompanies();
    } catch (e) {
      setCompanyErr(e?.response?.data?.message || 'Could not update company.');
    } finally {
      setCompanySaving(false);
    }
  };

  const tabs = [
    { id: 'all', label: 'All Companies', path: '/companies/all' },
    { id: 'active', label: 'Active Companies', path: '/companies/active' },
    { id: 'pending', label: 'Pending Invites', path: '/companies/pending' },
    { id: 'subscriptions', label: 'Subscriptions', path: '/companies/subscriptions' }
  ];

  const handleViewDetails = async (companyOrId) => {
    const id = typeof companyOrId === 'object' ? companyOrId.companyId || companyOrId.id : companyOrId;
    setActionMenu(null);
    setCompanyErr('');
    try {
      const { data } = await api.get(`/companies/${id}`);
      const c = data?.company;
      setSelectedCompany({
        id: c.id,
        companyId: c.id,
        companyName: c.name,
        businessEmail: c.businessEmail || '',
        agentName: formatAgentListName(c.agent),
        agentEmail: c.agent?.email || '',
        plan: c.subscriptionPlan?.name || '—',
        subscriptionPlanId: c.subscriptionPlan?.id || null,
        billing: c.subscriptionPlan?.billingCycle === 'yearly' ? 'Yearly' : 'Monthly',
        price: `$${Number(c.subscriptionPlan?.priceMonthly || 0).toFixed(0)}`,
        start: fmtDate(c.createdAt),
        renewal: fmtDate(computeRenewalDate(c)),
        cycle: c.subscriptionPlan?.billingCycle === 'yearly' ? 'Yearly' : 'Monthly',
        status: c.subscriptionStatus || 'active',
        discountPercent: Number(c.discountPercent || 0),
        createdAt: c.createdAt,
        agentPhone: c.agent?.phone || '',
      });
    } catch (e) {
      setCompanyErr(e?.response?.data?.message || 'Failed to load company details.');
      return;
    }
    setViewMode('details');
  };

  const openUpdateSubscription = (companyId) => {
    const row = subscriptionRows.find((r) => r.id === companyId);
    if (!row) return;
    setActionMenu(null);
    const plan = subscriptionPlans.find((p) => p.name === row.plan);
    setUpdateSubscriptionForm({
      companyId,
      subscriptionPlanId: plan?.id ? String(plan.id) : '',
      trialDays: '0',
      discountPercent: row.discountPercent ? String(row.discountPercent) : '0',
    });
    setViewMode('updateSubscription');
  };

  const submitUpdateSubscription = async () => {
    if (!updateSubscriptionForm.companyId) return;
    const planId = Number.parseInt(updateSubscriptionForm.subscriptionPlanId, 10);
    if (Number.isNaN(planId) || planId <= 0) {
      setCompanyErr('Please select a subscription plan.');
      return;
    }
    setActionBusyId(updateSubscriptionForm.companyId);
    setCompanyErr('');
    try {
      await updateCompany(updateSubscriptionForm.companyId, {
        subscriptionPlanId: planId,
        subscriptionStatus: 'active',
        trialDays: Number.parseInt(updateSubscriptionForm.trialDays, 10) || 0,
        discountPercent: Number.parseFloat(updateSubscriptionForm.discountPercent) || 0,
      });
      setViewMode('details');
      await handleViewDetails(updateSubscriptionForm.companyId);
    } catch (e) {
      setCompanyErr(e?.response?.data?.message || 'Failed to update subscription.');
    } finally {
      setActionBusyId(null);
    }
  };

  // --- Add / Edit Form View ---
  if (viewMode === 'add' || viewMode === 'edit') {
    const isAdd = viewMode === 'add';

    return (
      <div className="flex flex-col bg-[#f4f5f7] pb-12">

        {/* Top bar */}
        <div className="flex items-center justify-between py-6 px-1">
          <button
            onClick={() => setViewMode('list')}
            className="flex items-center gap-2 text-[13px] font-bold text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <div className="hidden sm:flex items-center gap-2 text-[12px] font-bold text-gray-400">
            <span className={isAdd ? 'text-gray-900' : ''}>New Company</span>
          </div>
        </div>

        {/* Page heading */}
        <div className="mb-6 px-1">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8bed21] to-[#5AD43D] shadow-md shadow-green-200">
              <Plus className="w-5 h-5 text-[#1a1a1a]" strokeWidth={3} />
            </div>
            <h1 className="text-[26px] font-display font-[900] text-gray-900 tracking-tight leading-none">
              {isAdd ? 'Add new company' : 'Edit Company'}
            </h1>
          </div>
          <p className="text-[13px] font-medium text-gray-500 ml-[52px]">Fill in the details below to {isAdd ? 'onboard a new company' : 'update the company'}.</p>
        </div>

        {companyErr && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700 flex items-center gap-2">
            <CircleX className="w-4 h-4 shrink-0" /> {companyErr}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4">

          {/* Left column — form sections */}
          <div className="space-y-4">

            {/* 1. Company Details */}
            <SectionCard number="1" title="Company Details" subtitle="Basic information about the company." icon={<Landmark className="w-6 h-6" />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="Company name *" error={formErrors.companyName}>
                  <input
                    type="text"
                    value={inviteForm.companyName}
                    onChange={(e) => { setInviteForm((f) => ({ ...f, companyName: e.target.value })); if (formErrors.companyName) setFormErrors((p) => ({ ...p, companyName: '' })); }}
                    placeholder="e.g. Acme Corp"
                    className={inputCls(formErrors.companyName)}
                  />
                </InputField>
                <InputField label="Business email *" error={formErrors.companyBusinessEmail}>
                  <input
                    type="email"
                    value={inviteForm.companyBusinessEmail}
                    onChange={(e) => { setInviteForm((f) => ({ ...f, companyBusinessEmail: e.target.value })); if (formErrors.companyBusinessEmail) setFormErrors((p) => ({ ...p, companyBusinessEmail: '' })); }}
                    placeholder="company@business.com"
                    className={inputCls(formErrors.companyBusinessEmail)}
                  />
                </InputField>
              </div>
            </SectionCard>

            {/* 2. Agent Info */}
            <SectionCard number="2" title="Agent Information" subtitle="The person who will manage this company." icon={<User className="w-6 h-6" />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="First name *" error={formErrors.agentFirstName}>
                  <input
                    type="text"
                    value={inviteForm.agentFirstName}
                    onChange={(e) => { setInviteForm((f) => ({ ...f, agentFirstName: e.target.value })); if (formErrors.agentFirstName) setFormErrors((p) => ({ ...p, agentFirstName: '' })); }}
                    placeholder="First name"
                    className={inputCls(formErrors.agentFirstName)}
                  />
                </InputField>
                <InputField label="Last name *" error={formErrors.agentLastName}>
                  <input
                    type="text"
                    value={inviteForm.agentLastName}
                    onChange={(e) => { setInviteForm((f) => ({ ...f, agentLastName: e.target.value })); if (formErrors.agentLastName) setFormErrors((p) => ({ ...p, agentLastName: '' })); }}
                    placeholder="Last name"
                    className={inputCls(formErrors.agentLastName)}
                  />
                </InputField>
              </div>
              <InputField label="Agent email *" hint="Used to sign in to the dashboard." error={formErrors.agentEmail}>
                <input
                  type="email"
                  value={inviteForm.agentEmail}
                  onChange={(e) => { setInviteForm((f) => ({ ...f, agentEmail: e.target.value })); if (formErrors.agentEmail) setFormErrors((p) => ({ ...p, agentEmail: '' })); }}
                  placeholder="agent@gmail.com"
                  className={inputCls(formErrors.agentEmail)}
                />
              </InputField>
              <InputField label="Phone number *" error={formErrors.agentPhone}>
                <div className="flex gap-2">
                  <div className="relative w-28 shrink-0">
                    <select
                      value={inviteForm.agentCountryCode}
                      onChange={(e) => setInviteForm((f) => ({ ...f, agentCountryCode: e.target.value }))}
                      className="w-full appearance-none bg-white border border-gray-200 py-2.5 pl-2 pr-6 rounded-xl text-[12px] font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#7ae230] cursor-pointer"
                      size={1}
                    >
                      {COUNTRY_CODE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={inviteForm.agentPhoneNumber}
                    onChange={(e) => { setInviteForm((f) => ({ ...f, agentPhoneNumber: e.target.value.replace(/\D/g, '') })); if (formErrors.agentPhone) setFormErrors((p) => ({ ...p, agentPhone: '' })); }}
                    placeholder="Phone number"
                    className={`flex-1 min-w-0 ${inputCls(formErrors.agentPhone)}`}
                  />
                </div>
              </InputField>

              {/* Password info pill */}
              <div className="flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
                <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-blue-400 flex items-center justify-center text-white text-[9px] font-black">i</div>
                <p className="text-[12px] font-medium text-blue-700 leading-relaxed">
                  A temporary password is auto-generated and sent to the agent's email. They can change it after first login.
                </p>
              </div>
            </SectionCard>

            {/* 3. Subscription Plan */}
            <SectionCard number="3" title="Subscription Plan" subtitle="Choose the plan and billing configuration." icon={<CreditCard className="w-6 h-6" />}>
              <InputField label="Subscription plan *" error={formErrors.subscriptionPlanId}>
                <div className="relative">
                  <select
                    value={inviteForm.subscriptionPlanId}
                    onChange={(e) => { setInviteForm((f) => ({ ...f, subscriptionPlanId: e.target.value })); if (formErrors.subscriptionPlanId) setFormErrors((p) => ({ ...p, subscriptionPlanId: '' })); }}
                    className={`appearance-none pr-10 ${inputCls(formErrors.subscriptionPlanId)}`}
                  >
                    <option value="">Select a plan</option>
                    {subscriptionPlans.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — ${Number(p.priceMonthly || 0).toFixed(0)}/{p.billingCycle}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
              </InputField>
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Trial period (days)">
                  <input
                    type="number" min="0"
                    value={inviteForm.trialDays}
                    onChange={(e) => setInviteForm((f) => ({ ...f, trialDays: e.target.value }))}
                    className={inputCls(false)}
                  />
                </InputField>
                <InputField label="Discount (%)">
                  <input
                    type="number" min="0" max="100"
                    value={inviteForm.discountPercent}
                    onChange={(e) => setInviteForm((f) => ({ ...f, discountPercent: e.target.value }))}
                    className={inputCls(false)}
                  />
                </InputField>
              </div>
            </SectionCard>

            {/* 4. White Label */}
            <SectionCard number="4" title="White-Label Branding" subtitle="Custom branding for this company's dashboard." icon={<PencilLine className="w-6 h-6" />}>
              {!planIncludesWhiteLabel ? (
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <Ban className="w-4 h-4 text-gray-400 shrink-0" />
                  <p className="text-[12px] font-semibold text-gray-500">White-label is not included in the selected plan. Default branding will be used.</p>
                </div>
              ) : (
                <>
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div
                      onClick={() => setInviteForm((f) => ({ ...f, enableWhiteLabel: !f.enableWhiteLabel }))}
                      className={`relative h-6 w-11 rounded-full transition-colors ${inviteForm.enableWhiteLabel ? 'bg-[#8bed21]' : 'bg-gray-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${inviteForm.enableWhiteLabel ? 'translate-x-5' : ''}`} />
                    </div>
                    <span className="text-[13px] font-bold text-gray-700">Enable white-label for this company</span>
                  </label>

                  {inviteForm.enableWhiteLabel && (
                    <div className="space-y-4 pt-2">
                      <div>
                        <label className="block text-[13px] font-bold text-gray-700 mb-2">Upload Logo</label>
                        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 py-8 flex flex-col items-center justify-center hover:bg-gray-100/60 transition-colors"
                        >
                          {inviteForm.whiteLabelLogoUrl ? (
                            <img src={inviteForm.whiteLabelLogoUrl} alt="Logo" className="mb-2 h-12 w-12 rounded-lg object-cover" />
                          ) : (
                            <Upload className="w-5 h-5 text-gray-500 mb-2" />
                          )}
                          <span className="text-[13px] font-bold text-gray-700">{uploadingLogo ? 'Uploading…' : 'Upload logo'}</span>
                          <span className="text-[11px] text-gray-400 mt-0.5">{inviteForm.whiteLabelLogoUrl ? '✓ Logo uploaded' : 'PNG or JPG'}</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[13px] font-bold text-gray-700 mb-2">Primary Color</label>
                          <div className="flex items-center gap-2">
                            <input type="color" value={inviteForm.primaryBrandColor} onChange={(e) => setInviteForm((f) => ({ ...f, primaryBrandColor: e.target.value }))} className="h-9 w-12 rounded-lg border border-gray-200 bg-transparent cursor-pointer" />
                            <span className="text-[12px] font-mono text-gray-500">{inviteForm.primaryBrandColor}</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[13px] font-bold text-gray-700 mb-2">Secondary Color</label>
                          <div className="flex items-center gap-2">
                            <input type="color" value={inviteForm.secondaryBrandColor} onChange={(e) => setInviteForm((f) => ({ ...f, secondaryBrandColor: e.target.value }))} className="h-9 w-12 rounded-lg border border-gray-200 bg-transparent cursor-pointer" />
                            <span className="text-[12px] font-mono text-gray-500">{inviteForm.secondaryBrandColor}</span>
                          </div>
                        </div>
                      </div>
                      <InputField label="Font">
                        <div className="relative">
                          <select value={inviteForm.brandFont} onChange={(e) => setInviteForm((f) => ({ ...f, brandFont: e.target.value }))} className={`appearance-none pr-10 ${inputCls(false)}`}>
                            <option value="Inter">Inter</option>
                            <option value="Poppins">Poppins</option>
                            <option value="Montserrat">Montserrat</option>
                            <option value="Roboto">Roboto</option>
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        </div>
                      </InputField>
                    </div>
                  )}
                </>
              )}
            </SectionCard>
          </div>

          {/* Right column — sticky summary + submit */}
          <div className="xl:sticky xl:top-4 h-fit space-y-4">

            {/* Summary card */}
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                <h3 className="text-[13px] font-black text-gray-900">Summary</h3>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Company</span>
                  <span className="text-[13px] font-bold text-gray-900 text-right max-w-[160px] truncate">{inviteForm.companyName || '—'}</span>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Agent</span>
                  <span className="text-[13px] font-bold text-gray-900 text-right">
                    {[inviteForm.agentFirstName, inviteForm.agentLastName].filter(Boolean).join(' ') || '—'}
                  </span>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Email</span>
                  <span className="text-[12px] font-bold text-gray-700 text-right max-w-[160px] truncate">{inviteForm.agentEmail || '—'}</span>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Plan</span>
                  <span className="text-[13px] font-bold text-gray-900">
                    {subscriptionPlans.find((p) => String(p.id) === String(inviteForm.subscriptionPlanId))?.name || '—'}
                  </span>
                </div>
                {Number(inviteForm.trialDays) > 0 && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Trial</span>
                    <span className="text-[13px] font-bold text-green-600">{inviteForm.trialDays} days</span>
                  </div>
                )}
                {Number(inviteForm.discountPercent) > 0 && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Discount</span>
                    <span className="text-[13px] font-bold text-orange-500">{inviteForm.discountPercent}%</span>
                  </div>
                )}
              </div>
            </div>

            {/* Submit */}
            <button
              type="button"
              disabled={companySaving}
              onClick={() => isAdd ? submitInviteCompany() : submitEditCompany()}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#8bed21] to-[#5AD43D] text-[#1a1a1a] text-[14px] font-black shadow-md shadow-green-200 hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {companySaving ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  {isAdd ? 'Sending invite…' : 'Updating…'}
                </>
              ) : (
                isAdd ? '✉ Save & Send Invite' : 'Update Company'
              )}
            </button>

            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="w-full py-3 rounded-2xl border border-gray-200 bg-white text-[13px] font-bold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Success Modal */}
        {showSuccessModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[999] flex items-center justify-center animate-in fade-in duration-200"
            onClick={(e) => { if (e.target === e.currentTarget) { setShowSuccessModal(false); setViewMode('list'); setInviteForm(createEmptyInviteForm()); setFormErrors({}); } }}
          >
            <div className="bg-white rounded-[28px] shadow-2xl p-10 max-w-sm w-full text-center animate-in zoom-in-95 duration-300 mx-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-[#8bed21] to-[#5AD43D] mx-auto flex items-center justify-center mb-6 shadow-lg shadow-green-200">
                <Check className="w-8 h-8 text-black" strokeWidth={3} />
              </div>
              <h2 className="text-xl font-display font-[900] mb-2 tracking-tight text-gray-900">Agent added successfully!</h2>
              <p className="text-[13px] font-medium text-gray-500 mb-8 px-4 leading-relaxed">
                The new agent has been onboarded. Login credentials have been sent to their email.
              </p>
              <button
                type="button"
                onClick={() => { setShowSuccessModal(false); setViewMode('list'); setInviteForm(createEmptyInviteForm()); setFormErrors({}); }}
                className="w-full py-3.5 bg-[#1a1a1a] text-white rounded-xl text-[14px] font-bold hover:bg-black transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (viewMode === 'updateSubscription') {
    return (
      <div className="flex flex-col h-full bg-[#f4f5f7] px-6 lg:px-10 overflow-y-auto pb-10">
        <div className="py-8">
          <button onClick={() => setViewMode('details')} className="flex items-center gap-2 text-[13px] font-bold text-gray-500 hover:text-gray-900 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
        </div>

        <div className="w-full rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h1 className="text-2xl font-display font-[900] text-gray-900 mb-1 tracking-tight">Update Subscription</h1>
          <p className="text-[13px] font-semibold text-gray-500 mb-8">Include all the necessary details.</p>

          <div className="flex flex-col lg:flex-row gap-8 lg:gap-20 p-1">
            <div className="w-64 shrink-0">
              <h2 className="text-[28px] font-bold text-gray-900 mb-1">Subscription Plan</h2>
              <p className="text-[13px] font-medium text-gray-500">Choose the plan agent bought.</p>
            </div>
            <div className="flex-1 max-w-md space-y-3">
              <div>
                <label className="block text-[13px] font-bold text-gray-700 mb-2">Subscription Plan</label>
                <div className="relative">
                  <select
                    value={updateSubscriptionForm.subscriptionPlanId}
                    onChange={(e) => setUpdateSubscriptionForm((f) => ({ ...f, subscriptionPlanId: e.target.value }))}
                    className="w-full appearance-none bg-[#f8f9fb] border border-gray-200 py-3 px-4 rounded-xl text-[14px] font-semibold text-gray-900 focus:ring-2 focus:ring-[#7ae230]"
                  >
                    <option value="">Select Plan</option>
                    {subscriptionPlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-bold text-gray-700 mb-2">Trial Period</label>
                <div className="relative">
                  <select
                    value={updateSubscriptionForm.trialDays}
                    onChange={(e) => setUpdateSubscriptionForm((f) => ({ ...f, trialDays: e.target.value }))}
                    className="w-full appearance-none bg-[#f8f9fb] border border-gray-200 py-3 px-4 rounded-xl text-[14px] font-semibold text-gray-900 focus:ring-2 focus:ring-[#7ae230]"
                  >
                    <option value="0">Select</option>
                    <option value="7">7 days</option>
                    <option value="14">14 days</option>
                    <option value="30">30 days</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-bold text-gray-700 mb-2">Discount Code</label>
                <input
                  type="text"
                  value={updateSubscriptionForm.discountPercent}
                  onChange={(e) => setUpdateSubscriptionForm((f) => ({ ...f, discountPercent: e.target.value }))}
                  placeholder="Enter discount code"
                  className="w-full bg-[#f8f9fb] border border-gray-200 py-3 px-4 rounded-xl text-[14px] font-semibold text-gray-900 focus:ring-2 focus:ring-[#7ae230]"
                />
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              type="button"
              disabled={actionBusyId === updateSubscriptionForm.companyId}
              onClick={submitUpdateSubscription}
              className="w-full max-w-md px-4 py-3.5 rounded-xl bg-black text-[14px] font-bold text-white hover:bg-gray-900 disabled:opacity-60"
            >
              Update Plan
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Details View ---
  if (viewMode === 'details') {
    return (
      <div className="flex flex-col h-full bg-[#f4f5f7] px-6 lg:px-10 py-10">
        <CompanyDetailsView
          company={selectedCompany}
          onBack={() => setViewMode('list')}
          actionBusy={actionBusyId === selectedCompany?.companyId}
          onToggleSubscription={() =>
            updateCompany(selectedCompany.companyId, {
              subscriptionStatus:
                String(selectedCompany?.status || '').toLowerCase() === 'paused' ? 'active' : 'paused',
            })
          }
          onUpgradeSubscription={() => openUpdateSubscription(selectedCompany.companyId)}
        />
      </div>
    );
  }

  // --- List View Mode ---
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-[#f4f5f7] px-4 sm:px-6 lg:px-10">
      {/* Page Header */}
      <div className="shrink-0 pt-5 pb-5 sm:pt-6 lg:pt-10 lg:pb-8">
        <h1 className="text-[24px] leading-tight sm:text-[28px] lg:text-[32px] font-display font-[900] text-[#1a1a1a] tracking-tight">
          Company Management
        </h1>
        {companyErr && currentTab === 'all' && (
          <p className="mt-3 text-sm font-semibold text-red-600">{companyErr}</p>
        )}
      </div>

      {/* Shared Nav/Actions Header */}
      <div className="mb-6 flex shrink-0 flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        
        {/* Tabs */}
        <div className="grid w-full grid-cols-2 gap-2 border-b border-gray-200 pb-3 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:border-b-0 sm:pb-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() =>
                navigate({
                  pathname: tab.path,
                  search: searchParams.toString() ? `?${searchParams.toString()}` : '',
                })
              }
              className={`min-h-[42px] rounded-xl px-3 py-2 text-center text-[12px] font-bold leading-snug transition-all sm:min-h-0 sm:px-4 sm:text-[13px] ${
                currentTab === tab.id 
                ? 'bg-[#8bed21] text-gray-900 shadow-sm' 
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right Actions */}
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-[minmax(220px,1fr)_auto_auto] sm:items-center xl:w-auto">
          <div className="relative min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              value={qRaw}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder={currentTab === 'active' ? "Search agent by name" : "Search company by name"} 
              className="w-full sm:w-[240px] bg-white lg:bg-[#f8f9fb] border border-gray-200 py-2.5 pl-10 pr-4 rounded-xl text-[13px] font-semibold text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-[#7ae230] transition-shadow shadow-sm lg:shadow-none" 
            />
          </div>
          
          {currentTab === 'all' && (
            <button
              type="button"
              onClick={() => {
                setInviteForm(createEmptyInviteForm());
                setFormErrors({});
                setCompanyErr('');
                setViewMode('add');
              }}
              className="flex w-full items-center justify-center gap-2 px-5 py-2.5 bg-black text-white shadow-sm rounded-xl text-[13px] font-bold hover:bg-gray-900 transition-all active:scale-[0.98] whitespace-nowrap sm:w-auto"
            >
              <Plus className="w-4 h-4" strokeWidth={3} /> Add New Company
            </button>
          )}

          <button
            type="button"
            onClick={handleExportPdf}
            className="flex w-full items-center justify-center gap-2 px-5 py-2.5 bg-black text-white shadow-sm rounded-xl text-[13px] font-bold hover:bg-gray-900 transition-colors whitespace-nowrap sm:w-auto">
            Export <ArrowUpRight className="w-4 h-4 ml-1 opacity-60" strokeWidth={3} />
          </button>
        </div>
      </div>

      {currentTab === 'all' && selectedCompanyIds.length > 0 && (
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-2.5 shadow-sm ring-1 ring-gray-100">
          <span className="text-[13px] font-bold text-gray-700">{selectedCompanyIds.length} selected</span>
          <button
            type="button"
            disabled={companySaving}
            onClick={handleBulkDeleteCompanies}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[13px] font-bold text-[#dc2626] hover:bg-red-100 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            Delete selected
          </button>
        </div>
      )}

      <div className="mb-6 flex w-full min-w-0 flex-col">
        <div className="min-w-0 overflow-hidden rounded-[20px] bg-white shadow-sm ring-1 ring-gray-100 sm:rounded-[24px]">
          {/* Horizontal scroll only (wide columns). Rows use pagination — no inner vertical scroll. */}
          <div className="company-table-scroll w-full max-w-full overflow-x-auto overscroll-x-contain pb-2 [-webkit-overflow-scrolling:touch]">
            {currentTab === 'all' && (
              <AllCompaniesTable
                data={allTableData}
                actionMenuOpenId={actionMenu?.variant === 'admin' ? actionMenu.id : null}
                onOpenActionMenu={(id, rect) =>
                  setActionMenu((prev) =>
                    prev?.id === id && prev?.variant === 'admin' ? null : { id, rect, variant: 'admin' }
                  )
                }
                onViewDetails={handleViewDetails}
                onEditCompany={handleEditCompany}
                onDeactivateCompany={handleDeactivateCompany}
                onResendPassword={handleResendPassword}
                onDeleteCompany={handleDeleteCompany}
                actionBusyId={actionBusyId}
                selectedIds={selectedCompanyIds}
                onToggleRow={toggleCompanyRowSelect}
                onToggleSelectAllPage={toggleSelectAllCompaniesOnPage}
                allPageSelected={allPageSelected}
                somePageSelected={somePageSelected}
              />
            )}
            {currentTab === 'active' && <ActiveCompaniesTable data={activeCompanies} />}
            {currentTab === 'pending' && (
              <PendingTable
                data={pendingCompanies}
                onResendInvite={handleResendInvite}
                onCancelInvite={handleCancelInvite}
                actionBusyId={actionBusyId}
              />
            )}
            {currentTab === 'subscriptions' && (
              <SubscriptionsTable
                data={subscriptionRows}
                onViewDetails={handleViewDetails}
                onOpenActionsMenu={(id, rect) =>
                  setActionMenu((prev) =>
                    prev?.id === id && prev?.variant === 'subscription' ? null : { id, rect, variant: 'subscription' }
                  )
                }
                actionMenuOpenId={actionMenu?.variant === 'subscription' ? actionMenu.id : null}
                onMarkPaid={(id) => updateCompany(id, { subscriptionStatus: 'active' })}
                onCancelSubscription={(id) => updateCompany(id, { subscriptionStatus: 'cancelled' })}
                onUpdateSubscription={(id) => openUpdateSubscription(id)}
                actionBusyId={actionBusyId}
              />
            )}
          </div>
        </div>

        <div className="pb-10">
          <PaginationFooter
            page={pagination.page}
            pageSize={pagination.pageSize || 10}
            totalItems={pagination.totalItems || 0}
            totalPages={pagination.totalPages || 1}
            itemLabel={currentTab === 'subscriptions' ? 'subscriptions' : 'companies'}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      </div>

      {actionMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-company-floating-menu="true"
            className="fixed z-[200] w-56 rounded-2xl border border-gray-100 bg-white p-2 shadow-xl"
            style={floatingMenuStyle(actionMenu.rect)}
          >
            {actionMenu.variant === 'admin' ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const id = actionMenu.id;
                    setActionMenu(null);
                    void handleViewDetails(id);
                  }}
                  className="mb-1.5 flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-2.5 text-left text-[13px] font-bold text-gray-800 hover:bg-gray-50"
                >
                  <Eye className="h-4 w-4" />
                  View detail
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === actionMenu.id}
                  onClick={() => {
                    const id = actionMenu.id;
                    setActionMenu(null);
                    void handleEditCompany(id);
                  }}
                  className="mb-1.5 flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-2.5 text-left text-[13px] font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                >
                  <PencilLine className="h-4 w-4" />
                  Edit
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === actionMenu.id}
                  onClick={() => {
                    const id = actionMenu.id;
                    setActionMenu(null);
                    void handleDeactivateCompany(id);
                  }}
                  className="mb-1.5 flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-2.5 text-left text-[13px] font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                >
                  <Ban className="h-4 w-4" />
                  {(() => {
                    const company = allTableData.find((c) => c.id === actionMenu.id);
                    const status = String(company?.status || '').toLowerCase();
                    const isActive = status === 'active' || status === 'trial';
                    return isActive ? 'Deactivate Company' : 'Activate Company';
                  })()}
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === actionMenu.id}
                  onClick={() => {
                    const id = actionMenu.id;
                    setActionMenu(null);
                    void handleResendPassword(id);
                  }}
                  className="mb-1.5 flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-2.5 text-left text-[13px] font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                >
                  <KeyRound className="h-4 w-4" />
                  Resend Password
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === actionMenu.id}
                  onClick={() => {
                    const id = actionMenu.id;
                    setActionMenu(null);
                    void handleDeleteCompany(id);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-red-100 bg-white px-4 py-2.5 text-left text-[13px] font-bold text-[#ff3048] hover:bg-red-50 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const id = actionMenu.id;
                    setActionMenu(null);
                    void handleViewDetails(id);
                  }}
                  className="mb-1.5 flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-2.5 text-left text-[13px] font-bold text-gray-800 hover:bg-gray-50"
                >
                  <Eye className="h-4 w-4" />
                  View detail
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === actionMenu.id}
                  onClick={() => {
                    const id = actionMenu.id;
                    setActionMenu(null);
                    void updateCompany(id, { subscriptionStatus: 'active' });
                  }}
                  className="mb-1.5 flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-2.5 text-left text-[13px] font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                >
                  Subscription Paid
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === actionMenu.id}
                  onClick={() => {
                    const id = actionMenu.id;
                    setActionMenu(null);
                    const sub = subscriptionRows.find((r) => r.id === id);
                    const isCurrentlyActive = ['active', 'trial'].includes(String(sub?.status || '').toLowerCase());
                    void updateCompany(id, { subscriptionStatus: isCurrentlyActive ? 'paused' : 'active' });
                  }}
                  className="mb-1.5 flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-2.5 text-left text-[13px] font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                >
                  {(() => {
                    const sub = subscriptionRows.find((r) => r.id === actionMenu.id);
                    const status = String(sub?.status || '').toLowerCase();
                    const isActive = status === 'active' || status === 'trial';
                    return isActive ? '⏸ Deactivate Subscription' : '▶ Activate Subscription';
                  })()}
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === actionMenu.id}
                  onClick={() => {
                    const id = actionMenu.id;
                    setActionMenu(null);
                    void openUpdateSubscription(id);
                  }}
                  className="mb-1.5 flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-2.5 text-left text-[13px] font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                >
                  Update Subscription
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === actionMenu.id}
                  onClick={() => {
                    const id = actionMenu.id;
                    setActionMenu(null);
                    void updateCompany(id, { subscriptionStatus: 'cancelled' });
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-red-100 bg-white px-4 py-2.5 text-left text-[13px] font-bold text-[#ff3048] hover:bg-red-50 disabled:opacity-60"
                >
                  <CircleX className="h-4 w-4" />
                  Cancel Subscription
                </button>
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
