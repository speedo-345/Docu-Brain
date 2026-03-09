import os
from app.core.database import index
from app.core.vectorizer import VectorBrain

def search_documents(query_text: str, brain: VectorBrain, top_k: int=5):
    query_vector = brain.convert_text_to_vector(query_text)
    
    search_response = index.query(
        vector=query_vector,
        top_k=top_k,
        include_metadata=True
    )

    results = []
    
    
    for match in search_response['matches']:#we get output in an object form which contains matches. It contains the following data 
        if match['score'] < 0.3:
            continue
            
        results.append({
            "score": round(match['score'], 2),
            "text": match['metadata'].get("text", "No text found"),
            "filename": match['metadata'].get("filename", "Unknown"),
            "chunk_id": match['id'],
            "page_number":int(float(match['metadata'].get("page_number", 1)))
        })
        
    return results 