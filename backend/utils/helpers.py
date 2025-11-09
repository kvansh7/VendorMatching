import os
import json
import hashlib
import tempfile
import logging
import numpy as np
from typing import Dict, Any
from bson import json_util
from langchain_community.document_loaders import (
    PyPDFLoader,
    UnstructuredPowerPointLoader,
    Docx2txtLoader
)
from config.settings import ALLOWED_EXTENSIONS
from database.connection import client

logger = logging.getLogger(__name__)

def serialize_mongo_doc(doc):
    return json.loads(json_util.dumps(doc)) if doc else None


def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def validate_file(file) -> bool:
    from flask import current_app
    if not file or not file.filename:
        raise ValueError("No file provided")
    if not allowed_file(file.filename):
        raise ValueError(f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size == 0:
        raise ValueError("File is empty")
    if size > current_app.config['MAX_CONTENT_LENGTH']:
        raise ValueError(f"File too large. Max size: {current_app.config['MAX_CONTENT_LENGTH'] / (1024*1024):.1f}MB")
    return True


def load_document(file_bytes: bytes, file_extension: str) -> str:
    """Extract text from uploaded document."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_extension}") as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        if file_extension.lower() == "pdf":
            loader = PyPDFLoader(tmp_path)
        elif file_extension.lower() in ["pptx", "ppt"]:
            loader = UnstructuredPowerPointLoader(tmp_path)
        elif file_extension.lower() == "docx":
            loader = Docx2txtLoader(tmp_path)
        else:
            raise ValueError("Unsupported file type")

        docs = loader.load()
        text = "\n".join([doc.page_content for doc in docs])
        if not text.strip():
            raise ValueError("Empty or invalid document")
        return text
    finally:
        try:
            os.remove(tmp_path)
        except Exception as e:
            logger.warning(f"Failed to delete temp file {tmp_path}: {str(e)}")


def get_content_hash(content: str) -> str:
    return hashlib.sha256(content.encode()).hexdigest()


def load_cached_analysis(collection, content_hash: str) -> Dict[str, Any]:
    try:
        doc = collection.find_one({"content_hash": content_hash})
        return doc.get("data") if doc else None
    except Exception as e:
        logger.error(f"Error loading cached analysis: {str(e)}")
        return None


def save_analysis(collection, content_hash: str, data: Dict[str, Any]):
    try:
        collection.update_one(
            {"content_hash": content_hash},
            {"$set": {"content_hash": content_hash, "data": data}},
            upsert=True
        )
    except Exception as e:
        logger.error(f"Error saving analysis: {str(e)}")


def load_embedding(collection, content_hash: str) -> np.ndarray:
    try:
        doc = collection.find_one({"content_hash": content_hash})
        if doc and "embedding" in doc:
            return np.array(doc["embedding"])
        return None
    except Exception as e:
        logger.error(f"Error loading cached embedding: {str(e)}")
        return None


def save_embedding(collection, content_hash: str, embedding: np.ndarray):
    try:
        collection.update_one(
            {"content_hash": content_hash},
            {"$set": {"content_hash": content_hash, "embedding": embedding.tolist()}},
            upsert=True
        )
    except Exception as e:
        logger.error(f"Error saving embedding: {str(e)}")


def create_text_representation(data: Dict[str, Any]) -> str:
    parts = []
    for key, value in data.items():
        if key != "name":
            parts.append(f"{key}: {json.dumps(value)}" if isinstance(value, (list, dict)) else f"{key}: {value}")
    return " ".join(parts)

def get_llm_collections(provider: str):
    """
    Get provider-specific MongoDB collections.
    Matches your actual collection names in the database.
    """
    db = client["vendor_matching_db"]
    
    # Normalize provider name
    provider = provider.lower().strip()
    
    # Validate provider
    if provider not in ['openai', 'gemini', 'ollama']:
        logger.warning(f"Invalid provider '{provider}', defaulting to 'gemini'")
        provider = 'gemini'
    
    collections = {
        "vendor_capabilities": db[f"vendor_capabilities_{provider}"],
        "ps_analysis": db[f"ps_analysis_{provider}"]
    }
    
    logger.info(f"Using collections: vendor_capabilities_{provider}, ps_analysis_{provider}")
    return collections
