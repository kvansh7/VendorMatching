import React, { useState, useEffect } from "react";

const VendorSearch = () => {
  const [problemStatements, setProblemStatements] = useState([]);
  const [selectedPsId, setSelectedPsId] = useState("");
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [loadingPs, setLoadingPs] = useState(true);

  // Fetch all problem statements
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

  const handleSearch = async (e) => {
    e.preventDefault();
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

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center">
      <h1 className="text-4xl font-bold mb-8 text-center text-blue-400">
        🔍 Vendor Matching System
      </h1>

      {/* Search Form */}
      <form
        onSubmit={handleSearch}
        className="bg-slate-800 shadow-lg rounded-xl p-6 w-full max-w-2xl mb-10"
      >
        {/* Problem Statement Selection */}
        <div className="mb-6">
          <label className="block text-sm mb-2 text-gray-300">
            Select Problem Statement
          </label>
          {loadingPs ? (
            <p className="text-gray-400 text-sm">Loading problem statements...</p>
          ) : (
            <select
              value={selectedPsId}
              onChange={(e) => setSelectedPsId(e.target.value)}
              className="w-full p-2 rounded bg-slate-700 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
              required
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

        {/* Count Input */}
        <div className="mb-6">
          <label className="block text-sm mb-2 text-gray-300">Number of Vendors</label>
          <input
            type="number"
            min="3"
            max="10"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full p-2 rounded bg-slate-700 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !selectedPsId}
          className={`w-full py-2 rounded-lg font-semibold transition-colors ${
            loading || !selectedPsId
              ? "bg-gray-600 cursor-not-allowed"
              : "bg-blue-500 hover:bg-blue-600"
          }`}
        >
          {loading ? "Searching..." : "Search Vendors"}
        </button>
      </form>

      {/* Error Message */}
      {error && (
        <div className="text-red-400 bg-slate-800 p-4 rounded-lg shadow max-w-2xl">
          ⚠️ {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="w-full max-w-5xl">
          <h2 className="text-2xl font-semibold mb-4 text-blue-300">
            Found {results.total_found} Vendors
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {results.vendors.map((vendor, index) => (
              <div
                key={index}
                className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow hover:shadow-lg transition-shadow"
              >
                <h3 className="text-xl font-bold text-blue-400 mb-2">
                  {vendor.name}
                </h3>
                <p className="text-gray-300 mb-3">{vendor.description}</p>

                <div className="mb-2 text-sm text-gray-400">
                  <strong>Composite Score:</strong>{" "}
                  <span className="text-green-400">
                    {vendor.composite_score?.toFixed(1)}
                  </span>
                </div>

                {vendor.strengths?.length > 0 && (
                  <div className="mb-2">
                    <strong className="text-gray-300 text-sm">Strengths:</strong>
                    <ul className="list-disc list-inside text-gray-400 text-sm">
                      {vendor.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {vendor.concerns?.length > 0 && (
                  <div className="mb-2">
                    <strong className="text-gray-300 text-sm">Concerns:</strong>
                    <ul className="list-disc list-inside text-gray-400 text-sm">
                      {vendor.concerns.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {vendor.web_sources?.length > 0 && (
                  <div className="mt-3 text-sm text-gray-400">
                    <strong>Sources:</strong>{" "}
                    {vendor.web_sources.map((src, i) => (
                      <a
                        key={i}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline block truncate"
                      >
                        🌐 {src.title || src.url}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorSearch;