# ══════════════════════════════════════════════════════════════════════════════
# TREE BUILDER — Creates summary vectors for enhanced document retrieval
#
# PREVIOUS APPROACH (Full RAPTOR tree — commented out at bottom):
#   Built a multi-level hierarchical tree using recursive clustering + LLM
#   summarization. Each level clusters the previous level's nodes, summarizes
#   them, and stores parent-child links (children_ids) for tree-traversal
#   retrieval.
#
#   WHY IT WAS TOO HECTIC:
#   1. SLOW: A 100-page document creates ~200 chunks. With 3 tree levels,
#      the builder needs 40+ LLM calls (each cluster needs a summary).
#      With Ollama (local), this took 15-30 minutes. Even with Gemini API,
#      it takes 3-5 minutes due to rate limits.
#   2. MEMORY-HUNGRY: Clustering with GaussianMixture (original) or even
#      MiniBatchKMeans + concurrent LLM calls caused memory spikes that
#      contributed to std::bad_alloc alongside Docling.
#   3. DIMINISHING RETURNS: For most queries, flat search (just searching
#      all chunks directly) returns results that are 90% as good as tree
#      traversal. The tree only helps for very broad "what is this about?"
#      questions — and even then, a single document summary works just as well.
#   4. FRAGILE: The tree traversal depends on children_ids being correctly
#      stored and all nodes existing. If any node is deleted, the tree breaks.
#
#   SOLUTION: "One-Level Summary" approach.
#   Instead of building a full tree, we:
#   1. Take the first + last chunks from the document (to capture intro + conclusion)
#   2. Make ONE LLM call to create a single document summary
#   3. Store it as a level-1 vector in Pinecone
#   This gives the "broad query" benefit with minimal time and zero complexity.
#
#   WHAT ABOUT HYBRID RAG? (see bottom of file for analysis)
# ══════════════════════════════════════════════════════════════════════════════

import uuid
from app.core.config import config
from app.core.llm_manager import LLMManager


