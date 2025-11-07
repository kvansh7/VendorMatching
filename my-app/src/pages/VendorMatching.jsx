import React, { useState, useEffect } from 'react';
import axios from 'axios';

const VendorMatching = () => {
  /* ------------------------------------------------------------------ */
  /*  STATE                                                             */
  /* ------------------------------------------------------------------ */
  const [psOptions, setPsOptions] = useState([]);
  const [selectedPsId, setSelectedPsId] = useState('');
  const [topK, setTopK] = useState(20);
  const [batchSize, setBatchSize] = useState(5);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadingPs, setLoadingPs] = useState(true);
  const [expandedVendor, setExpandedVendor] = useState(null);
  const [selectedVendors, setSelectedVendors] = useState([]);

  // LLM provider (persisted per page)
  const [provider, setProvider] = useState(() => localStorage.getItem('llm_provider') || 'openai');

  // Dynamic criteria
  const [criteria, setCriteria] = useState([
    { key: 'domain_fit', label: 'Domain Fit', weight: 0.4 },
    { key: 'tools_fit', label: 'Tools Fit', weight: 0.3 },
    { key: 'experience', label: 'Experience', weight: 0.2 },
    { key: 'scalability', label: 'Scalability', weight: 0.1 },
  ]);

  /* ------------------------------------------------------------------ */
  /*  EFFECTS                                                          */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    localStorage.setItem('llm_provider', provider);
  }, [provider]);

  useEffect(() => {
    const fetchPs = async () => {
      try {
        const { data } = await axios.get('/api/problem_statements');
        setPsOptions(data);
      } catch {
        setError('Failed to load problem statements');
      } finally {
        setLoadingPs(false);
      }
    };
    fetchPs();
  }, []);

  /* ------------------------------------------------------------------ */
  /*  CRITERIA HELPERS                                                 */
  /* ------------------------------------------------------------------ */
  const addCriterion = () => setCriteria((p) => [...p, { key: '', label: '', weight: 0 }]);

  const removeCriterion = (i) => setCriteria((p) => p.filter((_, idx) => idx !== i));

  const handleCriterionChange = (i, field, value) => {
    const updated = [...criteria];
    updated[i][field] = value;
    if (field === 'label') {
      updated[i].key = value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    }
    setCriteria(updated);
  };

  const normalizeWeights = () => {
    const total = criteria.reduce((s, c) => s + Number(c.weight || 0), 0);
    if (total > 0) {
      setCriteria(criteria.map((c) => ({
        ...c,
        weight: parseFloat((c.weight / total).toFixed(3)),
      })));
    }
  };

  /* ------------------------------------------------------------------ */
  /*  SUBMIT                                                            */
  /* ------------------------------------------------------------------ */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResults(null);
    setExpandedVendor(null);
    setSelectedVendors([]);

    if (!selectedPsId) {
      setError('Please select a problem statement');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        ps_id: selectedPsId,
        top_k: topK,
        batch_size: batchSize,
        llm_provider: provider,
        criteria,
      };
      const { data } = await axios.post('/api/vendor_matching', payload);
      setResults(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error matching vendors');
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  DOWNLOAD & SELECTION                                              */
  /* ------------------------------------------------------------------ */
  const handleDownload = () => {
    const url = `/api/download_results/${selectedPsId}?llm_provider=${encodeURIComponent(provider)}`;
    window.location.href = url;
  };

  const toggleSelect = (i) =>
    setSelectedVendors((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));

  /* ------------------------------------------------------------------ */
  /*  UI HELPERS                                                       */
  /* ------------------------------------------------------------------ */
  const scoreColor = (s) => {
    if (s >= 80) return 'text-green-400';
    if (s >= 60) return 'text-yellow-400';
    if (s >= 40) return 'text-orange-400';
    return 'text-red-400';
  };
  const progressColor = (s) => {
    if (s >= 80) return 'bg-green-500';
    if (s >= 60) return 'bg-yellow-500';
    if (s >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  /* ------------------------------------------------------------------ */
  /*  RENDER                                                            */
  /* ------------------------------------------------------------------ */
  if (loadingPs) return <p className="text-center text-white">Loading problem statements…</p>;
  if (error && !psOptions.length) return <p className="text-center text-red-400">{error}</p>;

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 space-y-10">
      {/* Header */}
      <h1 className="text-4xl font-bold text-white text-center">Vendor Matching</h1>

      {/* LLM Provider */}
      <div className="flex justify-center">
        <label className="text-white/80 mr-3 self-center text-lg">LLM Provider:</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
          <option value="ollama">Ollama</option>
        </select>
      </div>

      {/* No PS warning */}
      {psOptions.length === 0 ? (
        <p className="text-center text-yellow-400 text-lg">
          No problem statements yet – submit one first.
        </p>
      ) : (
        <>
          {/* INPUT CARD */}
          <div className="glass-card p-8 rounded-2xl shadow-2xl bg-white/10 backdrop-blur-md border border-white/20">
            <form onSubmit={handleSubmit} className="space-y-8">

              {/* Problem Statement */}
              <div>
                <label className="block text-sm font-semibold text-white/90 mb-2">
                  Select Problem Statement
                </label>
                <select
                  required
                  value={selectedPsId}
                  onChange={(e) => setSelectedPsId(e.target.value)}
                  className="w-full p-4 rounded-lg bg-white/5 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">Choose…</option>
                  {psOptions.map((ps) => (
                    <option key={ps.id} value={ps.id}>
                      {ps.title} (ID: {ps.id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Scoring Criteria */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-white">Scoring Criteria</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={normalizeWeights}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm"
                    >
                      Normalize
                    </button>
                    <button
                      type="button"
                      onClick={addCriterion}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm"
                    >
                      + Add
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {criteria.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 bg-white/5 p-3 rounded-lg border border-white/10"
                    >
                      <input
                        type="text"
                        placeholder="Label"
                        value={c.label}
                        onChange={(e) => handleCriterionChange(i, 'label', e.target.value)}
                        className="flex-1 bg-transparent border border-white/20 text-white px-3 py-2 rounded"
                      />
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={c.weight}
                        onChange={(e) => handleCriterionChange(i, 'weight', parseFloat(e.target.value) || 0)}
                        className="w-24 bg-transparent border border-white/20 text-white px-3 py-2 rounded text-center"
                      />
                      <span className="text-white/60 w-12 text-right">
                        {(c.weight * 100).toFixed(0)}%
                      </span>
                      <button
                        type="button"
                        onClick={() => removeCriterion(i)}
                        className="text-red-400 hover:text-red-600 text-xl"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sliders */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-white/90 mb-2">
                    Shortlist size: {topK}
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    value={topK}
                    onChange={(e) => setTopK(Number(e.target.value))}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white/90 mb-2">
                    Batch size: {batchSize}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !selectedPsId}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                  loading || !selectedPsId
                    ? 'bg-white/20 cursor-not-allowed text-white/60'
                    : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg'
                }`}
              >
                {loading ? 'Matching…' : 'Match Vendors'}
              </button>
            </form>

            {error && <p className="text-red-400 text-center mt-4 font-medium">{error}</p>}
          </div>

          {/* RESULTS --------------------------------------------------- */}
          {results && (
            <div className="space-y-10">

              {/* Header + Download */}
              <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-white">Match Results</h2>
                <button
                  onClick={handleDownload}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download CSV
                </button>
              </div>

              {/* Summary Cards */}
              <div className="grid md:grid-cols-3 gap-6">
                <div className="glass-card p-6 text-center rounded-xl shadow-xl">
                  <p className="text-white/70 text-sm">Total Analyzed</p>
                  <p className="text-4xl font-bold text-white mt-1">{results.total_vendors_analyzed}</p>
                </div>
                <div className="glass-card p-6 text-center rounded-xl shadow-xl">
                  <p className="text-white/70 text-sm">Shortlisted</p>
                  <p className="text-4xl font-bold text-white mt-1">{results.shortlisted_vendors}</p>
                </div>
                <div className="glass-card p-6 text-center rounded-xl shadow-xl">
                  <p className="text-white/70 text-sm">Top Score</p>
                  <p className={`text-4xl font-bold mt-1 ${scoreColor(results.top_composite_score)}`}>
                    {results.top_composite_score.toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Vendor List */}
              <div className="space-y-6">
                {results.results.map((vendor, idx) => (
                  <div
                    key={idx}
                    className={`glass-card p-6 rounded-xl transition-all border-l-4 ${
                      expandedVendor === idx
                        ? 'border-blue-500 shadow-2xl scale-[1.01]'
                        : 'border-transparent hover:border-blue-400 hover:shadow-xl'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={selectedVendors.includes(idx)}
                          onChange={() => toggleSelect(idx)}
                          className="w-6 h-6 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                        />
                        <div>
                          <h3 className="text-xl font-bold text-white">{vendor.name || 'Unnamed Vendor'}</h3>
                          <p className="text-sm text-white/60">ID: {vendor.vendor_id || '—'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-sm text-white/70">Score</p>
                          <p className={`text-3xl font-bold ${scoreColor(vendor.composite_score)}`}>
                            {vendor.composite_score.toFixed(1)}%
                          </p>
                        </div>
                        <button
                          onClick={() => setExpandedVendor(expandedVendor === idx ? null : idx)}
                          className="text-blue-400 hover:text-blue-300 font-medium"
                        >
                          {expandedVendor === idx ? 'Hide' : 'Details'}
                        </button>
                      </div>
                    </div>

                    {/* Criterion Bars */}
                    <div className="mt-5 space-y-3">
                      {criteria.map((c) => {
                        const s = vendor[`${c.key}_score`] ?? 0;
                        return (
                          <div key={c.key} className="flex items-center gap-3">
                            <span className="text-sm text-white/80 w-40 font-medium">{c.label}</span>
                            <div className="flex-1 bg-white/10 rounded-full h-3">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${progressColor(s)}`}
                                style={{ width: `${s}%` }}
                              />
                            </div>
                            <span className={`text-sm font-bold w-12 text-right ${scoreColor(s)}`}>
                              {s.toFixed(0)}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Expanded Details */}
                    {expandedVendor === idx && (
                      <div className="mt-6 pt-6 border-t border-white/20 space-y-5 text-sm">
                        <div>
                          <p className="font-semibold text-white/90 mb-2">Justification</p>
                          <p className="text-white/70 leading-relaxed">
                            {vendor.justification || '—'}
                          </p>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                          <div>
                            <p className="font-semibold text-green-400 mb-2">Strengths</p>
                            <ul className="list-disc list-inside text-white/70 space-y-1">
                              {vendor.strengths?.length ? (
                                vendor.strengths.map((s, i) => <li key={i}>{s}</li>)
                              ) : (
                                <li className="text-white/50">None identified</li>
                              )}
                            </ul>
                          </div>
                          <div>
                            <p className="font-semibold text-red-400 mb-2">Concerns</p>
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
                ))}
              </div>

              {/* Selected Vendors Footer */}
              {selectedVendors.length > 0 && (
                <div className="glass-card p-5 bg-blue-900/30 border border-blue-500 rounded-xl">
                  <p className="text-white font-medium">
                    Selected {selectedVendors.length} vendor{selectedVendors.length > 1 ? 's' : ''} for outreach.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VendorMatching;