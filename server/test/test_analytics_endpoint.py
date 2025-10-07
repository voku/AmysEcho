import json
import subprocess
import textwrap
import time
from pathlib import Path
import urllib.request

import pytest

SERVER_DIR = Path(__file__).resolve().parents[1]
DB_PATH = SERVER_DIR / "db.json"
ANALYTICS_PATH = SERVER_DIR / "analytics.json"


@pytest.fixture
def analytics_seed():
    original_db = DB_PATH.read_text() if DB_PATH.exists() else None
    original_analytics = ANALYTICS_PATH.read_text() if ANALYTICS_PATH.exists() else None

    now = int(time.time() * 1000)
    week = 7 * 24 * 60 * 60 * 1000
    day = 24 * 60 * 60 * 1000

    seeded = {
        "symbols": [],
        "gestureDefinitions": [],
        "gestureTrainingData": [],
        "interactionLogs": [
            {
                "id": "1",
                "gestureDefinitionId": "hello",
                "wasSuccessful": True,
                "confidenceScore": 0.9,
                "timestamp": now - 2 * 60 * 60 * 1000,
                "processedBy": "local",
            },
            {
                "id": "2",
                "gestureDefinitionId": "hello",
                "wasSuccessful": False,
                "confidenceScore": 0.2,
                "timestamp": now - 3 * day,
                "processedBy": "local",
            },
            {
                "id": "3",
                "gestureDefinitionId": "drink",
                "wasSuccessful": True,
                "confidenceScore": 0.7,
                "timestamp": now - 6 * day,
                "processedBy": "local",
            },
            {
                "id": "4",
                "gestureDefinitionId": "drink",
                "wasSuccessful": False,
                "confidenceScore": 0.5,
                "timestamp": now - (week + day),
                "processedBy": "local",
            },
        ],
        "profiles": [],
        "vocabularySets": [],
        "vocabularySetSymbols": [],
        "usageStats": [],
        "learningAnalytics": [],
        "corrections": [],
        "negativeSamples": [],
    }

    DB_PATH.write_text(json.dumps(seeded, indent=2))
    if ANALYTICS_PATH.exists():
        ANALYTICS_PATH.unlink()

    yield {
        "db_path": DB_PATH,
        "analytics_path": ANALYTICS_PATH,
    }

    if original_db is not None:
        DB_PATH.write_text(original_db)
    else:
        DB_PATH.unlink(missing_ok=True)

    if original_analytics is not None:
        ANALYTICS_PATH.write_text(original_analytics)
    else:
        ANALYTICS_PATH.unlink(missing_ok=True)


@pytest.fixture
def seeded_server(analytics_seed, running_server):
    yield


def compute_expected(db_path: Path, last_calculated: int) -> dict:
    script = textwrap.dedent(
        f"""
        import fs from 'fs';
        import {{ computeLearningAnalytics }} from './dist/services/analyticsService.js';

        const db = JSON.parse(fs.readFileSync({json.dumps(str(db_path))}, 'utf8'));
        const originalNow = Date.now;
        Date.now = () => {last_calculated};
        const result = computeLearningAnalytics(db);
        Date.now = originalNow;
        console.log(JSON.stringify(result));
        """
    )

    output = subprocess.check_output(
        ["node", "--input-type=module", "-e", script],
        cwd=SERVER_DIR,
    )
    return json.loads(output.decode())


def test_server_computes_analytics(analytics_seed, seeded_server, base_url):
    req = urllib.request.Request(
        f"{base_url}/analytics",
        method="POST",
        headers={
            "Authorization": "Bearer testtoken",
            "Content-Type": "application/json",
        },
        data=json.dumps({}).encode(),
    )

    with urllib.request.urlopen(req, timeout=5) as resp:
        assert resp.getcode() == 200
        body = json.loads(resp.read())

    assert ANALYTICS_PATH.exists()
    saved = json.loads(ANALYTICS_PATH.read_text())

    expected = compute_expected(analytics_seed["db_path"], saved["lastCalculated"])

    assert body == saved
    assert saved == expected
