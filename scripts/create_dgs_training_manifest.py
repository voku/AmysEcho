import json
from pathlib import Path

DGS_DIR = Path("server/data/dgs_video_examples")
OUTPUT_MANIFEST = Path("server/data/datasets/training_manifest.json")

def main():
    entries = []
    
    # Iterate over all _landmarks.json files in DGS_DIR
    for lm_file in DGS_DIR.glob("*_landmarks.json"):
        # label is filename without _landmarks.json
        label = lm_file.name.replace("_landmarks.json", "")
        
        entry = {
            "label": label,
            "profileId": None, # Global model
            "storage": {
                "directory": "dgs_video_examples",
                "files": [lm_file.name]
            }
        }
        entries.append(entry)
        
    manifest = {
        "version": "1.0",
        "entries": entries
    }
    
    OUTPUT_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    
    with open(OUTPUT_MANIFEST, "w") as f:
        json.dump(manifest, f, indent=2)
        
    print(f"Created {OUTPUT_MANIFEST} with {len(entries)} entries.")

if __name__ == "__main__":
    main()
