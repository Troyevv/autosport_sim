import asyncio

import httpx

from backend.app import app


def test_demo_bootstrap():
    async def request_config():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            health = await client.get("/api/health")
            config = await client.get("/api/config")
        assert health.status_code == config.status_code == 200
        assert health.json() == {"status": "ok"}
        assert config.json() == {"mode": "demo", "career_saves": False}

    asyncio.run(request_config())
