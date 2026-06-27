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
        Split LangChain Documents into smaller chunks suitable for embedding.

        NOTE: We use ONLY RecursiveCharacterTextSplitter here.
        A MarkdownHeaderTextSplitter was previously used as a first pass, but pypdf
        outputs plain text (not Markdown) with no # headers to split on.
        It would produce one giant chunk per page and then RecursiveCharacterTextSplitter
        would still need to do all the real work anyway — making it a useless step.
        """
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=config.CHUNK_SIZE,
            chunk_overlap=config.CHUNK_OVERLAP,
            separators=["\n\n\n", "\n\n", "\n", ". ", " ", ""]
        )

        final_chunks = []
        for doc in documents:
            page_val = doc.metadata.get("page_number", 1)
            sub_splits = text_splitter.split_text(doc.page_content)

            for split_text in sub_splits:
                if split_text.strip():
                    final_chunks.append({
                        "text": split_text.strip(),
                        "metadata": {"page_number": page_val}
                    })

        return final_chunks


    def convert_batch(self, texts: list):
        # Encode with an optimized batch size and skip progress bars for raw speed
        vectors = self.model.encode(texts, batch_size=128, show_progress_bar=False)
        return vectors.tolist()