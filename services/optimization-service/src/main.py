from datetime import datetime, timezone
import os
from fastapi import FastAPI

app = FastAPI(
    title="DarkOps AI Optimization Service",
    version="0.1.0",
    description="Stateless optimization engine for quick-commerce replenishment, allocation, and picker routing."
)


@app.get("/healthz")
def health_check() -> dict:
    return {
        "status": "ok",
        "service": "optimization-service",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run("src.main:app", host=host, port=port, reload=False)
