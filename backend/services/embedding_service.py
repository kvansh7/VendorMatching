import os
import logging
import numpy as np
from langchain_openai import OpenAIEmbeddings
from config.settings import OPENAI_API_KEY, OPENAI_EMBED_MODEL

logger = logging.getLogger(__name__)

# Initialize embeddings
try:
    if not OPENAI_API_KEY:
        raise ValueError("Missing OPENAI_API_KEY")

    embeddings = OpenAIEmbeddings(
        model=OPENAI_EMBED_MODEL,
        api_key=OPENAI_API_KEY
    )
    logger.info("✅ OpenAI embedding model initialized successfully.")
except Exception as e:
    logger.error(f"❌ Failed to initialize OpenAI embeddings: {str(e)}")
    raise

def get_embedding(text: str) -> np.ndarray:
    """Generate embedding using OpenAI embedding model."""
    try:
        embedding = embeddings.embed_query(text)
        return np.array(embedding)
    except Exception as e:
        logger.error(f"❌ Embedding generation failed: {str(e)}")
        raise
