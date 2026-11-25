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
