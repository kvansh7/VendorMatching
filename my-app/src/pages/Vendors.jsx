import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Users, Brain, Database, ChevronDown, ChevronUp, Trash2, RefreshCw, X, CheckCircle, XCircle } from 'lucide-react';

export default function VendorsManagement() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedVendor, setExpandedVendor] = useState(null);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [notification, setNotification] = useState(null);

  const API_BASE = 'http://127.0.0.1:5000/api';

  useEffect(() => { fetchVendors(); }, []);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/vendors`);
      setVendors(res.data.vendors || []);
    } catch {
      showNotification('Failed to fetch vendors', 'error');
    } finally { setLoading(false); }
  };

  const fetchVendorDetails = async (vendorName) => {
    try {
      const res = await axios.get(`${API_BASE}/vendors/${encodeURIComponent(vendorName)}`);
      setSelectedVendor(res.data);
    } catch {
      showNotification('Failed to fetch vendor details', 'error');
    }
  };

  const deleteVendor = async (vendorName) => {
    try {
      await axios.delete(`${API_BASE}/vendors/${encodeURIComponent(vendorName)}`);
      showNotification(`Vendor "${vendorName}" deleted`, 'success');
      fetchVendors();
      setDeleteConfirm(null);
      if (selectedVendor?.name === vendorName) setSelectedVendor(null);
    } catch {
      showNotification('Failed to delete vendor', 'error');
    }
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const filteredVendors = vendors.filter(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.text_preview.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleExpand = (vendorName) =>
    setExpandedVendor(expandedVendor === vendorName ? null : vendorName);

  const getCapabilityValue = (capabilities, key) => {
    if (!capabilities || !capabilities[key]) return null;
    const value = capabilities[key];
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
  };

  return (
    <div className="min-h-screen bg-slate-800 text-gray-200">

      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 ${
          notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        } text-white animate-slide-in`}>
          {notification.type === 'success' ? <CheckCircle size={22} /> : <XCircle size={22} />}
          <span className="font-semibold">{notification.message}</span>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
          <div className="bg-slate-900 text-gray-200 rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-3">Confirm Deletion</h3>
            <p className="mb-6">Are you sure you want to delete <span className="font-semibold">"{deleteConfirm}"</span>? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => deleteVendor(deleteConfirm)} className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition">Delete</button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-lg font-medium transition">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Vendor Details Modal */}
     {selectedVendor && (
  <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-6 overflow-y-auto">
    <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-6xl w-full text-gray-200 overflow-hidden">
      
      {/* Header */}
      <div className="p-6 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold">{selectedVendor.name}</h2>
          <div className="flex gap-6 mt-2 text-gray-100 text-sm">
            <span className="flex items-center gap-1"><Database size={16} /> {selectedVendor.text_length.toLocaleString()} chars</span>
            {selectedVendor.has_embedding && (
              <span className="flex items-center gap-1"><Brain size={16} /> {selectedVendor.embedding_dimensions}D Embedding</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setSelectedVendor(null)}
          className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition"
        >
          <X size={28} />
        </button>
      </div>

      {/* Content */}
      <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 max-h-[80vh] overflow-y-auto">
        
        {/* Capabilities Section */}
        {selectedVendor.capabilities && (
          <div className="space-y-6">
            <h3 className="text-2xl font-bold text-white border-b border-gray-700 pb-2">Extracted Capabilities</h3>
            <div className="grid grid-cols-1 gap-4">
              {Object.entries(selectedVendor.capabilities).map(([key, value]) => {
                if (key === 'name') return null;
                const displayValue = getCapabilityValue(selectedVendor.capabilities, key);
                if (!displayValue) return null;

                return (
                  <div key={key} className="bg-slate-800 p-5 rounded-2xl shadow-inner hover:shadow-lg transition">
                    <div className="text-sm font-semibold text-blue-400 mb-2">{key.replace(/_/g, ' ')}</div>
                    <div className="text-gray-200 text-sm whitespace-pre-wrap">{displayValue}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Full Text Section */}
        <div className="space-y-6">
          <h3 className="text-2xl font-bold text-white border-b border-gray-700 pb-2">Full Profile Text</h3>
          <div className="bg-slate-800 p-5 rounded-2xl border border-gray-700 shadow-inner overflow-auto max-h-[60vh]">
            <pre className="text-gray-200 text-sm whitespace-pre-wrap font-mono">{selectedVendor.full_text}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
)}

      {/* Header */}
      <div className="bg-slate-900 shadow-sm border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-3 rounded-xl shadow-lg">
              <Users className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Vendors Management</h1>
              <p className="text-gray-400 mt-1">Manage and explore your vendor database</p>
            </div>
          </div>
          <button onClick={fetchVendors} disabled={loading} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl font-semibold transition disabled:opacity-50">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* Stats & Search */}
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
            <div className="bg-slate-800 p-4 rounded-xl border border-gray-700 shadow-sm">
              <div className="text-blue-400 text-sm font-medium mb-1">Total Vendors</div>
              <div className="text-2xl font-bold text-white">{vendors.length}</div>
            </div>
            <div className="bg-slate-800 p-4 rounded-xl border border-gray-700 shadow-sm">
              <div className="text-green-400 text-sm font-medium mb-1">With Capabilities</div>
              <div className="text-2xl font-bold text-white">{vendors.filter(v => v.capabilities).length}</div>
            </div>
            <div className="bg-slate-800 p-4 rounded-xl border border-gray-700 shadow-sm">
              <div className="text-purple-400 text-sm font-medium mb-1">With Embeddings</div>
              <div className="text-2xl font-bold text-white">{vendors.filter(v => v.has_embedding).length}</div>
            </div>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search vendors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm bg-slate-900 text-gray-200"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 gap-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="animate-spin text-blue-500" size={40} />
          </div>
        ) : filteredVendors.length === 0 ? (
          <div className="bg-slate-900 rounded-xl shadow-sm border border-gray-700 p-12 text-center">
            <Users className="mx-auto text-gray-400 mb-4" size={48} />
            <h3 className="text-xl font-semibold text-white mb-2">No Vendors Found</h3>
            <p className="text-gray-400">{searchTerm ? 'Try adjusting your search terms' : 'Start by adding your first vendor'}</p>
          </div>
        ) : (
          filteredVendors.map(vendor => (
            <div key={vendor.name} className="bg-slate-900 rounded-xl shadow-md border border-gray-700 hover:shadow-lg transition overflow-hidden">
              <div className="p-6">
                <div className="flex flex-col md:flex-row justify-between mb-4 gap-3">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white mb-2">{vendor.name}</h3>
                    <div className="flex flex-wrap gap-2">
                      {vendor.has_embedding && <span className="flex items-center gap-1 px-3 py-1 bg-purple-700/20 text-purple-300 rounded-full text-xs font-medium"><Brain size={14} />Embedded</span>}
                      {vendor.capabilities && <span className="flex items-center gap-1 px-3 py-1 bg-green-700/20 text-green-300 rounded-full text-xs font-medium"><CheckCircle size={14} />Analyzed</span>}
                      <span className="px-3 py-1 bg-gray-700/20 text-gray-300 rounded-full text-xs font-medium">{vendor.full_text_length.toLocaleString()} chars</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => fetchVendorDetails(vendor.name)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition">View Details</button>
                    <button onClick={() => setDeleteConfirm(vendor.name)} className="p-2 text-red-500 hover:bg-red-600/20 rounded-xl transition" title="Delete vendor"><Trash2 size={18} /></button>
                    <button onClick={() => toggleExpand(vendor.name)} className="p-2 text-gray-400 hover:bg-gray-700/20 rounded-xl transition">
                      {expandedVendor === vendor.name ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>

                <p className="text-gray-300 text-sm line-clamp-2 mb-4">{vendor.text_preview}</p>

                {expandedVendor === vendor.name && vendor.capabilities && (
                  <div className="mt-4 pt-4 border-t border-gray-700 transition-all duration-300 ease-in-out">
                    <h4 className="font-semibold text-white mb-3">Key Capabilities:</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Object.entries(vendor.capabilities).slice(0, 6).map(([key, value]) => {
                        if (key === 'name') return null;
                        const displayValue = getCapabilityValue(vendor.capabilities, key);
                        if (!displayValue) return null;
                        return (
                          <div key={key} className="bg-slate-800 p-3 rounded-xl shadow-inner hover:shadow-md transition">
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{key.replace(/_/g, ' ')}</div>
                            <div className="text-sm text-gray-300 line-clamp-2">{displayValue}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <style jsx>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
      `}</style>
    </div>
  );
}