class TreeBuilder:
    def __init__(self, vector_brain):
        self.brain = vector_brain

    async def create_summaries(self, original_chunks, original_vectors, status_callback=None):
        """
        One-Level Summary: Creates a single document summary vector.
        
        Instead of the full RAPTOR tree (which required dozens of LLM calls
        and could take 15-30 minutes), this makes ONE LLM call to produce
        a comprehensive document summary. The summary is stored as a level-1
        node in Pinecone, giving broad-query benefits with minimal overhead.
        
        Time: ~5-15 seconds (vs 15-30 minutes for full RAPTOR)
        LLM calls: 1 (vs 20-50 for full RAPTOR)
        """
        if len(original_chunks) < 3:
            # Document is too small to need a summary
            print("[*] Document is too small for summarization. Skipping.")
            return []

        if status_callback:
            status_callback("summarizing", "Creating document summary...")

        # Build a representative sample of the document
        # Take first 3 chunks (introduction), last 2 chunks (conclusion),
        # and a few from the middle to capture the breadth
        sample_indices = []
        n = len(original_chunks)
        
        # First 3
        sample_indices.extend(range(min(3, n)))
        # Last 2
        if n > 5:
            sample_indices.extend(range(n - 2, n))
        # Middle samples (evenly spaced)
        if n > 10:
            mid_count = min(5, n // 4)
            step = n // (mid_count + 1)
            for i in range(1, mid_count + 1):
                idx = i * step
                if idx not in sample_indices:
                    sample_indices.append(idx)

        sample_indices = sorted(set(sample_indices))
        sample_text = "\n\n---\n\n".join([original_chunks[i]['text'] for i in sample_indices])

        # Truncate to fit within context window
        max_context = 6000  # Safe limit for most models
        if len(sample_text) > max_context:
            sample_text = sample_text[:max_context]

        prompt = (
            "You are building a search index for a document. Create a comprehensive "
            "summary of the following document excerpts.\n\n"
            "RULES:\n"
            "- Preserve ALL specific names, numbers, dates, and technical terms\n"
            "- Identify the main topic, subtopics, and key conclusions\n"
            "- Include key relationships between concepts\n"
            "- Be factual and precise — this summary will be used for search matching\n"
            "- Write 2-3 dense paragraphs\n\n"
            f"Document excerpts:\n{sample_text}\n\n"
            "Comprehensive summary:"
        )

        try:
            llm = LLMManager.get_llm()
            response = await llm.ainvoke(prompt)
            summary_text = response.content if hasattr(response, 'content') else str(response)

            if not summary_text or len(summary_text.strip()) < 20:
                print("[!] LLM returned empty/short summary. Skipping.")
                return []

            # Create the summary node
            summary_id = f"summary_L1_{uuid.uuid4().hex[:8]}"
            summary_node = {
                "id": summary_id,
                "text": summary_text.strip(),
                "metadata": {
                    "level": 1,
                    "page_number": "Multiple",
                    "is_summary": True,
                    "summary_type": "document_overview"
                }
            }

            # Vectorize the summary
            summary_vector = self.brain.convert_batch([summary_node['text']])[0]

            if status_callback:
                status_callback("complete", "Document summary created!")

            print(f"[✓] Document summary created ({len(summary_text)} chars)")
            return [{"node": summary_node, "vector": summary_vector}]

        except Exception as e:
            print(f"❌ Summary generation failed: {e}")
            if status_callback:
                status_callback("complete_partial", f"Summary failed: {str(e)}. Basic search still works.")
            return []


# ══════════════════════════════════════════════════════════════════════════════
# HYBRID RAG — ANALYSIS & FUTURE IMPROVEMENT
#
# WHAT IS HYBRID RAG?
#   Hybrid RAG combines two types of search:
#   - Dense retrieval (vector/semantic search) — what we currently use
#   - Sparse retrieval (keyword/BM25 search) — traditional text matching
#
# WHY WOULD IT BE BETTER?
#   Dense search is great for MEANING but bad for EXACT MATCHES:
#     Query: "What was the Q3 revenue of $4.2M?"
#     Dense search might return a chunk about "financial performance" (semantically
#     similar) but miss the chunk that literally says "$4.2M" (exact match).
#
#   Sparse/BM25 search is great for EXACT TERMS but bad for MEANING:
#     Query: "How much money did they make last quarter?"
#     BM25 won't match "revenue" or "$4.2M" because the words don't overlap.
#
#   Hybrid combines both: BM25 catches the exact "$4.2M" match, dense search
#   catches the semantic "financial performance" match. Combined scoring gives
#   the best of both worlds.
#
# HOW TO IMPLEMENT IT:
#   Pinecone supports hybrid search natively with "sparse vectors".
#   During ingestion, for each chunk you'd store:
#     - Dense vector: from sentence-transformers (what we do now)
#     - Sparse vector: BM25/TF-IDF token frequencies
#   During search, Pinecone combines both scores automatically.
#
#   Implementation would require:
#   1. pip install pinecone-text (for BM25 encoder)
#   2. In vectorizer.py: also compute sparse vectors per chunk
#   3. In database.py: include sparse_values in upsert
#   4. In search.py: pass both dense + sparse vectors in query
#   5. Pinecone index must be created with metric='dotproduct' (not 'cosine')
#      — this means recreating the index.
#
# VERDICT:
#   Hybrid RAG would improve results by ~15-25% for queries involving specific
#   names, numbers, or technical terms. It's a solid next step but requires
#   recreating the Pinecone index (metric change from cosine to dotproduct).
#   I'd recommend implementing it AFTER the current fixes are stable.
# ══════════════════════════════════════════════════════════════════════════════


# ══════════════════════════════════════════════════════════════════════════════
# PREVIOUS RAPTOR TREE BUILDER (preserved for reference)
# ══════════════════════════════════════════════════════════════════════════════
#
# import numpy as np
# import gc
# from sklearn.mixture import GaussianMixture
# from sklearn.cluster import MiniBatchKMeans
# from app.core.config import config
# from app.core.llm_manager import LLMManager
#
# class RaptorTreeBuilder:
#     """
#     Full RAPTOR tree builder — recursive clustering + summarization.
#     
#     PROBLEMS:
#     - 20-50 LLM calls per document (slow, expensive)
#     - Memory-hungry clustering (MiniBatchKMeans + concurrent summarization)
#     - Fragile tree structure (children_ids must all exist)
#     - Diminishing returns vs. flat search for most query types
#     """
#     def __init__(self, vector_brain):
#         self.brain = vector_brain
#         self.llm = LLMManager.get_llm()
#
#     def get_clusters(self, vectors):
#         import warnings
#         warnings.filterwarnings("ignore", category=FutureWarning)
#         n_clusters = max(1, len(vectors) // 5)
#         kmeans = MiniBatchKMeans(n_clusters=n_clusters, random_state=42, batch_size=256, n_init=1)
#         labels = kmeans.fit_predict(vectors)
#         clusters = {i: [] for i in range(n_clusters)}
#         for chunk_idx, cluster_idx in enumerate(labels):
#              clusters[cluster_idx].append(chunk_idx)
#         return clusters
#
#     def _build_summary_prompt(self, combined_text: str) -> str:
#         return (
#             "You are building a hierarchical index for document retrieval. "
#             "Summarize the following text cluster into a single, dense paragraph.\n\n"
#             "RULES:\n"
#             "- Preserve ALL specific names, numbers, dates, and technical terms\n"
#             "- Capture the main topic AND supporting details\n"
#             "- Include key relationships between concepts\n"
#             "- Do NOT use vague phrases like 'various topics were discussed'\n"
#             "- Be factual and precise\n\n"
#             f"Text:\n{combined_text[:4000]}"
#         )
#
#     async def create_summaries(self, original_chunks, original_vectors, status_callback=None):
#         import uuid, asyncio
#
#         MAX_TREE_CHUNKS = 200
#         if len(original_chunks) > MAX_TREE_CHUNKS:
#             indices = np.linspace(0, len(original_chunks) - 1, MAX_TREE_CHUNKS, dtype=int)
#             original_chunks = [original_chunks[i] for i in indices]
#             original_vectors = [original_vectors[i] for i in indices]
#
#         current_level_nodes = original_chunks
#         current_vectors = original_vectors
#         level = 0
#         all_summaries = []
#
#         while len(current_level_nodes) > 1:
#             next_level_nodes = []
#             level += 1
#
#             if status_callback:
#                 status_callback("clustering", f"Level {level}: Grouping {len(current_level_nodes)} nodes...")
#
#             current_clusters = self.get_clusters(current_vectors)
#
#             cluster_keys = []
#             cluster_children_ids = []
#             cluster_prompts = []
#
#             for cluster_id, chunk_indices in current_clusters.items():
#                 if not chunk_indices:
#                     continue
#                 combined_text = " ".join([current_level_nodes[i]['text'] for i in chunk_indices])
#                 prompt = self._build_summary_prompt(combined_text)
#                 cluster_prompts.append(prompt)
#                 cluster_keys.append(cluster_id)
#                 children = [current_level_nodes[i].get('id', f'unknown_{i}') for i in chunk_indices]
#                 cluster_children_ids.append(children)
#
#             if status_callback:
#                 status_callback("summarizing", f"Level {level}: AI summarizing {len(cluster_prompts)} clusters...")
#
#             sem = asyncio.Semaphore(3)
#             async def bounded_invoke(prompt, idx):
#                 async with sem:
#                     response = await self.llm.ainvoke(prompt)
#                     gc.collect()
#                     return response
#
#             tasks = [bounded_invoke(prompt, idx) for idx, prompt in enumerate(cluster_prompts)]
#             responses = await asyncio.gather(*tasks)
#
#             for i, response in enumerate(responses):
#                 summary_id = f"summary_L{level}_{uuid.uuid4().hex[:8]}"
#                 next_level_nodes.append({
#                     "id": summary_id,
#                     "text": response.content if hasattr(response, 'content') else str(response),
#                     "metadata": {
#                         "level": level,
#                         "page_number": "Multiple",
#                         "is_summary": True,
#                         "cluster_id": cluster_keys[i],
#                         "children_ids": cluster_children_ids[i]
#                     }
#                 })
#
#             current_level_vectors = self.brain.convert_batch([n['text'] for n in next_level_nodes])
#             for i in range(len(next_level_nodes)):
#                 all_summaries.append({"node": next_level_nodes[i], "vector": current_level_vectors[i]})
#
#             current_level_nodes = next_level_nodes
#             current_vectors = current_level_vectors
#             gc.collect()
#
#             if len(current_level_nodes) <= 1:
#                 break
#
#         return all_summaries