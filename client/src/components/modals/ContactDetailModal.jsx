import React from 'react';
import { FileText, PhoneCall, X } from 'lucide-react';

export default function ContactDetailModal({
  contact,
  onClose,
  onCall,
  onEditNote,
  formatDate,
  renderStatus,
}) {
  if (!contact) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[24px] shadow-2xl max-w-2xl w-full p-6 relative animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-gray-400 hover:text-gray-900"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 pr-8">
          <img
            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(contact.fullName || 'Contact')}&background=eaffd6&color=111827&size=96`}
            alt=""
            className="w-16 h-16 rounded-2xl shrink-0"
          />
          <div className="min-w-0">
            <h2 className="text-[22px] font-[900] text-gray-900 truncate">{contact.fullName || 'Unnamed Contact'}</h2>
            <p className="text-[13px] font-semibold text-gray-500 truncate">{contact.companyName || 'No company added'}</p>
            {renderStatus && <div className="mt-2">{renderStatus(contact.status)}</div>}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Phone Number</p>
            <p className="mt-1 text-[14px] font-bold text-gray-900 break-words">{contact.phone || '-'}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Assigned Date</p>
            <p className="mt-1 text-[14px] font-bold text-gray-900">{formatDate ? formatDate(contact.createdAt) : '-'}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Company</p>
            <p className="mt-1 text-[14px] font-bold text-gray-900 break-words">{contact.companyName || '-'}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Attempts</p>
            <p className="mt-1 text-[14px] font-bold text-gray-900">{contact.attempts || 1}</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Notes</p>
          <p className="mt-2 min-h-[56px] whitespace-pre-wrap text-[14px] font-semibold leading-6 text-gray-700">
            {contact.notes || 'No notes added yet.'}
          </p>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:justify-end">
          <button
            type="button"
            onClick={() => onCall?.(contact)}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#1a1a1a] text-white text-[13px] font-bold hover:bg-black transition-colors"
          >
            <PhoneCall className="w-4 h-4" /> Call Now
          </button>
          <button
            type="button"
            onClick={() => onEditNote?.(contact)}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-[#8bed21] to-[#5AD43D] text-gray-900 text-[13px] font-bold hover:opacity-95 transition-opacity"
          >
            <FileText className="w-4 h-4" /> {contact.notes ? 'Edit Note' : 'Add Note'}
          </button>
        </div>
      </div>
    </div>
  );
}
