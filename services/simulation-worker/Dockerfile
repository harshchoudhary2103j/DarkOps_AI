FROM python:3.11-slim

WORKDIR /app

RUN groupadd -r appgroup && useradd -r -g appgroup appuser

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
COPY scenarios/ ./scenarios/

USER appuser

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "import os, time; assert os.path.exists('/tmp/worker_heartbeat') and (time.time() - os.path.getmtime('/tmp/worker_heartbeat') < 20)" || exit 1

CMD ["python", "-m", "src.main"]
