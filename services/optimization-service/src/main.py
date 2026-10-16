import os
from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.routers import replenishment_router, allocation_router, picker_route_router

app = FastAPI(
    title="DarkOps AI Optimization Service",
    version="0.1.0",
    description="Stateless optimization engine for quick-commerce replenishment, allocation, and picker routing."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(replenishment_router)
app.include_router(allocation_router)
app.include_router(picker_route_router)


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
