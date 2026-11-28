import asyncio

import httpx

from backend.app import app


def test_career_bootstrap():
    async def request_config():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            health = await client.get("/api/health")
            config = await client.get("/api/config")
        assert health.status_code == config.status_code == 200
        assert health.json() == {"status": "ok"}
        assert config.json() == {"mode": "career", "career_saves": True}

    asyncio.run(request_config())


def test_pitwall_uses_authoritative_departments_at_one_revision(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    monkeypatch.setenv("AUTOSPORT_DATA_DIR", str(tmp_path))
    client = TestClient(app)
    career = client.post(
        "/api/careers",
        json={
            "role": "manager",
            "org": "team-scuderia-ferrari",
            "series": "f1",
            "seed": 42,
            "name": "Инженер",
        },
    ).json()
    path = "/api/careers/" + career["id"]
    response = client.get(
        path + "/pit-wall", params={"topics": ["council", "finance", "accounts"]}
    )
    assert response.status_code == 200
    snapshot = response.json()
    assert snapshot["revision"] == career["revision"]
    for topic in ("council", "finance"):
        assert snapshot["projections"][topic] == client.get(path + "/" + topic).json()
    for scope, statement in snapshot["projections"]["accounts"].items():
        assert (
            statement == client.get(path + "/finance", params={"scope": scope}).json()
        )
    assert (
        client.get(path + "/pit-wall", params={"topics": "unknown"}).status_code == 422
    )
    assert client.get(path).json()["revision"] == career["revision"]
