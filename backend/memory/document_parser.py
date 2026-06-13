import os
import sys
import json
import argparse

def parse_txt_or_md(filepath):
  with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
    return f.read()

def parse_pdf(filepath):
  try:
    import pypdf
  except ImportError:
    raise ImportError("pypdf is required to parse PDF files. Install it using pip.")
    
  reader = pypdf.PdfReader(filepath)
  text = []
  for page in reader.pages:
    page_text = page.extract_text()
    if page_text:
      text.append(page_text)
  return "\n".join(text)

def chunk_text(text, chunk_size=800, overlap=150):
  chunks = []
  words = text.split()
  
  # Group words into blocks to maintain context boundaries
  current_chunk = []
  current_len = 0
  
  for word in words:
    current_chunk.append(word)
    current_len += len(word) + 1 # +1 for space
    
    if current_len >= chunk_size:
      chunks.append(" ".join(current_chunk))
      # Overlap: keep the last N words
      overlap_words = current_chunk[-int(overlap/10):] if len(current_chunk) > int(overlap/10) else []
      current_chunk = overlap_words
      current_len = sum(len(w) + 1 for w in current_chunk)
      
  if current_chunk:
    chunks.append(" ".join(current_chunk))
    
  return chunks

def main():
  parser = argparse.ArgumentParser(description="J.A.R.V.I.S. Local File Ingestion & Chunking Utility")
  parser.add_argument("--file", required=True, help="Absolute path to the target file")
  parser.add_argument("--chunk_size", default=800, type=int)
  parser.add_argument("--overlap", default=150, type=int)
  
  args = parser.parse_args()
  
  if not os.path.exists(args.file):
    print(json.dumps({"error": f"File path does not exist: {args.file}"}))
    return

  ext = os.path.splitext(args.file)[1].lower()
  
  try:
    if ext == ".pdf":
      text = parse_pdf(args.file)
    elif ext in [".txt", ".md", ".json", ".csv"]:
      text = parse_txt_or_md(args.file)
    else:
      print(json.dumps({"error": f"Unsupported file extension: {ext}"}))
      return
      
    if not text.strip():
      print(json.dumps({"error": "No extractable text content found in document."}))
      return

    chunks = chunk_text(text, args.chunk_size, args.overlap)
    print(json.dumps({"status": "success", "file": args.file, "chunks": chunks}))
    
  except Exception as e:
    print(json.dumps({"error": f"Failed to parse document: {str(e)}"}))

if __name__ == "__main__":
  main()
