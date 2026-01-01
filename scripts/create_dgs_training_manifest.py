import json
from pathlib import Path

DGS_DIR = Path("server/data/dgs_video_examples")
OUTPUT_MANIFEST = Path("server/data/datasets/training_manifest.json")

# Map filenames back to labels using the logic: label_variant.json or label.json
def get_label_from_filename(filename):
    # Remove _landmarks.json
    name = filename.replace("_landmarks.json", "")
    
    # The label is the first part before any underscore
    # e.g. "alle_main_alle" -> "alle", "blau_0" -> "blau"
    label = name.split("_")[0]
    return label

def main():
    entries = []
    
    # Iterate over all _landmarks.json files in DGS_DIR
    files = list(DGS_DIR.glob("*_landmarks.json"))
    print(f"Found {len(files)} landmark files.")
    
    # Balance data: limit entries per label
    # NOTE: Selection is non-deterministic as it depends on filesystem glob() ordering.
    # This is acceptable for quick dataset creation, but for reproducible results,
    # consider sorting files explicitly before processing.
    label_counts = {}
    MAX_PER_LABEL = 10
    
    for lm_file in files:
        label = get_label_from_filename(lm_file.name)
        
        # Increment count for label
        count = label_counts.get(label, 0)
        if count >= MAX_PER_LABEL:
            continue
        
        label_counts[label] = count + 1
        
        # NOTE: storage.files is an array to support future multi-file entries
        # (e.g., multiple camera angles or temporal segments), even though
        # currently each entry contains only a single landmark file.
        entry = {
            "label": label,
            "profileId": None, # Global model
            "storage": {
                "directory": "dgs_video_examples",
                "files": [lm_file.name]
            }
        }
        entries.append(entry)
    
    # Print summary of counts
    print("Label distribution in manifest:")
    for lbl, cnt in sorted(label_counts.items()):
        print(f"  {lbl}: {cnt}")
        
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
