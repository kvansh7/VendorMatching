import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
MAX_CONTENT_LENGTH = int(os.getenv('MAX_FILE_SIZE', 16 * 1024 * 1024))  # 16MB default
ALLOWED_EXTENSIONS = {'pdf', 'pptx', 'ppt', 'docx'}
TOP_K_LIMIT = int(os.getenv('TOP_K_LIMIT', 100))
BATCH_SIZE_LIMIT = int(os.getenv('BATCH_SIZE_LIMIT', 20))
OPENAI_EMBED_MODEL = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small")

# MongoDB URI
MONGODB_URI = os.getenv("MONGODB_URI")

# API Keys
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
