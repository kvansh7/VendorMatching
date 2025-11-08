import React, { useState, useEffect } from "react";
import { useLLM } from '../context/LLMProviderContext'; // ✅ Import context

const VendorSearch = () => {
  const [problemStatements, setProblemStatements] = useState([]);
  const [selectedPsId, setSelectedPsId] = useState("");
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [loadingPs, setLoadingPs] = useState(true);

  const { provider } = useLLM(); // ✅ Get current LLM provider from context
  
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-5xl font-bold mb-8 text-center bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          🔍 Web Vendor Search
        </h1>

        <div className="bg-slate-800/50 backdrop-blur-lg shadow-2xl rounded-2xl p-8 mb-10 border border-white/10">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-300">
                Select Problem Statement
              </label>
              {loadingPs ? (
                <p className="text-gray-400 text-sm">Loading problem statements...</p>
              ) : (
                <select
                  value={selectedPsId}
                  onChange={(e) => setSelectedPsId(e.target.value)}
                  className="w-full p-3 rounded-lg bg-slate-700/50 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- Select a Problem Statement --</option>
                  {problemStatements.map((ps) => (
                    <option key={ps.id} value={ps.id}>
                      {ps.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-300">
                Number of Vendors (3-10)
              </label>
              <input
                type="number"
                min="3"
                max="10"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full p-3 rounded-lg bg-slate-700/50 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">Evaluation Parameters</h3>
                <div className="flex gap-2">
                  <button
                    onClick={normalizeWeights}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  >
                    Normalize to 100%
                  </button>
                  <button
                    onClick={addParameter}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  >
                    + Add Parameter
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {evaluationParams.map((param, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-white/5 p-4 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    <input
                      type="text"
                      placeholder="Parameter Name (e.g., Domain Fit)"
                      value={param.name}
                      onChange={(e) => handleParameterChange(i, "name", e.target.value)}
                      className="flex-1 bg-slate-700/50 border border-white/20 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={param.weight}
                      onChange={(e) => handleParameterChange(i, "weight", e.target.value)}
                      className="w-24 bg-slate-700/50 border border-white/20 text-white px-3 py-2 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="text-white/80 w-12 text-right font-semibold">
                      {param.weight}%
                    </span>
                    <button
                      onClick={() => removeParameter(i)}
                      disabled={evaluationParams.length <= 1}
                      className={`text-2xl ${
                        evaluationParams.length <= 1
                          ? "text-gray-600 cursor-not-allowed"
                          : "text-red-400 hover:text-red-600"
                      }`}
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
                      ? "text-green-400"
                      : "text-yellow-400"
                  }`}
                >
                  Total Weight: {getTotalWeight().toFixed(1)}%
                  {Math.abs(getTotalWeight() - 100) > 0.01 && " (Must equal 100%)"}
                </span>
              </div>
            </div>

            <button
              onClick={handleSearch}
              disabled={loading || !selectedPsId}
              className={`w-full py-3 rounded-lg font-semibold text-lg transition-all ${
                loading || !selectedPsId
                  ? "bg-gray-600 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg"
              }`}
            >
              {loading ? "🔄 Searching Web..." : "🔍 Search Vendors"}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-lg shadow-lg mb-6">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚠️</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {results && (
          <div className="space-y-6">
            <div className="bg-slate-800/50 backdrop-blur-lg rounded-xl p-6 border border-white/10">
              <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">
                Found {results.total_found} Vendors
              </h2>
              <div className="flex gap-4 text-sm text-gray-400">
                <span>Provider: <span className="text-purple-400 font-semibold">{results.llm_provider}</span></span>
                <span>•</span>
                <span>Sources: <span className="text-blue-400 font-semibold">{results.sources_count}</span></span>
                <span>•</span>
                <span>Top Score: <span className="text-green-400 font-semibold">{results.top_score?.toFixed(1)}</span></span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {results.vendors.map((vendor, index) => (
                <div
                  key={index}
                  className="bg-slate-800/50 backdrop-blur-lg border border-white/10 rounded-xl p-6 shadow-xl hover:shadow-2xl transition-all hover:scale-[1.02]"
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-2xl font-bold text-blue-400">
                      {index + 1}. {vendor.name}
                    </h3>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-green-400">
                        {vendor.composite_score?.toFixed(1)}
                      </div>
                      <div className="text-xs text-gray-400">Score</div>
                    </div>
                  </div>

                  <p className="text-gray-300 mb-4 leading-relaxed">
                    {vendor.description}
                  </p>

                  <div className="mb-4 space-y-2">
                    <h4 className="text-sm font-semibold text-gray-300 mb-2">Individual Scores:</h4>
                    {evaluationParams.map((param, idx) => {
                      const scoreKey = getScoreKey(param.name);
                      const score = vendor[scoreKey];
                      return (
                        <div key={idx} className="flex justify-between items-center">
                          <span className="text-sm text-gray-400">{param.name}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                                style={{ width: `${score}%` }}
                              />
                            </div>
                            <span className="text-sm font-semibold text-white w-12 text-right">
                              {score?.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {vendor.justification && (
                    <div className="mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
                      <h4 className="text-sm font-semibold text-gray-300 mb-1">Analysis:</h4>
                      <p className="text-sm text-gray-400 italic">{vendor.justification}</p>
                    </div>
                  )}

                  {vendor.strengths?.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-sm font-semibold text-green-400 mb-2">✓ Strengths:</h4>
                      <ul className="list-disc list-inside text-sm text-gray-300 space-y-1">
                        {vendor.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {vendor.concerns?.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-yellow-400 mb-2">⚠ Concerns:</h4>
                      <ul className="list-disc list-inside text-sm text-gray-300 space-y-1">
                        {vendor.concerns.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {vendor.web_sources?.length > 0 && (
                    <div className="pt-3 border-t border-white/10">
                      <h4 className="text-sm font-semibold text-gray-400 mb-2">🌐 Sources:</h4>
                      <div className="space-y-1">
                        {vendor.web_sources.map((src, i) => (
                          <a
                            key={i}
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:text-blue-300 hover:underline block truncate"
                          >
                            {src.url}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VendorSearch;