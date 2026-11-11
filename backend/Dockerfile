FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --system --uid 10001 bank && mkdir /data && chown bank /data
COPY *.py ./
USER bank
ENV PANICLOCK_DATA=/data
CMD ["uvicorn","main:app","--host","0.0.0.0","--port","8000","--no-access-log"]
