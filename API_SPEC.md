#  REST API Specification: Personal Color AI Analysis

본 문서는 프론트엔드(Next.js)와 백엔드(FastAPI) 간의 데이터 통신 규격을 정의합니다. 본 API는 AI 추론 대기 시간을 최소화하고 UI 애니메이션을 지원하기 위해 **비동기 작업 상태 확인(Async Task Polling)** 패턴을 기반으로 설계되었습니다.

##  공통 정책 (General Policy)

- **Base URL:** `https://api.yourdomain.com/api/v1` (K8s Nginx Ingress를 통해 라우팅)
- **인증 방식 (Authentication):** OAuth 2.0 (NextAuth 연동) 기반 `Bearer Token`을 `Authorization` 헤더에 포함.
- **데이터 형식:** 기본적으로 `application/json`을 사용하며, 파일 업로드 시에만 `multipart/form-data`를 사용.

---

##  1. 퍼스널 컬러 분석 시작 (Analyze Image)

사용자의 얼굴 이미지를 서버로 전송하고 백그라운드 AI 분석(OpenCV + MediaPipe + ONNX)을 트리거합니다. **[Privacy-First]** 전송된 이미지는 메모리에서 분석 후 즉시 파기되며 디스크나 클라우드 스토리지에 저장되지 않습니다.

- **엔드포인트:** `/analysis/start`
- **HTTP 메서드:** `POST`
- **용도:** 이미지 업로드 및 AI 추론 백그라운드 작업 시작
- **Content-Type:** `multipart/form-data`

### 요청 파라미터 (Request Parameters)
| 필드명 | 타입 | 필수 여부 | 설명 |
|---|---|---|---|
| `image` | File | `Required` | 분석할 안면 이미지 파일 (JPEG, PNG / Max: 5MB) |
| `lighting_score` | Float | `Optional` | 프론트엔드에서 1차 측정한 조명 밝기 점수 (0.0 ~ 1.0) |

### 응답 (Response) - `202 Accepted`
빠른 응답성을 위해 분석 완료를 기다리지 않고 작업 ID(Task ID)를 즉시 반환합니다.

```json
{
  "success": true,
  "message": "Image received. AI analysis started in background.",
  "data": {
    "task_id": "a1b2c3d4-e5f6-7890-1234-56789abcdef0",
    "status": "processing",
    "estimated_time_sec": 1.5
  }
}
```

---

## 2. 분석 상태 확인 및 결과 조회 (Get Task Status & Result)
프론트엔드에서 v0.app 애니메이션을 보여주는 동안, 이 엔드포인트를 0.5초 간격으로 폴링(Polling)하여 분석 완료 여부와 최종 결과를 가져옴.
  * **엔드포인트:** `/analysis/status/{task_id}`
  * **HTTP 메서드:** `GET`
  * **용도:** 백그라운드 AI 분석 진행 상태 및 완료 시 결과 큐레이션 데이터 조회

**요청 파라미터(Path Parameter)**
| 필드명 | 타입 | 필수 여부 | 설명 |
| :---| :--- | :--- | :--- |
| `task_id` | String | `Required` | `/analysis/start`에서 발급받은 작업 ID |

**응답 (Response) - `200 OK` (분석 중일 때)**
```json
{
  "success": true,
  "data": {
    "task_id": "a1b2c3d4-e5f6-7890-1234-56789abcdef0",
    "status": "processing"
  }
}
```

**응답 (Response) - `200 OK` (분석 완료 시)**
결과 데이터는 DB(PostgreSQL)에 저장된 후 반환. 시각적 타격감을 위한 헥스코드와 헤어 염색 레시피가 포함됨.
```json
{
  "success": true,
  "data": {
    "task_id": "a1b2c3d4-e5f6-7890-1234-56789abcdef0",
    "status": "completed",
    "result": {
      "season_type": "Summer Cool Mute",
      "main_colors": ["#8CA0B3", "#B5A6B8", "#DCD0D8"],
      "worst_colors": ["#D97D3A", "#E5C232"],
      "curation": {
        "makeup": {
          "lip": "모브 핑크 (Mauve Pink)",
          "blush": "라벤더 (Lavender)"
        },
        "hair_recipe": {
          "color_name": "애쉬 그레이지 (Ash Greige)",
          "mix_ratio": "애쉬 6 : 베이지 3 : 블루 1",
          "bleach_level": "탈색 1~2회 권장"
        },
        "styling_tip": "대비감을 줄이고 톤온톤 매치를 권장합니다."
      }
    }
  }
}
```

---

## 3. 과거 진단 이력 조회 (Get User History)
사용자 마이페이지에서 과거의 퍼스널 컬러 진단 기록을 시간순으로 불러옴.
  * **엔드포인트:** `/users/me/history`
  * **HTTP 메서드:** `GET`
  * **용도:** 로그인한 사용자의 진단 이력 리스트업

**요청 파라미터 (Query Parameter)**
| 필드명 | 타입 | 필수 여부 | 설명 |
| :--- | :--- | :--- | :--- |
| `limit` | Integer | `Optional` | 한 번에 불러올 개수 (기본값:10) |
| `offset` | Integer | `Optional` | 페이징 시작 위치 (기본값:0) |

**응답 (Response) - `200 OK`**
```json
{
  "success": true,
  "data": [
    {
      "history_id": 1042,
      "analyzed_at": "2026-02-25T14:30:00Z",
      "season_type": "Summer Cool Mute",
      "thumbnail_color": "#8CA0B3"
    }
  ],
  "pagination": {
    "total_count": 1,
    "limit": 10,
    "offset": 0
  }
}
```

---

## ⚠️ 공통 오류 처리 (Error Handling)
API 요청 실패 시, 일관된 포맷의 HTTP 상태 코드와 JSON 에러 메시지를 반환.

**에러 응답 포맷**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description"
  }
}
```

**주요 HTTP Status Code 및 상황**
| HTTP Status | Error Code | 발생 상황/설명 |
| :--- | :--- | :--- |
| `400 Bad Request` | `INVALID_IMAGE_FORMAT` | 지원하지 않는 이미지 확장자 (ex: GIF,WebP) 업로드 시 |
| `400 Bad Request` | `POOR_LIGHTING_CONDITION` | [AI 진단 실패] 전처리 단계에서 조명이 너무 어둡거나 랜드마크 추출에 실패한 경우(재촬영 요구)
| `401 Unauthorized` | `MISSING_TOKEN` | Authorization 헤더에 Bearer 토큰이 없거나 만료된 경우 |
| `404 Not Found` | `TASK_NOT_FOUND` | 상태 조회 시 유효하지 않거나 만료된 `task_id`를 요청한 경우 |
| `413 Payload Too Large` | `FILE_TOO_LARGE` | 업로드된 이미지 파일의 크기가 5MB를 초과한 경우 |
| `422 Unprocessable` | `VALIDATION_ERROR` | FastAPI 내부 Pydantic 스키마 검증 실패 시 (파라미터 타입 오류 등) |
| `500 Internal Server` | `MODEL_INFERENCE_ERROR` | ONNX Runtime 또는 K8s 파드 내부의 메모리/예기치 못한 오류 발생 시 |
