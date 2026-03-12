FROM python:3.11-slim

RUN sed -i -e '/debian-security/!s/deb.debian.org/mirror.kakao.com/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || sed -i -e '/debian-security/!s/deb.debian.org/mirror.kakao.com/g' /etc/apt/sources.list 2>/dev/null || true

RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY app/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ .

RUN mkdir -p /app/models

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
