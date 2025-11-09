import json
import logging
from typing import List, Dict, Any
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from langchain_core.output_parsers import JsonOutputParser
from utils.helpers import get_content_hash, load_cached_analysis, get_llm_collections
from services.vendor_service import process_vendor_profile
from database.connection import ps_collection, vendors_collection

logger = logging.getLogger(__name__)

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

def calculate_composite_score(scores: Dict[str, float], weights: Dict[str, float]) -> float:
    """Compute weighted composite score using dynamic weights."""
    total = 0.0
    for key, weight in weights.items():
        total += scores.get(key, 0) * weight
    return round(total, 2)

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
        from services.vendor_service import process_problem_statement
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
