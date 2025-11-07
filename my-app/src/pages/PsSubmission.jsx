import React, { useState } from 'react';
import axios from 'axios';

const PsSubmission = () => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [outcomes, setOutcomes] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const res = await axios.post('/api/ps_submission', {
        title,
        description,
        outcomes,
      });
      setMessage(res.data.message);
      setTitle('');
      setDescription('');
      setOutcomes('');
    } catch (err) {
      setError(err.response?.data?.error || 'Error submitting PS');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-16">
      <h1 className="text-3xl font-bold text-white text-center mb-8">
        Submit Problem Statement (PS)
      </h1>

      <div className="glass-card p-8 space-y-6 shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted mb-1">Project Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-3 rounded-md bg-white/5 text-white placeholder:text-gray-400 border border-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
              placeholder="Enter project title"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">Project Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-3 rounded-md bg-white/5 text-white placeholder:text-gray-400 border border-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 h-32"
              placeholder="Describe your project"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-muted mb-1">Expected Outcomes</label>
            <textarea
              value={outcomes}
              onChange={(e) => setOutcomes(e.target.value)}
              className="w-full p-3 rounded-md bg-white/5 text-white placeholder:text-gray-400 border border-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 h-24"
              placeholder="Expected results of the project"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 rounded-lg font-semibold text-white transition-all duration-300 ${
              loading
                ? 'bg-white/20 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? 'Processing...' : 'Submit PS'}
          </button>
        </form>

        {message && <p className="text-green-400 mt-4 text-center">{message}</p>}
        {error && <p className="text-red-400 mt-4 text-center">{error}</p>}
      </div>
    </div>
  );
};

export default PsSubmission;