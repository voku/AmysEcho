import os
import subprocess
import time
import json
import urllib.request
import urllib.error

SERVER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PORT = "5055"

def start_server():
    env = os.environ.copy()
    env.setdefault("API_TOKEN", "testtoken")
    env.setdefault("PORT", PORT)
    env.setdefault("DIALOG_LIMIT", "2")

    # Build the TypeScript sources to JavaScript so the runtime doesn't
    # depend on ts-node, which has proven flaky on CI.
    subprocess.run(
        ["npm", "run", "build"],
        cwd=SERVER_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True,
    )

    proc = subprocess.Popen(
        ["node", "dist/server.js"],
        cwd=SERVER_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    # Wait for the server to start accepting connections on /model-version
    start = time.time()
    headers = {"Authorization": "Bearer testtoken"}
    req = urllib.request.Request(
        f"http://localhost:{PORT}/model-version", headers=headers
    )
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

def make_request(auth: bool = True):
    url = f'http://localhost:{PORT}/dialog'
    payload = json.dumps({
        'input': 'hi',
        'context': [],
        'language': 'en',
        'age': 5,
    }).encode('utf-8')
    headers = {'Content-Type': 'application/json'}
    if auth:
        headers['Authorization'] = 'Bearer testtoken'
    req = urllib.request.Request(url, data=payload, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.getcode(), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

def test_dialog_endpoint_auth_and_rate_limit():
    proc = start_server()
    try:
        status, _ = make_request(auth=False)
        assert status == 401

        status, _ = make_request(auth=True)
        assert status == 200

        status, _ = make_request(auth=True)
        assert status == 200

        status, _ = make_request(auth=True)
        assert status == 429
    finally:
        stop_server(proc)
