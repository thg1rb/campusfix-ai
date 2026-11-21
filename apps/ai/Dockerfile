FROM ghcr.io/astral-sh/uv:0.13.9 AS uv
FROM python:3.14.7-slim-bookworm AS development
COPY --from=uv /uv /usr/local/bin/uv
RUN useradd --create-home --uid 10001 app && mkdir /app && chown app:app /app
WORKDIR /app
USER app
ENV UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never PYTHONDONTWRITEBYTECODE=1
COPY --chown=app:app pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-install-project
COPY --chown=app:app src ./src
RUN uv sync --locked
CMD ["/app/.venv/bin/python", "-m", "campusfix_ai.main", "--reload"]

FROM development AS runtime
RUN uv sync --locked --no-editable
CMD ["/app/.venv/bin/python", "-m", "campusfix_ai.main"]
