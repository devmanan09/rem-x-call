import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, MoreVertical, X, UploadCloud, ChevronDown } from 'lucide-react';
import { api } from '../../lib/api';
import PaginationFooter from '../../components/PaginationFooter';

const PRODUCT_NAMES = ['All products', 'Premium Headset', 'Desk Lamp', 'Air Purifier', 'Fitness Band'];
const CATEGORIES = ['All categories', 'Cosmetics', 'Electronics', 'Kitchen Appliances', 'Fitness Tracker'];
const STATUSES = ['All status', 'Available', 'Out of stock'];

const INITIAL_PRODUCTS = [
  {
    id: 1,
    name: 'Premium Headset',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=80&h=80&fit=crop',
    category: 'Electronics',
    status: 'Available',
    created: '24 Jan, 2024',
    qty: 200,
    sold: 20,
    price: 76,
  },
  {
    id: 2,
    name: 'Organic Serum',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=80&h=80&fit=crop',
    category: 'Cosmetics',
    status: 'Out of stock',
    created: '12 Feb, 2024',
    qty: 0,
    sold: 200,
    price: 45,
  },
  {
    id: 3,
    name: 'Smart Kettle',
    image: 'https://images.unsplash.com/photo-1574269909862-fb04b231bfd7?w=80&h=80&fit=crop',
    category: 'Kitchen Appliances',
    status: 'Available',
    created: '03 Mar, 2024',
    qty: 35,
    sold: 35,
    price: 89,
  },
  {
    id: 4,
    name: 'Fitness Band',
    image: 'https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=80&h=80&fit=crop',
    category: 'Fitness Tracker',
    status: 'Available',
    created: '18 Apr, 2024',
    qty: 100,
    sold: 50,
    price: 76,
  },
];

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

