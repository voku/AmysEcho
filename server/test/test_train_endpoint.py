import time
import urllib.request
import subprocess
import os
import json
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
PORT = '5056'


def start_server():
    env = os.environ.copy()
    env.setdefault('API_TOKEN', 'testtoken')
    env.setdefault('PORT', PORT)
    # Run the real training script but keep epochs low for test speed
    env.setdefault('MLP_SCRIPT', 'src/tools/train_mlp.py')
    env.setdefault('MLP_EPOCHS', '5')
    data_dir = SERVER_DIR / 'data'
    if data_dir.exists():
        for f in data_dir.glob('*'):
            f.unlink()
    subprocess.run(['npm', 'run', 'build'], cwd=SERVER_DIR, env=env, check=True, stdout=subprocess.DEVNULL)
    proc = subprocess.Popen(['node', 'dist/server.js'], cwd=SERVER_DIR, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # wait for server up
    headers = {'Authorization': 'Bearer testtoken'}
    req = urllib.request.Request(f'http://localhost:{PORT}/model-version', headers=headers)
    start = time.time()
    while True:
        if proc.poll() is not None:
            raise RuntimeError('server failed to start')
        try:
            with urllib.request.urlopen(req) as resp:
                if resp.getcode() == 200:
                    break
        except Exception as err:
            if time.time() - start > 30:
                raise RuntimeError('server did not start') from err
            time.sleep(0.5)
    return proc


def stop_server(proc):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def test_train_endpoint(tmp_path):
    proc = start_server()
    try:
        url = f"http://localhost:{PORT}/train-model"
        # vary landmark coordinates slightly so normalization succeeds
        landmarks = [[i * 0.01, 0.1, 0.1] for i in range(42)]
        samples = [{
            "gestureDefinitionId": "g1",
            "profileId": "p1",
            "landmarkData": landmarks,
        }]
        data = json.dumps({"samples": samples}).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer testtoken",
        }
        req = urllib.request.Request(url, data=data, headers=headers)
        with urllib.request.urlopen(req) as resp:
            assert resp.getcode() == 202
            resp_data = json.loads(resp.read().decode())
            job_id = resp_data['jobId']

        # poll for completion
        status_url = f'http://localhost:{PORT}/train-status/{job_id}'
        start = time.time()
        while True:
            status_req = urllib.request.Request(status_url, headers={'Authorization': 'Bearer testtoken'})
            with urllib.request.urlopen(status_req) as sresp:
                info = json.loads(sresp.read().decode())
            if info['status'] == 'completed':
                break
            if time.time() - start > 30:
                raise RuntimeError('training did not complete')
            time.sleep(0.2)

        # ensure centroid model downloadable
        model_req = urllib.request.Request(
            f'http://localhost:{PORT}/latest-model',
            headers={'Authorization': 'Bearer testtoken'},
        )
        with urllib.request.urlopen(model_req) as mresp:
            assert mresp.getcode() == 200
            data = json.loads(mresp.read().decode())
            assert data.get('type') == 'centroid_model'

        # verify MLP model files created
        npz = SERVER_DIR / 'data' / 'dgs_model.npz'
        prof_npz = SERVER_DIR / 'data' / 'dgs_model_p1.npz'
        assert npz.exists()
        assert prof_npz.exists()
    finally:
        stop_server(proc)
        # cleanup produced model files
        data_dir = SERVER_DIR / 'data'
        if data_dir.exists():
            for f in data_dir.glob('*'):
                f.unlink()
