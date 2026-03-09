from app.core.database import index
# Delete everything in the namespace (or default namespace)
try:
    index.delete(delete_all=True)
    print("✅ Pinecone Index Wiped Successfully.")
except Exception as e:
    print(f"Error: {e}")