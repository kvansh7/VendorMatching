import os
import hashlib
import logging
import traceback
from flask import Blueprint, request, jsonify
from services.llm_service import get_llm_instance
from services.vendor_service import process_problem_statement
from utils.helpers import get_content_hash
from database.connection import ps_collection, ps_embeddings_collection, db

logger = logging.getLogger(__name__)

ps_bp = Blueprint('problem_statement', __name__)

@ps_bp.route('/api/ps_submission', methods=['POST'])
def ps_submission():
    """
    Submit and process a problem statement.
    Body JSON should include: title, description, outcomes
    Optional: llm_provider in body (openai/gemini/ollama)
    """
    try:
        data = request.json or {}
        llm_provider = data.get("llm_provider", os.getenv("LLM_PROVIDER", "openai")).lower()
        llm = get_llm_instance(llm_provider)

        title = data.get('title', '').strip()
        description = data.get('description', '').strip()
        outcomes = data.get('outcomes', '').strip()

        if not title or not description or not outcomes:
            return jsonify({"error": "Title, description, and outcomes are required"}), 400

        if len(title) > 200:
            return jsonify({"error": "Title too long (max 200 characters)"}), 400

        # Create PS ID and structure
        ps_id = hashlib.md5(title.encode()).hexdigest()[:8]
        problem_statement = f"Title: {title}\nDescription: {description}\nOutcomes: {outcomes}"
        ps_data = {
            "id": ps_id,
            "title": title,
            "description": description,
            "outcomes": outcomes,
            "full_statement": problem_statement
        }

        # Store main PS metadata
        ps_collection.update_one({"id": ps_id}, {"$set": ps_data}, upsert=True)

        # Process using selected LLM (analysis stored per-LLM, embeddings stored in common ps_embeddings)
        analysis, embedding = process_problem_statement(problem_statement, llm, llm_provider)

        logger.info(f"✅ PS '{title}' processed successfully (llm_provider={llm_provider})")
        return jsonify({
            "message": f"Problem Statement '{title}' processed and cached!",
            "ps_id": ps_id,
            "llm_provider": llm_provider
        }), 200

    except ValueError as ve:
        logger.warning(f"Validation error: {str(ve)}")
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        logger.error(f"PS submission error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": "Failed to process problem statement"}), 500


@ps_bp.route('/api/problem_statements', methods=['GET'])
def get_problem_statements():
    """Get all problem statements with provider-specific analysis info"""
    try:
        llm_provider = request.args.get('llm_provider', 'openai').lower()
        
        # Validate provider
        if llm_provider not in ['openai', 'gemini']:
            llm_provider = 'openai'
        
        # Get all problem statements
        ps_list = list(ps_collection.find().sort("_id", -1))
        
        # Get provider-specific analysis collection
        analysis_collection_name = f'ps_analysis_{llm_provider}'
        analysis_collection = db[analysis_collection_name]
        
        enriched_ps = []
        for ps in ps_list:
            ps_hash = get_content_hash(ps['full_statement'])
            
            # Check if analysis exists for this provider
            analysis_doc = analysis_collection.find_one({"content_hash": ps_hash})
            has_analysis = analysis_doc is not None
            
            # Get basic analysis data (just to show preview)
            analysis_preview = None
            if has_analysis and analysis_doc.get("data"):
                analysis_data = analysis_doc["data"]
                # Get first 2 fields for preview
                analysis_preview = {
                    k: v for k, v in list(analysis_data.items())[:2] 
                    if k not in ['llm_provider', '_hash']
                }
            
            # Check if embedding exists (shared collection)
            embedding_doc = ps_embeddings_collection.find_one({"content_hash": ps_hash})
            has_embedding = embedding_doc is not None
            
            ps_info = {
                "id": ps["id"],
                "title": ps["title"],
                "description": ps.get("description", ""),
                "outcomes": ps.get("outcomes", ""),
                "has_analysis": has_analysis,
                "analysis": analysis_preview,
                "has_embedding": has_embedding
            }
            enriched_ps.append(ps_info)
        
        
        logger.info(f"✅ Fetched {len(enriched_ps)} problem statements (provider: {llm_provider})")
        return jsonify(enriched_ps), 200
        
    except Exception as e:
        logger.error(f"Error fetching problem statements: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": "Failed to fetch problem statements"}), 500


@ps_bp.route('/api/problem_statements/<ps_id>', methods=['GET'])
def get_problem_statement_details(ps_id):
    """Get detailed problem statement information with provider-specific analysis"""
    try:
        llm_provider = request.args.get('llm_provider', 'openai').lower()
        
        # Validate provider
        if llm_provider not in ['openai', 'gemini']:
            llm_provider = 'openai'
        
        # Get base problem statement
        ps = ps_collection.find_one({"id": ps_id})
        if not ps:
            return jsonify({"error": "Problem statement not found"}), 404
        
        ps_hash = get_content_hash(ps['full_statement'])
        
        # Get provider-specific analysis
        analysis_collection_name = f'ps_analysis_{llm_provider}'
        analysis_collection = db[analysis_collection_name]
        analysis_doc = analysis_collection.find_one({"content_hash": ps_hash})
        analysis = analysis_doc.get("data") if analysis_doc else None
        
        # Get embedding (shared collection)
        embedding_doc = ps_embeddings_collection.find_one({"content_hash": ps_hash})
        has_embedding = embedding_doc is not None
        embedding_dimensions = 0
        
        if has_embedding and "embedding" in embedding_doc:
            embedding_dimensions = len(embedding_doc["embedding"])
        
        ps_details = {
            "id": ps["id"],
            "title": ps["title"],
            "description": ps.get("description", ""),
            "outcomes": ps.get("outcomes", ""),
            "full_statement": ps.get("full_statement", ""),
            "analysis": analysis,
            "has_embedding": has_embedding,
            "embedding_dimensions": embedding_dimensions,
            "llm_provider": llm_provider
        }
        
        logger.info(f"✅ Fetched details for PS: {ps_id} (provider: {llm_provider})")
        return jsonify(ps_details), 200
        
    except Exception as e:
        logger.error(f"Error fetching problem statement details: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": "Failed to fetch problem statement details"}), 500


@ps_bp.route('/api/problem_statements/<ps_id>', methods=['DELETE'])
def delete_problem_statement(ps_id):
    """Delete problem statement and ALL associated data from all LLM providers"""
    try:
        # Find problem statement
        ps = ps_collection.find_one({"id": ps_id})
        if not ps:
            return jsonify({"error": "Problem statement not found"}), 404
        
        ps_hash = get_content_hash(ps['full_statement'])
        
        # Delete from base problem statements collection
        ps_collection.delete_one({"id": ps_id})
        
        # Delete from ALL provider-specific analysis collections
        deleted_from = ["problem_statements"]
        for provider in ['openai', 'gemini']:
            analysis_collection_name = f'ps_analysis_{provider}'
            analysis_collection = db[analysis_collection_name]
            result = analysis_collection.delete_one({"content_hash": ps_hash})
            if result.deleted_count > 0:
                deleted_from.append(analysis_collection_name)
        
        # Delete from shared embeddings collection
        result = ps_embeddings_collection.delete_one({"content_hash": ps_hash})
        if result.deleted_count > 0:
            deleted_from.append("ps_embeddings")
        
        logger.info(f"✅ Deleted problem statement '{ps['title']}' (ID: {ps_id}) and all associated data")
        return jsonify({
            "message": f"Problem statement deleted successfully",
            "deleted_from": deleted_from
        }), 200
        
    except Exception as e:
        logger.error(f"Error deleting problem statement: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": "Failed to delete problem statement"}), 500