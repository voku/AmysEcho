import json
import os
import shutil
import sqlite3
import subprocess
import time
import urllib.error
import urllib.request

from conftest import TEST_JWT_REFRESH_SECRET, TEST_JWT_SECRET, create_access_token

SERVER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PORT = "5055"
ACCESS_TOKEN = ""


def resolve_db_sqlite_path() -> str:
    data_dir = os.environ.get("AMY_ECHO_DATA_DIR")
    root = os.path.abspath(data_dir) if data_dir else os.path.join(os.getcwd(), "data")
    return os.path.join(root, "db.sqlite")


def start_server():
    env = os.environ.copy()
    env.setdefault("JWT_SECRET", TEST_JWT_SECRET)
    env.setdefault("JWT_REFRESH_SECRET", TEST_JWT_REFRESH_SECRET)
    env.setdefault("BACKUP_SECRET", "test-backup-secret-DO-NOT-USE-IN-PRODUCTION")
    env.setdefault("NODE_ENV", "test")
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
    deadline = time.time() + 10
    while True:
        conn = sqlite3.connect(resolve_db_sqlite_path(), timeout=10.0)
        try:
            cursor = conn.execute(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='signTrainingData'",
            )
            table_exists = cursor.fetchone()[0] == 1
            if table_exists:
                count_cursor = conn.execute("SELECT COUNT(*) FROM signTrainingData")
                return count_cursor.fetchone()[0]
        finally:
            conn.close()
        if time.time() >= deadline:
            raise AssertionError("signTrainingData table was not initialized in time")
        time.sleep(0.2)


def backup_sqlite_db():
    """Create a backup of the SQLite database file and its WAL/SHM files."""
    db_sqlite_path = resolve_db_sqlite_path()
    backup_path = db_sqlite_path + '.test_backup'
    if os.path.exists(db_sqlite_path):
        shutil.copy2(db_sqlite_path, backup_path)
        # Also backup WAL and SHM files if they exist (WAL mode)
        for suffix in ['-shm', '-wal']:
            original_path = db_sqlite_path + suffix
            if os.path.exists(original_path):
                shutil.copy2(original_path, backup_path + suffix)
        return backup_path
    return None


def restore_sqlite_db(backup_path):
    """Restore the SQLite database from backup and clean up WAL/SHM files."""
    db_sqlite_path = resolve_db_sqlite_path()
    if backup_path and os.path.exists(backup_path):
        shutil.copy2(backup_path, db_sqlite_path)
        os.remove(backup_path)
        # Restore or remove WAL and SHM files
        for suffix in ['-shm', '-wal']:
            backup_suffixed_path = backup_path + suffix
            original_path = db_sqlite_path + suffix
            if os.path.exists(backup_suffixed_path):
                shutil.copy2(backup_suffixed_path, original_path)
                os.remove(backup_suffixed_path)
            elif os.path.exists(original_path):
                # Remove WAL/SHM if they weren't in backup but exist now
                os.remove(original_path)


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
