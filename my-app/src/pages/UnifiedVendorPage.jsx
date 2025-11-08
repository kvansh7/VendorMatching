import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLLM } from '../context/LLMProviderContext'; // ✅ Import context

const UnifiedVendorPage = () => {
  /* ================================================================== */
  /*  STATE MANAGEMENT                                                  */
  /* ================================================================== */
  
  // Problem Statements
  const [psOptions, setPsOptions] = useState([]);
  const [selectedPsId, setSelectedPsId] = useState('');
  const [loadingPs, setLoadingPs] = useState(true);
  const { provider } = useLLM(); // ✅ Get current LLM provider from context
  
  // Parameters
  const [criteria, setCriteria] = useState([
    { key: 'domain_fit', label: 'Domain Fit', weight: 40 },
    { key: 'tools_fit', label: 'Tools Fit', weight: 30 },
    { key: 'experience', label: 'Experience', weight: 20 },
    { key: 'scalability', label: 'Scalability', weight: 10 },
  ]);
  
  // Repository Search Settings
  const [topK, setTopK] = useState(20);
  const [batchSize, setBatchSize] = useState(5);
  
  // Web Search Settings
  const [webSearchCount, setWebSearchCount] = useState(5);
  
  // Results
  const [repoResults, setRepoResults] = useState(null);
  const [webResults, setWebResults] = useState(null);
  
  // Loading States
  const [loadingRepo, setLoadingRepo] = useState(false);
  const [loadingWeb, setLoadingWeb] = useState(false);
  
  // Errors
  const [repoError, setRepoError] = useState('');
  const [webError, setWebError] = useState('');
  
  // Expanded Cards
  const [expandedRepo, setExpandedRepo] = useState(null);
  const [expandedWeb, setExpandedWeb] = useState(null);
  
  // Comparison Table
  const [comparisonVendors, setComparisonVendors] = useState([]);

  /* ================================================================== */
  /*  LOAD PROBLEM STATEMENTS                                           */
  /* ================================================================== */
  
  useEffect(() => {
    const fetchPs = async () => {
      try {
        const { data } = await axios.get('/api/problem_statements');
        setPsOptions(data);
      } catch (err) {
        setRepoError('Failed to load problem statements');
        console.error('Error loading problem statements:', err);
      } finally {
        setLoadingPs(false);
      }
    };
    fetchPs();
  }, []);

  /* ================================================================== */
  /*  CRITERIA MANAGEMENT                                               */
  /* ================================================================== */
  
  const addCriterion = () => {
    setCriteria((prev) => [...prev, { key: '', label: '', weight: 0 }]);
  };

  const removeCriterion = (index) => {
    if (criteria.length <= 1) return;
    setCriteria((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleCriterionChange = (index, field, value) => {
    const updated = [...criteria];
    if (field === 'label') {
      updated[index].label = value;
      updated[index].key = value
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
    } else if (field === 'weight') {
      updated[index].weight = parseFloat(value) || 0;
    }
    setCriteria(updated);
  };

  const normalizeWeights = () => {
    const total = criteria.reduce((sum, c) => sum + Number(c.weight || 0), 0);
    if (total > 0) {
      setCriteria(
        criteria.map((c) => ({
          ...c,
          weight: Math.round((c.weight / total) * 100),
        }))
      );
    }
  };

  const getTotalWeight = () => {
    return criteria.reduce((sum, c) => sum + Number(c.weight || 0), 0);
  };

  /* ================================================================== */
  /*  VALIDATION                                                        */
  /* ================================================================== */
  
  const validateInputs = () => {
    if (!selectedPsId) {
      return 'Please select a problem statement';
    }
    
    const totalWeight = getTotalWeight();
    if (Math.abs(totalWeight - 100) > 0.01) {
      return `Total weight must equal 100% (currently ${totalWeight.toFixed(1)}%). Use the Normalize button.`;
    }
    
    const invalidParams = criteria.filter(c => !c.label.trim());
    if (invalidParams.length > 0) {
      return 'All criteria must have a label';
    }
    
    return null;
  };

  /* ================================================================== */
  /*  REPOSITORY SEARCH                                                 */
  /* ================================================================== */
  
  const handleRepoSearch = async () => {
    const error = validateInputs();
    if (error) {
      setRepoError(error);
      return;
    }

    setLoadingRepo(true);
    setRepoError('');
    setRepoResults(null);
    setExpandedRepo(null);

    try {
      const payload = {
        ps_id: selectedPsId,
        top_k: topK,
        batch_size: batchSize,
        llm_provider: provider,
        criteria: criteria.map(c => ({
          key: c.key,
          label: c.label,
          weight: c.weight / 100, // Convert to decimal for backend
        })),
      };
      
      const { data } = await axios.post('/api/vendor_matching', payload);
      setRepoResults(data);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Error matching vendors from repository';
      setRepoError(errorMsg);
      console.error('Repository search error:', err);
    } finally {
      setLoadingRepo(false);
    }
  };

  /* ================================================================== */
  /*  WEB SEARCH                                                        */
  /* ================================================================== */
  
  const handleWebSearch = async () => {
    const error = validateInputs();
    if (error) {
      setWebError(error);
      return;
    }

    setLoadingWeb(true);
    setWebError('');
    setWebResults(null);
    setExpandedWeb(null);

    try {
      const payload = {
        ps_id: selectedPsId,
        count: webSearchCount,
        evaluation_params: criteria.map(c => ({
          name: c.label,
          weight: c.weight,
        })),
      };
      
      const { data } = await axios.post('/api/web_search_vendors', payload);
      setWebResults(data);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Error searching vendors on web';
      setWebError(errorMsg);
      console.error('Web search error:', err);
    } finally {
      setLoadingWeb(false);
    }
  };

  /* ================================================================== */
  /*  COMPARISON TABLE MANAGEMENT                                       */
  /* ================================================================== */
  
  const addToComparison = (vendor, source) => {
    const vendorWithSource = { ...vendor, source };
    const exists = comparisonVendors.some(
      v => v.vendor_id === vendor.vendor_id && v.source === source
    );
    
    if (!exists) {
      setComparisonVendors(prev => [...prev, vendorWithSource]);
    }
  };

  const removeFromComparison = (vendor, source) => {
    setComparisonVendors(prev =>
      prev.filter(v => !(v.vendor_id === vendor.vendor_id && v.source === source))
    );
  };

  const isInComparison = (vendor, source) => {
    return comparisonVendors.some(
      v => v.vendor_id === vendor.vendor_id && v.source === source
    );
  };

  const clearComparison = () => {
    setComparisonVendors([]);
  };

  const exportComparisonToCSV = () => {
    const csvContent = [
      ['Source', 'Vendor Name', 'Vendor ID', 'Composite Score', ...criteria.map(c => c.label)].join(','),
      ...comparisonVendors.map(v => {
        const scores = criteria.map(c => {
          if (v.source === 'repository') {
            return (v[`${c.key}_score`] ?? 0).toFixed(1);
          } else {
            const scoreKey = getScoreKey(c.label);
            return (v[scoreKey] ?? 0).toFixed(1);
          }
        });
        return [
          v.source,
          `"${(v.name || 'Unnamed').replace(/"/g, '""')}"`,
          v.vendor_id || 'N/A',
          (v.composite_score || 0).toFixed(1),
          ...scores
        ].join(',');
      })
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendor_comparison_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  /* ================================================================== */
  /*  DOWNLOAD REPOSITORY RESULTS                                       */
  /* ================================================================== */
  
  const handleDownloadRepo = () => {
    if (!selectedPsId) return;
    const url = `/api/download_results/${selectedPsId}`;
    window.location.href = url;
  };

  /* ================================================================== */
  /*  UI UTILITIES                                                      */
  /* ================================================================== */
  
  const scoreColor = (score) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  const progressColor = (score) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getScoreKey = (paramName) => {
    return paramName.toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') + '_score';
  };

  /* ================================================================== */
  /*  RENDER LOADING STATE                                              */
  /* ================================================================== */
  
  if (loadingPs) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mx-auto mb-4"></div>
          <p className="text-white text-xl">Loading problem statements...</p>
        </div>
      </div>
    );
  }

  /* ================================================================== */
  /*  MAIN RENDER                                                       */
  /* ================================================================== */

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <div className="max-w-7xl mx-auto py-12 px-4 space-y-10">
        
        {/* ============================================================ */}
        {/*  HEADER                                                      */}
        {/* ============================================================ */}
        
        <div className="text-center space-y-2">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Vendor Matching & Discovery
          </h1>
          <p className="text-white/70 text-lg">
            Match vendors from your repository and discover new ones on the web
          </p>
        </div>

        {/* ============================================================ */}
        {/*  INPUT CONFIGURATION CARD                                    */}
        {/* ============================================================ */}
        
        <div className="bg-slate-800/50 backdrop-blur-lg shadow-2xl rounded-2xl p-8 border border-white/10">
          <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-2">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Configuration
          </h2>
          
          <div className="space-y-6">
            
            {/* Problem Statement Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Select Problem Statement <span className="text-red-400">*</span>
              </label>
              {psOptions.length === 0 ? (
                <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-4">
                  <p className="text-yellow-400 text-sm">
                    ⚠️ No problem statements available. Please create one first.
                  </p>
                </div>
              ) : (
                <select
                  value={selectedPsId}
                  onChange={(e) => setSelectedPsId(e.target.value)}
                  className="w-full p-4 rounded-lg bg-slate-700/50 text-white border border-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                >
                  <option value="">-- Choose a Problem Statement --</option>
                  {psOptions.map((ps) => (
                    <option key={ps.id} value={ps.id}>
                      {ps.title} (ID: {ps.id})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Scoring Criteria */}
            <div className="border-t border-white/10 pt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Evaluation Criteria
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={normalizeWeights}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-lg"
                  >
                    Normalize to 100%
                  </button>
                  <button
                    type="button"
                    onClick={addCriterion}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-lg"
                  >
                    + Add Criterion
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {criteria.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-white/5 p-4 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    <input
                      type="text"
                      placeholder="Criterion Name (e.g., Domain Fit)"
                      value={c.label}
                      onChange={(e) => handleCriterionChange(i, 'label', e.target.value)}
                      className="flex-1 bg-slate-700/50 border border-white/20 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={c.weight}
                      onChange={(e) => handleCriterionChange(i, 'weight', e.target.value)}
                      className="w-24 bg-slate-700/50 border border-white/20 text-white px-3 py-2 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="text-white/80 w-12 text-right font-semibold">
                      {c.weight}%
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCriterion(i)}
                      disabled={criteria.length <= 1}
                      className={`text-2xl ${
                        criteria.length <= 1
                          ? 'text-gray-600 cursor-not-allowed'
                          : 'text-red-400 hover:text-red-600'
                      }`}
                      title={criteria.length <= 1 ? 'At least one criterion required' : 'Remove criterion'}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-4 text-center">
                <span
                  className={`text-lg font-bold ${
                    Math.abs(getTotalWeight() - 100) < 0.01
                      ? 'text-green-400'
                      : 'text-yellow-400'
                  }`}
                >
                  Total Weight: {getTotalWeight().toFixed(1)}%
                  {Math.abs(getTotalWeight() - 100) > 0.01 && ' (Must equal 100%)'}
                </span>
              </div>
            </div>

            {/* Repository Search Settings */}
            <div className="border-t border-white/10 pt-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                </svg>
                Repository Search Settings
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Shortlist Size: <span className="text-blue-400 font-bold">{topK}</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={topK}
                    onChange={(e) => setTopK(Number(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>1</span>
                    <span>50</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Batch Size: <span className="text-blue-400 font-bold">{batchSize}</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>1</span>
                    <span>10</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Web Search Settings */}
            <div className="border-t border-white/10 pt-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                Web Search Settings
              </h3>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">
                  Number of Vendors to Find: <span className="text-purple-400 font-bold">{webSearchCount}</span>
                </label>
                <input
                  type="range"
                  min="3"
                  max="10"
                  value={webSearchCount}
                  onChange={(e) => setWebSearchCount(Number(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>3</span>
                  <span>10</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ============================================================ */}
        {/*  ACTION BUTTONS                                              */}
        {/* ============================================================ */}
        
        <div className="grid md:grid-cols-2 gap-6">
          <button
            onClick={handleRepoSearch}
            disabled={loadingRepo || !selectedPsId || psOptions.length === 0}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3 ${
              loadingRepo || !selectedPsId || psOptions.length === 0
                ? 'bg-gray-600 cursor-not-allowed text-white/60'
                : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
            }`}
          >
            {loadingRepo ? (
              <>
                <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-white"></div>
                <span>Searching Repository...</span>
              </>
            ) : (
              <>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                </svg>
                <span>Match Vendors from Repository</span>
              </>
            )}
          </button>

          <button
            onClick={handleWebSearch}
            disabled={loadingWeb || !selectedPsId || psOptions.length === 0}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3 ${
              loadingWeb || !selectedPsId || psOptions.length === 0
                ? 'bg-gray-600 cursor-not-allowed text-white/60'
                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
            }`}
          >
            {loadingWeb ? (
              <>
                <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-white"></div>
                <span>Searching Web...</span>
              </>
            ) : (
              <>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                <span>Search Vendors on Web</span>
              </>
            )}
          </button>
        </div>

        {/* ============================================================ */}
        {/*  REPOSITORY RESULTS                                          */}
        {/* ============================================================ */}
        
        {repoError && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-lg shadow-lg">
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold">{repoError}</span>
            </div>
          </div>
        )}

        {repoResults && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                </svg>
                Repository Matches
              </h2>
              <button
                onClick={handleDownloadRepo}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-all shadow-lg hover:shadow-xl"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download CSV
              </button>
            </div>

            {/* Summary Cards */}
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-slate-800/50 backdrop-blur-lg p-6 text-center rounded-xl shadow-xl border border-white/10">
                <p className="text-white/70 text-sm mb-1">Total Analyzed</p>
                <p className="text-4xl font-bold text-white">{repoResults.total_vendors_analyzed || 0}</p>
              </div>
              <div className="bg-slate-800/50 backdrop-blur-lg p-6 text-center rounded-xl shadow-xl border border-white/10">
                <p className="text-white/70 text-sm mb-1">Shortlisted</p>
                <p className="text-4xl font-bold text-cyan-400">{repoResults.shortlisted_vendors || 0}</p>
              </div>
              <div className="bg-slate-800/50 backdrop-blur-lg p-6 text-center rounded-xl shadow-xl border border-white/10">
                <p className="text-white/70 text-sm mb-1">Top Score</p>
                <p className={`text-4xl font-bold ${scoreColor(repoResults.top_composite_score || 0)}`}>
                  {(repoResults.top_composite_score || 0).toFixed(1)}
                </p>
              </div>
            </div>

            {/* Vendor Cards */}
            <div className="space-y-6">
              {repoResults.results && repoResults.results.map((vendor, idx) => {
                const vendorId = vendor.vendor_id || `repo_${idx}`;
                const inComparison = isInComparison({ ...vendor, vendor_id: vendorId }, 'repository');
                
                return (
                  <div
                    key={idx}
                    className={`bg-slate-800/50 backdrop-blur-lg p-6 rounded-xl transition-all border ${
                      expandedRepo === idx
                        ? 'border-blue-500 shadow-2xl scale-[1.01]'
                        : 'border-white/10 hover:border-blue-400 hover:shadow-xl'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={inComparison}
                          onChange={() => {
                            if (inComparison) {
                              removeFromComparison({ ...vendor, vendor_id: vendorId }, 'repository');
                            } else {
                              addToComparison({ ...vendor, vendor_id: vendorId }, 'repository');
                            }
                          }}
                          className="w-6 h-6 text-blue-600 rounded focus:ring-blue-500 cursor-pointer accent-blue-500"
                        />
                        <div>
                          <h3 className="text-xl font-bold text-white">{vendor.name || 'Unnamed Vendor'}</h3>
                          <p className="text-sm text-white/60">ID: {vendorId}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-sm text-white/70">Composite Score</p>
                          <p className={`text-3xl font-bold ${scoreColor(vendor.composite_score || 0)}`}>
                            {(vendor.composite_score || 0).toFixed(1)}
                          </p>
                        </div>
                        <button
                          onClick={() => setExpandedRepo(expandedRepo === idx ? null : idx)}
                          className="text-blue-400 hover:text-blue-300 font-medium px-4 py-2 rounded-lg hover:bg-blue-400/10 transition-all"
                        >
                          {expandedRepo === idx ? 'Hide ▲' : 'Details ▼'}
                        </button>
                      </div>
                    </div>

                    {/* Criterion Bars */}
                    <div className="mt-5 space-y-3">
                      {criteria.map((c) => {
                        const score = vendor[`${c.key}_score`] ?? 0;
                        return (
                          <div key={c.key} className="flex items-center gap-3">
                            <span className="text-sm text-white/80 w-40 font-medium">{c.label}</span>
                            <div className="flex-1 bg-white/10 rounded-full h-3 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${progressColor(score)}`}
                                style={{ width: `${score}%` }}
                              />
                            </div>
                            <span className={`text-sm font-bold w-12 text-right ${scoreColor(score)}`}>
                              {score.toFixed(0)}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Expanded Details */}
                    {expandedRepo === idx && (
                      <div className="mt-6 pt-6 border-t border-white/20 space-y-5 text-sm animate-fadeIn">
                        <div>
                          <p className="font-semibold text-white/90 mb-2">Justification</p>
                          <p className="text-white/70 leading-relaxed">
                            {vendor.justification || 'No justification provided'}
                          </p>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                          <div>
                            <p className="font-semibold text-green-400 mb-2 flex items-center gap-2">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Strengths
                            </p>
                            <ul className="list-disc list-inside text-white/70 space-y-1">
                              {vendor.strengths?.length ? (
                                vendor.strengths.map((s, i) => <li key={i}>{s}</li>)
                              ) : (
                                <li className="text-white/50">None identified</li>
                              )}
                            </ul>
                          </div>
                          <div>
                            <p className="font-semibold text-red-400 mb-2 flex items-center gap-2">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              Concerns
                            </p>
                            <ul className="list-disc list-inside text-white/70 space-y-1">
                              {vendor.concerns?.length ? (
                                vendor.concerns.map((c, i) => <li key={i}>{c}</li>)
                              ) : (
                                <li className="text-white/50">None identified</li>
                              )}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  WEB SEARCH RESULTS                                          */}
        {/* ============================================================ */}
        
        {webError && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-lg shadow-lg">
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-semibold">{webError}</span>
            </div>
          </div>
        )}

        {webResults && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                Web Search Results
              </h2>
              <div className="flex gap-4 text-sm">
                <span className="text-gray-400">
                  Found: <span className="text-purple-400 font-semibold">{webResults.total_found || 0}</span>
                </span>
                <span className="text-gray-400">•</span>
                <span className="text-gray-400">
                  Sources: <span className="text-blue-400 font-semibold">{webResults.sources_count || 0}</span>
                </span>
              </div>
            </div>

            {/* Vendor Cards */}
            <div className="space-y-6">
              {webResults.vendors && webResults.vendors.map((vendor, idx) => {
                const vendorId = vendor.name?.replace(/\s+/g, '_').toLowerCase() || `web_${idx}`;
                const inComparison = isInComparison({ ...vendor, vendor_id: vendorId }, 'web');
                
                return (
                  <div
                    key={idx}
                    className={`bg-slate-800/50 backdrop-blur-lg p-6 rounded-xl transition-all border ${
                      expandedWeb === idx
                        ? 'border-purple-500 shadow-2xl scale-[1.01]'
                        : 'border-white/10 hover:border-purple-400 hover:shadow-xl'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <input
                          type="checkbox"
                          checked={inComparison}
                          onChange={() => {
                            if (inComparison) {
                              removeFromComparison({ ...vendor, vendor_id: vendorId }, 'web');
                            } else {
                              addToComparison({ ...vendor, vendor_id: vendorId }, 'web');
                            }
                          }}
                          className="w-6 h-6 text-purple-600 rounded focus:ring-purple-500 cursor-pointer accent-purple-500"
                        />
                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-white">
                            {idx + 1}. {vendor.name || 'Unnamed Vendor'}
                          </h3>
                          {vendor.description && (
                            <p className="text-sm text-white/70 mt-1 line-clamp-2">{vendor.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-sm text-white/70">Composite Score</p>
                          <p className={`text-3xl font-bold ${scoreColor(vendor.composite_score || 0)}`}>
                            {(vendor.composite_score || 0).toFixed(1)}
                          </p>
                        </div>
                        <button
                          onClick={() => setExpandedWeb(expandedWeb === idx ? null : idx)}
                          className="text-purple-400 hover:text-purple-300 font-medium px-4 py-2 rounded-lg hover:bg-purple-400/10 transition-all"
                        >
                          {expandedWeb === idx ? 'Hide ▲' : 'Details ▼'}
                        </button>
                      </div>
                    </div>

                    {/* Criterion Bars */}
                    <div className="mt-5 space-y-3">
                      {criteria.map((c) => {
                        const scoreKey = getScoreKey(c.label);
                        const score = vendor[scoreKey] ?? 0;
                        return (
                          <div key={c.key} className="flex items-center gap-3">
                            <span className="text-sm text-white/80 w-40 font-medium">{c.label}</span>
                            <div className="flex-1 bg-white/10 rounded-full h-3 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${progressColor(score)}`}
                                style={{ width: `${score}%` }}
                              />
                            </div>
                            <span className={`text-sm font-bold w-12 text-right ${scoreColor(score)}`}>
                              {score.toFixed(0)}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Expanded Details */}
                    {expandedWeb === idx && (
                      <div className="mt-6 pt-6 border-t border-white/20 space-y-5 text-sm animate-fadeIn">
                        {vendor.justification && (
                          <div>
                            <p className="font-semibold text-white/90 mb-2">Analysis</p>
                            <p className="text-white/70 leading-relaxed italic bg-white/5 p-3 rounded-lg">
                              {vendor.justification}
                            </p>
                          </div>
                        )}

                        <div className="grid md:grid-cols-2 gap-6">
                          <div>
                            <p className="font-semibold text-green-400 mb-2 flex items-center gap-2">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Strengths
                            </p>
                            <ul className="list-disc list-inside text-white/70 space-y-1">
                              {vendor.strengths?.length ? (
                                vendor.strengths.map((s, i) => <li key={i}>{s}</li>)
                              ) : (
                                <li className="text-white/50">None identified</li>
                              )}
                            </ul>
                          </div>
                          <div>
                            <p className="font-semibold text-yellow-400 mb-2 flex items-center gap-2">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              Concerns
                            </p>
                            <ul className="list-disc list-inside text-white/70 space-y-1">
                              {vendor.concerns?.length ? (
                                vendor.concerns.map((c, i) => <li key={i}>{c}</li>)
                              ) : (
                                <li className="text-white/50">None identified</li>
                              )}
                            </ul>
                          </div>
                        </div>

                        {/* Web Sources */}
                        {vendor.web_sources?.length > 0 && (
                          <div className="pt-4 border-t border-white/10">
                            <p className="font-semibold text-blue-400 mb-3 flex items-center gap-2">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                              </svg>
                              Web Sources ({vendor.web_sources.length})
                            </p>
                            <div className="space-y-2">
                              {vendor.web_sources.map((src, i) => (
                                <a
                                  key={i}
                                  href={src.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-start gap-2 text-sm text-blue-400 hover:text-blue-300 hover:underline p-3 bg-white/5 rounded-lg transition-all hover:bg-white/10 group"
                                >
                                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                  <span className="break-all">{src.url}</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  COMPARISON TABLE                                            */}
        {/* ============================================================ */}
        
        {comparisonVendors.length > 0 && (
          <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 backdrop-blur-lg border-2 border-blue-500/50 rounded-2xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Comparison Table
              </h2>
              <div className="flex gap-3 items-center">
                <span className="text-white/80">
                  {comparisonVendors.length} vendor{comparisonVendors.length > 1 ? 's' : ''} selected
                </span>
                <button
                  onClick={clearComparison}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-lg"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-white/20">
                    <th className="py-4 px-4 font-semibold text-white bg-white/5">Source</th>
                    <th className="py-4 px-4 font-semibold text-white bg-white/5">Vendor Name</th>
                    <th className="py-4 px-4 font-semibold text-white text-center bg-white/5">Composite</th>
                    {criteria.map((c) => (
                      <th key={c.key} className="py-4 px-4 font-semibold text-white text-center bg-white/5">
                        {c.label}
                      </th>
                    ))}
                    <th className="py-4 px-4 font-semibold text-white text-center bg-white/5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonVendors.map((vendor, idx) => {
                    const compositeScore = vendor.composite_score || 0;
                    return (
                      <tr key={idx} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                        <td className="py-4 px-4">
                          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                            vendor.source === 'repository' 
                              ? 'bg-blue-600 text-white' 
                              : 'bg-purple-600 text-white'
                          }`}>
                            {vendor.source === 'repository' ? (
                              <>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                                </svg>
                                Repository
                              </>
                            ) : (
                              <>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                </svg>
                                Web
                              </>
                            )}
                          </span>
                        </td>
                        <td className="py-4 px-4 font-medium text-white max-w-xs truncate">
                          {vendor.name || 'Unnamed'}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className={`text-lg font-bold ${scoreColor(compositeScore)}`}>
                            {compositeScore.toFixed(1)}
                          </span>
                        </td>
                        {criteria.map((c) => {
                          let score;
                          if (vendor.source === 'repository') {
                            score = vendor[`${c.key}_score`] ?? 0;
                          } else {
                            const scoreKey = getScoreKey(c.label);
                            score = vendor[scoreKey] ?? 0;
                          }
                          return (
                            <td key={c.key} className="py-4 px-4 text-center">
                              <span className={`font-semibold ${scoreColor(score)}`}>
                                {score.toFixed(0)}
                              </span>
                            </td>
                          );
                        })}
                        <td className="py-4 px-4 text-center">
                          <button
                            onClick={() => removeFromComparison(vendor, vendor.source)}
                            className="text-red-400 hover:text-red-300 font-medium text-xs px-3 py-1 border border-red-400 rounded-lg hover:bg-red-400/10 transition-colors"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Export Options */}
            <div className="mt-6 pt-6 border-t border-white/20 flex justify-end gap-3">
              <button
                onClick={exportComparisonToCSV}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-all shadow-lg hover:shadow-xl"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export Comparison (CSV)
              </button>
            </div>
          </div>
        )}

        {/* Footer Spacing */}
        <div className="h-10"></div>

      </div>
    </div>
  );
};

export default UnifiedVendorPage;