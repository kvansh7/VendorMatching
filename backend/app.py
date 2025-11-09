import os
import re
import json
import hashlib
import traceback
import logging
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
from typing import TypedDict, List, Dict, Any, Tuple
# LangChain & Models
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama
from langchain_community.document_loaders import (
    PyPDFLoader,
    UnstructuredPowerPointLoader,
    Docx2txtLoader
)
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi
from dotenv import load_dotenv
from bson import json_util
import tempfile
import io
from openai import OpenAI

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Initialize OpenAI client
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
# Configuration
app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('MAX_FILE_SIZE', 16 * 1024 * 1024))  # 16MB default
ALLOWED_EXTENSIONS = {'pdf', 'pptx', 'ppt', 'docx'}
TOP_K_LIMIT = int(os.getenv('TOP_K_LIMIT', 100))
BATCH_SIZE_LIMIT = int(os.getenv('BATCH_SIZE_LIMIT', 20))
OPENAI_EMBED_MODEL = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small")

# MongoDB setup with better connection handling
try:
    uri = os.getenv("MONGODB_URI")
    if not uri:
        raise ValueError("MONGODB_URI not found in environment variables")
    
    client = MongoClient(
        uri, 
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

# ============================================================================
# MODEL INITIALIZATION AND HELPERS (UPDATED)
# ============================================================================

from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama

# --- Replace MiniLM with OpenAI Embeddings ---
try:
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        raise ValueError("Missing OPENAI_API_KEY")

    embeddings = OpenAIEmbeddings(
        model=os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small"),
        api_key=openai_api_key
    )
    logger.info("✅ OpenAI embedding model initialized successfully.")
except Exception as e:
    logger.error(f"❌ Failed to initialize OpenAI embeddings: {str(e)}")
    raise


def get_llm_instance(provider: str):
    """Dynamically load LLM based on provider (openai, gemini, ollama)."""
    provider = (provider or "gemini").lower()
    try:
        if provider == "openai":
            return ChatOpenAI(
                model=os.getenv("OPENAI_MODEL", "gpt-5"),
                temperature=0,
                api_key=os.getenv("OPENAI_API_KEY")
            )
        elif provider == "gemini":
            os.environ["GOOGLE_API_KEY"] = os.getenv("GOOGLE_API_KEY")
            return ChatGoogleGenerativeAI(
                model=os.getenv("GEMINI_MODEL", "gemini-2.0-flash"),
                temperature=0
            )
        elif provider == "ollama":
            return ChatOllama(model=os.getenv("OLLAMA_MODEL", "llama3"), temperature=0)
        else:
            raise ValueError("Invalid LLM provider. Use: openai, gemini, or ollama.")
    except Exception as e:
        logger.error(f"❌ Error initializing LLM for {provider}: {str(e)}")
        raise


# --- Replace MiniLM encode() with OpenAI embeddings ---
def get_embedding(text: str) -> np.ndarray:
    """Generate embedding using OpenAI embedding model."""
    try:
        embedding = embeddings.embed_query(text)
        return np.array(embedding)
    except Exception as e:
        logger.error(f"❌ Embedding generation failed: {str(e)}")
        raise


# --- Update file/document helpers to remain same ---
def serialize_mongo_doc(doc):
    return json.loads(json_util.dumps(doc)) if doc else None


def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def validate_file(file) -> bool:
    if not file or not file.filename:
        raise ValueError("No file provided")
    if not allowed_file(file.filename):
        raise ValueError(f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size == 0:
        raise ValueError("File is empty")
    if size > app.config['MAX_CONTENT_LENGTH']:
        raise ValueError(f"File too large. Max size: {app.config['MAX_CONTENT_LENGTH'] / (1024*1024):.1f}MB")
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


# ============================================================================
# CORE PROCESSING FUNCTIONS (UPDATED)
# ============================================================================

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

def shortlist_vendors(
    ps_embedding: np.ndarray,
    vendor_embeddings: List[np.ndarray],
    vendor_capabilities: List[Dict[str, Any]],
    top_k: int = 20
) -> List[Dict[str, Any]]:
    """Calculate cosine similarity and shortlist top vendors."""
    similarities = cosine_similarity([ps_embedding], np.array(vendor_embeddings))[0]
    results = [
        {
            "name": cap["name"],
            "semantic_similarity_score": float(similarities[i]),
            "similarity_percentage": float(similarities[i]) * 100,
            "vendor_capabilities": cap
        }
        for i, cap in enumerate(vendor_capabilities)
    ]
    results.sort(key=lambda x: x["semantic_similarity_score"], reverse=True)
    return results[:top_k]


# --- Scoring weights (same as your original setup) ---

def calculate_composite_score(scores: Dict[str, float], weights: Dict[str, float]) -> float:
    """Compute weighted composite score using dynamic weights."""
    total = 0.0
    for key, weight in weights.items():
        total += scores.get(key, 0) * weight
    return round(total, 2)


def validate_matching_params(top_k: int, batch_size: int):
    """Ensure user parameters are within allowed limits."""
    if not isinstance(top_k, int) or not (1 <= top_k <= TOP_K_LIMIT):
        raise ValueError(f"top_k must be between 1 and {TOP_K_LIMIT}")
    if not isinstance(batch_size, int) or not (1 <= batch_size <= BATCH_SIZE_LIMIT):
        raise ValueError(f"batch_size must be between 1 and {BATCH_SIZE_LIMIT}")


def evaluate_shortlist(
    ps_id: str,
    shortlist: List[Dict[str, Any]],
    llm,
    llm_provider: str,
    batch_size: int = 5,
    criteria: List[Dict[str, Any]] = None
) -> List[Dict[str, Any]]:
    """
    Evaluate shortlisted vendors dynamically using the specified LLM provider.
    Automatically fetches provider-specific PS analysis and vendor capabilities.
    """
    # --- Get provider-specific collections ---
    collections = get_llm_collections(llm_provider)
    vendor_capabilities_collection = collections["vendor_capabilities"]
    ps_analysis_collection = collections["ps_analysis"]

    # --- Fetch problem statement master doc (global collection) ---
    ps_doc = ps_collection.find_one({"id": ps_id})
    if not ps_doc:
        raise ValueError(f"Problem statement ID '{ps_id}' not found")

    problem_statement = ps_doc.get("full_statement", "")
    ps_hash = get_content_hash(problem_statement)

    # --- Load provider-specific PS analysis (cached or generate) ---
    ps_analysis = load_cached_analysis(ps_analysis_collection, ps_hash)
    if not ps_analysis:
        logger.info(f"⚙️ PS analysis not found — generating for {llm_provider}")
        ps_analysis, _ = process_problem_statement(problem_statement, llm, llm_provider)
    else:
        logger.info(f"✅ Using cached PS analysis for provider={llm_provider}")

    # --- Default scoring criteria ---
    if not criteria or len(criteria) == 0:
        criteria = [
            {"key": "domain_fit", "label": "Domain Fit", "weight": 0.4},
            {"key": "tools_fit", "label": "Tools/Stack Fit", "weight": 0.3},
            {"key": "experience", "label": "Experience", "weight": 0.2},
            {"key": "scalability", "label": "Scalability", "weight": 0.1},
        ]

    json_fields = ",\n    ".join([f'"{c["key"]}": float' for c in criteria])
    criteria_lines = "\n".join([f"{i+1}. {c['label']} (0–100)" for i, c in enumerate(criteria)])
    weights = {c["key"]: float(c["weight"]) for c in criteria}

    RAW_PROMPT = """
You are a senior technical evaluator with 15+ years of experience in enterprise vendor selection.

TASK:
1. Analyze the PROBLEM STATEMENT and VENDOR CAPABILITIES.
2. For each vendor, assign a score (0–100) for every criterion:
   - 0  = no alignment
   - 50 = partial fit
   - 100 = perfect match
3. Provide a short justification and list 3–5 strengths & concerns.

PROBLEM STATEMENT:
{ps_analysis}

VENDORS TO EVALUATE:
{vendor_batch}

CRITERIA (score 0–100):
{criteria_lines}

OUTPUT STRICTLY IN JSON FORMAT:
[
  {{
    "name": "<vendor name>",
    {json_fields},
    "justification": "<3–5 sentences>",
    "strengths": ["<point1>", "<point2>", "<point3>"],
    "concerns": ["<point1>", "<point2>", "<point3>"]
  }}
]
""".strip()

    parser = JsonOutputParser()
    results = []

    for i in range(0, len(shortlist), batch_size):
        batch = shortlist[i:i + batch_size]
        batch_names = [v["name"] for v in batch]

        # --- Fetch/generate vendor capabilities for this batch (provider-specific) ---
        vendor_caps = []
        for name in batch_names:
            # Try provider-specific capabilities first
            vendor_doc = vendor_capabilities_collection.find_one({"name": name})

            if not vendor_doc:
                logger.warning(f"⚠️ Vendor '{name}' not found in {llm_provider} capabilities — generating dynamically")

                # Find base vendor info from global vendor collection
                base_vendor = vendors_collection.find_one({"name": name})
                if not base_vendor:
                    logger.error(f"❌ Base vendor '{name}' not found in master vendors collection. Skipping.")
                    continue

                try:
                    # This function (you provided) will generate provider-specific capabilities
                    # and save embedding into the shared vendor_embeddings_collection.
                    cap, _ = process_vendor_profile(base_vendor["name"], base_vendor["text"], llm, llm_provider)

                    # Make sure the capability doc has 'name' and 'llm_provider' fields (process_vendor_profile does this)
                    cap["name"] = cap.get("name", base_vendor["name"])
                    cap["llm_provider"] = llm_provider

                    # Append the freshly generated capability doc
                    vendor_caps.append(cap)

                except Exception as e:
                    logger.error(f"❌ Failed to generate capabilities for '{name}' with provider {llm_provider}: {e}")
                    continue
            else:
                vendor_caps.append(vendor_doc)

        # If no vendor capabilities available for this batch, skip evaluation
        if not vendor_caps:
            logger.warning(f"⚠️ No vendor capability documents available for batch {i // batch_size + 1}. Skipping.")
            continue

        try:
            logger.info(f"🧮 Evaluating batch {i // batch_size + 1} ({len(vendor_caps)} vendors)")

            prompt_str = RAW_PROMPT.format(
                ps_analysis=json.dumps(ps_analysis, ensure_ascii=False, indent=2),
                vendor_batch=json.dumps(vendor_caps, ensure_ascii=False, indent=2),
                criteria_lines=criteria_lines,
                json_fields=json_fields
            )

            raw_output = llm.invoke(prompt_str)
            parsed = parser.invoke(raw_output)

            if not isinstance(parsed, list):
                parsed = [parsed] if isinstance(parsed, dict) else []

            for item in parsed:
                name = item.get("name", "Unknown")

                scores = {
                    c["key"]: round(float(item.get(c["key"], 0)), 1)
                    if isinstance(item.get(c["key"]), (int, float))
                    else 0.0
                    for c in criteria
                }

                composite = round(sum(scores[k] * weights[k] for k in weights), 2)

                result = {
                    "name": name,
                    "composite_score": composite,
                    "justification": str(item.get("justification", "")).strip(),
                    "strengths": [s.strip() for s in item.get("strengths", []) if str(s).strip()],
                    "concerns": [c.strip() for c in item.get("concerns", []) if str(c).strip()],
                }

                for c in criteria:
                    result[f"{c['key']}_score"] = scores[c["key"]]

                results.append(result)

        except Exception as e:
            logger.error(f"⚠️ Batch {i // batch_size + 1} failed: {e}")
            for vendor in batch:
                sim = vendor.get("semantic_similarity_score", 0) * 100
                fallback = {
                    "name": vendor.get("name", "Unknown"),
                    "composite_score": round(sim * 0.8, 1),
                    "justification": "LLM evaluation failed — fallback score from semantic similarity.",
                    "strengths": ["Semantic similarity match detected"],
                    "concerns": ["LLM unavailable", "Score is approximate"],
                }
                for c in criteria:
                    fallback[f"{c['key']}_score"] = round(sim, 1)
                results.append(fallback)

    results.sort(key=lambda x: x["composite_score"], reverse=True)
    return results

def validate_matching_params(top_k: int, batch_size: int):
    """Ensure user parameters are within allowed limits."""
    if not isinstance(top_k, int) or not (1 <= top_k <= TOP_K_LIMIT):
        raise ValueError(f"top_k must be between 1 and {TOP_K_LIMIT}")
    if not isinstance(batch_size, int) or not (1 <= batch_size <= BATCH_SIZE_LIMIT):
        raise ValueError(f"batch_size must be between 1 and {BATCH_SIZE_LIMIT}")

# --- Replace / add these functions in your file ---

def validate_evaluation_params(params: List[Dict[str, Any]]) -> bool:
    """Validate evaluation parameters"""
    if not params or not isinstance(params, list):
        raise ValueError("evaluation_params must be a non-empty list")
    
    total_weight = 0
    for param in params:
        if 'name' not in param or 'weight' not in param:
            raise ValueError("Each parameter must have 'name' and 'weight' fields")
        
        name = param['name'].strip()
        if not name:
            raise ValueError("Parameter name cannot be empty")
        
        weight = param['weight']
        if not isinstance(weight, (int, float)) or weight < 0:
            raise ValueError(f"Parameter weight must be a non-negative number: {name}")
        
        total_weight += weight
    
    if abs(total_weight - 100) > 0.01:  # Allow small floating point errors
        raise ValueError(f"Total weight must equal 100%, got {total_weight}%")
    
    return True


def search_vendors_with_openai(
    problem_statement: str,
    ps_analysis: Dict[str, Any],
    count: int = 5
) -> Dict[str, Any]:
    """
    Use OpenAI Responses API with web_search_preview to find real, active vendors.
    
    FIXED: Changed ps_analysis_openai to ps_analysis (parameter name)
    """
    try:
        if not openai_client:
            raise ValueError("OpenAI client not initialized")

        # --- Extract & normalize fields from ps_analysis ---
        domains_raw = ps_analysis.get('primary_technical_domains', [])
        tools_raw = ps_analysis.get('required_tools_or_frameworks', [])
        requirements_raw = ps_analysis.get('key_technical_requirements', [])

        # Normalize domains -> list[str]
        domains = []
        if isinstance(domains_raw, str):
            domains = [domains_raw]
        elif isinstance(domains_raw, list):
            domains = domains_raw
        elif isinstance(domains_raw, dict):
            for v in domains_raw.values():
                if isinstance(v, list):
                    domains.extend(v)
                elif isinstance(v, str):
                    domains.append(v)

        # Normalize tools -> list[str]
        tools = []
        if isinstance(tools_raw, str):
            tools = [tools_raw]
        elif isinstance(tools_raw, list):
            tools = tools_raw
        elif isinstance(tools_raw, dict):
            for v in tools_raw.values():
                if isinstance(v, list):
                    tools.extend(v)
                elif isinstance(v, str):
                    tools.append(v)

        # Normalize requirements -> list[str]
        requirements = []
        if isinstance(requirements_raw, str):
            requirements = [requirements_raw]
        elif isinstance(requirements_raw, list):
            requirements = requirements_raw
        elif isinstance(requirements_raw, dict):
            for v in requirements_raw.values():
                if isinstance(v, list):
                    requirements.extend(v)
                elif isinstance(v, str):
                    requirements.append(v)

        # Create preview strings
        domains_preview = ', '.join(domains[:5]) if domains else 'software development'
        tools_preview = ', '.join(tools[:6]) if tools else 'modern stack'
        reqs_preview = ', '.join(requirements[:6]) if requirements else 'enterprise-grade'

        # --- Build search queries ---
        search_queries = []
        if domains:
            for d in domains[:2]:
                search_queries.append(f"top companies specializing in {d}")
        if tools:
            tools_str = ', '.join(tools[:3])
            search_queries.append(f"companies using {tools_str}")
        
        # Fallback query
        if not search_queries:
            desc = ""
            for line in problem_statement.splitlines():
                if line.strip().lower().startswith("description:"):
                    desc = line.split(":", 1)[1].strip()
                    break
            search_queries.append(f"technology vendors for {desc[:120] or 'software development'}")

        logger.info(f"Generated search queries: {search_queries}")

        # --- Build search prompt ---
        search_prompt = f"""You are a procurement researcher. Use web search to find exactly {count} real, active technology vendors.

SEARCH CRITERIA:
- Domains: {domains_preview}
- Tools: {tools_preview}
- Requirements: {reqs_preview}

USE THESE SEARCH QUERIES:
{chr(10).join(f"- {q}" for q in search_queries)}

INSTRUCTIONS:
1. Perform web search NOW using the tool.
2. Find {count} real companies with active websites.
3. For each company provide:
   - Company name
   - 2-3 sentence description
   - Technologies used
   - Website URL

DO NOT hallucinate. Only use search results.

Return numbered list format:
1. **Company Name**
   Description...
   Technologies: ...
   Website: https://...
"""

        logger.info("Calling OpenAI Responses API with web search...")
        response = openai_client.responses.create(
            model="gpt-4o",
            input=search_prompt,
            tools=[{"type": "web_search_preview"}],
            temperature=0,
            tool_choice="auto"
        )

        # --- Parse response ---
        search_results = ""
        citations = []
        web_search_used = False

        output_items = []
        if isinstance(response, dict):
            output_items = response.get("output", []) or []
        else:
            output_items = getattr(response, "output", []) or []

        if not isinstance(output_items, list):
            output_items = [output_items]

        for item in output_items:
            item_type = None
            if isinstance(item, dict):
                item_type = item.get("type") or item.get("role")
            else:
                item_type = getattr(item, "type", None) or getattr(item, "role", None)

            if item_type and "web_search" in str(item_type).lower():
                web_search_used = True
                logger.info("Web search tool was called")

            contents = []
            if isinstance(item, dict):
                contents = item.get("content") or []
            else:
                contents = getattr(item, "content", []) or []

            if not isinstance(contents, list):
                contents = [contents]

            for c in contents:
                text_piece = ""
                if isinstance(c, dict):
                    text_piece = c.get("text") or c.get("output_text") or c.get("content") or ""
                    annots = c.get("annotations") or c.get("metadata") or []
                    if isinstance(annots, list):
                        for ann in annots:
                            if isinstance(ann, dict) and ann.get("type") == "url_citation":
                                citations.append({
                                    "title": ann.get("title", "Source"),
                                    "url": ann.get("url")
                                })
                else:
                    text_piece = getattr(c, "text", "") or getattr(c, "output_text", "") or ""
                    annots = getattr(c, "annotations", []) or []
                    for ann in annots:
                        if getattr(ann, "type", "") == "url_citation":
                            citations.append({
                                "title": getattr(ann, "title", "Source"),
                                "url": getattr(ann, "url", "")
                            })

                if text_piece:
                    search_results += text_piece + "\n"

            if isinstance(item, str):
                search_results += item + "\n"

        if not web_search_used and not search_results.strip():
            logger.warning("Web search tool was not used and no textual output found.")
            return {
                "vendors": [],
                "search_results_raw": search_results,
                "sources_count": 0,
                "search_successful": False,
                "error": "Web search not performed or no usable output from the tool"
            }

        if not web_search_used:
            logger.warning("Web search tool not explicitly detected; parsing available text output.")

        logger.info(f"Search results: {len(search_results)} chars; citations: {len(citations)}")

        # --- Parse vendors ---
        vendors = parse_vendor_search_results(search_results)

        # Attach citations
        seen_urls = set()
        merged_citations = []
        for c in citations:
            url = c.get("url") or ""
            if url and url not in seen_urls:
                seen_urls.add(url)
                merged_citations.append({"url": url, "title": c.get("title", "")})

        for v in vendors:
            existing = v.get("web_sources", []) or []
            for c in merged_citations:
                if c["url"] not in [s.get("url") for s in existing]:
                    existing.append(c)
            v["web_sources"] = existing

        return {
            "vendors": vendors[:count],
            "search_results_raw": search_results,
            "sources_count": len(merged_citations),
            "search_successful": True
        }

    except Exception as e:
        logger.error(f"Web search error: {str(e)}")
        logger.error(traceback.format_exc())
        return {
            "vendors": [],
            "search_results_raw": "",
            "sources_count": 0,
            "search_successful": False,
            "error": str(e)
        }

def parse_vendor_search_results(search_text: str) -> List[Dict[str, Any]]:
    """Parse OpenAI web search results into structured vendor data."""
    if not search_text or len(search_text.strip()) < 50:
        return []

    vendors = []
    
    # Try multiple splitting strategies
    sections = re.split(r'\n(?=\d+\.\s+\*\*)', search_text.strip())
    if len(sections) <= 1:
        sections = re.split(r'\n(?=\d+\.)', search_text.strip())
    if len(sections) <= 1:
        sections = re.split(r'\n\n+', search_text.strip())

    for sec in sections:
        sec = sec.strip()
        if len(sec) < 50:
            continue

        vendor = {
            "name": "",
            "description": "",
            "full_text": sec,
            "web_sources": []
        }

        # Extract name (look for bold text or numbered item)
        name_match = re.search(r'\*\*([^*]+)\*\*', sec)
        if not name_match:
            name_match = re.search(r'^\d+\.\s+([A-Z][A-Za-z0-9&\s\.,\-]{3,})', sec)
        if name_match:
            vendor["name"] = name_match.group(1).strip()
            vendor["name"] = re.sub(r'^\d+\.', '', vendor["name"]).strip()

        # Extract description
        lines = [l.strip() for l in sec.splitlines() if l.strip()]
        desc_lines = []
        for line in lines:
            if not line.startswith(('http', 'Technologies:', 'Website:', 'Tech Stack:')):
                line = re.sub(r'\*\*.*?\*\*', '', line)
                line = re.sub(r'^\d+\.\s*', '', line)
                if len(line) > 20:
                    desc_lines.append(line)
            if len(desc_lines) >= 3:
                break
        vendor["description"] = " ".join(desc_lines)

        # Extract URLs
        urls = re.findall(r'https?://[^\s<>"\)\]]+', sec)
        for url in urls[:2]:
            vendor["web_sources"].append({"url": url, "title": vendor["name"]})

        if vendor["name"] and len(vendor["description"]) > 30:
            vendors.append(vendor)

    return vendors[:10]


def normalize_param_name(name: str) -> str:
    """Normalize parameter name to a valid Python identifier."""
    normalized = name.lower()
    normalized = re.sub(r'[^a-z0-9]+', '_', normalized)
    normalized = normalized.strip('_')
    return normalized


def evaluate_web_vendors(
    ps_analysis: Dict[str, Any],
    web_vendors: List[Dict[str, Any]],
    evaluation_params: List[Dict[str, Any]],
    llm_provider: str = "openai"
) -> List[Dict[str, Any]]:
    """Evaluate web-found vendors using LLM with dynamic criteria."""
    if not web_vendors:
        return []

    # Normalize params
    criteria = []
    weights = {}
    for p in evaluation_params:
        key = normalize_param_name(p["name"])
        criteria.append({
            "key": key,
            "label": p["name"],
            "weight": p["weight"] / 100.0
        })
        weights[key] = p["weight"] / 100.0

    criteria_lines = "\n".join([
        f"{i+1}. {c['label']} (0-100)"
        for i, c in enumerate(criteria)
    ])
    score_fields = ",\n    ".join([
        f'"{c["key"]}": <0-100 score>'
        for c in criteria
    ])

    prompt_template = PromptTemplate.from_template("""
You are a senior technical procurement expert with 15+ years of experience.

PROBLEM REQUIREMENTS:
{ps_analysis}

VENDOR FROM WEB SEARCH:
{vendor_info}

EVALUATION CRITERIA:
{criteria_lines}

Provide JSON response ONLY:
{{
  "name": "<vendor name>",
  {score_fields},
  "justification": "<3-5 sentences with specific evidence from vendor description>",
  "strengths": ["<specific strength 1>", "<specific strength 2>", "<specific strength 3>"],
  "concerns": ["<specific concern 1>", "<specific concern 2>"]
}}

Only return valid JSON. No markdown, no explanation.
""")

    llm = get_llm_instance(llm_provider)
    parser = JsonOutputParser()
    results = []

    for vendor in web_vendors:
        try:
            vendor_info = (
                f"Name: {vendor['name']}\n"
                f"Description: {vendor['description']}\n"
                f"Full Context: {vendor.get('full_text', '')}"
            )
            
            prompt = prompt_template.format(
                ps_analysis=json.dumps(ps_analysis, indent=2),
                vendor_info=vendor_info,
                criteria_lines=criteria_lines,
                score_fields=score_fields
            )

            raw = llm.invoke(prompt)
            raw_text = raw.content if hasattr(raw, 'content') else str(raw)
            
            # Clean potential markdown formatting
            raw_text = raw_text.strip()
            if raw_text.startswith('```'):
                raw_text = re.sub(r'^```(?:json)?\s*', '', raw_text)
                raw_text = re.sub(r'\s*```$', '', raw_text)
            
            parsed = parser.parse(raw_text)

            scores = {}
            for c in criteria:
                val = parsed.get(c["key"], 0)
                try:
                    score = float(val)
                    score = max(0, min(100, score))
                except:
                    score = 0
                scores[c["key"]] = round(score, 1)

            composite = sum(scores[k] * weights.get(k, 0) for k in weights)
            composite = round(composite, 2)

            result = {
                "name": parsed.get("name", vendor["name"]),
                "description": vendor.get("description", ""),
                "composite_score": composite,
                "justification": parsed.get("justification", "").strip(),
                "strengths": [s.strip() for s in parsed.get("strengths", []) if s.strip()],
                "concerns": [c.strip() for c in parsed.get("concerns", []) if c.strip()],
                "web_sources": vendor.get("web_sources", []),
                "source": "web_search"
            }
            
            for c in criteria:
                result[f"{c['key']}_score"] = scores[c["key"]]

            results.append(result)
            logger.info(f"✅ Evaluated web vendor: {result['name']} (score: {composite})")

        except Exception as e:
            logger.error(f"Eval failed for {vendor.get('name')}: {e}")
            logger.error(traceback.format_exc())
            
            fallback = {
                "name": vendor.get("name", "Unknown"),
                "description": vendor.get("description", ""),
                "composite_score": 0,
                "justification": f"Evaluation failed: {str(e)[:100]}",
                "strengths": [],
                "concerns": ["LLM evaluation error", "Unable to score vendor"],
                "web_sources": vendor.get("web_sources", []),
                "source": "web_search_fallback"
            }
            for c in criteria:
                fallback[f"{c['key']}_score"] = 0
            results.append(fallback)

    results.sort(key=lambda x: x["composite_score"], reverse=True)
    return results

# ============================================================================
# API ENDPOINTS (UPDATED to accept llm_provider per-request)
# ============================================================================

@app.before_request
def log_request():
    """Log all incoming requests"""
    logger.info(f"{request.method} {request.path} from {request.remote_addr}")


@app.route('/api/health', methods=['GET'])
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


@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    """Get dashboard statistics"""
    try:
        vendors = list(vendors_collection.find())
        ps_list = list(ps_collection.find())
        cached_analyses = (
            vendor_capabilities_collection.count_documents({}) +
            ps_analysis_collection.count_documents({})
        )

        recent_vendors = [v['name'] for v in vendors[-3:]] if vendors else []
        recent_ps = [ps['title'] for ps in ps_list[-3:]] if ps_list else []

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

@app.route('/api/vendor_submission', methods=['POST'])
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
    
@app.route('/api/ps_submission', methods=['POST'])
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
    
@app.route('/api/vendor_matching', methods=['POST'])
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
        
@app.route('/api/download_results/<ps_id>', methods=['GET'])
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
        ps_analysis, ps_embedding = process_problem_statement(problem_statement, llm)
        vendor_capabilities = []
        vendor_embeddings = []
        for vendor in vendors:
            cap, emb = process_vendor_profile(vendor["name"], vendor["text"], llm)
            vendor_capabilities.append(cap)
            vendor_embeddings.append(emb)

        shortlist = shortlist_vendors(ps_embedding, vendor_embeddings, vendor_capabilities)
        final_results = evaluate_shortlist(ps_analysis, shortlist, llm)

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


@app.route('/api/problem_statements', methods=['GET'])
def get_problem_statements():
    """Get all problem statements with provider-specific analysis info"""
    try:
        llm_provider = request.args.get('llm_provider', 'openai').lower()
        
        # Validate provider
        if llm_provider not in ['openai', 'gemini']:
            llm_provider = 'openai'
        
        # Get all problem statements
        ps_list = list(ps_collection.find())
        
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
        
        # Sort by title
        enriched_ps.sort(key=lambda x: x["title"].lower())
        
        logger.info(f"✅ Fetched {len(enriched_ps)} problem statements (provider: {llm_provider})")
        return jsonify(enriched_ps), 200
        
    except Exception as e:
        logger.error(f"Error fetching problem statements: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": "Failed to fetch problem statements"}), 500


# ============================================================================
# NEW: GET /api/problem_statements/<ps_id>
# Get detailed problem statement with full analysis
# ============================================================================

@app.route('/api/problem_statements/<ps_id>', methods=['GET'])
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


# ============================================================================
# NEW: DELETE /api/problem_statements/<ps_id>
# Delete problem statement and all associated data
# ============================================================================

@app.route('/api/problem_statements/<ps_id>', methods=['DELETE'])
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



@app.route('/api/clear_cache', methods=['POST'])
def clear_cache():
    """Clear all cached data"""
    try:
        vendor_capabilities_collection.delete_many({})
        ps_analysis_collection.delete_many({})
        vendor_embeddings_collection.delete_many({})
        ps_embeddings_collection.delete_many({})
        logger.info("Cache cleared successfully")
        return jsonify({"message": "Cache cleared successfully!"}), 200
    except Exception as e:
        logger.error(f"Cache clear error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": "Failed to clear cache"}), 500


@app.errorhandler(413)
def request_entity_too_large(error):
    """Handle file too large error"""
    return jsonify({"error": f"File too large. Maximum size: {app.config['MAX_CONTENT_LENGTH'] / (1024*1024):.1f}MB"}), 413


@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({"error": "Endpoint not found"}), 404


@app.route('/api/vendors', methods=['GET'])
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


@app.route('/api/vendors/<vendor_name>', methods=['GET'])
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


@app.route('/api/vendors/<vendor_name>', methods=['DELETE'])
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
    

@app.route('/api/web_search_vendors', methods=['POST', 'OPTIONS'])
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



@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    logger.error(f"Internal server error: {str(error)}")
    return jsonify({"error": "Internal server error occurred"}), 500

if __name__ == '__main__':
    logger.info("Starting Flask application")
    app.run(debug=True, host='0.0.0.0', port=5000)