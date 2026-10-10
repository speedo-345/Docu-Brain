# ai-engine/app/main.py
from fastapi import FastAPI, File, UploadFile, Form, BackgroundTasks
from dotenv import load_dotenv
import os
import asyncio
from pydantic import BaseModel
import shutil
import json
from fastapi.responses import StreamingResponse
from app.core.config import config

from app.ingestion_pipeline.file_parser import extract_text_from_file
from app.core.vectorizer import VectorBrain
from app.core.database import upsert_vectors, delete_vectors, assign_chunk_ids
from app.core.graph_db import graph_db
from app.retrieval_pipeline.search import smart_search
from langchain_community.tools import DuckDuckGoSearchRun

from app.core.llm_manager import LLMManager
from app.debate.orchestrator import run_debate


load_dotenv()

app = FastAPI()

brain = VectorBrain()

# ── In-memory status tracking for background processing ──
_processing_status: dict[str, dict] = {}


@app.post("/file-parser")
async def process_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    filename: str = Form(None),
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

        success_l0 = await upsert_vectors(doc_filename, leaf_chunks, leaf_vectors, user_id=user_id)

        if not success_l0:
            _processing_status[doc_filename] = {"stage": "failed", "message": "Failed to save vectors."}
            return {"error": "Failed to save base vectors to database."}

        # ── COMPLETE: Document is now fully indexed and searchable ──
        _processing_status[doc_filename] = {"stage": "complete", "message": "Document is fully indexed and ready!"}

        # ── PHASE 2: GraphRAG Background Extraction ──
        # We push this to a background task so the user gets instant upload success.
        leaf_texts_for_graph = [c['text'] for c in leaf_chunks[:10]]
        background_tasks.add_task(graph_db.add_document_entities_bg, doc_filename, user_id, leaf_texts_for_graph)

        return {
            "filename": doc_filename,
            "status": "complete",
            "details": {
                "chunks": len(leaf_chunks),
            }
        }

    except Exception as e:
        print(f"❌ Critical Error: {str(e)}")
        _processing_status[doc_filename] = {"stage": "failed", "message": str(e)}
        return {"error": str(e)}

    finally:
        if os.path.exists(temp_filename):
            os.remove(temp_filename)


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
        results = await smart_search(
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
            
            # ── GraphRAG Context ──
            graph_context = graph_db.query_graph(query.text, query.user_id)
            if graph_context:
                context_parts.append(graph_context)

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
            # ── AGENTIC FALLBACK: Web Search ──
            try:
                search_tool = DuckDuckGoSearchRun()
                web_results = search_tool.invoke(query.text)
                
                context = f"[LIVE WEB SEARCH RESULTS]\n{web_results}\n\n"
                
                history_str = ""
                if query.history:
                    history_str = "[CONVERSATION HISTORY]\n"
                    for msg in query.history:
                        role_name = "User" if msg.get("role") == "user" else "Assistant"
                        history_str += f"{role_name}: {msg.get('content')}\n"
                    history_str += "\n"

                prompt = (
                    "You are DocuBrain, a knowledgeable and helpful AI assistant. "
                    "The user's question did not match anything in their uploaded documents, so I have automatically "
                    "performed a live web search to find the answer. "
                    "Synthesize the web search results below to answer the user's question clearly and accurately.\n\n"
                    f"{history_str}"
                    f"{context}"
                    f"User Question: {query.text}\n\n"
                    "Your answer:"
                )
                
                # Push a pseudo-result to the client so they know it came from the web
                results = [{"text": "Extracted from live web search.", "score": 1.0, "filename": "🌐 Live Web Search", "page": 1}]
                
            except Exception as search_err:
                # If DuckDuckGo fails, fallback to general knowledge
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

        # ── MULTI-AGENT DEBATE: Detection ──
        is_debate = False
        if has_relevant_results:
            try:
                llm = LLMManager.get_llm()
                debate_classify = (
                    "Is this question subjective, comparative, evaluative, or debatable? "
                    "(e.g., 'Is X better than Y?', 'Should we invest in X?', 'Is this a good approach?')\n"
                    "Answer ONLY 'YES' or 'NO'.\n"
                    f"Question: {query.text}"
                )
                debate_result = await llm.ainvoke(debate_classify)
                is_debate = (debate_result.content if hasattr(debate_result, 'content') else str(debate_result)).strip().upper().startswith('YES')
            except Exception:
                is_debate = False

        if is_debate and has_relevant_results:
            # ── DEBATE MODE ──
            async def generate_response():
                yield f"data: {json.dumps({'type': 'results', 'data': results})}\n\n"
                async for event in run_debate(context, query.text, history_str):
                    yield event

            return StreamingResponse(generate_response(), media_type="text/event-stream")

        # ── GENERATIVE UI: Chart Detection ──
        chart_data = None
        if has_relevant_results:
            try:
                llm = LLMManager.get_llm()
                classify_prompt = (
                    "Decide if this question asks for data that can be visualized as a chart "
                    "(comparisons, trends, percentages, rankings, distributions). "
                    "Answer ONLY 'YES' or 'NO'.\n"
                    f"Question: {query.text}"
                )
                classify_result = await llm.ainvoke(classify_prompt)
                is_chart = (classify_result.content if hasattr(classify_result, 'content') else str(classify_result)).strip().upper().startswith('YES')
                
                if is_chart:
                    chart_prompt = (
                        "Based on the document context below, generate chart data for the user's question. "
                        "Output ONLY valid JSON, no markdown fences, no commentary. Use this exact format:\n"
                        '{"chart_type": "bar|pie|line", "title": "Chart Title", '
                        '"labels": ["Label1", "Label2"], '
                        '"datasets": [{"label": "Series Name", "data": [10, 20]}]}\n\n'
                        f"Context:\n{context[:2000]}\n\n"
                        f"Question: {query.text}\nJSON:"
                    )
                    chart_result = await llm.ainvoke(chart_prompt)
                    chart_raw = (chart_result.content if hasattr(chart_result, 'content') else str(chart_result)).strip()
                    chart_raw = chart_raw.replace('```json', '').replace('```', '').strip()
                    chart_data = json.loads(chart_raw)
            except Exception as chart_err:
                print(f"⚠️ Chart generation skipped: {chart_err}")
                chart_data = None

        async def generate_response():
            yield f"data: {json.dumps({'type': 'results', 'data': results})}\n\n"
            
            # Stream chart data if available
            if chart_data:
                yield f"data: {json.dumps({'type': 'chart', 'data': chart_data})}\n\n"
            
            try:
                llm = LLMManager.get_llm()
                async for chunk in llm.astream(prompt):
                    content = chunk.content if hasattr(chunk, 'content') else str(chunk)
                    if content:
                        yield f"data: {json.dumps({'type': 'token', 'data': content})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"
            
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        return StreamingResponse(generate_response(), media_type="text/event-stream")

    except Exception as e:
        print(f"❌ Search Error: {str(e)}")
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"error": str(e)})


class DeleteRequest(BaseModel):
    filename: str
    user_id: str = None


@app.post("/delete")
async def delete_file(request: DeleteRequest):
    success = await delete_vectors(request.filename, request.user_id)

    if success:
        return {"status": "deleted"}
    else:
        return {"error": "Failed to delete from Pinecone"}