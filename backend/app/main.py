from fastapi import FastAPI, File, UploadFile, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import uuid
import asyncpg
from datetime import datetime
from typing import Optional
import os

app = FastAPI(title="Personal Color AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

AI_WORKER_URL = os.getenv("AI_WORKER_URL", "http://ai-worker-svc:8001")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://colorai:colorai_pw@postgresql-svc:5432/colorai_db")

# DB 연결 풀 (앱 전역)
db_pool: Optional[asyncpg.Pool] = None


async def get_db() -> asyncpg.Pool:
    return db_pool


@app.on_event("startup")
async def startup():
    global db_pool
    # 재시도 로직 — PostgreSQL Pod가 완전히 뜨기 전에 backend가 먼저 시작될 수 있음
    for attempt in range(10):
        try:
            db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
            # jobs 테이블 자동 생성
            async with db_pool.acquire() as conn:
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS jobs (
                        job_id      TEXT PRIMARY KEY,
                        status      TEXT NOT NULL DEFAULT 'queued',
                        result_id   TEXT,
                        result      JSONB,
                        error       TEXT,
                        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                """)
            print("DB 연결 및 테이블 초기화 완료")
            break
        except Exception as e:
            print(f"DB 연결 시도 {attempt + 1}/10 실패: {e}")
            if attempt < 9:
                import asyncio
                await asyncio.sleep(3)
            else:
                raise


@app.on_event("shutdown")
async def shutdown():
    if db_pool:
        await db_pool.close()


@app.get("/api/health")
async def health():
    # DB 연결 상태도 함께 체크
    try:
        async with db_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        db_status = "ok"
    except Exception as e:
        db_status = f"error: {e}"
    return {
        "status": "ok",
        "db": db_status,
        "timestamp": datetime.utcnow().isoformat()
    }


async def run_analysis(job_id: str, image_bytes: bytes):
    pool = await get_db()
    try:
        # processing 상태로 업데이트
        async with pool.acquire() as conn:
            await conn.execute("""
                UPDATE jobs SET status='processing', updated_at=NOW()
                WHERE job_id=$1
            """, job_id)

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{AI_WORKER_URL}/analyze",
                files={"file": ("image.jpg", image_bytes, "image/jpeg")},
            )
            if response.status_code == 200:
                result = response.json()
                result_id = result.get("result_id")
                import json
                async with pool.acquire() as conn:
                    await conn.execute("""
                        UPDATE jobs
                        SET status='done', result_id=$2, result=$3, updated_at=NOW()
                        WHERE job_id=$1
                    """, job_id, result_id, json.dumps(result))
            else:
                async with pool.acquire() as conn:
                    await conn.execute("""
                        UPDATE jobs SET status='failed', updated_at=NOW()
                        WHERE job_id=$1
                    """, job_id)

    except Exception as e:
        async with pool.acquire() as conn:
            await conn.execute("""
                UPDATE jobs SET status='failed', error=$2, updated_at=NOW()
                WHERE job_id=$1
            """, job_id, str(e))


@app.post("/api/analyze")
async def analyze(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    image_bytes = await file.read()
    job_id = str(uuid.uuid4())

    async with db_pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO jobs (job_id, status, created_at, updated_at)
            VALUES ($1, 'queued', NOW(), NOW())
        """, job_id)

    background_tasks.add_task(run_analysis, job_id, image_bytes)
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/status/{job_id}")
async def get_status(job_id: str):
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT job_id, status, result_id, error, created_at
            FROM jobs WHERE job_id=$1
        """, job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    return dict(row)


@app.get("/api/result/{result_id}")
async def get_result(result_id: str):
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT result FROM jobs WHERE result_id=$1
        """, result_id)
    if not row or not row["result"]:
        raise HTTPException(status_code=404, detail="Result not found")
    import json
    return json.loads(row["result"])


@app.get("/api/history")
async def get_history():
    async with db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT result_id, created_at
            FROM jobs
            WHERE status='done'
            ORDER BY created_at DESC
        """)
    return {"history": [dict(r) for r in rows]}
