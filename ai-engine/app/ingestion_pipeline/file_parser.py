import os
import fitz  # PyMuPDF
from langchain_core.documents import Document
from app.core.config import config
from google import genai
from google.genai import types

def extract_text_from_file(file_path: str):
    """
    SMART MULTI-MODAL PDF PARSER
    - Fast path: Extracts pure text instantly using PyMuPDF.
    - Vision path: If a page contains images/charts, it renders the page as an image
      and sends it to Gemini 2.0 Flash Vision to extract the text AND explain the charts!
    """
    ext = os.path.splitext(file_path)[1].lower()
    if ext != ".pdf":
        print(f"❌ Unsupported file type: {ext}")
        return []

    print(f"--- Processing File (Smart Multi-Modal Vision): {file_path} ---")
    documents_list = []
    
    try:
        # Initialize Gemini Client if available
        client = None
        if config.GEMINI_API_KEY:
            client = genai.Client(api_key=config.GEMINI_API_KEY)
        
        # Open PDF with PyMuPDF
        pdf_document = fitz.open(file_path)
        total_pages = len(pdf_document)
        print(f"[*] PDF has {total_pages} pages. Running Smart Extraction...")

        for page_num in range(total_pages):
            try:
                page = pdf_document[page_num]
                extracted_text = ""
                
                # Check if page has images or graphics
                image_list = page.get_images(full=True)
                has_images = len(image_list) > 0
                
                if has_images and client:
                    # MULTI-MODAL VISION PATH
                    print(f"[*] Page {page_num+1} contains images/charts. Using Gemini Vision...")
                    pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
                    img_bytes = pix.tobytes("png")
                    
                    response = client.models.generate_content(
                        model=config.GEMINI_MODEL,
                        contents=[
                            types.Content(
                                parts=[
                                    types.Part.from_bytes(data=img_bytes, mime_type="image/png"),
                                    types.Part.from_text(
                                        text=(
                                            "This page contains text and images/charts. "
                                            "Extract all text exactly as written. "
                                            "Additionally, deeply analyze any charts, diagrams, graphs, or complex tables "
                                            "and provide a detailed markdown summary of the data they show so it can be searched."
                                        )
                                    )
                                ]
                            )
                        ]
                    )
                    extracted_text = response.text if response.text else ""
                else:
                    # FAST TEXT EXTRACTION PATH
                    extracted_text = page.get_text("text")
                    
                if extracted_text.strip():
                    doc = Document(
                        page_content=extracted_text.strip(),
                        metadata={"page_number": page_num + 1}
                    )
                    documents_list.append(doc)
                    
            except Exception as page_err:
                print(f"⚠️ Warning: Failed to process page {page_num+1}: {page_err}")
                continue

        pdf_document.close()
        
        if not documents_list:
            print("❌ No text could be extracted from this PDF.")
            return []

        print(f"✅ Successfully parsed {len(documents_list)} pages.")
        return documents_list

    except Exception as e:
        print(f"❌ PDF Parsing Error: {e}")
        return []
