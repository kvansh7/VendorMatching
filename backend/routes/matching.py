import os
import io
import json
import logging
import traceback
from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required
from bson import json_util
from services.llm_service import get_llm_instance
from services.vendor_service import process_vendor_profile, process_problem_statement
from services.matching_service import shortlist_vendors, evaluate_shortlist
from services.search_service import search_vendors_with_openai, evaluate_web_vendors
from utils.helpers import (
    get_content_hash, load_cached_analysis, load_embedding, 
    save_embedding, create_text_representation, get_llm_collections
)
from utils.validators import validate_matching_params, validate_evaluation_params
from services.embedding_service import get_embedding
from database.connection import (
    ps_collection, vendors_collection, ps_embeddings_collection, 
    vendor_embeddings_collection
)

logger = logging.getLogger(__name__)

matching_bp = Blueprint('matching', __name__)

@matching_bp.route('/api/vendor_matching', methods=['POST'])
@jwt_required()
def vendor_matching():
    """
    Match vendors to a problem statement with multi-criteria dynamic evaluation.
    Uses provider-specific text analysis collections (OpenAI/Gemini/Ollama)
    and shared embeddings collections (OpenAI-based).
    """
    try:
        data = request.json or {}
        llm_provider = data.get("llm_provider", os.getenv("LLM_PROVIDER", "openai")).lower()
        llm = get_llm_instance(llm_provider)

        ps_id = data.get("ps_id")
        top_k = int(data.get("top_k", 20))
        batch_size = int(data.get("batch_size", 5))
        criteria = data.get("criteria", [])  # Optional evaluation criteria

        validate_matching_params(top_k, batch_size)

        logger.info(f"🚀 Vendor matching started | PS ID: {ps_id} | LLM Provider: {llm_provider}")

        # --- Get provider-specific collections ---
        collections = get_llm_collections(llm_provider)
        vendor_capabilities_collection = collections["vendor_capabilities"]
        ps_analysis_collection = collections["ps_analysis"]

        # --- Fetch problem statement ---
        selected_ps = ps_collection.find_one({"id": ps_id})
        if not selected_ps:
            return jsonify({"error": "Problem statement not found"}), 404

        problem_statement = selected_ps["full_statement"]
        vendors = list(vendors_collection.find())
        if not vendors:
            return jsonify({"error": "No vendors available"}), 400

        # --- Load PS analysis ---
        ps_hash = get_content_hash(problem_statement)
        ps_analysis = load_cached_analysis(ps_analysis_collection, ps_hash)

        if not ps_analysis:
            logger.info(f"🧩 PS analysis not found, processing with {llm_provider}")
            ps_analysis, ps_embedding = process_problem_statement(problem_statement, llm, llm_provider)
        else:
            ps_embedding = load_embedding(ps_embeddings_collection, ps_hash)
            if ps_embedding is None:
                logger.info(f"🧠 Generating missing PS embedding (OpenAI)")
                text_representation = create_text_representation(ps_analysis)
                ps_embedding = get_embedding(text_representation)
                save_embedding(ps_embeddings_collection, ps_hash, ps_embedding)
            else:
                logger.info(f"✅ Using cached PS analysis and embedding ({llm_provider})")

        # --- Process all vendors ---
        vendor_capabilities = []
        vendor_embeddings = []
        vendors_processed = 0
        vendors_from_cache = 0

        for vendor in vendors:
            vendor_hash = get_content_hash(f"{vendor['name']}:{vendor['text']}")

            cap = load_cached_analysis(vendor_capabilities_collection, vendor_hash)
            emb = load_embedding(vendor_embeddings_collection, vendor_hash)

            if cap is None or emb is None:
                logger.info(f"⚙️ Processing vendor (not cached): {vendor['name']} [{llm_provider}]")
                cap, emb = process_vendor_profile(vendor["name"], vendor["text"], llm, llm_provider)
                vendors_processed += 1
            else:
                vendors_from_cache += 1
                logger.info(f"✅ Cached vendor: {vendor['name']} [{llm_provider}]")

            vendor_capabilities.append(cap)
            vendor_embeddings.append(emb)

        logger.info(f"Cache stats — from_cache={vendors_from_cache}, new={vendors_processed}")

        # --- Shortlist vendors using embeddings ---
        shortlist = shortlist_vendors(ps_embedding, vendor_embeddings, vendor_capabilities, top_k=top_k)
        logger.info(f"🏆 Shortlisted {len(shortlist)} vendors")

        # --- Evaluate shortlisted vendors ---
        final_results = evaluate_shortlist(
        ps_id=ps_id,
        shortlist=shortlist,
        llm=llm,
        llm_provider=llm_provider,
        batch_size=batch_size,
        criteria=criteria
        )
        logger.info(f"✅ Evaluation complete for {llm_provider}: {len(final_results)} vendors evaluated")

        # --- Build response ---
        selected_ps_serializable = json.loads(json_util.dumps(selected_ps))

        response = {
            "problem_statement": selected_ps_serializable,
            "results": final_results,
            "total_vendors_analyzed": len(vendors),
            "shortlisted_vendors": len(final_results),
            "top_composite_score": final_results[0]["composite_score"] if final_results else 0,
            "cache_stats": {
                "vendors_from_cache": vendors_from_cache,
                "vendors_processed": vendors_processed
            },
            "llm_provider": llm_provider
        }

        return jsonify(response), 200

    except ValueError as ve:
        logger.warning(f"Validation error: {str(ve)}")
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        logger.error(f"❌ Matching error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": "An internal error occurred during vendor matching"}), 500

