FROM python:3.11-slim

WORKDIR /app

# 레이어 캐싱을 위해 requirements 먼저 복사
COPY app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
