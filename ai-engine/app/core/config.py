import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PINECONE_API_KEY= os.getenv("PINECONE_API_KEY")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    
    PINECONE_INDEX_NAME = "docubrain-index"
    EMBEDDING_MODEL = "all-MiniLM-L6-v2"
    EMBEDDING_DIMENSION = 384
    
    CHUNK_SIZE = 1000
    CHUNK_OVERLAP = 200

# Create a single instance to import elsewhere
settings = Settings()
