import json
import os
import shutil
import sqlite3
import subprocess
import time
import urllib.error
import urllib.request

from conftest import create_access_token

SERVER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PORT = "5055"
DB_SQLITE_PATH = os.path.join(SERVER_DIR, 'db.sqlite')
ACCESS_TOKEN = ""


def start_server():
    env = os.environ.copy()
    env.setdefault("JWT_SECRET", "test-jwt-secret")
    env.setdefault("JWT_REFRESH_SECRET", "test-refresh-secret")
    env.setdefault("BACKUP_SECRET", "test-backup-secret-DO-NOT-USE-IN-PRODUCTION")
    env.setdefault("PORT", PORT)
    global ACCESS_TOKEN
    ACCESS_TOKEN = create_access_token(env["JWT_SECRET"], user_id="queue-tester")

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
    start = time.time()
    headers = {"Authorization": f"Bearer {ACCESS_TOKEN}"}
    req = urllib.request.Request(
        f"http://localhost:{PORT}/api/v1/models/version", headers=headers
    )
    while True:
        if proc.poll() is not None:
            raise RuntimeError("server failed to start")
        try:
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.getcode() == 200:
                    break
        except (urllib.error.URLError, ConnectionRefusedError, TimeoutError) as err:
            if time.time() - start > 30:
                raise RuntimeError("server did not start in time") from err
            time.sleep(0.5)
    return proc


def stop_server(proc):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def post_correction(payload):
    url = f'http://localhost:{PORT}/api/v1/corrections'
    body = json.dumps(payload).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {ACCESS_TOKEN}',
    }
    req = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.getcode()


def load_training_count():
    """Load the count of training data entries from SQLite database."""
    # Use timeout to prevent indefinite blocking if database is locked
    conn = sqlite3.connect(DB_SQLITE_PATH, timeout=10.0)
    try:
        cursor = conn.execute("SELECT COUNT(*) FROM signTrainingData")
        count = cursor.fetchone()[0]
        return count
    finally:
        conn.close()


def backup_sqlite_db():
    """Create a backup of the SQLite database file."""
    backup_path = DB_SQLITE_PATH + '.test_backup'
    if os.path.exists(DB_SQLITE_PATH):
        shutil.copy2(DB_SQLITE_PATH, backup_path)
        return backup_path
    return None


def restore_sqlite_db(backup_path):
    """Restore the SQLite database from backup."""
    if backup_path and os.path.exists(backup_path):
        shutil.copy2(backup_path, DB_SQLITE_PATH)
        os.remove(backup_path)


def test_training_queue_increment_single():
    backup_path = backup_sqlite_db()
    proc = start_server()
    try:
        before = load_training_count()
        status = post_correction({"sign": "wave"})
        assert status == 202
        after = load_training_count()
        assert after == before + 1
    finally:
        stop_server(proc)
        restore_sqlite_db(backup_path)


def test_training_queue_increment_object():
    backup_path = backup_sqlite_db()
    proc = start_server()
    try:
        before = load_training_count()
        status = post_correction({"sign": {"left": "wave", "right": "fist"}})
        assert status == 202
        after = load_training_count()
        assert after == before + 1
    finally:
        stop_server(proc)
        restore_sqlite_db(backup_path)

