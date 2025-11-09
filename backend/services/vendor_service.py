import logging
from typing import Dict, Any, Tuple
import numpy as np
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from utils.helpers import (
    get_content_hash, load_cached_analysis, save_analysis, 
    load_embedding, save_embedding, create_text_representation, get_llm_collections
)
from services.embedding_service import get_embedding
from database.connection import vendor_embeddings_collection, ps_embeddings_collection

logger = logging.getLogger(__name__)

def process_vendor_profile(vendor_name: str, vendor_text: str, llm, llm_provider: str) -> Tuple[Dict[str, Any], np.ndarray]:
    """
    Extract vendor capabilities using the selected LLM (OpenAI, Gemini, or Ollama)
    and generate embeddings using OpenAI (stored in a shared embeddings collection).
    """
    vendor_hash = get_content_hash(f"{vendor_name}:{vendor_text}")

    # --- Get provider-specific collection for capabilities ---
    collections = get_llm_collections(llm_provider)
    vendor_capabilities_collection = collections["vendor_capabilities"]

    # --- Check cached analysis in LLM-specific collection ---
    capabilities = load_cached_analysis(vendor_capabilities_collection, vendor_hash)
    if not capabilities:
        logger.info(f"🔍 Analyzing vendor capabilities for: {vendor_name} using {llm_provider}")

        prompt = PromptTemplate.from_template("""
        From this vendor profile, extract:
        1. Key technical domains (e.g., NLP, CV, ML)
        2. Tools and frameworks used
        3. Core capabilities (e.g., scalability, real-time processing)
        4. Industry experience
        5. Team size and project scale

        Vendor Profile: {vendor_text}

        Provide structured output in JSON format.
        """)
        chain = prompt | llm | JsonOutputParser()
        capabilities = chain.invoke({"vendor_text": vendor_text})
        capabilities["name"] = vendor_name
        capabilities["llm_provider"] = llm_provider
        save_analysis(vendor_capabilities_collection, vendor_hash, capabilities)
    else:
        logger.info(f"✅ Using cached vendor capabilities for {vendor_name} ({llm_provider})")

    # --- Check cached embedding (common OpenAI embeddings collection) ---
    embedding = load_embedding(vendor_embeddings_collection, vendor_hash)
    if embedding is None:
        logger.info(f"🧠 Generating embedding (OpenAI) for vendor: {vendor_name}")
        text_representation = create_text_representation(capabilities)
        embedding = get_embedding(text_representation)  # always OpenAI embedding
        save_embedding(vendor_embeddings_collection, vendor_hash, embedding)
    else:
        logger.info(f"✅ Using cached embedding (OpenAI) for vendor: {vendor_name}")

    return capabilities, embedding

def process_problem_statement(problem_statement: str, llm, llm_provider: str) -> Tuple[Dict[str, Any], np.ndarray]:
    """
    Analyze a problem statement using the selected LLM (OpenAI/Gemini/Ollama)
    and generate its embedding using OpenAI. 
    Analysis -> saved to provider-specific ps_analysis_<provider>
    Embedding -> saved to shared ps_embeddings collection
    """
    ps_hash = get_content_hash(problem_statement)

    # --- Get provider-specific analysis collection ---
    collections = get_llm_collections(llm_provider)
    ps_analysis_collection = collections["ps_analysis"]

    # --- Check cached analysis in provider-specific collection ---
    analysis = load_cached_analysis(ps_analysis_collection, ps_hash)
    if not analysis:
        logger.info(f"🧩 Analyzing problem statement with {llm_provider}")
        prompt = PromptTemplate.from_template("""
        Analyze this problem statement and extract:
        1. Primary technical domains (e.g., NLP, CV, ML)
        2. Required tools or frameworks
        3. Key technical requirements (e.g., real-time, accuracy)
        4. Deployment constraints (e.g., cloud, edge)
        5. Project complexity (e.g., research, production)

        Problem Statement: {problem_statement}

        Provide structured analysis in JSON format.
        """)
        chain = prompt | llm | JsonOutputParser()
        analysis = chain.invoke({"problem_statement": problem_statement})

        # tag + metadata
        analysis["llm_provider"] = llm_provider
        analysis["_hash"] = ps_hash

        save_analysis(ps_analysis_collection, ps_hash, analysis)
    else:
        logger.info(f"✅ Using cached problem statement analysis for provider={llm_provider}")

    # --- Check cached embedding in shared ps_embeddings collection ---
    embedding = load_embedding(ps_embeddings_collection, ps_hash)
    if embedding is None:
        logger.info(f"🧠 Generating embedding (OpenAI) for problem statement")
        text_representation = create_text_representation(analysis)
        # get_embedding should use OpenAI embeddings (per your design)
        embedding = get_embedding(text_representation)
        save_embedding(ps_embeddings_collection, ps_hash, embedding)
    else:
        logger.info("✅ Using cached problem statement embedding (shared OpenAI embeddings)")

    return analysis, embedding
