ARG PYTHON_VERSION=3.13

FROM python:${PYTHON_VERSION}-slim AS dependencies

ENV VIRTUAL_ENV=/opt/venv
ENV PATH="${VIRTUAL_ENV}/bin:${PATH}"

WORKDIR /build

COPY requirements.runtime.txt .
RUN python -m venv "${VIRTUAL_ENV}" \
    && "${VIRTUAL_ENV}/bin/pip" install --no-cache-dir --upgrade pip \
    && "${VIRTUAL_ENV}/bin/pip" install --no-cache-dir -r requirements.runtime.txt

FROM python:${PYTHON_VERSION}-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PRG32_STORE_DATA=/data
ENV PRG32_STORE_DB=/data/cartridge_store.sqlite
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="${VIRTUAL_ENV}/bin:${PATH}"

# Default UID/GID used inside the container.
# Override them at build time to match the deployment host:
# docker build --build-arg APP_UID=$(id -u) --build-arg APP_GID=$(id -g) .
ARG APP_UID=1000
ARG APP_GID=1000

WORKDIR /app

RUN groupadd --gid ${APP_GID} prg32 \
    && useradd --uid ${APP_UID} \
        --gid ${APP_GID} \
        --create-home \
        --home-dir /app \
        --shell /bin/bash \
        prg32 \
    && mkdir -p /data \
    && chown -R prg32:prg32 /app /data

COPY --from=dependencies /opt/venv /opt/venv
COPY --chown=prg32:prg32 app.py ./app.py
COPY --chown=prg32:prg32 cartridge_store ./cartridge_store
COPY --chown=prg32:prg32 templates ./templates
COPY --chown=prg32:prg32 static ./static

USER prg32

EXPOSE 5080

CMD ["gunicorn", "--bind", "0.0.0.0:5080", "--threads", "8", "--timeout", "120", "app:app"]
