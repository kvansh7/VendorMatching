import React from 'react';
import { Link } from 'react-router-dom';

function Home() {
  return (
    <div className="text-center py-20">
      {/* Hero Section */}
      <h2 className="hero-title mb-6">
        Intelligent Vendor <span className="text-white">Matching System</span>
      </h2>
      <p className="text-muted mb-10 max-w-2xl mx-auto">
        Streamline your vendor selection process with AI-powered matching, submissions, and analytics.
      </p>

      {/* Feature Cards */}
      <div className="grid md:grid-cols-3 gap-8 mb-20">
        {[
          {
            icon: "📊",
            title: "Dashboard Analytics",
            description: "Real-time insights and comprehensive metrics for vendor management",
            path: "/dashboard"
          },
          {
            icon: "🏢",
            title: "Vendor Submission",
            description: "Effortlessly submit and manage vendor information",
            path: "/vendor-submission"
          },
          {
            icon: "🔍",
            title: "Smart Matching",
            description: "AI-powered algorithms for the perfect vendor matches",
            path: "/vendor-matching"
          },
          {
            icon: "👀",
            title: "View Vendors",
            description: "Browse all registered vendors easily",
            path: "/vendors"
          },
          {
            icon: "📄",
            title: "View PS",
            description: "Check all project submissions quickly",
            path: "/view-ps"
          },
          {
            icon: "➕",
            title: "Add PS",
            description: "Submit new project submissions effortlessly",
            path: "/add-ps"
          }
        ].map((feature, i) => (
          <Link
            key={i}
            to={feature.path}
            className="glass-card hover:scale-105 transition-transform duration-300"
          >
            <div className="glow-icon mb-4">{feature.icon}</div>
            <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
            <p className="text-muted">{feature.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default Home;