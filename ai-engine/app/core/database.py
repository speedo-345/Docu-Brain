
import uuid
import numpy as np
from pinecone import Pinecone, ServerlessSpec#Pinecone handles the scaling for you; it's faster to set up and usually much cheaper

from app.core.config import config




pc=Pinecone(api_key=(config.PINECONE_API_KEY))

INDEX_NAME=config.PINECONE_INDEX_NAME


if INDEX_NAME not in pc.list_indexes().names():
    print(f"Creating Index {INDEX_NAME}...")
    pc.create_index(
        name=INDEX_NAME,
        dimension=config.EMBEDDING_DIMENSION, # this index must match the MiniLM model
        metric='cosine',#cosine measures the angel between vectors. so it is best suited for texts and documents
        spec=ServerlessSpec(
            cloud='aws',
            region='us-east-1'
        )
    )
    
index=pc.Index(INDEX_NAME)  


# ──────────────────────────────────────────────────────────────────────
# RAPTOR IMPROVEMENT #4 — Pre-assign IDs to chunks BEFORE upserting.
# This lets the tree builder reference leaf/child IDs when constructing
# parent summary nodes, enabling tree-traversal retrieval later.
# ──────────────────────────────────────────────────────────────────────
def assign_chunk_ids(filename: str, chunks: list):
    """
    Assigns a unique Pinecone vector ID to each chunk dict (in-place).
    Must be called BEFORE upsert_vectors() and BEFORE tree building,
    so that the tree builder can read chunk['id'] for children_ids.
    """
    for chunk in chunks:
        if 'id' not in chunk:
            chunk['id'] = f"{filename}_{uuid.uuid4().hex[:8]}"
    return chunks


def upsert_vectors(filename: str, chunks: list, vectors: list, user_id: str = None):
    

    print(f"[*] Uploading {len(vectors)} vectors to Pinecone...")  
    
    upsert_data=[]
    
    for i, (chunk_data, vector) in enumerate(zip(chunks, vectors)):
        # Use pre-assigned ID if the chunk already has one (from assign_chunk_ids),
        # otherwise generate a new one (backward-compatible fallback).
        chunk_id = chunk_data.get('id', f"{filename}_{uuid.uuid4().hex[:8]}")

        # 2. Extract existing metadata and add the filename
        # We merge the metadata we already have with the filename

        metadata=chunk_data.get('metadata', {}).copy()
        metadata['filename']=filename
        metadata['text']=chunk_data['text']#The text must be in metadata to read it back
        
        if user_id:
            metadata['user_id'] = user_id
        
        if "page_number" not in metadata:
            metadata["page_number"]=chunk_data.get("page_number", "Multiple")

        record={
            "id":chunk_id,
            "values": vector,
            "metadata":metadata
        }
        upsert_data.append(record)
    
    try:
        # Pinecone fails if given > 1000 items at once. Wrap in safe batches
        batch_size = 100
        for i in range(0, len(upsert_data), batch_size):
            index.upsert(vectors=upsert_data[i:i+batch_size])
            
        print("✅ Upload Successful!")
        return True    
    except Exception as e:
        print(f"❌ Database Upload Failed: {e}")
        return False
    

# ──────────────────────────────────────────────────────────────────────
# RAPTOR IMPROVEMENT #5 — Helpers for tree-traversal retrieval.
# fetch_vectors_by_ids: grab child vectors by their Pinecone IDs
#                       so we can score them against the query locally.
# get_max_tree_level:   discover how deep the RAPTOR tree goes for a
#                       given file so traversal knows where to start.
# ──────────────────────────────────────────────────────────────────────
def fetch_vectors_by_ids(ids: list):
    """
    Fetch specific vectors from Pinecone by their IDs.
    Returns a dict of { id: { 'values': [...], 'metadata': {...} } }.
    Batches in groups of 100 to stay within Pinecone limits.
    """
    all_vectors = {}
    batch_size = 100
    for i in range(0, len(ids), batch_size):
        batch = ids[i:i+batch_size]
        response = index.fetch(ids=batch)
        if response and 'vectors' in response:
            all_vectors.update(response['vectors'])
    return all_vectors


def get_max_tree_level(filename: str):
    """
    Discovers the highest tree level stored for a given file.
    Works by probing downward from level 10 to 1.
    Returns 0 if no tree summaries exist (leaf-only document).
    """
    # Probe from a reasonable max depth downward
    for level in range(10, 0, -1):
        try:
            results = index.query(
                vector=[0.0] * config.EMBEDDING_DIMENSION,
                top_k=1,
                include_metadata=True,
                filter={
                    "filename": {"$eq": filename},
                    "level": {"$eq": level}
                }
            )
            if results['matches']:
                print(f"[*] Tree depth for '{filename}': level {level}")
                return level
        except Exception:
            continue
    return 0


def cosine_similarity(vec_a, vec_b):
    """Compute cosine similarity between two vectors (used for local scoring in tree traversal)."""
    a = np.array(vec_a)
    b = np.array(vec_b)
    dot = np.dot(a, b)
    norm = np.linalg.norm(a) * np.linalg.norm(b)
    if norm == 0:
        return 0.0
    return float(dot / norm)


def delete_vectors(filename: str):
    try:
        index.delete(
            filter={
                "filename": {"$eq":filename}
            }
        )    
        print("✅ Pinecone cleanup successful")
        return True
    
    except Exception as e:
        print(f"❌ Pinecone Delete Failed: {e}")
        return False