import React, { useState, useEffect } from "react";
import { useLLM } from '../context/LLMProviderContext';

const VendorSearch = () => {
  const [problemStatements, setProblemStatements] = useState([]);
  const [selectedPsId, setSelectedPsId] = useState("");
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [loadingPs, setLoadingPs] = useState(true);
  const [expandedVendor, setExpandedVendor] = useState(null);

  const { provider } = useLLM();
  
  // Evaluation parameters (weights as percentages)
  const [evaluationParams, setEvaluationParams] = useState([
    { name: "Domain Fit", weight: 40 },
    { name: "Tools Fit", weight: 30 },
    { name: "Experience", weight: 20 },
    { name: "Scalability", weight: 10 },
  ]);

  useEffect(() => {
    const fetchProblemStatements = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/problem_statements");
        const data = await res.json();
        setProblemStatements(data);
      } catch (err) {
        setError("Failed to load problem statements");
      } finally {
        setLoadingPs(false);
      }
    };
    fetchProblemStatements();
  }, []);

  const addParameter = () => {
    setEvaluationParams((prev) => [...prev, { name: "", weight: 0 }]);
  };

  const removeParameter = (index) => {
    setEvaluationParams((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleParameterChange = (index, field, value) => {
    const updated = [...evaluationParams];
    if (field === "name") {
      updated[index].name = value;
    } else if (field === "weight") {
      updated[index].weight = parseFloat(value) || 0;
    }
    setEvaluationParams(updated);
  };

  const normalizeWeights = () => {
    const total = evaluationParams.reduce((sum, param) => sum + Number(param.weight || 0), 0);
    if (total > 0) {
      setEvaluationParams(
        evaluationParams.map((param) => ({
          ...param,
          weight: Math.round((param.weight / total) * 100),
        }))
      );
    }
  };

  const getTotalWeight = () => {
    return evaluationParams.reduce((sum, param) => sum + Number(param.weight || 0), 0);
  };

  const handleSearch = async () => {
    const totalWeight = getTotalWeight();
    if (Math.abs(totalWeight - 100) > 0.01) {
      setError(`Total weight must equal 100% (currently ${totalWeight}%). Use the Normalize button.`);
      return;
    }

    const invalidParams = evaluationParams.filter(p => !p.name.trim());
    if (invalidParams.length > 0) {
      setError("All parameters must have a name");
      return;
    }

    setLoading(true);
    setError("");
    setResults(null);

    try {
      const response = await fetch("http://localhost:5000/api/web_search_vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ps_id: selectedPsId,
          count: count,
          llm_provider: provider,
          evaluation_params: evaluationParams,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Server error");
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getScoreKey = (paramName) => {
    return paramName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') + '_score';
  };

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

  if (loadingPs) return <p className="text-center text-white">Loading problem statements…</p>;

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 space-y-10">
      {/* Header */}
      <h1 className="text-4xl font-bold text-white text-center">Web Vendor Search</h1>

      {/* No PS warning */}
      {problemStatements.length === 0 ? (
        <p className="text-center text-yellow-400 text-lg">
          No problem statements yet – submit one first.
        </p>
      ) : (
        <>
          {/* INPUT CARD */}
          <div className="glass-card p-8 rounded-2xl shadow-2xl bg-white/10 backdrop-blur-md border border-white/20">
            <div className="space-y-8">

              {/* Problem Statement */}
              <div>
                <label className="block text-sm font-semibold text-white/90 mb-2">
                  Select Problem Statement
                </label>
                <select
                  value={selectedPsId}
                  onChange={(e) => setSelectedPsId(e.target.value)}
                  className="w-full p-4 rounded-lg bg-gray-800 text-white border border-white/20 focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="" className="bg-gray-800 text-white">Choose…</option>
                  {problemStatements.map((ps) => (
                    <option key={ps.id} value={ps.id} className="bg-gray-800 text-white">
                      {ps.title} (ID: {ps.id})
                    </option>
                  ))}
                </select>
              </div>

              {/* Number of Vendors */}
              <div>
                <label className="block text-sm font-semibold text-white/90 mb-2">
                  Number of vendors to find: {count}
                </label>
                <input
                  type="range"
                  min="3"
                  max="10"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider-blue"
                  style={{
                    background: `linear-gradient(to right, #2563eb 0%, #2563eb ${((count - 3) / (10 - 3)) * 100}%, rgba(255,255,255,0.2) ${((count - 3) / (10 - 3)) * 100}%, rgba(255,255,255,0.2) 100%)`
                  }}
                />
              </div>

              {/* Evaluation Parameters */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-white">Evaluation Parameters</h3>
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
                      onClick={addParameter}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm"
                    >
                      + Add
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {evaluationParams.map((param, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 bg-white/5 p-3 rounded-lg border border-white/10"
                    >
                      <input
                        type="text"
                        placeholder="Parameter Name"
                        value={param.name}
                        onChange={(e) => handleParameterChange(i, "name", e.target.value)}
                        className="flex-1 bg-transparent border border-white/20 text-white px-3 py-2 rounded"
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={param.weight}
                        onChange={(e) => handleParameterChange(i, "weight", e.target.value)}
                        className="w-24 bg-transparent border border-white/20 text-white px-3 py-2 rounded text-center"
                      />
                      <span className="text-white/60 w-12 text-right">
                        {param.weight}%
                      </span>
                      <button
                        type="button"
                        onClick={() => removeParameter(i)}
                        className="text-red-400 hover:text-red-600 text-xl"
                        style={{ filter: 'hue-rotate(0deg) saturate(2) brightness(0.8)' }}
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 text-center">
                  {(() => {
                    const total = evaluationParams.reduce((sum, param) => sum + Number(param.weight || 0), 0);
                    const isExact = Math.abs(total - 100) < 0.01;
                    return (
                      <span className={`text-lg font-bold ${isExact ? 'text-green-400' : total > 100 ? 'text-red-400' : 'text-yellow-400'}`}>
                        Total: {total.toFixed(1)}% 
                        {isExact ? ' (Perfect!)' : total > 100 ? ' (Too High)' : ' (Too Low)'}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSearch}
                disabled={loading || !selectedPsId}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                  loading || !selectedPsId
                    ? 'bg-white/20 cursor-not-allowed text-white/60'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg'
                }`}
              >
                {loading ? 'Searching Web…' : 'Search Vendors'}
              </button>
            </div>

            {error && <p className="text-red-400 text-center mt-4 font-medium">{error}</p>}
          </div>

          {/* RESULTS */}
          {results && (
            <div className="space-y-10">
              {/* Header */}
              <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-white">Web Search Results</h2>
                <div className="flex gap-4 text-sm">
                  <span className="text-white/70">
                    Found: <span className="text-blue-400 font-semibold">{results.total_found || 0}</span>
                  </span>
                </div>
              </div>

              {/* Vendor List */}
              <div className="space-y-6">
                {results.vendors && results.vendors.map((vendor, idx) => (
                  <div
                    key={idx}
                    className="glass-card p-6 rounded-xl transition-all border-l-4 border-transparent hover:border-blue-400 hover:shadow-xl"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-xl font-bold text-white">
                          {idx + 1}. {vendor.name || 'Unnamed Vendor'}
                        </h3>
                        {vendor.description && (
                          <p className="text-sm text-white/60 mt-1">{vendor.description}</p>
                        )}
                      </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm text-white/70">Score</p>
                        <p className={`text-3xl font-bold ${scoreColor(vendor.composite_score || 0)}`}>
                          {(vendor.composite_score || 0).toFixed(1)}%
                        </p>
                      </div>
                      <button
                        onClick={() => setExpandedVendor(expandedVendor === idx ? null : idx)}
                        className="text-blue-400 hover:text-blue-300 font-medium px-4 py-2 rounded-lg hover:bg-blue-400/10 transition-all"
                      >
                        {expandedVendor === idx ? 'Hide ▲' : 'Details ▼'}
                      </button>
                    </div>
                    </div>

                    {/* Parameter Bars */}
                    <div className="mt-5 space-y-3">
                      {evaluationParams.map((param) => {
                        const scoreKey = getScoreKey(param.name);
                        const score = vendor[scoreKey] ?? 0;
                        return (
                          <div key={param.name} className="flex items-center gap-3">
                            <span className="text-sm text-white/80 w-40 font-medium">{param.name}</span>
                            <div className="flex-1 bg-white/10 rounded-full h-3">
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
                    {expandedVendor === idx && (
                      <div className="mt-6 pt-6 border-t border-white/20 space-y-5 text-sm">
                        {/* Analysis */}
                        {vendor.justification && (
                          <div>
                            <p className="font-semibold text-white/90 mb-2">Analysis</p>
                            <p className="text-white/70 leading-relaxed">
                              {vendor.justification}
                            </p>
                          </div>
                        )}

                        {/* Strengths and Concerns */}
                        {(vendor.strengths?.length > 0 || vendor.concerns?.length > 0) && (
                          <div className="grid md:grid-cols-2 gap-6">
                            {vendor.strengths?.length > 0 && (
                              <div>
                                <p className="font-semibold text-green-400 mb-2">Strengths</p>
                                <ul className="list-disc list-inside text-white/70 space-y-1">
                                  {vendor.strengths.map((s, i) => <li key={i}>{s}</li>)}
                                </ul>
                              </div>
                            )}
                            {vendor.concerns?.length > 0 && (
                              <div>
                                <p className="font-semibold text-red-400 mb-2">Concerns</p>
                                <ul className="list-disc list-inside text-white/70 space-y-1">
                                  {vendor.concerns.map((c, i) => <li key={i}>{c}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Web Sources */}
                        {vendor.web_sources?.length > 0 && (
                          <div className="pt-4 border-t border-white/10">
                            <p className="font-semibold text-blue-400 mb-3 text-sm">
                              Web Sources ({vendor.web_sources?.length || 0})
                            </p>
                            <div className="space-y-2">
                              {vendor.web_sources?.slice(0, 3).map((src, i) => (
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
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VendorSearch;