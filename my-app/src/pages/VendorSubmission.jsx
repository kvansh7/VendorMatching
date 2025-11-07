import React, { useState } from 'react';
import axios from 'axios';

const VendorSubmission = () => {
  const [vendorName, setVendorName] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    if (!file) {
      setError('Please select a file to upload.');
      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append('vendor_name', vendorName);
    formData.append('file', file);

    try {
      const res = await axios.post('/api/vendor_submission', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessage(res.data.message);
      setVendorName('');
      setFile(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Error submitting vendor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-16">
      <h1 className="text-3xl font-bold text-white text-center mb-8">
        🏢 Vendor Submission
      </h1>

      <div className="glass-card p-8 space-y-6 shadow-xl">
        {/* Vendor Name */}
        <div>
          <label className="block text-sm font-medium text-muted mb-1">
            Vendor Name
          </label>
          <input
            type="text"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            placeholder="Enter vendor name"
            className="w-full p-3 rounded-md bg-white/5 text-white placeholder:text-gray-400 border border-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
            required
          />
        </div>

        {/* File Upload */}
        <div>
          <label className="block text-sm font-medium text-muted mb-2">
            Upload Document (PDF, PPTX, DOCX)
          </label>
          <div className="flex items-center justify-center w-full">
            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-white/10 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-white/5 transition">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <svg
                  className="w-10 h-10 mb-3 text-white/50"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M12 12V4M8 8l4-4 4 4" />
                </svg>
                <p className="mb-2 text-sm text-white/60">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-white/40">PDF, PPTX, PPT, DOCX</p>
              </div>
              <input
                type="file"
                accept=".pdf,.pptx,.ppt,.docx"
                onChange={(e) => setFile(e.target.files[0])}
                className="hidden"
                required
              />
            </label>
          </div>
          {file && <p className="mt-2 text-sm text-white/70 text-center">Selected file: {file.name}</p>}
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          className={`w-full py-3 rounded-lg font-semibold text-white transition-all duration-300 ${
            loading ? 'bg-white/20 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
          }`}
          disabled={loading}
        >
          {loading ? 'Processing...' : 'Submit Vendor'}
        </button>

        {/* Status Message */}
        {message && <p className="mt-4 text-center text-green-400">{message}</p>}
        {error && <p className="mt-4 text-center text-red-400">{error}</p>}
      </div>
    </div>
  );
};

export default VendorSubmission;