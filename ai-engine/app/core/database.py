import os
from pinecone import Pinecone, ServerlessSpec
from dotenv import load_dotenv
from app.core.config import Settings



load_dotenv()

pc=Pinecone(api_key=(Settings.PINECONE_API_KEY))

INDEX_NAME=Settings.PINECONE_INDEX_NAME


if INDEX_NAME not in pc.list_indexes().names():
    print(f"Creating Index {INDEX_NAME}...")
    pc.create_index(
        name=INDEX_NAME,
        dimension=Settings.EMBEDDING_DIMENSION, # this index must match the MiniLM model
        metric='cosine',#cosine measures the angel between vectors. so it is best suited for texts and documents
        spec=ServerlessSpec(
            cloud='aws',
            region='us-east-1'
        )
    )
    
index=pc.Index(INDEX_NAME)  

def upsert_vectors(filename: str, chunks: list, vectors: list):
    print(f"Uploading {len(vectors)} chunks to Pinecone")  
    
    upsert_data=[]
    
    for i, (text_chunk, vector) in enumerate(zip(chunks, vectors)):
        #create a unique id for each chunk
        chunk_id=f"{filename}_{i}"
        
        record={
            "id":chunk_id,
            "values": vector,
            "metadata":{
                "filename": filename,
                "text": chunk_data['text'],
                "page_number":chunk_data['page_number']
            }
        }
        upsert_data.append(record)
    
    try:
        index.upsert(vectors=upsert_data)
        print("✅ Upload Successful!")
        return True    
    except Exception as e:
        print(f"❌ Database Upload Failed: {e}")
        return False
    
def delete_vectors(filename: str):
    try:
        index.delete(
            filter={
                "filename": {"$eq":filename}
            }
        )    
        print("✅ Pinecone cleanup successful")
        return true
    
    except Exception as e:
        print(f"❌ Pinecone Delete Failed: {e}")
        return false