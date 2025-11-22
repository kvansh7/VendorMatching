import os
import logging
import traceback
from flask import Blueprint, jsonify
from database.connection import client, vendors_collection, ps_collection, vendor_capabilities_collection, ps_analysis_collection

logger = logging.getLogger(__name__)

health_bp = Blueprint('health', __name__)

@health_bp.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        client.admin.command('ping')
        return jsonify({
            "status": "healthy",
            "database": "connected",
            "embedding_model": os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small")
        }), 200
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({"status": "unhealthy", "database": "disconnected", "error": str(e)}), 503


@health_bp.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    """Get dashboard statistics"""
    try:
        vendors = list(vendors_collection.find())
        ps_list = list(ps_collection.find())
        cached_analyses = (
            vendor_capabilities_collection.count_documents({}) +
            ps_analysis_collection.count_documents({})
        )

        # Sort by _id (which contains timestamp) in descending order and get last 3
        recent_vendors_docs = list(vendors_collection.find().sort("_id", -1).limit(3))
        recent_ps_docs = list(ps_collection.find().sort("_id", -1).limit(3))
        
        recent_vendors = [v['name'] for v in recent_vendors_docs]
        recent_ps = [ps['title'] for ps in recent_ps_docs]

        data = {
            "total_vendors": len(vendors),
            "total_ps": len(ps_list),
            "cached_analyses": cached_analyses,
            "recent_vendors": recent_vendors,
            "recent_ps": recent_ps
        }
        return jsonify(data), 200
    except Exception as e:
        logger.error(f"Dashboard error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": "Failed to fetch dashboard data"}), 500

@health_bp.route('/api/clear_cache', methods=['POST'])
def clear_cache():
    """Clear all cached data"""
    try:
        vendor_capabilities_collection.delete_many({})
        ps_analysis_collection.delete_many({})
        return jsonify({"message": "Cache cleared successfully"}), 200
    except Exception as e:
        logger.error(f"Cache clear error: {str(e)}")
        return jsonify({"error": "Failed to clear cache"}), 500
