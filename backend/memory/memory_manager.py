import os
import sys
import json
import argparse

# Dynamic import helper to report missing packages as JSON errors to Node.js
try:
  import chromadb
  from chromadb.utils import embedding_functions
except ImportError as err:
  print(json.dumps({"error": f"ChromaDB not installed or missing dependencies: {err}"}))
  sys.exit(1)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chroma_db")

def get_client():
  return chromadb.PersistentClient(path=DB_PATH)

def add_memory(collection_name, content, doc_id, metadata=None):
  client = get_client()
  # Use default local ONNX MiniLM embedding function (lightweight and free)
  emb_fn = embedding_functions.DefaultEmbeddingFunction()
  
  collection = client.get_or_create_collection(
    name=collection_name,
    embedding_function=emb_fn
  )
  
  metadatas_list = [metadata] if metadata else None
  collection.add(
    documents=[content],
    metadatas=metadatas_list,
    ids=[doc_id]
  )
  return {"status": "success", "id": doc_id}

def query_memory(collection_name, query_text, limit=3):
  client = get_client()
  emb_fn = embedding_functions.DefaultEmbeddingFunction()
  
  try:
    collection = client.get_collection(
      name=collection_name,
      embedding_function=emb_fn
    )
    
    results = collection.query(
      query_texts=[query_text],
      n_results=int(limit)
    )
    
    formatted_results = []
    if results and 'documents' in results and len(results['documents']) > 0:
      docs = results['documents'][0]
      ids = results['ids'][0]
      metadatas = results['metadatas'][0] if 'metadatas' in results else [{}]*len(docs)
      distances = results['distances'][0] if 'distances' in results else [0]*len(docs)
      
      for i in range(len(docs)):
        formatted_results.append({
          "id": ids[i],
          "content": docs[i],
          "metadata": metadatas[i],
          "distance": float(distances[i])
        })
        
    return {"status": "success", "results": formatted_results}
  except Exception as e:
    # Collection might not exist yet
    return {"status": "success", "results": [], "info": str(e)}

def delete_memory(collection_name, doc_id):
  client = get_client()
  try:
    collection = client.get_collection(name=collection_name)
    collection.delete(ids=[doc_id])
    return {"status": "success", "msg": f"Deleted ID {doc_id}"}
  except Exception as e:
    return {"status": "error", "error": str(e)}

def list_memory(collection_name):
  client = get_client()
  try:
    collection = client.get_collection(name=collection_name)
    results = collection.get()
    formatted = []
    if results and 'documents' in results:
      docs = results['documents']
      ids = results['ids']
      metadatas = results['metadatas'] if 'metadatas' in results and results['metadatas'] else [{}] * len(docs)
      for i in range(len(docs)):
        formatted.append({
          "id": ids[i],
          "content": docs[i],
          "metadata": metadatas[i] if metadatas[i] else {}
        })
    return {"status": "success", "results": formatted}
  except Exception as e:
    return {"status": "success", "results": [], "info": str(e)}

def main():
  parser = argparse.ArgumentParser(description="J.A.R.V.I.S. ChromaDB Vector Memory Connector")
  parser.add_argument("--action", required=True, choices=["add", "query", "delete", "list"])
  parser.add_argument("--collection", required=True)
  parser.add_argument("--content")
  parser.add_argument("--id")
  parser.add_argument("--metadata")
  parser.add_argument("--limit", default=3, type=int)
  
  args = parser.parse_args()
  
  try:
    if args.action == "add":
      if not args.content or not args.id:
        print(json.dumps({"error": "action 'add' requires --content and --id"}))
        return
      meta = json.loads(args.metadata) if args.metadata else None
      res = add_memory(args.collection, args.content, args.id, meta)
      print(json.dumps(res))
      
    elif args.action == "query":
      if not args.content:
        print(json.dumps({"error": "action 'query' requires --content"}))
        return
      res = query_memory(args.collection, args.content, args.limit)
      print(json.dumps(res))
      
    elif args.action == "delete":
      if not args.id:
        print(json.dumps({"error": "action 'delete' requires --id"}))
        return
      res = delete_memory(args.collection, args.id)
      print(json.dumps(res))
      
    elif args.action == "list":
      res = list_memory(args.collection)
      print(json.dumps(res))
  except Exception as ex:
    print(json.dumps({"error": f"Memory process exception: {str(ex)}"}))

if __name__ == "__main__":
  main()
