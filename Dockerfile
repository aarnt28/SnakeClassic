FROM python:3.12-slim

# Keep your original tzdata and timezone setup
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tzdata \
        ca-certificates \
        sqlite3 \
    && rm -rf /var/lib/apt/lists/*
ENV TZ=America/Chicago


WORKDIR /app

# Install Python deps (your original list) + the two minimal additions:
#  - itsdangerous (Starlette sessions)
#  - bcrypt (to verify UI_PASSWORD_HASH)
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn[standard]

RUN mkdir -p /app/data /app/logs

# Keep your original copy layout (copy the app/ dir into /app/app)
COPY app /app/app

# Your app listens on 8089 per CMD; expose that (your compose maps 8089:8089)
EXPOSE 6271

# Same command you had (already using port 8089)
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "6271"]
