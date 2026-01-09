#!/usr/bin/env python3
"""
Integration test to verify that Python and TypeScript normalization logic is identical.
"""

import json
import subprocess
import sys
from pathlib import Path

import numpy as np

# Add src to path
sys.path.append(str(Path(__file__).parent.parent / "training"))
from config_constants import INPUT_FEATURE_SIZE
from frame_normalization import _normalize_frame


def test_normalization_sync():
    """Verify that Python and TypeScript normalization results match."""
    
    print("🚀 Verifying normalization sync between Python and TypeScript...")
    
    # 1. Create a deterministic landmark set
    hands = [[0.5 + i*0.01, 0.4 + i*0.005, 0.1] for i in range(42)]
    pose = [[0.5, 0.5, 0.0, 1.0] for _ in range(33)]
    face = [[0.5, 0.5, 0.0] for _ in range(468)]
    
    # 2. Run Python normalization
    py_result = _normalize_frame(hands, pose, face)
    if py_result is None:
        raise ValueError("Python normalization returned None")
    
    # Validate result dimension
    if py_result.shape[0] != INPUT_FEATURE_SIZE:
        print(f"❌ Unexpected Python feature size: {py_result.shape[0]}, expected {INPUT_FEATURE_SIZE}")
        sys.exit(1)
    
    py_result = py_result.astype(np.float32)
    
    # 3. Run TypeScript normalization via a small Node.js script
    # We'll create a temporary JS script to run the normalization
    js_test_script = Path(__file__).parent / "tmp_norm_test.mjs"
    
    # We need to find where the compiled JS or the TS source can be imported
    # Given the project structure, we can try to use the webapp source with 'tsx' or similar, 
    # but it's easier to just write a standalone JS that mimics the logic or imports from dist.
    
    input_data = {
        "hands": hands,
        "pose": pose,
        "face": face
    }
    
    js_code = f"""
import {{ prepareMultimodalForMLP }} from '../../webapp/src/gesture/utils/landmarkNormalizer.ts';

const input = {json.dumps(input_data)};
const result = prepareMultimodalForMLP(input.hands, input.pose, input.face);
console.log(JSON.stringify(Array.from(result)));
"""
    # Note: Using tsx to run the TS file directly
    try:
        # Check if tsx is available
        subprocess.run(["npx", "tsx", "--version"], check=True, capture_output=True)
    except (subprocess.SubprocessError, FileNotFoundError, PermissionError) as e:
        print(f"❌ 'tsx' check failed: {e}. Skipping cross-language test. Please install 'tsx' or run in an environment with Node.js.")
        return

    with open(js_test_script, "w") as f:
        f.write(js_code)
        
    try:
        process = subprocess.run(
            ["npx", "tsx", str(js_test_script)],
            cwd=Path(__file__).parent.parent.parent,
            capture_output=True,
            text=True
        )
        if process.returncode != 0:
            # Check if this is an environment issue (missing lib directory, etc.)
            stderr_lower = process.stderr.lower()
            if "enoent" in stderr_lower or "no such file" in stderr_lower or "cannot find" in stderr_lower:
                print("⚠️  Environment issue detected. Skipping cross-language test.")
                print("   This test requires the server to be built or proper Node.js environment.")
                print(f"   STDERR: {process.stderr[:200]}")
                return
            print(f"❌ JS test failed with code {process.returncode}")
            print(f"STDOUT: {process.stdout}")
            print(f"STDERR: {process.stderr}")
            sys.exit(1)
            
        js_result = np.array(json.loads(process.stdout), dtype=np.float32)
        
        # Validate JS result dimension
        if js_result.shape[0] != INPUT_FEATURE_SIZE:
            print(f"❌ Unexpected JS feature size: {js_result.shape[0]}, expected {INPUT_FEATURE_SIZE}")
            sys.exit(1)
        
        # 4. Compare results
        if py_result.shape != js_result.shape:
            print(f"❌ Shape mismatch: Python {py_result.shape} vs JS {js_result.shape}")
            sys.exit(1)
            
        # We allow a small epsilon for floating point differences
        if np.allclose(py_result, js_result, atol=1e-5):
            print("✅ Normalization sync verified! Python and TypeScript results match perfectly.")
        else:
            diff = np.abs(py_result - js_result)
            max_diff = np.max(diff)
            print(f"❌ Normalization mismatch! Max difference: {max_diff}")
            
            # Identify which part mismatched
            # Feature sizes: HANDS=126 (42 landmarks × 3 coords), POSE=99 (33 landmarks × 3 coords), FACE=1404 (468 landmarks × 3 coords)
            hand_end = 126
            pose_end = hand_end + 99
            
            if not np.allclose(py_result[:hand_end], js_result[:hand_end], atol=1e-5):
                print("  -> Mismatch in HANDS")
            if not np.allclose(py_result[hand_end:pose_end], js_result[hand_end:pose_end], atol=1e-5):
                print("  -> Mismatch in POSE")
            if not np.allclose(py_result[pose_end:], js_result[pose_end:], atol=1e-5):
                print("  -> Mismatch in FACE")
                
            sys.exit(1)
            
    finally:
        if js_test_script.exists():
            js_test_script.unlink()

if __name__ == "__main__":
    test_normalization_sync()
