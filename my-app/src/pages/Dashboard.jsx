import React, { useEffect, useState } from 'react';
import axios from 'axios';

const Dashboard = () => {
  const [data, setData] = useState({
    total_vendors: 0,
    total_ps: 0,
    cached_analyses: 0,
    recent_vendors: [],
    recent_ps: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get('/api/dashboard');
        setData(res.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to load dashboard');
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <p className="text-center text-white">Loading...</p>;
  if (error) return <p className="text-red-500 text-center">{error}</p>;

  return (
    <div className="space-y-12">
      <h1 className="text-3xl font-bold text-white mb-6 text-center">System Overview</h1>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="glass-card text-center p-6">
          <p className="text-muted mb-2">Total Vendors</p>
          <p className="text-4xl font-bold text-white">{data.total_vendors}</p>
        </div>
        <div className="glass-card text-center p-6">
          <p className="text-muted mb-2">Total Problem Statements</p>
          <p className="text-4xl font-bold text-white">{data.total_ps}</p>
        </div>
        <div className="glass-card text-center p-6">
          <p className="text-muted mb-2">Cached Analyses</p>
          <p className="text-4xl font-bold text-white">{data.cached_analyses}</p>
        </div>
      </div>

      {/* Recent Vendors */}
      <div className="glass-card p-6">
        <h2 className="text-xl font-bold text-white mb-4">Recent Vendors</h2>
        {data.recent_vendors.length > 0 ? (
          <ul className="list-disc pl-5 space-y-2 text-muted">
            {data.recent_vendors.map((v, i) => (
              <li key={i}>{v}</li>
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
              <li key={i}>{ps}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No recent problem statements.</p>
        )}
      </div>
    </div>
  );
};

export default Dashboard;