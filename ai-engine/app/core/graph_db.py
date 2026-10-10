import json
from neo4j import GraphDatabase
from app.core.config import config
from google import genai
from google.genai import types

class GraphDBManager:
    def __init__(self):
        self.uri = config.NEO4J_URI
        self.username = config.NEO4J_USERNAME
        self.password = config.NEO4J_PASSWORD
        self.driver = None
        if self.uri and self.password:
            try:
                self.driver = GraphDatabase.driver(self.uri, auth=(self.username, self.password))
                print("✅ Successfully connected to Neo4j Graph Database")
            except Exception as e:
                print(f"❌ Failed to connect to Neo4j: {e}")

    def close(self):
        if self.driver:
            self.driver.close()

    def add_document_entities_bg(self, doc_id: str, user_id: str, text_chunks: list):
        """
        Background task to extract entities and relations from text and push to Neo4j.
        """
        if not self.driver or not config.GEMINI_API_KEY:
            print("⚠️ Skipping GraphRAG - Neo4j or Gemini not configured.")
            return

        client = genai.Client(api_key=config.GEMINI_API_KEY)
        
        print(f"🕸️ [GraphRAG] Starting background extraction for doc {doc_id}...")
        
        # Limit to first 10 chunks to avoid huge API costs/delays
        max_chunks = min(len(text_chunks), 10)
        
        for i in range(max_chunks):
            chunk_text = text_chunks[i]
            
            prompt = (
                "You are a knowledge graph extractor. Given the following text, extract all entities and their relationships. "
                "Output MUST be valid JSON in this exact format: "
                "{\"triples\": [{\"head\": \"Entity1\", \"head_type\": \"Person/Company/Concept\", \"relation\": \"WORKED_AT/CREATED/ETC\", \"tail\": \"Entity2\", \"tail_type\": \"Company/Concept\"}]}\n\n"
                f"Text: {chunk_text}\n\nJSON:"
            )
            
            try:
                response = client.models.generate_content(
                    model=config.GEMINI_MODEL,
                    contents=prompt
                )
                
                # Parse JSON safely
                raw_text = response.text.replace("```json", "").replace("```", "").strip()
                data = json.loads(raw_text)
                
                if "triples" in data:
                    self._insert_triples(data["triples"], doc_id, user_id)
            except Exception as e:
                print(f"⚠️ GraphRAG extraction error on chunk {i}: {e}")
                
        print(f"🕸️ [GraphRAG] Completed graph building for doc {doc_id}")

    def _insert_triples(self, triples, doc_id, user_id):
        # Clean inputs to prevent Cypher injection issues on dynamic labels
        import re
        def clean_label(l):
            return re.sub(r'[^a-zA-Z0-9_]', '', l) or 'Entity'
            
        with self.driver.session() as session:
            for t in triples:
                head = t.get("head", "").upper()
                head_type = clean_label(t.get("head_type", "Entity"))
                rel = clean_label(t.get("relation", "RELATED_TO")).upper()
                tail = t.get("tail", "").upper()
                tail_type = clean_label(t.get("tail_type", "Entity"))
                
                if not head or not tail:
                    continue
                    
                # Create Nodes and Edges using Cypher
                query = f"""
                MERGE (h:{head_type} {{name: $head, user_id: $user_id}})
                MERGE (t:{tail_type} {{name: $tail, user_id: $user_id}})
                MERGE (h)-[r:{rel} {{doc_id: $doc_id}}]->(t)
                """
                session.run(query, head=head, tail=tail, user_id=user_id, doc_id=doc_id)

    def query_graph(self, question: str, user_id: str) -> str:
        """
        Extract key entities from the question and query the graph for context.
        """
        if not self.driver:
            return ""
            
        client = genai.Client(api_key=config.GEMINI_API_KEY)
        
        # 1. Ask LLM what entity is the focus of the question
        prompt = (
            "Extract the primary entity (person, company, technology) from this question. "
            "Output ONLY the entity name in uppercase. No other text.\n"
            f"Question: {question}"
        )
        try:
            response = client.models.generate_content(model=config.GEMINI_MODEL, contents=prompt)
            entity = response.text.strip().upper()
            
            if not entity or len(entity) < 3: return ""
            
            # 2. Query Neo4j for 1-hop and 2-hop relationships to this entity for this user
            query = """
            MATCH (n {user_id: $user_id})-[r]-(m)
            WHERE n.name CONTAINS $entity OR m.name CONTAINS $entity
            RETURN n.name, type(r), m.name
            LIMIT 15
            """
            
            with self.driver.session() as session:
                result = session.run(query, user_id=user_id, entity=entity)
                graph_context = "\n[KNOWLEDGE GRAPH RELATIONSHIPS (MULTI-HOP)]\n"
                found = False
                for record in result:
                    found = True
                    graph_context += f"({record['n.name']}) --[{record['type(r)']}]--> ({record['m.name']})\n"
                
                if found:
                    return graph_context + "\n"
                return ""
                
        except Exception as e:
            print(f"⚠️ GraphRAG Query error: {e}")
            return ""

graph_db = GraphDBManager()
