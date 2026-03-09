import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

print("\n--- RAW MODEL LIST ---")
try:
    # Just print the name and display_name of every model found
    for m in client.models.list():
        print(f"Model ID: {m.name}")
        if hasattr(m, 'display_name'):
            print(f"Display:  {m.display_name}")
        print("-" * 20)
except Exception as e:
    print(f"Error: {e}")