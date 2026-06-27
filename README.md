# DocuBrain: Intelligent Document Analysis & Chat

DocuBrain is a full-stack RAG (Retrieval-Augmented Generation) application that allows users to upload PDF documents, build a hierarchical summary tree (RAPTOR), and engage in semantic chat.

---

## 🛠 Recent Technical Fixes & Optimizations

### 1. AI Engine: RAPTOR Tree Construction

#### **Memory Optimization (Fixed `std::bad_alloc`)**
- **The Issue**: Document clustering originally used `GaussianMixture` (Expectation-Maximization), which has a high memory complexity of `O(N^2)`. On documents with many chunks, this caused an instant memory crash (`std::bad_alloc`) on systems with 8GB RAM.
- **The Solution**: Swapped `GaussianMixture` for **`MiniBatchKMeans`**. 
  - **Result**: Drastically reduced memory footprint. It processes embeddings in configurable batches (`batch_size=256`), making it stable for large documents on standard hardware.

#### **Speed Optimization (Asynchronous Summarization)**
- **The Issue**: Summary generation was strictly sequential. The system would wait for one LLM response before requesting the next, causing significant bottlenecks for large trees.
- **The Solution**: Implemented **Asynchronous Batch Processing**.
  - **Implementation**: Utilized LangChain's `ainvoke` coupled with `asyncio.gather(*tasks)`.
  - **Result**: Multiple clusters are now summarized concurrently, dramatically reducing total ingestion time.

---

### 2. Frontend: PDF Document Viewer

#### **File Switching & State Management**
- **The Issue**: Clicking a different file in the sidebar would often fail to update the viewer visually. The component wouldn't reset its internal "Loading" or "Pages" state correctly, leading to UI freezes or stale content.
- **The Solution**: Added a dedicated `useEffect` listener on the `documentName` prop.
  - **Logic**: Explicitly calls `setLoading(true)`, `setError(null)`, and `setNumPages(null)` whenever the document name changes.
  - **Result**: The viewer now flushes the previous document and correctly mounts the new one with a fresh loading state.

#### **PDF Worker Resolution**
- **The Issue**: Protocol-less URLs (`//unpkg.com/...`) for the PDF worker script caused `404` resolution errors in certain browser environments (especially on Next.js 15).
- **The Solution**: Hardened the worker configuration to use an explicit HTTPS endpoint: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`.

---

### 3. Backend: Chat History Recovery
- **The Issue**: Historical chat messages were failing to fetch even when they existed in the database. The Mongoose query in the controller was passing the filter object as a nested property, resulting in empty results.
- **The Solution**: 
  - **Fix**: Corrected the filter assignment in `docController.ts` from `Message.find({query})` (nested) to `Message.find(query)` (direct).
  - **Result**: Chat history now correctly persists and restores when switching between documents.

---

### 4. UX: Optimistic UI Deletion
- **The Issue**: Deleting a file from the library caused a full-section re-render with a global loading spinner. This made the application feel sluggish and "blocked" the user for several seconds while the AI engine cleaned up Pinecone.
- **The Solution**: Implemented **Optimistic UI Updates**.
  - **Logic**: The file is removed from the local React state *immediately* upon confirmation. The sync with the server (and AI engine cleanup) happens in the background.
  - **Result**: The interface feels instantaneous and fluid, providing immediate feedback to the user.

---

---

### 5. AI Engine: Performance & Vectorization Tuning
- **The Issue**: Document processing felt slow during vectorization and clustering phases.
- **The Solution**:
  - **Vector Batching**: Implemented `batch_size=128` in `vectorizer.py` to optimize CPU throughput during embedding generation.
  - **Chunk Architecture**: Increased `CHUNK_SIZE` to `1500` and `CHUNK_OVERLAP` to `300`. This reduces the total number of chunks by ~30%, significantly cutting down on DB writes and LLM summary loops without losing context.
  - **Clustering Speed**: Reduced `MiniBatchKMeans` initialization cycles (`n_init=1`), eliminating redundant mathematical passes during tree construction.

---

### 6. RAG: Search Accuracy & Depth
- **The Issue**: AI responses were sometimes too generic or missed specific data points.
- **The Solution**: 
  - **Expanded Context**: Increased `top_k` retrieval from `3` to `7` nodes, providing the LLM with a 130% larger data pool per query.
  - **Detailed Prompting**: Refined the LLM system prompt to explicitly prioritize "meticulous, detailed, and specific" answers over concise summaries.
  - **Data Integrity Fix**: Patched a critical `500 error` where Mongoose failed to store chat history because summary nodes returned `"Multiple"` instead of an integer for the page number.

---

### 7. UI: Resizable Layout System
- **The Issue**: The Chat and Library sidebars were a fixed width, taking up too much space on small monitors and too little on ultra-wide screens.
- **The Solution**: Integrated `react-resizable-panels`.
  - **Implementation**: Replaced static flex wrappers with a draggable `<PanelGroup>` system in the main Viewer page.
  - **Result**: Users can now custom-size the Chat sidebar, high-resolution PDF viewer, and Document Library according to their preference.

---

## 🚀 Key Features
- **Hierarchical RAG**: Uses the RAPTOR method for grouping related text chunks into summaries, allowing the AI to answer both specific and high-level questions about your documents.
- **Concurrent Processing**: Leveraging Python's `asyncio` for fast backend indexing.
- **Responsive Theme**: Dark-themed premium UI with glassmorphism effects.
- **Pinecone Integration**: Serverless vector database for efficient scaling.
