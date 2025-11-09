import os
import logging
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama

logger = logging.getLogger(__name__)

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
