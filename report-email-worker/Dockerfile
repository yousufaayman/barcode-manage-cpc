FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends tzdata && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY config.py api_client.py mailer.py run_once.py scheduler.py ./

RUN useradd --uid 1000 --create-home --shell /bin/bash appuser && \
    chown -R 1000:1000 /app

USER 1000:1000

# Long-running cron scheduler (see DEPLOYMENT_GUIDE.md for one-shot runs).
CMD ["python", "scheduler.py"]
