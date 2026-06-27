import requests
from app.core.config import config

# ══════════════════════════════════════════════════════════════════════════════
# LLM MANAGER — Manages the language model used for answer generation
#
# PREVIOUS APPROACH (Ollama — commented out below):
#   Used ChatOllama with llama3.2 (3B params) running locally.
#
#   WHY IT DIDN'T WORK WELL:
#   1. llama3.2 (3B) is too small for nuanced document comprehension.
#      It often produced vague, incomplete, or slightly wrong answers.
#   2. The model requires ~4-6 GB RAM just to stay loaded, which combined
#      with the embedding model + Docling + tree builder caused
#      std::bad_alloc (C++ out-of-memory) crashes on ≤16 GB machines.
#   3. Portability problem: Ollama must be manually installed on every
#      machine, and the model must be pulled (ollama pull llama3.2).
#      If someone clones this repo and doesn't have Ollama, nothing works.
#   4. Cold-start latency: first query after idle takes 15-30 seconds
#      while the model loads into RAM.
#
#   SOLUTION: Switched to Gemini 2.0 Flash via API.
#   - Dramatically better response quality (orders of magnitude more capable)
#   - Zero local RAM usage — runs on Google's servers
#   - Works on ANY laptop with internet access
#   - Free tier: 15 RPM / 1M tokens per day (plenty for personal use)
#   - No installation needed — just an API key in .env
#
#   TO REVERT TO OLLAMA: Set MODEL_PROVIDER=ollama in your .env file.
# ══════════════════════════════════════════════════════════════════════════════

class LLMManager:
    _instance = None

    @classmethod
    def get_llm(cls):
        if cls._instance is None:
            if config.MODEL_PROVIDER == "ollama":
                # ── OLLAMA (local) ──
                # Requires: pip install langchain-ollama
                # Requires: Ollama installed and running (ollama serve)
                # Requires: Model pulled (ollama pull llama3.2)
                from langchain_ollama import ChatOllama
                print(f"[*] Loading LOCAL model via Ollama: {config.OLLAMA_MODEL}")
                cls._instance = ChatOllama(
                    model=config.OLLAMA_MODEL,
                    base_url=config.OLLAMA_BASE_URL,
                    temperature=0,
                    num_ctx=4096,
                    keep_alive="5m"
                )
            elif config.MODEL_PROVIDER == "groq":
                # ── GROQ (cloud API — extremely fast) ──
                from langchain_groq import ChatGroq
                print(f"[*] Loading CLOUD model via Groq API: {config.GROQ_MODEL}")
                cls._instance = ChatGroq(
                    model=config.GROQ_MODEL,
                    api_key=config.GROQ_API_KEY,
                    temperature=0,
                    max_tokens=2048,
                )
            else:
                # ── GEMINI (cloud API — recommended) ──
                from langchain_google_genai import ChatGoogleGenerativeAI
                print(f"[*] Loading CLOUD model via Gemini API: {config.GEMINI_MODEL}")
                cls._instance = ChatGoogleGenerativeAI(
                    model=config.GEMINI_MODEL,
                    google_api_key=config.GEMINI_API_KEY,
                    temperature=0,
                    max_output_tokens=2048,
                )

        return cls._instance

    @classmethod
    def unload_model(cls):
        """
        Unload the model from memory (only relevant for Ollama).
        For Gemini API, this is a no-op — there's nothing to unload.
        """
        if config.MODEL_PROVIDER == "ollama":
            print(f"[*] Sending Unload signal for {config.OLLAMA_MODEL}...")
            try:
                url = f"{config.OLLAMA_BASE_URL}/api/generate"
                payload = {
                    "model": config.OLLAMA_MODEL,
                    "keep_alive": 0
                }
                requests.post(url, json=payload)
                cls._instance = None
                print("✅ Model unloaded. RAM is now free.")
            except Exception as e:
                print(f"❌ Failed to unload model: {e}")
        else:
            # Gemini is cloud-based — no RAM to free
            cls._instance = None
            print("[*] Gemini API session cleared (no RAM to free).")


# ══════════════════════════════════════════════════════════════════════════════
# ORIGINAL OLLAMA-ONLY CODE (preserved for reference):
# ══════════════════════════════════════════════════════════════════════════════
#
# from langchain_ollama import ChatOllama
# from app.core.config import config
#
# class LLMManager:
#     _instance=None
#
#     @classmethod
#     def get_llm(cls):
#         if cls._instance is None:
#             cls._instance=ChatOllama(
#                 model=config.OLLAMA_MODEL,
#                 base_url=config.OLLAMA_BASE_URL,
#                 temperature=0,
#                 num_ctx=4096,
#                 keep_alive="5m"
#             )
#         return cls._instance
#
#     @classmethod
#     def unload_model(cls):
#         print(f"[*] Sending Unload signal for {config.OLLAMA_MODEL}...")
#         try:
#             url=f"{config.OLLAMA_BASE_URL}/api/generate"
#             payload={
#                 "model": config.OLLAMA_MODEL,
#                 "keep_alive":0
#             }
#             requests.post(url, json=payload)
#             cls._instance = None
#             print("✅ Model unloaded. RAM is now free.")
#         except Exception as e:
#             print(f"❌ Failed to unload model: {e}")
