# syntax=docker/dockerfile:1
# Build context: raiz do repositório (precisa do requirements.txt e do iot-simulator/).
#
#   docker build -f back/Dockerfile -t agrosmart-api:local .
#
# A mesma imagem roda a API (padrão) e o simulador IoT (command no compose).

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependências numa camada própria: o cache do Buildx vale enquanto o requirements.txt não muda.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY back/ back/
COPY iot-simulator/ iot-simulator/

# UID 1654, o mesmo das imagens .NET dos outros apps: os segredos em /run/secrets seguem a
# convenção do gtlabs-deploy (dono 1654, chmod 400). O SQLite fica no volume /data.
RUN useradd --uid 1654 --no-create-home --shell /usr/sbin/nologin app \
    && mkdir /data && chown app:app /data
USER app

ENV DATABASE_URL=sqlite:////data/agrosmart.db
WORKDIR /app/back
EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"]

# --proxy-headers: o Caddy e o nginx do front ficam na frente.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