@matching_bp.route('/api/download_results/<ps_id>', methods=['GET'])
@jwt_required()
def download_results(ps_id):
    """
    Download matching results as JSON.
    Optional query param: llm_provider (openai/gemini/ollama)
    """
    try:
        llm_provider = request.args.get("llm_provider", os.getenv("LLM_PROVIDER", "openai"))
        llm = get_llm_instance(llm_provider)

        selected_ps = ps_collection.find_one({"id": ps_id})
        if not selected_ps:
            return jsonify({"error": "Problem statement not found"}), 404

        problem_statement = selected_ps["full_statement"]
        vendors = list(vendors_collection.find())
        if not vendors:
            return jsonify({"error": "No vendors available"}), 400

        # Process and match using selected LLM
        ps_analysis, ps_embedding = process_problem_statement(problem_statement, llm, llm_provider)
        vendor_capabilities = []
        vendor_embeddings = []
        for vendor in vendors:
            cap, emb = process_vendor_profile(vendor["name"], vendor["text"], llm, llm_provider)
            vendor_capabilities.append(cap)
            vendor_embeddings.append(emb)

        shortlist = shortlist_vendors(ps_embedding, vendor_embeddings, vendor_capabilities)
        final_results = evaluate_shortlist(ps_id, shortlist, llm, llm_provider)

        # Convert to JSON-serializable format
        selected_ps_serializable = json.loads(json_util.dumps(selected_ps))
        results = {
            "problem_statement": selected_ps_serializable,
            "results": final_results,
            "generated_at": json_util.default({"$date": {"$numberLong": str(int(os.times().elapsed * 1000))}}),
            "llm_provider": llm_provider
        }
        results_json = json.dumps(results, indent=2, default=json_util.default)

        logger.info(f"Downloaded results for PS: {ps_id} (llm_provider={llm_provider})")
        return send_file(
            io.BytesIO(results_json.encode()),
            mimetype='application/json',
            as_attachment=True,
            download_name=f"matching_results_{ps_id}.json"
        )
    except Exception as e:
        logger.error(f"Download error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": "Failed to generate download"}), 500

