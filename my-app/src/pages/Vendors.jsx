import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Search, Users, Brain, Database, ChevronDown, ChevronUp, Trash2, RefreshCw, X, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useLLM } from '../context/LLMProviderContext';

export default function VendorsManagement() {
  const { provider } = useLLM(); // Get current LLM provider from context
  
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedVendor, setExpandedVendor] = useState(null);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [notification, setNotification] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const API_BASE = 'http://127.0.0.1:5000/api';

  // Refetch vendors when provider changes
  useEffect(() => { 
    fetchVendors(); 
  }, [provider]);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const res = await api.get(`${API_BASE}/vendors`, {
        params: { llm_provider: provider }
      });
      setVendors(res.data.vendors || []);
    } catch (error) {
      console.error('Fetch vendors error:', error);
      showNotification('Failed to fetch vendors', 'error');
    } finally { 
      setLoading(false); 
    }
  };

  const fetchVendorDetails = async (vendorName) => {
    setLoadingDetails(true);
    try {
      const res = await api.get(
        `${API_BASE}/vendors/${encodeURIComponent(vendorName)}`,
        { params: { llm_provider: provider } }
      );
      setSelectedVendor(res.data);
    } catch (error) {
      console.error('Fetch vendor details error:', error);
      showNotification('Failed to fetch vendor details', 'error');
    } finally {
      setLoadingDetails(false);
    }
  };

  const deleteVendor = async (vendorName) => {
    try {
      await api.delete(`${API_BASE}/vendors/${encodeURIComponent(vendorName)}`);
      showNotification(`Vendor "${vendorName}" deleted successfully`, 'success');
      fetchVendors();
      setDeleteConfirm(null);
      if (selectedVendor?.name === vendorName) setSelectedVendor(null);
    } catch (error) {
      console.error('Delete vendor error:', error);
      showNotification('Failed to delete vendor', 'error');
    }
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const filteredVendors = vendors.filter(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.text_preview && v.text_preview.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const toggleExpand = (vendorName) =>
    setExpandedVendor(expandedVendor === vendorName ? null : vendorName);

  const getCapabilityValue = (capabilities, key) => {
    if (!capabilities || !capabilities[key]) return null;
    const value = capabilities[key];
    
    // Handle arrays - return as structured list
    if (Array.isArray(value)) {
      return value.length > 0 ? value : null;
    }
    
    // Handle objects - convert to array of key-value pairs
    if (typeof value === 'object' && value !== null) {
      const entries = Object.entries(value);
      if (entries.length === 0) return null;
      return entries.map(([k, v]) => `${k}: ${v}`);
    }
    
    // Handle strings - split by common delimiters
    if (typeof value === 'string') {
      // Check if it's a comma/semicolon separated list
      if (value.includes(',') || value.includes(';') || value.includes('•') || value.includes('\n')) {
        const delimiter = value.includes('\n') ? '\n' : value.includes(';') ? ';' : value.includes('•') ? '•' : ',';
        const items = value.split(delimiter)
          .map(item => item.trim())
          .filter(item => item.length > 0);
        return items.length > 1 ? items : value;
      }
      return value;
    }
    
    return value;
  };

  const renderCapabilityValue = (value) => {
    // If it's an array, render as bullet points
    if (Array.isArray(value)) {
      return (
        <ul className="space-y-1.5 list-none">
          {value.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-blue-400 mt-1 text-sm">•</span>
              <span className="flex-1">{item}</span>
            </li>
          ))}
        </ul>
      );
    }
    
    // Otherwise render as text
    return <span>{value}</span>;
  };

  const formatCapabilityKey = (key) => {
    return key
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-gray-200">

      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 ${
          notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        } text-white animate-slide-in`}>
          {notification.type === 'success' ? <CheckCircle size={22} /> : <XCircle size={22} />}
          <span className="font-semibold">{notification.message}</span>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-40 flex items-center justify-center p-4">
          <div className="bg-slate-900 text-gray-200 rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-600/20 p-3 rounded-full">
                <AlertCircle className="text-red-500" size={24} />
              </div>
              <h3 className="text-xl font-bold">Confirm Deletion</h3>
            </div>
            <p className="mb-6 text-gray-300">
              Are you sure you want to delete <span className="font-semibold text-white">"{deleteConfirm}"</span>? 
              This will remove the vendor and all associated capabilities from all LLM providers. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => deleteVendor(deleteConfirm)} 
                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition"
              >
                Delete
              </button>
              <button 
                onClick={() => setDeleteConfirm(null)} 
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-lg font-medium transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vendor Details Modal */}
      {selectedVendor && (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-6 overflow-y-auto">
          <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-6xl w-full text-gray-200 overflow-hidden border border-slate-700">
            
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 p-6 flex justify-between items-start border-b border-slate-700">
              <div className="flex-1">
                <h2 className="text-3xl font-bold text-white mb-2">{selectedVendor.name}</h2>
                <div className="flex flex-wrap gap-4 text-gray-300 text-sm">
                  <span className="flex items-center gap-2 bg-slate-800/50 px-3 py-1 rounded-full">
                    <Database size={16} /> 
                    {selectedVendor.text_length?.toLocaleString() || 0} characters
                  </span>
                  {selectedVendor.has_embedding && (
                    <span className="flex items-center gap-2 bg-purple-900/30 px-3 py-1 rounded-full">
                      <Brain size={16} /> 
                      {selectedVendor.embedding_dimensions}D Embedding
                    </span>
                  )}
                  <span className="flex items-center gap-2 bg-blue-900/30 px-3 py-1 rounded-full">
                    <CheckCircle size={16} /> 
                    Analyzed by {provider.toUpperCase()}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedVendor(null)}
                className="text-gray-400 hover:text-white hover:bg-slate-800 p-2 rounded-lg transition"
              >
                <X size={28} />
              </button>
            </div>

            {/* Content */}
            <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 max-h-[75vh] overflow-y-auto">
              
              {/* Capabilities Section */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Brain size={24} className="text-blue-400" />
                    Extracted Capabilities
                  </h3>
                  <span className="text-xs text-gray-400 bg-slate-800 px-3 py-1 rounded-full">
                    via {provider.toUpperCase()}
                  </span>
                </div>

                {selectedVendor.capabilities ? (
                  <div className="space-y-4">
                    {Object.entries(selectedVendor.capabilities).map(([key, value]) => {
                      if (key === 'name' || key === 'llm_provider' || key === '_hash') return null;
                      const displayValue = getCapabilityValue(selectedVendor.capabilities, key);
                      if (!displayValue) return null;

                      return (
                        <div 
                          key={key} 
                          className="bg-gradient-to-br from-slate-800 to-slate-800/50 p-5 rounded-xl shadow-lg border border-slate-700 hover:border-blue-500/50 transition-all"
                        >
                          <div className="text-sm font-bold text-blue-400 mb-3 flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                            {formatCapabilityKey(key)}
                          </div>
                          <div className="text-gray-300 text-sm leading-relaxed">
                            {renderCapabilityValue(displayValue)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center">
                    <AlertCircle className="mx-auto text-yellow-500 mb-3" size={40} />
                    <p className="text-gray-400 mb-2">No capabilities analyzed yet</p>
                    <p className="text-sm text-gray-500">
                      Capabilities will be generated when this vendor is used in matching
                    </p>
                  </div>
                )}
              </div>

              {/* Full Text Section */}
              <div className="space-y-6">
                <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Database size={24} className="text-green-400" />
                  Full Profile Text
                </h3>
                <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg overflow-auto max-h-[60vh]">
                  <pre className="text-gray-300 text-sm whitespace-pre-wrap font-mono leading-relaxed">
                    {selectedVendor.full_text || 'No text available'}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-slate-900/80 backdrop-blur-sm shadow-lg border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-3 rounded-xl shadow-lg">
              <Users className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Vendors Management</h1>
              <p className="text-gray-400 mt-1">
                Manage and explore your vendor database • Current Provider: 
                <span className="text-blue-400 font-semibold ml-1">{provider.toUpperCase()}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={fetchVendors} 
            disabled={loading} 
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> 
            Refresh
          </button>
        </div>

        {/* Stats & Search */}
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
            <div className="bg-gradient-to-br from-slate-800 to-slate-800/50 p-4 rounded-xl border border-slate-700 shadow-lg">
              <div className="text-blue-400 text-sm font-medium mb-1">Total Vendors</div>
              <div className="text-3xl font-bold text-white">{vendors.length}</div>
            </div>
            <div className="bg-gradient-to-br from-slate-800 to-slate-800/50 p-4 rounded-xl border border-slate-700 shadow-lg">
              <div className="text-green-400 text-sm font-medium mb-1">With Capabilities</div>
              <div className="text-3xl font-bold text-white">
                {vendors.filter(v => v.capabilities).length}
              </div>
            </div>
            <div className="bg-gradient-to-br from-slate-800 to-slate-800/50 p-4 rounded-xl border border-slate-700 shadow-lg">
              <div className="text-purple-400 text-sm font-medium mb-1">With Embeddings</div>
              <div className="text-3xl font-bold text-white">
                {vendors.filter(v => v.has_embedding).length}
              </div>
            </div>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search vendors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-lg bg-slate-800 text-gray-200 placeholder-gray-500"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 gap-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <RefreshCw className="animate-spin text-blue-500 mb-4" size={48} />
            <p className="text-gray-400">Loading vendors...</p>
          </div>
        ) : filteredVendors.length === 0 ? (
          <div className="bg-slate-900/50 rounded-xl shadow-lg border border-slate-700 p-12 text-center">
            <Users className="mx-auto text-gray-500 mb-4" size={64} />
            <h3 className="text-2xl font-semibold text-white mb-2">No Vendors Found</h3>
            <p className="text-gray-400">
              {searchTerm 
                ? 'Try adjusting your search terms' 
                : 'Start by adding your first vendor'}
            </p>
          </div>
        ) : (
          filteredVendors.map(vendor => (
            <div 
              key={vendor.name} 
              className="bg-slate-900/50 rounded-xl shadow-lg border border-slate-700 hover:border-blue-500/50 hover:shadow-2xl transition-all overflow-hidden"
            >
              <div className="p-6">
                <div className="flex flex-col md:flex-row justify-between mb-4 gap-3">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-white mb-3">{vendor.name}</h3>
                    <div className="flex flex-wrap gap-2">
                      {vendor.has_embedding && (
                        <span className="flex items-center gap-1 px-3 py-1 bg-purple-700/20 text-purple-300 rounded-full text-xs font-medium border border-purple-700/30">
                          <Brain size={14} />
                          Embedded
                        </span>
                      )}
                      {vendor.capabilities && (
                        <span className="flex items-center gap-1 px-3 py-1 bg-green-700/20 text-green-300 rounded-full text-xs font-medium border border-green-700/30">
                          <CheckCircle size={14} />
                          Analyzed ({provider.toUpperCase()})
                        </span>
                      )}
                      <span className="px-3 py-1 bg-slate-700/30 text-gray-300 rounded-full text-xs font-medium border border-slate-700">
                        {vendor.full_text_length?.toLocaleString() || 0} chars
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 items-start">
                    <button 
                      onClick={() => fetchVendorDetails(vendor.name)} 
                      disabled={loadingDetails}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loadingDetails ? 'Loading...' : 'View Details'}
                    </button>
                    <button 
                      onClick={() => setDeleteConfirm(vendor.name)} 
                      className="p-2 text-red-400 hover:bg-red-600/20 hover:text-red-300 rounded-xl transition border border-transparent hover:border-red-600/30" 
                      title="Delete vendor"
                    >
                      <Trash2 size={18} />
                    </button>
                    <button 
                      onClick={() => toggleExpand(vendor.name)} 
                      className="p-2 text-gray-400 hover:bg-slate-700/30 hover:text-gray-200 rounded-xl transition border border-transparent hover:border-slate-600"
                      title={expandedVendor === vendor.name ? 'Collapse' : 'Expand'}
                    >
                      {expandedVendor === vendor.name ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>

                {vendor.text_preview && (
                  <p className="text-gray-400 text-sm line-clamp-2 mb-4 leading-relaxed">
                    {vendor.text_preview}
                  </p>
                )}

                {expandedVendor === vendor.name && (
                  <div className="mt-4 pt-4 border-t border-slate-700 transition-all duration-300 ease-in-out">
                    {vendor.capabilities ? (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-white flex items-center gap-2">
                            <Brain size={18} className="text-blue-400" />
                            Key Capabilities
                          </h4>
                          <span className="text-xs text-gray-500">
                            Analyzed by {provider.toUpperCase()}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {Object.entries(vendor.capabilities)
                            .filter(([key]) => key !== 'name' && key !== 'llm_provider' && key !== '_hash')
                            .slice(0, 6)
                            .map(([key, value]) => {
                              const displayValue = getCapabilityValue(vendor.capabilities, key);
                              if (!displayValue) return null;
                              
                              // For preview, show first 3 items if it's an array
                              const previewValue = Array.isArray(displayValue) 
                                ? displayValue.slice(0, 3)
                                : displayValue;
                              
                              return (
                                <div 
                                  key={key} 
                                  className="bg-slate-800 p-4 rounded-xl shadow-lg border border-slate-700 hover:border-blue-500/30 transition"
                                >
                                  <div className="text-xs font-bold text-blue-400 uppercase mb-2">
                                    {formatCapabilityKey(key)}
                                  </div>
                                  <div className="text-sm text-gray-300 leading-relaxed">
                                    {Array.isArray(previewValue) ? (
                                      <ul className="space-y-1">
                                        {previewValue.map((item, idx) => (
                                          <li key={idx} className="flex items-start gap-1.5">
                                            <span className="text-blue-400 text-xs mt-0.5">•</span>
                                            <span className="flex-1 line-clamp-1">{item}</span>
                                          </li>
                                        ))}
                                        {Array.isArray(displayValue) && displayValue.length > 3 && (
                                          <li className="text-xs text-gray-500 italic mt-1">
                                            +{displayValue.length - 3} more...
                                          </li>
                                        )}
                                      </ul>
                                    ) : (
                                      <span className="line-clamp-3">{previewValue}</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </>
                    ) : (
                      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 text-center">
                        <AlertCircle className="mx-auto text-yellow-500 mb-2" size={32} />
                        <p className="text-gray-400 text-sm">
                          No capabilities analyzed yet with {provider.toUpperCase()}
                        </p>
                      </div>
                    )}
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
        .animate-slide-in { 
          animation: slide-in 0.3s ease-out; 
        }
      `}</style>
    </div>
  );
}