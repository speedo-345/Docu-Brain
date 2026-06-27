# ai-engine/app/main.py
from fastapi import FastAPI, File, UploadFile, Form
from dotenv import load_dotenv
import os
import asyncio
from pydantic import BaseModel
import shutil
from app.core.config import config

from app.ingestion_pipeline.file_parser import extract_text_from_file
from app.core.vectorizer import VectorBrain
from app.core.database import upsert_vectors, delete_vectors, assign_chunk_ids
from app.retrieval_pipeline.search import smart_search
from app.core.tree_builder import TreeBuilder
from app.core.llm_manager import LLMManager


load_dotenv()

app = FastAPI()

brain = VectorBrain()
tree_builder = TreeBuilder(brain)

# ── In-memory status tracking for background processing ──
_processing_status: dict[str, dict] = {}


@app.post("/file-parser")
async def process_pdf(
    file: UploadFile = File(...),
    filename: str = Form(None),  # Explicit filename from Node server (fixes the mismatch bug)
    user_id: str = Form(None)
):
    # CRITICAL FIX: Use the explicit filename passed by the Node server.
    # Previously, we used file.filename which was derived from the multipart
    # stream — this could differ from the Multer-generated name stored in MongoDB,
    # causing Pinecone to store vectors with a different filename than what the
    # search endpoint later uses to filter. This mismatch made chat silently fail.
    doc_filename = filename or file.filename

    # Save the file temporarily
    temp_filename = f'temp_{doc_filename}'
    with open(temp_filename, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        # ── PHASE 1: Parse + vectorize leaves (fast, synchronous) ──
        _processing_status[doc_filename] = {"stage": "parsing", "message": "Extracting text from your document..."}

        raw_docs = extract_text_from_file(temp_filename)

        if not raw_docs:
            _processing_status[doc_filename] = {"stage": "failed", "message": "Parsing failed."}
            return {"error": "Parsing failed. The PDF may be corrupted or contain only images."}

        _processing_status[doc_filename] = {"stage": "chunking", "message": "Splitting into chunks and creating embeddings..."}

        leaf_chunks = brain.split_documents(raw_docs)
        leaf_texts = [c['text'] for c in leaf_chunks]

        leaf_vectors = brain.convert_batch(leaf_texts)

        # Pre-assign unique Pinecone IDs to every leaf chunk BEFORE upserting
        assign_chunk_ids(doc_filename, leaf_chunks)

        _processing_status[doc_filename] = {"stage": "uploading", "message": "Saving vectors to database..."}

        success_l0 = upsert_vectors(doc_filename, leaf_chunks, leaf_vectors, user_id=user_id)

        if not success_l0:
            _processing_status[doc_filename] = {"stage": "failed", "message": "Failed to save vectors."}
            return {"error": "Failed to save base vectors to database."}

        # ── PHASE 1 COMPLETE: Document is now searchable ──
        _processing_status[doc_filename] = {"stage": "searchable", "message": "Document is searchable! Creating summary in background..."}

        # ── PHASE 2: Create document summary in background ──
        asyncio.create_task(_build_summary_background(doc_filename, leaf_chunks, leaf_vectors, user_id))

        return {
            "filename": doc_filename,
            "status": "searchable",
            "details": {
                "leaf_nodes": len(leaf_chunks),
            }
        }

    except Exception as e:
        print(f"❌ Critical Error: {str(e)}")
        _processing_status[doc_filename] = {"stage": "failed", "message": str(e)}
        return {"error": str(e)}

    finally:
        if os.path.exists(temp_filename):
            os.remove(temp_filename)


async def _build_summary_background(filename: str, leaf_chunks: list, leaf_vectors: list, user_id: str = None):
    """Background task: creates document summary and upserts it."""
    try:
        def status_update(stage: str, message: str):
            _processing_status[filename] = {"stage": stage, "message": message}

        print("[*] Starting Document Summarization (background)")
        status_update("summarizing", "Creating document summary...")

        all_summaries = await tree_builder.create_summaries(
            leaf_chunks, leaf_vectors, status_callback=status_update
        )

        if all_summaries:
            summary_nodes = [item['node'] for item in all_summaries]
            summary_vectors = [item['vector'] for item in all_summaries]

            status_update("indexing", "Saving summary to database...")
            success = upsert_vectors(filename, summary_nodes, summary_vectors, user_id=user_id)

            if not success:
                print("Summary created but failed to upload to Pinecone")
                status_update("complete_partial", "Summary created but failed to save.")
            else:
                status_update("complete", "Document is fully indexed and ready!")
        else:
            status_update("complete", "Document indexed (no summary needed for small documents).")

        print("[+] Summarization Complete.")
        LLMManager.unload_model()

    except Exception as e:
        print(f"❌ Background summarization failed: {str(e)}")
        _processing_status[filename] = {"stage": "complete_partial", "message": f"Summary failed: {str(e)}. Basic search still works."}
        LLMManager.unload_model()


@app.get("/status/{filename}")
async def get_processing_status(filename: str):
    """Returns the current processing stage for a file."""
    return _processing_status.get(filename, {"stage": "unknown", "message": "No status available."})


class SearchQuery(BaseModel):
    text: str
    top_k: int = 5
    filename: str = None
    user_id: str = None
    history: list[dict] = []


@app.post("/search")
async def search_endpoint(query: SearchQuery):
    try:
        # We now pass user_id to smart_search so it can search across ALL documents
        # for this user, instead of just query.filename
        results = smart_search(
            query.text, 
            brain, 
            active_filename=query.filename, 
            user_id=query.user_id, 
            top_k=query.top_k
        )

        # ── Check relevance: if no results or all scores are too low,
        #    answer the question from general knowledge instead of saying
        #    "I couldn't find relevant info." ──
        has_relevant_results = (
            results and
            any(r['score'] > config.RELEVANCE_THRESHOLD for r in results)
        )

        if has_relevant_results:
            # ── Segregate Primary Context (Active Document) from Related Context (Other Documents) ──
            primary_summaries = []
            primary_leaves = []
            related_context = []

            for r in results:
                # Fallback: if filename isn't in metadata, assume primary
                chunk_filename = r.get('filename', query.filename) 
                
                if chunk_filename == query.filename:
                    if r.get('is_summary', False):
                        primary_summaries.append(r['text'])
                    else:
                        primary_leaves.append(r['text'])
                else:
                    related_context.append(f"From document '{chunk_filename}':\n{r['text']}")

            context_parts = []
            if primary_summaries:
                context_parts.append("[DOCUMENT OVERVIEW]\n" + "\n\n".join(primary_summaries))
            if primary_leaves:
                trimmed_leaves = [t[:600] + "..." if len(t) > 600 else t for t in primary_leaves]
                context_parts.append("[DOCUMENT CONTENT]\n" + "\n\n---\n\n".join(trimmed_leaves))
            if related_context:
                trimmed_related = [t[:400] + "..." if len(t) > 400 else t for t in related_context]
                context_parts.append("[RELATED DOCUMENTS]\n" + "\n\n---\n\n".join(trimmed_related))

            context = "\n\n".join(context_parts)
            
            history_str = ""
            if query.history:
                history_str = "[CONVERSATION HISTORY]\n"
                for msg in query.history:
                    role_name = "User" if msg.get("role") == "user" else "Assistant"
                    history_str += f"{role_name}: {msg.get('content')}\n"
                history_str += "\n"

            prompt = (
                "You are DocuBrain, an expert AI assistant that helps users understand their documents. "
                "You have deep expertise in analysing, summarising, and explaining any kind of document content.\n\n"
                "Use the document context below as your primary source of truth. "
                "Reason carefully over it and give a thorough, well-structured answer. "
                "You may expand on the document content with logical inferences, explanations, and examples where helpful — "
                "just clearly distinguish inferred content from what's directly stated. "
                "If information from another document is used, name that document. "
                "Never just repeat raw chunks verbatim — always synthesise and explain.\n\n"
                f"{history_str}"
                f"{context}\n\n"
                f"User Question: {query.text}\n\n"
                "Your detailed answer:"
            )
        else:
            history_str = ""
            if query.history:
                history_str = "[CONVERSATION HISTORY]\n"
                for msg in query.history:
                    role_name = "User" if msg.get("role") == "user" else "Assistant"
                    history_str += f"{role_name}: {msg.get('content')}\n"
                history_str += "\n"

            prompt = (
                "You are DocuBrain, a knowledgeable and helpful AI assistant. "
                "The user's question doesn't appear in any uploaded document, so answer from your general knowledge. "
                "Be clear, thorough, and conversational — like a senior expert explaining to a colleague. "
                "Use the conversation history below if it's relevant to understand what the user is referring to.\n\n"
                f"{history_str}"
                f"User Question: {query.text}\n\n"
                "Your answer:"
            )

        llm = LLMManager.get_llm()
        llm_response = await llm.ainvoke(prompt)
        answer = llm_response.content if hasattr(llm_response, 'content') else str(llm_response)

        return {
            "count": len(results),
            "results": results,
            "answer": answer
        }

    except Exception as e:
        print(f"❌ Search Error: {str(e)}")
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": str(e)})


class DeleteRequest(BaseModel):
    filename: str


@app.post("/delete")
async def delete_file(request: DeleteRequest):
    success = delete_vectors(request.filename)

    if success:
        return {"status": "deleted"}
    else:
        return {"error": "Failed to delete from Pinecone"}