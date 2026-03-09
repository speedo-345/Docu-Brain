# ai-engine/app/main.py
from fastapi import FastAPI, File, UploadFile
from dotenv import load_dotenv
import os
from app.ingestion_pipeline.file_parser import extract_text_from_file, chunk_text
from app.core.vectorizer import VectorBrain
from app.core.database import upsert_vectors
from app.retrieval_pipeline.search import search_documents
from pydantic import BaseModel
import shutil



load_dotenv()

app = FastAPI()

brain=VectorBrain()

@app.post("/file-parser")

async def process_pdf(file: UploadFile=File(...)):
    #save the file temporarily
    temp_filename=f'temp_{file.filename}'
    #here when open in wb it does not corrupts the pdf and keeps it safe. also data is opened from file in small sizes and stored in buffer .
    #this avoids server crash
    with open(temp_filename, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        #file.file is the source and buffer is target. 
        #shutil is stream based. it reads small amount nearly 64Kb the writes it and repeats this.THis is memory effixient, stable .
    
    try:
        
        pages_content= extract_text_from_file(temp_filename)
        
        chunks=chunk_text(pages_content)
        
        text_only_list = [c['text'] for c in chunks]
        
        vectors=brain.convert_batch(text_only_list)
        success=upsert_vectors(file.filename, chunks, vectors)
        
        if not success:
            return {"error": "Failed to save to database."}
        
        if not chunks or not vectors:
         return {
          "filename": file.filename,
          "status": "No text found in PDF (Is it an image?)",
          "total_chunks": 0
        }
        
        return {
            "filename": file.filename,
            "total_chunks": len(chunks),
            "vector_dimension": len(vectors[0]),
            "sample_chunk": chunks[0]
        }
        
    finally:
        
        if os.path.exists(temp_filename):
            os.remove(temp_filename)    
            


class SearchQuery(BaseModel):
    text: str
    top_k: int=3
    


@app.post("/search") 
async def search_endpoint(query: SearchQuery):
    try:
        results= search_documents(query.text, brain, query.top_k)
        
        return {
            "count": len(results),
            "results": results
        }    
    
    except Exception as e:
        return{"error": str(e)} 
    
                  
class DeleteRequest(BaseModel):
    filename:str    
    

@app.post("/delete")
async def delete_file(request: DeleteRequest):
    success= delete_vectors(request.filename)
    
    if success:
        return {"status": "deleted"}
    else:
        return {"error":"Failed to delete from Pinecone"}