import json
import urllib.request


def test_health_endpoint(running_server, base_url):
    with urllib.request.urlopen(f"{base_url}/health", timeout=5) as resp:
        assert resp.getcode() == 200
        data = json.loads(resp.read())
        assert data.get("status") == "ok"
        assert isinstance(data.get("uptime"), (int, float))
