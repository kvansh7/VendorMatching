import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import { useLLM } from '../context/LLMProviderContext';
import { X, Database, Brain, FileText, AlertCircle, CheckCircle } from 'lucide-react';

const Dashboard = () => {
  const navigate = useNavigate();
  const { provider } = useLLM();
  
  const [data, setData] = useState({
    total_vendors: 0,
    total_ps: 0,
    cached_analyses: 0,
    recent_vendors: [],
    recent_ps: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedPS, setSelectedPS] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const API_BASE = 'http://127.0.0.1:5000/api';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.get('/api/dashboard');
        setData(res.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to load dashboard');
        setLoading(false);
      }
    };
    fetchData();
  }, []);

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
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchPSDetails = async (psId) => {
    setLoadingDetails(true);
    try {
      const res = await api.get(
        `${API_BASE}/problem_statements/${psId}`,
        { params: { llm_provider: provider } }
      );
      setSelectedPS(res.data);
    } catch (error) {
      console.error('Fetch PS details error:', error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const getCapabilityValue = (capabilities, key) => {
    if (!capabilities || !capabilities[key]) return null;
    const value = capabilities[key];
    
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

  const renderCapabilityValue = (value) => {
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

  const formatCapabilityKey = (key) => {
    return key
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

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

  if (loading) return <p className="text-center text-white">Loading...</p>;
  if (error) return <p className="text-red-500 text-center">{error}</p>;

  return (
    <div className="space-y-12">
      <h1 className="text-3xl font-bold text-white mb-6 text-center">System Overview</h1>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        <div 
          onClick={() => navigate('/vendors')}
          className="glass-card text-center p-6 cursor-pointer hover:scale-105 transition-transform duration-200"
        >
          <p className="text-muted mb-2">Total Vendors</p>
          <p className="text-4xl font-bold text-white">{data.total_vendors}</p>
        </div>
        <div 
          onClick={() => navigate('/viewps')}
          className="glass-card text-center p-6 cursor-pointer hover:scale-105 transition-transform duration-200"
        >
          <p className="text-muted mb-2">Total Problem Statements</p>
          <p className="text-4xl font-bold text-white">{data.total_ps}</p>
        </div>
      </div>

      {/* Recent Vendors */}
      <div className="glass-card p-6">
        <h2 className="text-xl font-bold text-white mb-4">Recent Vendors</h2>
        {data.recent_vendors.length > 0 ? (
          <ul className="list-disc pl-5 space-y-2 text-muted">
            {data.recent_vendors.map((v, i) => (
              <li 
                key={i}
                onClick={() => fetchVendorDetails(v.name)}
                className="cursor-pointer hover:text-white transition-colors duration-200"
              >
                {v.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No recent vendors.</p>
        )}
      </div>

      {/* Recent Problem Statements */}
      <div className="glass-card p-6">
        <h2 className="text-xl font-bold text-white mb-4">Recent Problem Statements</h2>
        {data.recent_ps.length > 0 ? (
          <ul className="list-disc pl-5 space-y-2 text-muted">
            {data.recent_ps.map((ps, i) => (
              <li 
                key={i}
                onClick={() => fetchPSDetails(ps.id)}
                className="cursor-pointer hover:text-white transition-colors duration-200"
              >
                {ps.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No recent problem statements.</p>
        )}
      </div>

      {/* Vendor Details Modal */}
      {selectedVendor && (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-6 overflow-y-auto">
          <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-6xl w-full text-gray-200 overflow-hidden border border-slate-700">
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

            <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 max-h-[75vh] overflow-y-auto">
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

      {/* PS Details Modal */}
      {selectedPS && (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-6 overflow-y-auto">
          <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-6xl w-full text-gray-200 overflow-hidden border border-slate-700">
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

            <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 max-h-[75vh] overflow-y-auto">
              <div className="space-y-6">
                <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                  <FileText size={24} className="text-blue-400" />
                  Problem Statement Details
                </h3>
                
                <div className="space-y-4">
                  <div className="bg-slate-800 p-5 rounded-xl border border-slate-700">
                    <h4 className="text-sm font-bold text-blue-400 mb-2">Description</h4>
                    <p className="text-gray-300 text-sm">{selectedPS.description}</p>
                  </div>
                  
                  <div className="bg-slate-800 p-5 rounded-xl border border-slate-700">
                    <h4 className="text-sm font-bold text-blue-400 mb-2">Outcomes</h4>
                    <p className="text-gray-300 text-sm">{selectedPS.outcomes}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Brain size={24} className="text-purple-400" />
                    Analysis
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
                          className="bg-gradient-to-br from-slate-800 to-slate-800/50 p-5 rounded-xl shadow-lg border border-slate-700 hover:border-purple-500/50 transition-all"
                        >
                          <div className="text-sm font-bold text-purple-400 mb-3 flex items-center gap-2">
                            <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
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
                    <p className="text-gray-400 mb-2">No analysis available yet</p>
                    <p className="text-sm text-gray-500">
                      Analysis will be generated when this PS is used in matching
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