function SelectFilter({ value, options, onChange, minW = 'sm:min-w-[150px]' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`relative w-full sm:w-auto ${minW}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between gap-2 w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-[13px] font-bold text-gray-800 shadow-sm hover:bg-gray-50"
      >
        <span className="truncate">{value}</span>
        <span className="text-gray-400">▾</span>
      </button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-full mt-1.5 w-full bg-white rounded-xl shadow-xl border border-gray-100 z-30 py-1 max-h-56 overflow-y-auto">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 text-[13px] font-semibold hover:bg-gray-50 ${
                  value === opt ? 'bg-gray-50 font-bold text-gray-900' : 'text-gray-700'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const emptyForm = () => ({
  name: '',
  image: '',
  category: CATEGORIES[1],
  status: 'Available',
  qty: '',
  sold: '',
  price: '',
});

export default function AgentProductManagement() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [productName, setProductName] = useState(PRODUCT_NAMES[0]);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [status, setStatus] = useState(STATUSES[0]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [menuRect, setMenuRect] = useState(null);
  const [deletingProduct, setDeletingProduct] = useState(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [toast, setToast] = useState(null); // { message: string, type: 'update' | 'delete', deletedProduct?: any }

  const showToast = (message, type, deletedProduct = null) => {
    setToast({ message, type, deletedProduct });
    setTimeout(() => {
      setToast((curr) => {
        if (curr && curr.message === message) return null;
        return curr;
      });
    }, 4500);
  };

  const handleUndoDelete = async (productData) => {
    if (!productData) return;
    try {
      await api.post('/products', {
        name: productData.name,
        image: productData.image,
        category: productData.category,
        qty: productData.qty,
        price: productData.price,
      });
      setToast(null);
      await loadProducts(currentPage, search, category, status, productName);
      showToast('Product added successfully', 'update');
    } catch (err) {
      console.error('Failed to undo product deletion:', err);
    }
  };

  const loadProducts = async (page = 1, searchVal = search, catVal = category, statVal = status, pNameVal = productName) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('pageSize', 5);
      if (searchVal.trim()) params.append('search', searchVal.trim());
      if (catVal && catVal !== 'All categories') params.append('category', catVal);
      if (statVal && statVal !== 'All status') params.append('status', statVal);
      if (pNameVal && pNameVal !== PRODUCT_NAMES[0]) params.append('name', pNameVal);

      const response = await api.get(`/products?${params.toString()}`);
      setProducts(response.data.products || []);
      setTotalPages(response.data.pagination?.totalPages || 1);
      setTotalItems(response.data.pagination?.totalItems || 0);
      setCurrentPage(page);
      setError(null);
    } catch (err) {
      console.error('Failed to load products:', err);
      setError('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts(1, search, category, status, productName);
  }, [search, category, status, productName]);

  const handlePageChange = (page) => {
    loadProducts(page, search, category, status, productName);
  };

  const openAdd = () => {
    setForm(emptyForm());
    setShowAdd(true);
  };

  const openEdit = (row) => {
    setForm({
      name: row.name,
      image: row.image || '',
      category: row.category,
      status: row.status,
      qty: String(row.qty),
      sold: String(row.sold),
      price: String(row.price),
    });
    setEditing(row);
    setMenuOpenId(null);
  };

  const saveProduct = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const image = form.image.trim() || 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=80&h=80&fit=crop';
    const qty = Number.parseInt(form.qty, 10);
    const sold = Number.isNaN(Number.parseInt(form.sold, 10)) ? 0 : Number.parseInt(form.sold, 10);
    const price = Number.parseFloat(form.price);
    if (!name || Number.isNaN(qty) || Number.isNaN(price)) return;

    try {
      if (editing) {
        await api.put(`/products/${editing.id}`, {
          name,
          image,
          category: form.category,
          status: form.status,
          qty,
          sold,
          price,
        });
        setEditing(null);
        showToast('Product updated successfully!', 'update');
      } else {
        await api.post('/products', {
          name,
          image,
          category: form.category,
          qty,
          price,
        });
        setShowAdd(false);
        showToast('Product added successfully', 'update');
      }
      setForm(emptyForm());
      await loadProducts(editing ? currentPage : 1, search, category, status, productName);
    } catch (err) {
      console.error('Failed to save product:', err);
      alert('Error saving product. Please try again.');
    }
  };

  const handleDelete = (id) => {
    const row = products.find((p) => p.id === id);
    if (row) {
      setDeletingProduct(row);
    }
  };

  const confirmDelete = async () => {
    if (!deletingProduct) return;
    const row = deletingProduct;
    try {
      setDeletingProduct(null);
      await api.delete(`/products/${row.id}`);
      setMenuOpenId(null);
      showToast('1 product deleted successfully.', 'delete', row);
      const isLastItemOnPage = products.length === 1 && currentPage > 1;
      await loadProducts(isLastItemOnPage ? currentPage - 1 : currentPage, search, category, status, productName);
    } catch (err) {
      console.error('Failed to delete product:', err);
      alert('Error deleting product');
    }
  };

  const filtered = products;
  const hasActiveFilters =
    Boolean(search.trim()) ||
    productName !== PRODUCT_NAMES[0] ||
    category !== CATEGORIES[0] ||
    status !== STATUSES[0];

  const clearFilters = () => {
    setProductName(PRODUCT_NAMES[0]);
    setCategory(CATEGORIES[0]);
    setStatus(STATUSES[0]);
    setSearch('');
    setCurrentPage(1);
  };

  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm((f) => ({ ...f, image: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm((f) => ({ ...f, image: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const formModal = (title, onClose) => {
    const isEdit = title.toLowerCase().includes('edit');

    return (
      <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <style>{`
          .no-scrollbar::-webkit-scrollbar {
            display: none !important;
          }
          .no-scrollbar {
            -ms-overflow-style: none !important;
            scrollbar-width: none !important;
          }
        `}</style>
        <div className="bg-white rounded-[28px] shadow-2xl max-w-[440px] w-full p-5 relative animate-in zoom-in-95 duration-200 select-none overflow-hidden no-scrollbar">
          {/* Close button */}
          <button 
            type="button" 
            onClick={onClose} 
            className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-all"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="mb-4">
            <h2 className="text-[20px] font-black text-gray-900 tracking-tight leading-none mb-1.5 font-display">
              {title}
            </h2>
            <p className="text-[12px] text-gray-400 font-semibold">
              Include all the product details.
            </p>
          </div>

          <form onSubmit={saveProduct} className="space-y-3.5">
            {/* Drag and Drop Image Dropzone */}
            <div 
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={triggerFileSelect}
              className="bg-[var(--Colors-Background,#F7F7F7)] border border-dashed border-gray-200/80 rounded-2xl h-22 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100/50 transition-all group relative overflow-hidden"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                className="hidden" 
              />
              {form.image ? (
                <>
                  <img 
                    src={form.image} 
                    alt="Product" 
                    className="w-full h-full object-cover rounded-2xl" 
                  />
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all text-white gap-1 rounded-2xl">
                    <UploadCloud className="w-4 h-4 animate-bounce" />
                    <span className="text-[11px] font-bold">Change product image</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-center px-4 py-1.5">
                  <div className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center text-gray-500 mb-1 group-hover:scale-105 transition-transform shadow-xs">
                    <UploadCloud className="w-4 h-4 text-gray-600" />
                  </div>
                  <span className="text-[12px] font-extrabold text-gray-800">
                    Upload or drag and drop product image
                  </span>
                  <span className="text-[10px] font-bold text-gray-400 mt-0.5">
                    Format should be PNG or JPG
                  </span>
                </div>
              )}
            </div>

            {/* Product Name */}
            <div>
              <label className="block text-[12px] font-bold text-gray-500 mb-1 ml-0.5">
                Product Name
              </label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="block w-full px-4 py-2.5 border border-transparent focus:border-[#7ae230] focus:ring-1 focus:ring-[#7ae230] rounded-2xl text-[13px] bg-[var(--Colors-Background,#F7F7F7)] transition-all font-semibold text-gray-800 placeholder:text-gray-400 placeholder:font-normal"
                placeholder="Enter Product Name"
              />
            </div>

            {/* Category selection dropdown */}
            <div>
              <label className="block text-[12px] font-bold text-gray-500 mb-1 ml-0.5">
                Category
              </label>
              <div className="relative">
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="block w-full px-4 pr-10 py-2.5 border border-transparent focus:border-[#7ae230] focus:ring-1 focus:ring-[#7ae230] rounded-2xl text-[13px] bg-[var(--Colors-Background,#F7F7F7)] transition-all font-semibold text-gray-800 appearance-none cursor-pointer"
                >
                  <option value="" disabled>Select category</option>
                  {CATEGORIES.filter((c) => c !== 'All categories').map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-600">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Status selection */}
            <div>
              <label className="block text-[12px] font-bold text-gray-500 mb-1 ml-0.5">
                Status
              </label>
              <div className="relative">
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="block w-full px-4 pr-10 py-2.5 border border-transparent focus:border-[#7ae230] focus:ring-1 focus:ring-[#7ae230] rounded-2xl text-[13px] bg-[var(--Colors-Background,#F7F7F7)] transition-all font-semibold text-gray-800 appearance-none cursor-pointer"
                >
                  <option value="Available">Available</option>
                  <option value="Out of stock">Out of stock</option>
                </select>
                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-600">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-[12px] font-bold text-gray-500 mb-1 ml-0.5">
                Quantity
              </label>
              <input
                required
                type="number"
                min="0"
                value={form.qty}
                onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                className="block w-full px-4 py-2.5 border border-transparent focus:border-[#7ae230] focus:ring-1 focus:ring-[#7ae230] rounded-2xl text-[13px] bg-[var(--Colors-Background,#F7F7F7)] transition-all font-semibold text-gray-800 tabular-nums placeholder:text-gray-400 placeholder:font-normal"
                placeholder="Enter quantity e.g 12"
              />
            </div>

            {/* Price */}
            <div>
              <label className="block text-[12px] font-bold text-gray-500 mb-1 ml-0.5">
                Price
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 font-bold text-[13px]">
                  +$
                </div>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  className="block w-full pl-9 pr-4 py-2.5 border border-transparent focus:border-[#7ae230] focus:ring-1 focus:ring-[#7ae230] rounded-2xl text-[13px] bg-[var(--Colors-Background,#F7F7F7)] transition-all font-semibold text-gray-800 tabular-nums placeholder:text-gray-400 placeholder:font-normal"
                  placeholder="Enter price"
                />
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              className="w-full mt-2 bg-gradient-to-r from-[#ADF808] to-[#5AD43D] hover:opacity-95 text-[#1c4714] font-bold text-[15px] py-3 px-4 rounded-2xl transition duration-200 ease-in-out shadow-sm flex items-center justify-center"
            >
              {isEdit ? 'Save Changes' : 'Add Product'}
            </button>
          </form>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-4 w-full bg-white rounded-[16px] shadow-[0_4px_24px_rgba(0,0,0,0.06)] ring-1 ring-gray-200/60 min-h-full p-4 sm:mt-0 sm:p-6 md:p-8 flex flex-col animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 sm:gap-6 mb-6 sm:mb-8">
        <h1 className="text-[25px] leading-[1.08] md:text-[32px] font-display font-[900] text-[#1a1a1a] tracking-tight">Product Management</h1>
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex w-full items-center justify-center gap-2 px-5 py-2.5 bg-[#1a1a1a] text-white rounded-xl text-[13px] font-bold shadow-sm hover:bg-gray-800 transition-colors sm:w-auto sm:self-start"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Add New Product
        </button>
      </div>

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-5 sm:mb-6 flex-wrap">
        <div className="grid w-full grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-center">
          <SelectFilter value={productName} options={PRODUCT_NAMES} onChange={setProductName} />
          <SelectFilter value={category} options={CATEGORIES} onChange={setCategory} />
          <SelectFilter value={status} options={STATUSES} onChange={setStatus} />
        </div>
        <div className="relative w-full xl:w-[260px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product"
            className="w-full bg-[#f8f9fb] border border-gray-200 py-2.5 pl-10 pr-4 rounded-full text-[13px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#8bed21]/40"
          />
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="company-table-scroll w-full overflow-x-auto overscroll-x-contain rounded-xl ring-1 ring-gray-200/50 [-webkit-overflow-scrolling:touch]">
        <table className="w-full text-left border-collapse min-w-[880px]">
          <thead>
            <tr className="border-b border-gray-100 bg-[#fafafa] text-[11px] font-bold text-gray-400">
              <th className="p-4 py-3 pl-6">Product Name</th>
              <th className="p-4 py-3">Category</th>
              <th className="p-4 py-3">Status</th>
              <th className="p-4 py-3">Created Date</th>
              <th className="p-4 py-3">Quantity</th>
              <th className="p-4 py-3">Sold Products</th>
              <th className="p-4 py-3 text-center w-24">Action</th>
            </tr>
          </thead>
          <tbody>
              {filtered.map((row, idx) => (
                <tr
                  key={row.id}
                  className={`border-b border-gray-50 ${idx % 2 === 1 ? 'bg-gray-50/40' : ''} hover:bg-gray-50/80`}
                >
                  <td className="p-4 pl-6">
                    <div className="flex items-center gap-3">
                      <img src={row.image} alt="" className="w-11 h-11 rounded-lg object-cover bg-gray-100" />
                      <span className="text-[13px] font-bold text-gray-800">{row.name}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-[13px] font-bold text-gray-800">{row.category}</div>
                    <div className="text-[12px] font-semibold text-gray-500">${row.price}</div>
                  </td>
                  <td className="p-4">
                    {row.status === 'Available' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-green-50 text-[#16a34a] border border-green-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                        Available
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-600 border border-red-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        Out of stock
                      </span>
                    )}
                  </td>
                   <td className="p-4 text-[13px] font-semibold text-gray-600 whitespace-nowrap">{formatDate(row.createdAt || row.created)}</td>
                  <td className="p-4 text-[13px] font-bold text-gray-800 tabular-nums">{row.qty}</td>
                  <td className="p-4 text-[13px] font-bold text-gray-800 tabular-nums">{row.sold}</td>
                  <td className="p-4 text-center relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setMenuRect(rect);
                        setMenuOpenId((id) => (id === row.id ? null : row.id));
                      }}
                      className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"
                      aria-label="Actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        </div>
      )}

      {loading && (
        <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-gray-200/70 bg-white px-4 text-center">
          <div className="flex items-center justify-center gap-2 text-sm font-semibold text-gray-500">
            <span className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-gray-800 animate-spin" />
            Loading products...
          </div>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200/70 bg-white px-4 pb-8 pt-5 text-center sm:px-5 sm:pb-9 sm:pt-7">
          <div className="mx-auto flex max-w-[420px] flex-col items-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f8f9fb] text-gray-400 ring-1 ring-gray-200 sm:h-14 sm:w-14">
              {hasActiveFilters ? <Search className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
            </div>
            <h3 className="text-[16px] font-extrabold text-gray-900">
              {hasActiveFilters ? 'No products match your filters' : 'No products yet'}
            </h3>
            <p className="mt-2 text-[13px] font-medium leading-relaxed text-gray-500 sm:max-w-[330px]">
              {hasActiveFilters
                ? 'Try another product name, category, status, or search term.'
                : 'Add your first product so it appears in this catalogue for tracking stock and sales.'}
            </p>
            <div className="mt-5 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[13px] font-bold text-gray-700 shadow-sm transition hover:bg-gray-50"
                >
                  Clear filters
                </button>
              )}
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex w-full max-w-[240px] items-center justify-center gap-2 rounded-xl bg-[#1a1a1a] px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-gray-800 sm:w-auto sm:min-w-[190px]"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Add New Product
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <PaginationFooter
          page={currentPage}
          pageSize={5}
          totalItems={totalItems}
          totalPages={totalPages}
          itemLabel="products"
          onPageChange={handlePageChange}
        />
      )}

      {showAdd && formModal('Add product', () => setShowAdd(false))}
      {editing && formModal('Edit product', () => setEditing(null))}

      {/* Portal dropdown menu for product actions */}
      {menuOpenId && menuRect && typeof document !== 'undefined' && createPortal(
        <>
          <button
            type="button"
            className="fixed inset-0 z-[200]"
            onClick={() => setMenuOpenId(null)}
            aria-hidden
          />
          <div
            className="fixed z-[201] w-36 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 text-left"
            style={{
              top: menuRect.bottom + 4,
              left: Math.min(menuRect.right - 144, window.innerWidth - 152),
            }}
          >
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-[13px] font-semibold hover:bg-gray-50 text-gray-800"
              onClick={() => {
                const row = products.find((p) => p.id === menuOpenId);
                if (row) openEdit(row);
                setMenuOpenId(null);
              }}
            >
              Edit product
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-[13px] font-semibold hover:bg-gray-50 text-red-600"
              onClick={() => {
                handleDelete(menuOpenId);
                setMenuOpenId(null);
              }}
            >
              Delete product
            </button>
          </div>
        </>,
        document.body
      )}
      {/* Custom Confirm Delete Modal */}
      {deletingProduct && (
        <div className="fixed inset-0 bg-[#09090b]/40 backdrop-blur-[2px] z-[999] flex items-center justify-center animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setDeletingProduct(null); }}
        >
          <div
            style={{
              width: '566px',
              height: '319px',
              borderRadius: '16px',
              padding: '32px',
            }}
            className="bg-white shadow-[0_20px_50px_rgba(0,0,0,0.12)] flex flex-col items-center justify-between relative overflow-hidden select-none animate-in zoom-in-95 duration-200"
          >
            {/* Red Circular Icon with Halo */}
            <div className="flex flex-col items-center mt-2">
              <div className="w-16 h-16 rounded-full bg-[#D00416] flex items-center justify-center shadow-[0_0_24px_rgba(208,4,22,0.45)] ring-8 ring-[#D00416]/10">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19 7L18.1327 19.1422C18.0579 20.1891 17.187 21 16.1378 21H7.86224C6.81296 21 5.94208 20.1891 5.86732 19.1422L5 7M10 11V17M14 11V17M15 7V4C15 3.44772 14.5523 3 14 3H10C9.44772 3 9 3.44772 9 4V7M4 7H20" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </div>

            {/* Text Contents */}
            <div className="text-center flex flex-col gap-1.5 mt-1">
              <h3 className="text-[20px] font-extrabold text-[#09090b] tracking-tight">Delete product</h3>
              <p className="text-[14px] font-semibold text-gray-500 max-w-[380px]">
                Are you sure you want to delete this product?
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-4 w-full px-4 mb-1">
              <button
                type="button"
                onClick={() => setDeletingProduct(null)}
                className="flex-1 h-12 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-[14px] font-bold text-gray-800 transition-colors flex items-center justify-center cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 h-12 rounded-xl bg-[#D00416] hover:bg-[#b00312] text-[14px] font-bold text-white transition-colors flex items-center justify-center cursor-pointer shadow-[0_4px_12px_rgba(208,4,22,0.2)]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Alert Component */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center pointer-events-none select-none">
          <div
            style={{
              width: toast.type === 'update' ? '277px' : '312px',
              height: '40px',
              borderRadius: '8px',
              padding: '8px 12px',
              backgroundColor: toast.type === 'update' ? '#2D7A1B' : '#D00416',
            }}
            className="text-white text-[13px] font-bold shadow-[0_4px_16px_rgba(0,0,0,0.15)] flex items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto"
          >
            {toast.type === 'update' && (
              <svg width="21" height="13" viewBox="0 0 21 13" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                <path d="M0.75 8.08333C0.75 8.08333 2.25 8.75 4.25 11.75C4.25 11.75 4.53485 11.2692 5.07133 10.5026M14.75 0.75C12.4585 1.89577 10.0619 4.30181 8.13791 6.57228" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M5.75 8.08333C5.75 8.08333 7.25 8.75 9.25 11.75C9.25 11.75 14.75 3.25 19.75 0.75" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            )}
            <span className="truncate">{toast.message}</span>
            {toast.type === 'delete' && (
              <button
                type="button"
                onClick={() => handleUndoDelete(toast.deletedProduct)}
                className="flex items-center gap-1 hover:underline text-white font-bold ml-1.5 cursor-pointer pointer-events-auto"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4.5 h-4.5 shrink-0">
                  <path d="M12.6391 0.833008L13.1374 1.76448C13.4742 2.39423 13.6427 2.7091 13.5313 2.84395C13.4199 2.9788 13.0531 2.86989 12.3194 2.65207C11.5859 2.43431 10.8071 2.31713 10.0002 2.31713C5.62791 2.31713 2.0835 5.75673 2.0835 9.99968C2.0835 11.399 2.46902 12.7109 3.14261 13.8409M7.36127 19.1663L6.86297 18.2349C6.52607 17.6051 6.35762 17.2902 6.469 17.1554C6.58038 17.0205 6.94724 17.1295 7.6809 17.3473C8.4144 17.565 9.19318 17.6822 10.0002 17.6822C14.3724 17.6822 17.9168 14.2426 17.9168 9.99968C17.9168 8.60035 17.5313 7.2884 16.8577 6.1584" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span className="text-[12px] uppercase tracking-wide">undo</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
