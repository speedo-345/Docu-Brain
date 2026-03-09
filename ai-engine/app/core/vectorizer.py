from sentence_transformers import SentenceTransformer


class VectorBrain:
    def __init__(self):
        print("Loading AI Model...(This happens only once)")
        #1. Load the AI Model
        #This donwloads a small, free model from HuggingFace
        self.model= SentenceTransformer('all-MiniLM-L6-v2')
    
    def convert_text_to_vector(self, text: str):
        #turn text into numpy array
        vector= self.model.encode(text)
        
        # because databases cannot store numpy array it is converted to a python list
        return vector.tolist()
    
    def convert_batch(self, texts: list):
        
        vectors= self.model.encode(texts)
        return vectors.tolist()