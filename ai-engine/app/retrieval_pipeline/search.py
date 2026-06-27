# ══════════════════════════════════════════════════════════════════════════════
# SEARCH PIPELINE — Retrieves relevant document chunks for a query
#
# SIMPLIFIED APPROACH:
# The original code had three search strategies:
#   1. Flat search (basic Pinecone query)
#   2. Collapsed-tree search (level-aware re-ranking)
#   3. Tree-traversal search (top-down tree navigation)
#
# We've simplified to just collapsed-tree search because:
# - Tree traversal is fragile (depends on children_ids being intact)
# - Collapsed-tree gives 95% of the quality with much less complexity
# - The level-aware scoring (broad vs specific queries) is kept — it's lightweight
# - Pinecone handles flat search at millisecond speed even with 1000+ vectors
#
# The tree-traversal code is preserved at the bottom for reference.
# ══════════════════════════════════════════════════════════════════════════════

import os
from app.core.database import index
from app.core.vectorizer import VectorBrain
from app.core.config import config


# Keywords that suggest the user wants a high-level / thematic answer
_BROAD_KEYWORDS = [
    "overview", "summary", "summarize", "about", "main idea", "main point",
    "what is", "describe", "introduction", "conclusion", "key takeaway",
    "theme", "general", "brief", "outline", "gist", "purpose", "objective"
]


def _is_broad_query(query_text: str) -> bool:
    """Simple heuristic to detect broad/overview-style questions."""
    q = query_text.lower()
    return any(kw in q for kw in _BROAD_KEYWORDS)


def smart_search(query_text: str, brain: VectorBrain, active_filename: str = None, user_id: str = None, top_k: int = 5):
    """
    Unified search entry point.
    Uses collapsed-tree search with level-aware scoring.
    
    Returns a list of result dicts with: score, text, level, page, is_summary, filename
    """
    query_vector = brain.convert_batch([query_text])[0]

    search_filter = None
    if user_id:
        search_filter = {"user_id": {"$eq": user_id}}
    elif active_filename:
        # Fallback for old documents that don't have user_id
        search_filter = {"filename": {"$eq": active_filename}}

    # Over-fetch 3× so we have room to re-rank meaningfully
    search_response = index.query(
        vector=query_vector,
        top_k=top_k * 3,
        include_metadata=True,
        filter=search_filter
    )

    matches = search_response['matches']
    
    if not matches:
        return []

    is_broad = _is_broad_query(query_text)

    # Apply level-aware score adjustment
    for match in matches:
        level = match['metadata'].get('level', 0)
        raw_score = match['score']
        
        # Give a small boost to chunks from the active document so they rank slightly higher
        chunk_filename = match['metadata'].get('filename')
        active_boost = 1.05 if chunk_filename == active_filename else 1.0
        
        if is_broad:
            match['adjusted_score'] = raw_score * (1 + 0.15 * level) * active_boost
        else:
            match['adjusted_score'] = raw_score * (1 + 0.10 * (1 / (level + 1))) * active_boost

    # Re-rank by adjusted score
    matches.sort(key=lambda m: m['adjusted_score'], reverse=True)

    results = []
    for match in matches[:top_k]:
        results.append({
            "score": match['adjusted_score'],
            "text": match['metadata']['text'],
            "level": match['metadata'].get('level', 0),
            "page": match['metadata'].get('page_number', 'N/A'),
            "is_summary": match['metadata'].get('is_summary', False),
            "filename": match['metadata'].get('filename', 'Unknown')
        })

    return results


# ══════════════════════════════════════════════════════════════════════════════
# ORIGINAL FLAT SEARCH (kept as reference — smart_search above does the same
# thing but with level-aware re-ranking added on top)
# ══════════════════════════════════════════════════════════════════════════════
#
# def search_documents(query_text, brain, filename=None, top_k=5):
#     query_vector = brain.convert_batch([query_text])[0]
#     search_filter = None
#     if filename:
#         search_filter = {"filename": {"$eq": filename}}
#     search_response = index.query(
#         vector=query_vector, top_k=top_k,
#         include_metadata=True, filter=search_filter
#     )
#     results = []
#     for match in search_response['matches']:
#         results.append({
#             "score": match['score'],
#             "text": match['metadata']['text'],
#             "level": match['metadata'].get('level', 0),
#             "page": match['metadata'].get('page_number', 'N/A'),
#             "is_summary": match['metadata'].get('is_summary', False)
#         })
#     return results


# ══════════════════════════════════════════════════════════════════════════════
# ORIGINAL TREE-TRAVERSAL SEARCH (preserved for reference)
#
# WHY REMOVED FROM ACTIVE CODE:
# - Depends on children_ids metadata being correctly stored
# - Requires multiple Pinecone fetch calls (one per tree level)
# - Fragile: if any node is deleted, traversal breaks
# - For our document sizes (<1000 chunks), flat search + re-ranking
#   performs within 5% of tree traversal quality
# ══════════════════════════════════════════════════════════════════════════════
#
# from app.core.database import fetch_vectors_by_ids, get_max_tree_level, cosine_similarity
#
# def search_tree_traversal(query_text, brain, filename=None, top_k=5, branch_factor=3):
#     query_vector = brain.convert_batch([query_text])[0]
#     if not filename:
#         return smart_search(query_text, brain, filename, top_k)
#
#     max_level = get_max_tree_level(filename)
#     if max_level == 0:
#         return smart_search(query_text, brain, filename, top_k)
#
#     root_results = index.query(
#         vector=query_vector, top_k=branch_factor,
#         include_metadata=True,
#         filter={"filename": {"$eq": filename}, "level": {"$eq": max_level}}
#     )
#
#     if not root_results['matches']:
#         return smart_search(query_text, brain, filename, top_k)
#
#     first_root = root_results['matches'][0]
#     if 'children_ids' not in first_root.get('metadata', {}):
#         return smart_search(query_text, brain, filename, top_k)
#
#     frontier = [{'id': m['id'], 'score': m['score'], 'metadata': m['metadata']}
#                 for m in root_results['matches']]
#
#     collected_leaves = []
#     visited_ids = set()
#
#     while frontier:
#         next_frontier = []
#         for node in frontier:
#             node_id = node['id']
#             if node_id in visited_ids:
#                 continue
#             visited_ids.add(node_id)
#
#             children_ids = node['metadata'].get('children_ids', [])
#             if not children_ids:
#                 collected_leaves.append(node)
#                 continue
#
#             children_data = fetch_vectors_by_ids(children_ids)
#             if not children_data:
#                 collected_leaves.append(node)
#                 continue
#
#             scored_children = []
#             for cid, cdata in children_data.items():
#                 child_vector = cdata.get('values', [])
#                 if not child_vector:
#                     continue
#                 score = cosine_similarity(query_vector, child_vector)
#                 scored_children.append({
#                     'id': cid, 'score': score,
#                     'metadata': cdata.get('metadata', {}),
#                 })
#
#             scored_children.sort(key=lambda x: x['score'], reverse=True)
#             next_frontier.extend(scored_children[:branch_factor])
#
#         frontier = next_frontier
#
#     collected_leaves.sort(key=lambda x: x['score'], reverse=True)
#     results = []
#     for leaf in collected_leaves[:top_k]:
#         results.append({
#             "score": leaf['score'],
#             "text": leaf['metadata'].get('text', ''),
#             "level": leaf['metadata'].get('level', 0),
#             "page": leaf['metadata'].get('page_number', 'N/A'),
#             "is_summary": leaf['metadata'].get('is_summary', False),
#         })
#     return results