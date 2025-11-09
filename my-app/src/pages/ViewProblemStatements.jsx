import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, FileText, Brain, Database, ChevronDown, ChevronUp, Trash2, RefreshCw, X, CheckCircle, XCircle, AlertCircle, Target } from 'lucide-react';
import { useLLM } from '../context/LLMProviderContext';

export default function ViewProblemStatements() {
  const { provider } = useLLM();
  
  const [problemStatements, setProblemStatements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedPS, setExpandedPS] = useState(null);
  const [selectedPS, setSelectedPS] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [notification, setNotification] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const API_BASE = 'http://127.0.0.1:5000/api';

  useEffect(() => { 
    fetchProblemStatements(); 
  }, [provider]);

  const fetchProblemStatements = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/problem_statements`, {
        params: { llm_provider: provider }
      });
      setProblemStatements(res.data || []);
    } catch (error) {
      console.error('Fetch PS error:', error);
      showNotification('Failed to fetch problem statements', 'error');
    } finally { 
      setLoading(false); 
    }
  };

  const fetchPSDetails = async (psId) => {
    setLoadingDetails(true);
    try {
      const res = await axios.get(
        `${API_BASE}/problem_statements/${psId}`,
        { params: { llm_provider: provider } }
      );
      setSelectedPS(res.data);
    } catch (error) {
      console.error('Fetch PS details error:', error);
      showNotification('Failed to fetch problem statement details', 'error');
    } finally {
      setLoadingDetails(false);
    }
  };

  const deletePS = async (psId) => {
    try {
      await axios.delete(`${API_BASE}/problem_statements/${psId}`);
      showNotification(`Problem statement deleted successfully`, 'success');
      fetchProblemStatements();
      setDeleteConfirm(null);
      if (selectedPS?.id === psId) setSelectedPS(null);
    } catch (error) {
      console.error('Delete PS error:', error);
      showNotification('Failed to delete problem statement', 'error');
    }
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const filteredPS = problemStatements.filter(ps =>
    ps.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (ps.description && ps.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const toggleExpand = (psId) =>
    setExpandedPS(expandedPS === psId ? null : psId);

  const getAnalysisValue = (analysis, key) => {
    if (!analysis || !analysis[key]) return null;
    const value = analysis[key];
    
    if (Array.isArray(value)) {
      return value.length > 0 ? value : null;
    }
    
    if (typeof value === 'object' && value !== null) {
      const entries = Object.entries(value);
      if (entries.length === 0) return null;
      return entries.map(([k, v]) => `${k}: ${v}`);
    }
    
    if (typeof value === 'string') {
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

  const renderAnalysisValue = (value) => {
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
    return <span>{value}</span>;
  };

  const formatAnalysisKey = (key) => {
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
              Are you sure you want to delete this problem statement? 
              This will remove the problem statement and all associated analysis from all LLM providers. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => deletePS(deleteConfirm)} 
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

      {/* Problem Statement Details Modal */}
      {selectedPS && (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-6 overflow-y-auto">
          <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-6xl w-full text-gray-200 overflow-hidden border border-slate-700">
            
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-900/50 to-indigo-900/50 p-6 flex justify-between items-start border-b border-slate-700">
              <div className="flex-1">
                <h2 className="text-3xl font-bold text-white mb-2">{selectedPS.title}</h2>
                <div className="flex flex-wrap gap-4 text-gray-300 text-sm">
                  <span className="flex items-center gap-2 bg-slate-800/50 px-3 py-1 rounded-full">
                    <FileText size={16} /> 
                    ID: {selectedPS.id}
                  </span>
                  {selectedPS.has_embedding && (
                    <span className="flex items-center gap-2 bg-purple-900/30 px-3 py-1 rounded-full">
                      <Brain size={16} /> 
                      {selectedPS.embedding_dimensions}D Embedding
                    </span>
                  )}
                  <span className="flex items-center gap-2 bg-blue-900/30 px-3 py-1 rounded-full">
                    <CheckCircle size={16} /> 
                    Analyzed by {provider.toUpperCase()}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedPS(null)}
                className="text-gray-400 hover:text-white hover:bg-slate-800 p-2 rounded-lg transition"
              >
                <X size={28} />
              </button>
            </div>

            {/* Content */}
            <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 max-h-[75vh] overflow-y-auto">
              
              {/* Analysis Section */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Brain size={24} className="text-blue-400" />
                    Technical Analysis
                  </h3>
                  <span className="text-xs text-gray-400 bg-slate-800 px-3 py-1 rounded-full">
                    via {provider.toUpperCase()}
                  </span>
                </div>

                {selectedPS.analysis ? (
                  <div className="space-y-4">
                    {Object.entries(selectedPS.analysis).map(([key, value]) => {
                      if (key === 'llm_provider' || key === '_hash') return null;
                      const displayValue = getAnalysisValue(selectedPS.analysis, key);
                      if (!displayValue) return null;

                      return (
                        <div 
                          key={key} 
                          className="bg-gradient-to-br from-slate-800 to-slate-800/50 p-5 rounded-xl shadow-lg border border-slate-700 hover:border-blue-500/50 transition-all"
                        >
                          <div className="text-sm font-bold text-blue-400 mb-3 flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                            {formatAnalysisKey(key)}
                          </div>
                          <div className="text-gray-300 text-sm leading-relaxed">
                            {renderAnalysisValue(displayValue)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center">
                    <AlertCircle className="mx-auto text-yellow-500 mb-3" size={40} />
                    <p className="text-gray-400 mb-2">No analysis generated yet</p>
                    <p className="text-sm text-gray-500">
                      Analysis will be generated when this problem statement is used in matching
                    </p>
                  </div>
                )}
              </div>

              {/* Full Statement Section */}
              <div className="space-y-6">
                <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                  <FileText size={24} className="text-green-400" />
                  Full Statement
                </h3>
                
                <div className="space-y-4">
                  {/* Description */}
                  <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg">
                    <h4 className="text-sm font-bold text-green-400 mb-2">Description</h4>
                    <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {selectedPS.description || 'No description available'}
                    </p>
                  </div>

                  {/* Outcomes */}
                  <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg">
                    <h4 className="text-sm font-bold text-blue-400 mb-2">Expected Outcomes</h4>
                    <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {selectedPS.outcomes || 'No outcomes specified'}
                    </p>
                  </div>

                  {/* Full Text */}
                  <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-lg">
                    <h4 className="text-sm font-bold text-indigo-400 mb-2">Complete Statement</h4>
                    <pre className="text-gray-300 text-sm whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-y-auto">
                      {selectedPS.full_statement || 'No full statement available'}
                    </pre>
                  </div>
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
              <FileText className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Problem Statements</h1>
              <p className="text-gray-400 mt-1">
                View and manage problem statements • Current Provider: 
                <span className="text-blue-400 font-semibold ml-1">{provider.toUpperCase()}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={fetchProblemStatements} 
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
              <div className="text-blue-400 text-sm font-medium mb-1">Total Statements</div>
              <div className="text-3xl font-bold text-white">{problemStatements.length}</div>
            </div>
            <div className="bg-gradient-to-br from-slate-800 to-slate-800/50 p-4 rounded-xl border border-slate-700 shadow-lg">
              <div className="text-green-400 text-sm font-medium mb-1">With Analysis</div>
              <div className="text-3xl font-bold text-white">
                {problemStatements.filter(ps => ps.has_analysis).length}
              </div>
            </div>
            <div className="bg-gradient-to-br from-slate-800 to-slate-800/50 p-4 rounded-xl border border-slate-700 shadow-lg">
              <div className="text-purple-400 text-sm font-medium mb-1">With Embeddings</div>
              <div className="text-3xl font-bold text-white">
                {problemStatements.filter(ps => ps.has_embedding).length}
              </div>
            </div>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search problem statements..."
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
            <p className="text-gray-400">Loading problem statements...</p>
          </div>
        ) : filteredPS.length === 0 ? (
          <div className="bg-slate-900/50 rounded-xl shadow-lg border border-slate-700 p-12 text-center">
            <FileText className="mx-auto text-gray-500 mb-4" size={64} />
            <h3 className="text-2xl font-semibold text-white mb-2">No Problem Statements Found</h3>
            <p className="text-gray-400">
              {searchTerm 
                ? 'Try adjusting your search terms' 
                : 'Start by adding your first problem statement'}
            </p>
          </div>
        ) : (
          filteredPS.map(ps => (
            <div 
              key={ps.id} 
              className="bg-slate-900/50 rounded-xl shadow-lg border border-slate-700 hover:border-blue-500/50 hover:shadow-2xl transition-all overflow-hidden"
            >
              <div className="p-6">
                <div className="flex flex-col md:flex-row justify-between mb-4 gap-3">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-white mb-3">{ps.title}</h3>
                    <div className="flex flex-wrap gap-2">
                      {ps.has_embedding && (
                        <span className="flex items-center gap-1 px-3 py-1 bg-purple-700/20 text-purple-300 rounded-full text-xs font-medium border border-purple-700/30">
                          <Brain size={14} />
                          Embedded
                        </span>
                      )}
                      {ps.has_analysis && (
                        <span className="flex items-center gap-1 px-3 py-1 bg-green-700/20 text-green-300 rounded-full text-xs font-medium border border-green-700/30">
                          <CheckCircle size={14} />
                          Analyzed ({provider.toUpperCase()})
                        </span>
                      )}
                      <span className="px-3 py-1 bg-slate-700/30 text-gray-300 rounded-full text-xs font-medium border border-slate-700">
                        ID: {ps.id}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 items-start">
                    <button 
                      onClick={() => fetchPSDetails(ps.id)} 
                      disabled={loadingDetails}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loadingDetails ? 'Loading...' : 'View Details'}
                    </button>
                    <button 
                      onClick={() => setDeleteConfirm(ps.id)} 
                      className="p-2 text-red-400 hover:bg-red-600/20 hover:text-red-300 rounded-xl transition border border-transparent hover:border-red-600/30" 
                      title="Delete problem statement"
                    >
                      <Trash2 size={18} />
                    </button>
                    <button 
                      onClick={() => toggleExpand(ps.id)} 
                      className="p-2 text-gray-400 hover:bg-slate-700/30 hover:text-gray-200 rounded-xl transition border border-transparent hover:border-slate-600"
                      title={expandedPS === ps.id ? 'Collapse' : 'Expand'}
                    >
                      {expandedPS === ps.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>

                {ps.description && (
                  <p className="text-gray-400 text-sm line-clamp-2 mb-4 leading-relaxed">
                    {ps.description}
                  </p>
                )}

                {expandedPS === ps.id && (
                  <div className="mt-4 pt-4 border-t border-slate-700 transition-all duration-300 ease-in-out">
                    {ps.analysis ? (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-white flex items-center gap-2">
                            <Brain size={18} className="text-blue-400" />
                            Technical Analysis
                          </h4>
                          <span className="text-xs text-gray-500">
                            Analyzed by {provider.toUpperCase()}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {Object.entries(ps.analysis)
                            .filter(([key]) => key !== 'llm_provider' && key !== '_hash')
                            .slice(0, 6)
                            .map(([key, value]) => {
                              const displayValue = getAnalysisValue(ps.analysis, key);
                              if (!displayValue) return null;
                              
                              const previewValue = Array.isArray(displayValue) 
                                ? displayValue.slice(0, 3)
                                : displayValue;
                              
                              return (
                                <div 
                                  key={key} 
                                  className="bg-slate-800 p-4 rounded-xl shadow-lg border border-slate-700 hover:border-blue-500/30 transition"
                                >
                                  <div className="text-xs font-bold text-blue-400 uppercase mb-2">
                                    {formatAnalysisKey(key)}
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
                          No analysis generated yet with {provider.toUpperCase()}
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