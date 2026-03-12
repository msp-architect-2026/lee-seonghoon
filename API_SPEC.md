# REST API Specification: Personal Color AI Analysis

본 문서는 프론트엔드(Next.js)와 백엔드(FastAPI) 간의 데이터 통신 규격을 정의합니다.  
AI 추론 대기 시간을 최소화하고 UI 애니메이션을 지원하기 위해 **비동기 작업 폴링(Async Task Polling)** 패턴을 기반으로 설계되었습니다.

---

## 공통 정책 (General Policy)

| 항목 | 값 |
|------|-----|
| Base URL | `http://www.color-ai.com/api` (Nginx Ingress → FastAPI Pod 라우팅) |
| 데이터 형식 | `application/json` (파일 업로드 시 `multipart/form-data`) |
| 폴링 간격 | 1000ms (`NEXT_PUBLIC_POLL_INTERVAL_MS`) |

> ⚠️ 현재 환경은 사설 IP(192.168.x.x) 기반 온프레미스 클러스터입니다.  
> 외부 공인 DNS 연결은 Phase 6에서 진행 예정입니다.

---

## 엔드포인트 목록

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/health` | 헬스체크 (DB 연결 상태 포함) |
| POST | `/api/analyze` | 이미지 업로드 및 AI 분석 시작 |
| GET | `/api/status/{job_id}` | 분석 진행 상태 폴링 |
| GET | `/api/result/{result_id}` | 분석 결과 조회 |
| GET | `/api/history` | 진단 이력 목록 조회 |

---

## 1. 헬스체크 (Health Check)

- **Endpoint:** `GET /api/health`
- **용도:** 서비스 및 DB 연결 상태 확인

### 응답 — `200 OK`

```json
{
  "status": "ok",
  "db": "ok"
}
```

---

## 2. 퍼스널 컬러 분석 시작 (Analyze Image)

사용자의 안면 이미지를 서버로 전송하고 백그라운드 AI 분석을 트리거합니다.

> **[Privacy-First]** 전송된 이미지는 메모리에서 분석 후 즉시 파기되며 (`del image_bytes`),  
> 디스크나 클라우드 스토리지에 저장되지 않습니다.

- **Endpoint:** `POST /api/analyze`
- **Content-Type:** `multipart/form-data`
- **용도:** 이미지 업로드 및 AI 추론 백그라운드 작업 시작

### 처리 흐름

```
이미지 수신
  → job_id 생성 + PostgreSQL jobs 테이블 status=queued 저장
  → BackgroundTask로 AI Worker (http://color-ai-ai-worker:8001/analyze) 호출
  → 202 즉시 반환 (분석 완료 대기 없음)
```

### 요청 파라미터

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| `image` | File | Required | 분석할 안면 이미지 (JPEG, PNG / Max: 5MB) |

### 응답 — `202 Accepted`

```json
{
  "job_id": "a1b2c3d4-e5f6-7890-1234-56789abcdef0",
  "status": "queued"
}
```

---

## 3. 분석 상태 폴링 (Get Job Status)

프론트엔드에서 레이저 스캔 애니메이션을 보여주는 동안 **1000ms 간격**으로 폴링하여  
분석 완료 여부를 확인합니다.

- **Endpoint:** `GET /api/status/{job_id}`
- **용도:** 백그라운드 AI 분석 진행 상태 조회

### 요청 파라미터 (Path)

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| `job_id` | String | Required | `/api/analyze`에서 발급받은 작업 ID |

### 상태값 정의

| status | 의미 |
|--------|------|
| `queued` | 대기 중 |
| `processing` | AI Worker 분석 중 |
| `done` | 분석 완료 |
| `failed` | 분석 실패 |

### 응답 — `200 OK` (분석 중)

```json
{
  "job_id": "a1b2c3d4-e5f6-7890-1234-56789abcdef0",
  "status": "processing"
}
```

### 응답 — `200 OK` (분석 완료)

```json
{
  "job_id": "a1b2c3d4-e5f6-7890-1234-56789abcdef0",
  "status": "done",
  "result_id": "r9s8t7u6-v5w4-3210-9876-54321fedcba0"
}
```

---

## 4. 분석 결과 조회 (Get Result)

- **Endpoint:** `GET /api/result/{result_id}`
- **용도:** 분석 완료된 퍼스널 컬러 결과 및 큐레이션 데이터 조회

### 요청 파라미터 (Path)

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| `result_id` | String | Required | `/api/status`에서 반환된 결과 ID |

### 응답 — `200 OK`

결과 데이터는 PostgreSQL `jobs` 테이블의 `result` JSONB 컬럼에서 조회됩니다.

```json
{
  "result_id": "r9s8t7u6-v5w4-3210-9876-54321fedcba0",
  "season": "autumn",
  "label": "가을 웜톤",
  "description": "깊고 따뜻한 캐멜, 테라코타, 올리브 계열",
  "palette": [
    "#D2691E",
    "#CD853F",
    "#8B4513",
    "#556B2F",
    "#DAA520"
  ],
  "makeup": {
    "lip": "따뜻한 브라운/핑크 계열",
    "shadow": "브라운 계열"
  },
  "hair": "골든 브라운 (골든 8 : 코퍼 2)",
  "fashion": "내추럴 & 웜, 어스톤 & 카키"
}
```

### 계절 타입 정의

| season | label | 특징 |
|--------|-------|------|
| `spring` | 봄 웜톤 | 밝고 따뜻한 톤 |
| `summer` | 여름 쿨톤 | 밝고 차가운 톤 |
| `autumn` | 가을 웜톤 | 깊고 따뜻한 톤 |
| `winter` | 겨울 쿨톤 | 깊고 차가운 톤 |

---

## 5. 진단 이력 조회 (Get History)

- **Endpoint:** `GET /api/history`
- **용도:** 완료된 진단 이력 목록 조회 (마이페이지)

### 응답 — `200 OK`

PostgreSQL `jobs` 테이블에서 `status=done`인 행만 `created_at` 내림차순으로 반환합니다.

```json
[
  {
    "job_id": "a1b2c3d4-e5f6-7890-1234-56789abcdef0",
    "result_id": "r9s8t7u6-v5w4-3210-9876-54321fedcba0",
    "season": "autumn",
    "created_at": "2026-03-11T00:00:00Z"
  }
]
```

---

## 공통 오류 처리 (Error Handling)

### 에러 응답 포맷

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description"
  }
}
```

### 주요 HTTP Status Code

| HTTP Status | Error Code | 발생 상황 |
|------------|------------|----------|
| `400 Bad Request` | `INVALID_IMAGE_FORMAT` | 지원하지 않는 이미지 형식 (GIF, WebP 등) |
| `400 Bad Request` | `POOR_LIGHTING_CONDITION` | 전처리 단계에서 조명 불량 또는 랜드마크 추출 실패 |
| `404 Not Found` | `JOB_NOT_FOUND` | 유효하지 않거나 만료된 `job_id` 요청 |
| `413 Payload Too Large` | `FILE_TOO_LARGE` | 이미지 파일 크기 5MB 초과 |
| `422 Unprocessable` | `VALIDATION_ERROR` | FastAPI Pydantic 스키마 검증 실패 |
| `500 Internal Server` | `MODEL_INFERENCE_ERROR` | ONNX Runtime 또는 AI Worker Pod 내부 오류 |

---

## Phase 6 예정 변경사항

| 항목 | 현재 | Phase 6 이후 |
|------|------|-------------|
| Base URL | `http://www.color-ai.com/api` (내부망) | 공인 DNS 연결 후 외부 접근 가능 |
| AI 추론 | OpenCV fallback | ONNX 실제 모델 적용 |
| Frontend | MOCK 데이터 | 실제 API 연동 |
