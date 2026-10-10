from sentence_transformers import SentenceTransformer
from app.core.config import config
from langchain_text_splitters import RecursiveCharacterTextSplitter


# class VectorBrain:
#     def __init__(self):
#         print("Loading AI Model...(This happens only once)")
#         #1. Load the AI Model
#         #This donwloads a small, free model from HuggingFace
#         self.model= SentenceTransformer('all-MiniLM-L6-v2')
    
#     def convert_text_to_vector(self, text: str):
#         #turn text into numpy array
#         vector= self.model.encode(text)
        
#         # because databases cannot store numpy array it is converted to a python list
#         return vector.tolist()
    
#     def convert_batch(self, texts: list):
        
#         vectors= self.model.encode(texts)
#         return vectors.tolist()
class VectorBrain:
    def __init__(self):

        print(f"[*] Loading Embedding Model: {config.EMBEDDING_MODEL}")
        self.model= SentenceTransformer(config.EMBEDDING_MODEL)

    def split_documents(self, documents):
        """
        Implements Small-to-Big (Parent-Child) chunking.
        Documents are split into large Parent chunks (for LLM context).
        Parents are then split into small Child chunks (for accurate retrieval).
        The child chunk holds the parent's text in its metadata.
        """
        import uuid
        parent_splitter = RecursiveCharacterTextSplitter(
            chunk_size=2000,
            chunk_overlap=200,
            separators=["\n\n\n", "\n\n", "\n", ". ", " ", ""]
        )
        
        child_splitter = RecursiveCharacterTextSplitter(
            chunk_size=400,
            chunk_overlap=50,
            separators=["\n\n", "\n", ". ", " ", ""]
        )

        final_child_chunks = []
        for doc in documents:
            page_val = doc.metadata.get("page_number", 1)
            
            # 1. Split into large parent chunks
            parent_splits = parent_splitter.split_text(doc.page_content)
            
            for parent_text in parent_splits:
                if not parent_text.strip():
                    continue
                    
                parent_id = f"parent_{uuid.uuid4().hex[:8]}"
                
                # 2. Split parent into small child chunks
                child_splits = child_splitter.split_text(parent_text)
                
                for child_text in child_splits:
                    if child_text.strip():
                        # We store the parent text right in the child's metadata 
                        # so we don't need a separate DB for retrieval!
                        final_child_chunks.append({
                            "text": child_text.strip(),
                            "metadata": {
                                "page_number": page_val,
                                "parent_id": parent_id,
                                "parent_text": parent_text.strip()
                            }
                        })

        return final_child_chunks


    def convert_batch(self, texts: list):
        # Encode with an optimized batch size and skip progress bars for raw speed
        vectors = self.model.encode(texts, batch_size=128, show_progress_bar=False)
        return vectors.tolist()