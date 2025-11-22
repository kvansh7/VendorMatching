import re
import json
import logging
import traceback
from typing import Dict, Any, List
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from services.llm_service import get_llm_instance
from openai import OpenAI
import os

logger = logging.getLogger(__name__)

# Initialize OpenAI client
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

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

        # Helper to extract strings from nested structures
        def extract_strings(data):
            result = []
            if isinstance(data, str):
                result.append(data)
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, str):
                        result.append(item)
                    elif isinstance(item, dict):
                        result.extend(extract_strings(item))
            elif isinstance(data, dict):
                for v in data.values():
                    result.extend(extract_strings(v))
            return result

        # Normalize domains -> list[str]
        domains = extract_strings(domains_raw)

        # Normalize tools -> list[str]
        tools = extract_strings(tools_raw)

        # Normalize requirements -> list[str]
        requirements = extract_strings(requirements_raw)

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
   - Include the official website url

DO NOT hallucinate. Only use search results.

Return numbered list format:
1. **Company Name**
   Description...
   Technologies: ...
   Website: https://..."""

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
