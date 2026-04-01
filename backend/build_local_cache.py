import os
import re
import json
import logging
import numpy as np
import ast
from sentence_transformers import SentenceTransformer
import torch

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Device detection parity with generate_embeddings_smart.py
def get_best_device():
    try:
        if torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"

DEVICE = get_best_device()

def parse_sql_dump(file_path):
    logger.info(f"🔍 Parsing SQL Dump: {file_path}")
    if not os.path.exists(file_path):
        logger.error(f"❌ File not found: {file_path}")
        return []
    
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # The file has a structured pattern. We will use a regex to extract content inside the top-level parentheses.
    # To handle commas inside strings, we can't use simple split.
    # Python ast.literal_eval handles tuples containing strings with commas perfectly!
    
    # Locate VALUES block
    values_idx = content.find("VALUES")
    if values_idx == -1:
        logger.error("❌ Could not find VALUES in SQL file.")
        return []
        
    values_block = content[values_idx + 6:].strip()
    
    # Simple regex to heuristically grab tuples that look like ('ID123', 'Name', ...)
    # This works if the nested data isn't incredibly erratic.
    tuple_strings = re.findall(r"\(\'[VEM][0-9]{4}\'.*?\)", values_block, flags=re.DOTALL)
    
    parsed_orgs = []
    logger.info(f"⚙️ Found {len(tuple_strings)} potential organization rows.")
    
    for t_str in tuple_strings:
        # Prevent multiline breaks from ruining AST, substitute NULL
        clean_str = t_str.replace('\n', ' ').replace('\r', ' ').replace('NULL', 'None').replace('true', 'True').replace('false', 'False')
        try:
            data = ast.literal_eval(clean_str)
            if data and len(data) >= 5:
                # Column mapping based on standard setup
                org = {
                    "id": str(data[0]),
                    "name": str(data[1]) if data[1] else "",
                    "domain": str(data[2]) if data[2] else "",
                    "type": str(data[3]) if data[3] else "",
                    "description": str(data[4]) if data[4] else "",
                    "email": str(data[5]) if len(data)>5 and data[5] else "",
                    "website": str(data[6]) if len(data)>6 and data[6] else "",
                    "team_size": int(data[10]) if len(data)>10 and data[10] else 0,
                    "views": 0,
                    "skills": []
                }
                parsed_orgs.append(org)
        except Exception as e:
            # Let's try an even simpler method if ast fails due to complex string escaping
            try:
                # Fallback: Just extract strings using regex
                strings = re.findall(r"'([^']*)'", clean_str)
                if len(strings) >= 5:
                    org = {
                        "id": strings[0],
                        "name": strings[1],
                        "domain": strings[2],
                        "type": strings[3],
                        "description": strings[4],
                        "email": strings[5] if len(strings)>5 else "",
                        "website": strings[6] if len(strings)>6 else "",
                        "team_size": 10,
                        "views": 0,
                        "skills": []
                    }
                    parsed_orgs.append(org)
            except Exception as e2:
                logger.debug(f"Row mapping failed: {e2}")
                continue
                
    logger.info(f"✅ Successfully extracted {len(parsed_orgs)} organizations into active memory.")
    return parsed_orgs

def build_cache():
    orgs = parse_sql_dump("organizations_250_full.sql")
    if not orgs:
        return
        
    logger.info("🤖 Loading GTE-Large embedding model...")
    model = SentenceTransformer("thenlper/gte-large", device=DEVICE)
    
    combined_texts = []
    for org in orgs:
        text = f"{org.get('name', '')} {org.get('domain', '')} {org.get('type', '')} {org.get('description', '')}"
        combined_texts.append(text[:2000])

    logger.info(f"🚀 Generating GTE-Large embeddings for {len(combined_texts)} organizations...")
    logger.info(f"   Device: {DEVICE}")
    
    embeddings = model.encode(
        combined_texts,
        show_progress_bar=True,
        batch_size=16,
        convert_to_numpy=True,
        normalize_embeddings=True,
        device=DEVICE
    )
    
    logger.info("💾 Saving embeddings to local numpy matrix 'local_embeddings.npy'...")
    np.save("local_embeddings.npy", embeddings)
    
    logger.info("💾 Saving organizations JSON corpus 'local_orgs.json'...")
    with open("local_orgs.json", "w", encoding="utf-8") as f:
        json.dump(orgs, f, indent=4)
        
    logger.info("✅ Build Complete! You have successfully bypassed MySQL.")

if __name__ == "__main__":
    build_cache()
