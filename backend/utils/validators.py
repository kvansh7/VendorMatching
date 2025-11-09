import re
from typing import List, Dict, Any
from config.settings import TOP_K_LIMIT, BATCH_SIZE_LIMIT

def validate_matching_params(top_k: int, batch_size: int):
    """Ensure user parameters are within allowed limits."""
    if not isinstance(top_k, int) or not (1 <= top_k <= TOP_K_LIMIT):
        raise ValueError(f"top_k must be between 1 and {TOP_K_LIMIT}")
    if not isinstance(batch_size, int) or not (1 <= batch_size <= BATCH_SIZE_LIMIT):
        raise ValueError(f"batch_size must be between 1 and {BATCH_SIZE_LIMIT}")

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

def normalize_param_name(name: str) -> str:
    """Normalize parameter name to a valid Python identifier."""
    normalized = name.lower()
    normalized = re.sub(r'[^a-z0-9]+', '_', normalized)
    normalized = normalized.strip('_')
    return normalized
