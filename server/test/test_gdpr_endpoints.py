import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
PORT = "5057"


def start_server():
    env = os.environ.copy()
    env.setdefault("API_TOKEN", "testtoken")
    env.setdefault("PORT", PORT)
    subprocess.run(
        ["npm", "run", "build"],
        cwd=SERVER_DIR,
        env=env,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    proc = subprocess.Popen(
        ["node", "dist/server.js"],
        cwd=SERVER_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    headers = {"Authorization": "Bearer testtoken"}
    req = urllib.request.Request(
        f"http://localhost:{PORT}/model-version", headers=headers
    )
    start = time.time()
    while True:
        if proc.poll() is not None:
            raise RuntimeError("server failed to start")
        try:
            with urllib.request.urlopen(req) as resp:
                if resp.getcode() == 200:
                    break
        except Exception:
            if time.time() - start > 30:
                raise RuntimeError("server did not start in time")
            time.sleep(0.5)
    return proc


def stop_server(proc):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def test_profile_export_and_deletion():
    db_file = SERVER_DIR / "db.json"
    original = db_file.read_text()
    data = json.loads(original)
    data["profiles"].append(
        {
            "id": "gdpr",
            "name": "GDPR Test",
            "consentDataUpload": False,
            "consentHelpMeGetSmarter": False,
            "vocabularySetId": "basic",
        }
    )
    data["usageStats"].append(
        {
            "id": "gdprstat",
            "symbolId": "hello",
            "profileId": "gdpr",
            "count": 0,
        }
    )
    data["corrections"].append(
        {
            "id": "gdprcorr",
            "predictedGesture": "hello",
            "actualGesture": "hello",
            "confidence": 1.0,
            "timestamp": 0,
            "isSynced": False,
            "profileId": "gdpr",
        }
    )
    db_file.write_text(json.dumps(data))

    proc = start_server()
    try:
        headers = {"Authorization": "Bearer testtoken"}
        export_url = f"http://localhost:{PORT}/api/profiles/gdpr/export"
        with urllib.request.urlopen(
            urllib.request.Request(export_url, headers=headers)
        ) as resp:
            assert resp.getcode() == 200
            exported = json.loads(resp.read())
            assert exported["profile"]["id"] == "gdpr"
            assert exported["usageStats"][0]["profileId"] == "gdpr"

        delete_req = urllib.request.Request(
            f"http://localhost:{PORT}/api/profiles/gdpr",
            method="DELETE",
            headers=headers,
        )
        with urllib.request.urlopen(delete_req) as resp:
            assert resp.getcode() == 200

        try:
            urllib.request.urlopen(
                urllib.request.Request(export_url, headers=headers)
            )
            assert False
        except urllib.error.HTTPError as e:
            assert e.code == 404
    finally:
        stop_server(proc)
        db_file.write_text(original)

