import os
import logging
import traceback
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from werkzeug.utils import secure_filename
from services.llm_service import get_llm_instance
from services.vendor_service import process_vendor_profile
from utils.helpers import validate_file, load_document, get_content_hash
from database.connection import vendors_collection, vendor_embeddings_collection, db

logger = logging.getLogger(__name__)

vendor_bp = Blueprint('vendor', __name__)

@vendor_bp.route('/api/vendor_submission', methods=['POST'])
@jwt_required()
def vendor_submission():
    """
    Submit and process vendor profile.
    Accepts:
      - form field 'vendor_name'
      - file 'file' (pdf/pptx/docx)
      - optional form field 'llm_provider' (openai/gemini/ollama)
    """
    try:
        llm_provider = request.form.get("llm_provider", os.getenv("LLM_PROVIDER", "openai")).lower()
        llm = get_llm_instance(llm_provider)

        if 'file' not in request.files or not request.form.get('vendor_name'):
            return jsonify({"error": "Vendor name and file are required"}), 400

        vendor_name = request.form.get('vendor_name').strip()
        if not vendor_name or len(vendor_name) > 100:
            return jsonify({"error": "Invalid vendor name (max 100 characters)"}), 400

        file = request.files['file']
        validate_file(file)

        # Read file and extract text
        file_bytes = file.read()
        file_ext = secure_filename(file.filename).rsplit('.', 1)[1].lower()
        text = load_document(file_bytes, file_ext)

        # Store vendor raw data
        vendor_data = {"name": vendor_name, "text": text}
        vendors_collection.update_one({"name": vendor_name}, {"$set": vendor_data}, upsert=True)

        # Process and cache with multi-LLM analysis + single OpenAI embedding
        capabilities, embedding = process_vendor_profile(vendor_name, text, llm, llm_provider)

        logger.info(f"✅ Vendor '{vendor_name}' onboarded successfully ({llm_provider})")
        return jsonify({
            "message": f"Vendor '{vendor_name}' onboarded successfully!",
            "llm_provider": llm_provider
        }), 200

    except ValueError as ve:
        logger.warning(f"Validation error: {str(ve)}")
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        logger.error(f"Vendor submission error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": "Failed to process vendor submission"}), 500


@vendor_bp.route('/api/vendors', methods=['GET'])
@jwt_required()
def get_all_vendors():
    """Get all vendors with provider-specific capabilities"""
    try:
        llm_provider = request.args.get('llm_provider', 'openai').lower()
        
        # Validate provider
        if llm_provider not in ['openai', 'gemini']:
            llm_provider = 'openai'
        
        # Get base vendors
        vendors = list(vendors_collection.find())
        
        # Get provider-specific capabilities collection
        capabilities_collection_name = f'vendor_capabilities_{llm_provider}'
        capabilities_collection = db[capabilities_collection_name]
        
        enriched_vendors = []
        for vendor in vendors:
            vendor_hash = get_content_hash(f"{vendor['name']}:{vendor['text']}")
            
            # Get capabilities from provider-specific collection
            capabilities_doc = capabilities_collection.find_one({"content_hash": vendor_hash})
            capabilities = capabilities_doc.get("data") if capabilities_doc else None
            
            # Get embedding (shared collection)
            embedding_doc = vendor_embeddings_collection.find_one({"content_hash": vendor_hash})
            has_embedding = embedding_doc is not None
            
            vendor_info = {
                "name": vendor["name"],
                "text_preview": vendor["text"][:500] + "..." if len(vendor["text"]) > 500 else vendor["text"],
                "full_text_length": len(vendor["text"]),
                "capabilities": capabilities,
                "has_embedding": has_embedding
            }
            enriched_vendors.append(vendor_info)
        
        return jsonify({
            "total": len(enriched_vendors),
            "vendors": enriched_vendors,
            "llm_provider": llm_provider
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching vendors: {str(e)}")
        return jsonify({"error": "Failed to fetch vendors"}), 500


@vendor_bp.route('/api/vendors/<vendor_name>', methods=['GET'])
@jwt_required()
def get_vendor_details(vendor_name):
    """Get detailed vendor information with provider-specific capabilities"""
    try:
        llm_provider = request.args.get('llm_provider', 'openai').lower()
        
        # Validate provider
        if llm_provider not in ['openai', 'gemini']:
            llm_provider = 'openai'
        
        # Get base vendor
        vendor = vendors_collection.find_one({"name": vendor_name})
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404
        
        vendor_hash = get_content_hash(f"{vendor['name']}:{vendor['text']}")
        
        # Get provider-specific capabilities
        capabilities_collection_name = f'vendor_capabilities_{llm_provider}'
        capabilities_collection = db[capabilities_collection_name]
        capabilities_doc = capabilities_collection.find_one({"content_hash": vendor_hash})
        capabilities = capabilities_doc.get("data") if capabilities_doc else None
        
        # Get embedding (shared collection)
        embedding_doc = vendor_embeddings_collection.find_one({"content_hash": vendor_hash})
        has_embedding = embedding_doc is not None
        embedding_dimensions = 0
        
        if has_embedding and "embedding" in embedding_doc:
            embedding_dimensions = len(embedding_doc["embedding"])
        
        vendor_details = {
            "name": vendor["name"],
            "full_text": vendor["text"],
            "text_length": len(vendor["text"]),
            "capabilities": capabilities,
            "has_embedding": has_embedding,
            "embedding_dimensions": embedding_dimensions,
            "llm_provider": llm_provider
        }
        
        return jsonify(vendor_details), 200
        
    except Exception as e:
        logger.error(f"Error fetching vendor details: {str(e)}")
        return jsonify({"error": "Failed to fetch vendor details"}), 500


@vendor_bp.route('/api/vendors/<vendor_name>', methods=['DELETE'])
@jwt_required()
def delete_vendor(vendor_name):
    """Delete vendor and ALL associated data from all LLM providers"""
    try:
        # Find vendor
        vendor = vendors_collection.find_one({"name": vendor_name})
        if not vendor:
            return jsonify({"error": "Vendor not found"}), 404
        
        vendor_hash = get_content_hash(f"{vendor['name']}:{vendor['text']}")
        
        # Delete from base vendors collection
        vendors_collection.delete_one({"name": vendor_name})
        
        # Delete from ALL provider-specific capabilities collections
        for provider in ['openai', 'gemini']:
            capabilities_collection_name = f'vendor_capabilities_{provider}'
            capabilities_collection = db[capabilities_collection_name]
            capabilities_collection.delete_one({"content_hash": vendor_hash})
        
        # Delete from shared embeddings collection
        vendor_embeddings_collection.delete_one({"content_hash": vendor_hash})
        
        logger.info(f"✅ Deleted vendor '{vendor_name}' and all associated data")
        return jsonify({
            "message": f"Vendor '{vendor_name}' deleted successfully",
            "deleted_from": ["vendors", "vendor_capabilities_openai", "vendor_capabilities_gemini", "vendor_embeddings"]
        }), 200
        
    except Exception as e:
        logger.error(f"Error deleting vendor: {str(e)}")
        return jsonify({"error": "Failed to delete vendor"}), 500