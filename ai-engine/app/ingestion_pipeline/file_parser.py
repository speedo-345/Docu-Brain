from pypdf import PdfReader
from google.genai import types
from google import genai
from docx import Document
from dotenv import load_dotenv
import os
from app.core.config import Settings

load_dotenv()

client= genai.Client(api_key=Settings.GEMINI_API_KEY)



def extract_text_from_file(file_path: str):
    #split_ext funxtion specifically slices and the last 
    ext= os.path.splitext(file_path)[1].lower()
    print(f"--- Processing File: {file_path} ({ext}) ---")
    
    if ext==".pdf":
        return _parse_pdf(file_path)
    
    else:
        print(f"❌ Unsupported file type: {ext}")
        return []
    
    
    
def _parse_pdf(file_path: str):
    pages_content=[]
    try:
        # fast extraction is done. PdfReader returns a colection of page object. Its like a blueprint
        with open(file_path, 'rb') as f:
            reader = PdfReader(f)
            
            # Extract text page by page to keep track of page numbers
            for i, page in enumerate(reader.pages):
                extracted = page.extract_text()
                if extracted and len(extracted.strip()) > 0:
                    pages_content.append({
                        "page": i + 1,  # 1-based index
                        "text": extracted
                    })
        
        #check if the text extracted is very small then the either the data is not eaxtacted correctly or image is present.
        #pass to gemini for ocr
          
        total_chars = sum(len(p['text']) for p in pages_content)
        
        if total_chars < 50 and client:
            print("⚠️ Low text detected. Switching to Gemini OCR...")
            ocr_text = _parse_pdf_with_gemini(file_path)
            
            # If OCR works, we treat the whole doc as "Page 1" 
            # (Gemini 1.5 doesn't easily split page numbers in raw text mode)
            if ocr_text:
                return [{"page": 1, "text": ocr_text}]
                
        return pages_content    
    
        
    
    except Exception as e:
        print(f"PDF Error: {e}")  
        return ""  
    
    
 #uses ocr to extract text from images and handwritten scan pdf   
def _parse_pdf_with_gemini(file_path: str):
    print("🚀 Sending to Gemini 1.5 Flash for OCR...")
    try:
        with open(file_path, "rb") as f:
            file_content = f.read()
            
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=[
                types.Content(
                    parts=[
                        types.Part.from_bytes(
                            data=file_content,
                            mime_type="application/pdf"
                        ),
                        types.Part.from_text(
                            text="Transcribe the text in this document exactly. Output ONLY the text content."
                        )
                    ]
                )
            ]
        )
        return response.text if response.text else ""
    except Exception as e:
        print(f"Gemini OCR Error: {e}")
        return ""  
       
# to chunk the text. when we send to ai it might crash. This way we are sending a specific amount of characters each time
def chunk_text(pages_content: list, chunk_size: int = 1000, overlap: int = 200):
    """
    Splits text into chunks while preserving page numbers.
    Input: List of {'page': int, 'text': str}
    Output: List of {'page_number': int, 'text': str}
    """
    if not pages_content:
        return []
        
    all_chunks = []
    
    try:
        for entry in pages_content:
            text = entry['text']
            page_num = entry['page']
            
            total_length = len(text)
            i = 0
            
            while i < total_length:
                # Slice the text
                chunk = text[i : i + chunk_size]
                
                # Clean formatting
                clean_chunk = chunk.replace('\n', ' ').strip()
                
                if clean_chunk:
                    all_chunks.append({
                        "text": clean_chunk,
                        "page_number": page_num
                    })
                
                # Move forward (Slide window)
                i += (chunk_size - overlap)
                
        return all_chunks

    except Exception as e:
        print(f"Error chunking text: {e}")
        return []
    
    
    
# text_parts = []
#     try:
#         #reader is an instance of the pdfreader class
#         reader = PdfReader(file_path)
#         #reader.pages is a list
#         for page in reader.pages:
#             text = page.extract_text()
#             if text:
#                 text_parts.append(text.strip())

#         final_text = "\n".join(text_parts)
#         return final_text
#     except Exception as e:
#         print(f"Error reading PDF: {e}")
#         return ""    