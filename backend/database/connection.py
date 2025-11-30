import logging
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from config.settings import MONGODB_URI

logger = logging.getLogger(__name__)

# MongoDB setup with better connection handling
try:
    if not MONGODB_URI:
        raise ValueError("MONGODB_URI not found in environment variables")
    
    client = MongoClient(
        MONGODB_URI, 
        server_api=ServerApi('1'),
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=10000
    )
    # Test connection
    client.admin.command('ping')
    logger.info("MongoDB connection successful")
    
    db = client['vendor_matching_db']
    vendors_collection = db['vendors']
    ps_collection = db['problem_statements']
    vendor_capabilities_collection = db['vendor_capabilities']
    ps_analysis_collection = db['ps_analysis']
    vendor_embeddings_collection = db['vendor_embeddings']
    ps_embeddings_collection = db['ps_embeddings']
    users_collection = db['users']
    # LLM-specific collections
    vendor_capabilities_openai = db["vendor_capabilities_openai"]
    vendor_capabilities_gemini = db["vendor_capabilities_gemini"]
    vendor_capabilities_ollama = db["vendor_capabilities_ollama"]

    ps_analysis_openai = db["ps_analysis_openai"]
    ps_analysis_gemini = db["ps_analysis_gemini"]
    ps_analysis_ollama = db["ps_analysis_ollama"]
except Exception as e:
    logger.error(f"MongoDB connection failed: {str(e)}")
    raise
