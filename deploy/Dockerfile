FROM node:22-bookworm-slim AS web
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM docker:28-cli AS dockercli

FROM python:3.13-slim-bookworm
WORKDIR /app
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt
COPY backend/ /app/backend/
COPY --from=web /src/frontend/dist /app/frontend/dist
ENV PYTHONPATH=/app/backend PYTHONDONTWRITEBYTECODE=1
CMD ["python", "-m", "uvicorn", "app.main:create_app", "--factory", "--host", "127.0.0.1", "--port", "8000", "--no-access-log", "--no-proxy-headers"]