@matching_bp.route('/api/web_search_vendors', methods=['POST', 'OPTIONS'])
@jwt_required()
def web_search_vendors():
    """
    Search web for vendors matching the problem statement.
    Uses collections: ps_analysis_[provider], problem_statements, etc.
    """
    if request.method == 'OPTIONS':
        return '', 200
    
    try:
        data = request.json
        ps_id = data.get('ps_id')
        count = int(data.get('count', 5))
        llm_provider = data.get('llm_provider', 'gemini').lower()  # Default to gemini
        evaluation_params = data.get('evaluation_params', [
            {'name': 'Domain Fit', 'weight': 40},
            {'name': 'Tools Fit', 'weight': 30},
            {'name': 'Experience', 'weight': 20},
            {'name': 'Scalability', 'weight': 10}
        ])
        
        # Validate
        if count < 3 or count > 10:
            return jsonify({"error": "count must be between 3 and 10"}), 400
        
        validate_evaluation_params(evaluation_params)
        
        logger.info(f"Web search request: PS={ps_id}, count={count}, provider={llm_provider}")
        
        # Fetch problem statement from 'problem_statements' collection
        selected_ps = ps_collection.find_one({"id": ps_id})
        if not selected_ps:
            return jsonify({"error": "Problem statement not found"}), 404
        
        problem_statement = selected_ps["full_statement"]
        ps_hash = get_content_hash(problem_statement)
        
        # Get provider-specific collections (e.g., ps_analysis_gemini)
        collections = get_llm_collections(llm_provider)
        ps_analysis_collection = collections["ps_analysis"]
        
        # Load or generate PS analysis for this provider
        ps_analysis = load_cached_analysis(ps_analysis_collection, ps_hash)
        
        if not ps_analysis or not any([
            ps_analysis.get('primary_technical_domains'),
            ps_analysis.get('required_tools_or_frameworks'),
            ps_analysis.get('key_technical_requirements')
        ]):
            logger.info(f"PS analysis missing/invalid for {llm_provider}, regenerating...")
            
            # Get LLM instance and generate analysis
            llm = get_llm_instance(llm_provider)
            ps_analysis, ps_embedding = process_problem_statement(
                problem_statement,
                llm,
                llm_provider
            )
            logger.info(f"✅ Generated PS analysis with {llm_provider}")
        else:
            logger.info(f"✅ Using cached PS analysis from ps_analysis_{llm_provider}")
        
        # Log analysis fields
        logger.info(f"PS Analysis - domains: {bool(ps_analysis.get('primary_technical_domains'))}, "
                   f"tools: {bool(ps_analysis.get('required_tools_or_frameworks'))}, "
                   f"reqs: {bool(ps_analysis.get('key_technical_requirements'))}")
        
        # Search web for vendors (always uses OpenAI)
        search_results = search_vendors_with_openai(
            problem_statement,
            ps_analysis,
            count
        )
        
        if not search_results["search_successful"]:
            return jsonify({
                "error": "Web search failed",
                "details": search_results.get("error", "Unknown error"),
                "search_results_raw": search_results.get("search_results_raw", "")
            }), 500
        
        web_vendors = search_results["vendors"]
        
        if not web_vendors:
            return jsonify({
                "message": "No vendors found in web search",
                "total_found": 0,
                "vendors": [],
                "sources_count": search_results["sources_count"],
                "top_score": 0,
                "search_results_preview": search_results.get("search_results_raw", "")[:500]
            }), 200
        
        logger.info(f"Found {len(web_vendors)} vendors from web search")
        
        # Evaluate vendors using selected LLM provider
        evaluated_vendors = evaluate_web_vendors(
            ps_analysis,
            web_vendors,
            evaluation_params,
            llm_provider
        )
        
        # Prepare response
        response = {
            "problem_statement_id": ps_id,
            "llm_provider": llm_provider,
            "total_found": len(evaluated_vendors),
            "sources_count": search_results["sources_count"],
            "top_score": evaluated_vendors[0]["composite_score"] if evaluated_vendors else 0,
            "vendors": evaluated_vendors,
            "evaluation_params": evaluation_params
        }
        
        logger.info(f"✅ Web search complete: {len(evaluated_vendors)} vendors evaluated")
        return jsonify(response), 200
        
    except ValueError as ve:
        logger.warning(f"Validation error: {str(ve)}")
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        logger.error(f"Web search vendors error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            "error": "An internal error occurred during web search",
            "details": str(e)
        }), 500
