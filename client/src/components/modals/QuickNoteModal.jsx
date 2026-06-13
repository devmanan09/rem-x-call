import React from 'react';
import { X } from 'lucide-react';

export default function QuickNoteModal({
  open,
  noteText,
  saving,
  onChange,
  onClose,
  onSave,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="bg-white rounded-[24px] shadow-2xl max-w-md w-full p-6 relative animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-gray-400 hover:text-gray-900"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-[20px] font-bold text-gray-900 mb-1">Add Quick Note</h2>
        <p className="text-[13px] font-medium text-gray-500 mb-6">Add a note related to this contact.</p>
        <label className="block text-[13px] font-bold text-gray-900 mb-2">Note</label>
        <textarea
          value={noteText}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="Type your note.."
          rows={5}
          className="w-full bg-[#f8f9fb] border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#8bed21]/40 resize-none"
        />
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="mt-6 w-full py-3.5 rounded-xl bg-gradient-to-r from-[#8bed21] to-[#5AD43D] text-gray-900 text-[15px] font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Note'}
        </button>
      </div>
    </div>
  );
}
