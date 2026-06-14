import React from 'react';

export default function PaginationFooter({
  page,
  pageSize,
  totalItems,
  totalPages,
  itemLabel,
  onPageChange,
  pageSizeOptions = [5, 10],
  onPageSizeChange,
}) {
  if (!totalItems) return null;

  const safeTotalPages = Math.max(1, totalPages || 1);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  // Use simple "Showing X of Y" when start === end, else "Showing X-Y of Z"
  const showingText =
    start === end
      ? `Showing ${start} of ${totalItems} ${itemLabel}`
      : `Showing ${start}–${end} of ${totalItems} ${itemLabel}`;

  return (
    <div className="mt-6 flex flex-col gap-3 border-t border-gray-100 pt-4 md:flex-row md:items-center md:justify-between">
      <p className="text-[13px] font-semibold text-gray-500 leading-5">
        {showingText}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <label className="inline-flex items-center gap-2 text-[13px] font-bold text-gray-700">
            Show
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-[38px] rounded-lg border border-gray-200 bg-white px-2 text-[13px] font-bold text-gray-800 outline-none hover:bg-gray-50 focus:ring-2 focus:ring-[#8bed21]/40"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="min-w-[86px] px-3.5 py-2 rounded-lg border border-gray-200 bg-white text-[13px] font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Previous
        </button>
        <span className="min-w-[84px] px-2 text-center text-[13px] font-bold text-gray-800 whitespace-nowrap">
          Page {page} of {safeTotalPages}
        </span>
        <button
          type="button"
          disabled={page >= safeTotalPages}
          onClick={() => onPageChange(Math.min(safeTotalPages, page + 1))}
          className="min-w-[70px] px-3.5 py-2 rounded-lg border border-gray-200 bg-white text-[13px] font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
