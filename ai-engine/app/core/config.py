import os
from dotenv import load_dotenv

load_dotenv()

class Config:

    MODEL_PROVIDER=os.getenv("MODEL_PROVIDER", "gemini")

    # ── Ollama (local) ──
    # WHY COMMENTED OUT AS DEFAULT:
    # Ollama requires manual installation + model download on every machine.
    # The llama3.2 (3B) model needs ~4-6 GB RAM, which causes std::bad_alloc
    # crashes during tree building on machines with ≤16 GB RAM.
    # Additionally, the 3B model produces mediocre answers for document QA.
    # SOLUTION: Switched default to Gemini API (cloud-hosted, zero local RAM).
    # TO USE OLLAMA: Set MODEL_PROVIDER=ollama in .env
    OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2") 

    # ── Gemini (cloud API — recommended) ──
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    
    PINECONE_API_KEY= os.getenv("PINECONE_API_KEY")
    
    # ── Groq (cloud API) ──
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    GROQ_MODEL = os.getenv("GROQ_MODEL", "llama3-8b-8192")
    PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "docubrain-index")

    # ── Neo4j Graph Database ──
    NEO4J_URI = os.getenv("NEO4J_URI")
    NEO4J_USERNAME = os.getenv("NEO4J_USERNAME", "neo4j")
    NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")

    EMBEDDING_MODEL = "all-MiniLM-L6-v2"
    EMBEDDING_DIMENSION = 384
    
    CHUNK_SIZE = 1500
    CHUNK_OVERLAP = 300

    # Relevance threshold — search results below this score are considered
    # irrelevant. If ALL results fall below this, the LLM answers from
    # general knowledge instead of saying "info not available".
    RELEVANCE_THRESHOLD = 0.15

    DOCLING_EXPORT_TYPE="markdown"

# Create a single instance to import elsewhere
config = Config()
