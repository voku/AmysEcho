import hashlib
import shutil
import time
import urllib.error
import urllib.request
from pathlib import Path

import pytest
from conftest import resolve_data_dir


def get_global_mlp_model_path(data_dir: Path) -> Path:
    return data_dir / "models" / "global" / "amy_model.npz"


def fetch_latest_mlp_model(base_url, profile_id=None, extra_headers=None, auth_header=None):
    url = f"{base_url}/latest-mlp-model"
    if profile_id:
        url += f"?profileId={profile_id}"
    headers = auth_header.copy() if auth_header else {}
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.getcode()
    except urllib.error.HTTPError as e:
        return e.code

@pytest.fixture
def missing_data_dir():
    data_dir = resolve_data_dir()
    backup_dir = None
    if data_dir.exists():
        backup_dir = data_dir.with_name(
            f"{data_dir.name}.bak.{int(time.time())}"
        )
        shutil.move(str(data_dir), str(backup_dir))
    yield data_dir
    if data_dir.exists():
        shutil.rmtree(data_dir)
    if backup_dir is not None and Path(backup_dir).exists():
        shutil.move(str(backup_dir), str(data_dir))

@pytest.fixture
def model_file():
    data_dir = resolve_data_dir()
    backup_dir = None
    if data_dir.exists():
        backup_dir = data_dir.with_name(
            f"{data_dir.name}.bak.{int(time.time())}"
        )
        shutil.move(str(data_dir), str(backup_dir))
    data_dir.mkdir()
    model_path = data_dir / "models" / "p1" / "amy_model.npz"
    model_path.parent.mkdir(parents=True, exist_ok=True)
    model_path.write_bytes(b"placeholder")
    try:
        yield model_path
    finally:
        if data_dir.exists():
            shutil.rmtree(data_dir)
        if backup_dir is not None and Path(backup_dir).exists():
            shutil.move(str(backup_dir), str(data_dir))


@pytest.fixture
def global_model_file():
    data_dir = resolve_data_dir()
    backup_dir = None
    if data_dir.exists():
        backup_dir = data_dir.with_name(
            f"{data_dir.name}.bak.{int(time.time())}"
        )
        shutil.move(str(data_dir), str(backup_dir))
    data_dir.mkdir()
    model_path = get_global_mlp_model_path(data_dir)
    model_path.parent.mkdir(parents=True, exist_ok=True)
    model_path.write_bytes(b"placeholder")
    try:
        yield model_path
    finally:
        if data_dir.exists():
            shutil.rmtree(data_dir)
        if backup_dir is not None and Path(backup_dir).exists():
            shutil.move(str(backup_dir), str(data_dir))

def test_latest_mlp_model_requires_authorization(model_file, running_server, base_url):
    status = fetch_latest_mlp_model(base_url, profile_id="p1")
    assert status == 401

def test_latest_mlp_model_seeds_baseline_when_missing(missing_data_dir, running_server, base_url, auth_header):
    status = fetch_latest_mlp_model(base_url, auth_header=auth_header)
    assert status == 200
    seeded_path = get_global_mlp_model_path(missing_data_dir)
    assert seeded_path.exists()
    assert seeded_path.stat().st_size > 0

def test_latest_mlp_model_returns_200_for_authorized_owner(model_file, running_server, base_url, auth_header):
    status = fetch_latest_mlp_model(
        base_url, profile_id="p1", extra_headers={"x-profile-id": "p1"}, auth_header=auth_header
    )
    assert status == 200


def test_latest_mlp_model_sets_headers(model_file, running_server, base_url, auth_header):
    url = f"{base_url}/latest-mlp-model?profileId=p1"
    headers = {**auth_header, "x-profile-id": "p1"}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=5) as resp:
        assert resp.getcode() == 200
        # consume body to ensure headers are final
        resp.read()
        expected_sha256 = hashlib.sha256(b"placeholder").hexdigest()
        assert resp.headers.get("ETag") == f'"sha256-{expected_sha256}"'
        assert resp.headers.get("X-Checksum-SHA256") == expected_sha256
        version = resp.headers.get("X-Model-Version")
        assert version is not None and version.isdigit()
        cache_control = resp.headers.get("Cache-Control")
        assert cache_control == "private, max-age=0, must-revalidate"
        assert "CDN-Cache-Control" not in resp.headers


def test_latest_mlp_model_public_caching(global_model_file, running_server, base_url, auth_header):
    url = f"{base_url}/latest-mlp-model"
    headers = auth_header
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=5) as resp:
        assert resp.getcode() == 200
        resp.read()
        cache_control = resp.headers.get("Cache-Control")
        assert cache_control == "public, max-age=0, must-revalidate"
        cdn_cache = resp.headers.get("CDN-Cache-Control")
        assert cdn_cache == "max-age=3600"
