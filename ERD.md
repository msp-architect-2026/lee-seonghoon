# Database ERD: Personal Color AI Analysis Application

본 문서는 퍼스널 컬러 진단 애플리케이션의 실제 구현된 데이터베이스 구조를 정의합니다.  
Phase 5 완료 기준으로 작성되었으며, 실제 PostgreSQL StatefulSet에 배포된 스키마를 기준으로 합니다.

---

## 1. 요구사항 수집 (Requirements Gathering)

**목표:** AI 분석 작업 상태 추적, 진단 결과 저장, 진단 이력 관리를 위한 데이터 구조 설계.

**핵심 비즈니스 규칙:**

| 규칙 | 내용 |
|------|------|
| **Privacy-First** | 안면 원본 이미지는 분석 직후 메모리(`del image_bytes`)에서 파기. DB에 절대 저장 금지 |
| **비동기 작업 추적** | 이미지 수신 즉시 job_id 발급 → BackgroundTask 분석 → 상태값(status) 폴링 방식 |
| **이력 관리** | 마이페이지에서 완료된(`status=done`) 진단 결과를 누적 조회 가능 |
| **단일 테이블 설계** | 작업 상태와 결과를 하나의 `jobs` 테이블로 통합 관리 (Phase 5 구현 기준) |

---

## 2. 엔티티 식별 (Entity Identification)

Phase 5 실제 구현 기준으로 **단일 테이블(`jobs`)** 구조로 운영됩니다.

> **설계 배경:**  
> 초기 설계(USER, ANALYSIS_HISTORY, CURATION_RESULT 분리)에서  
> 운영 복잡도를 줄이기 위해 `jobs` 단일 테이블로 통합 구현되었습니다.  
> Phase 6 이후 인증(NextAuth) 연동 시 USER 테이블 추가 예정입니다.

---

## 3. 속성 정의 (Attribute Definition)

### jobs 테이블 (실제 운영 중)

| Column | Data Type | Constraint | Description |
|--------|-----------|------------|-------------|
| `job_id` | TEXT | PK | 분석 작업 고유 식별자 (UUID) |
| `status` | TEXT | NOT NULL, DEFAULT 'queued' | 작업 상태 (queued / processing / done / failed) |
| `result_id` | TEXT | Nullable | 완료 시 생성되는 결과 식별자 |
| `result` | JSONB | Nullable | AI 분석 결과 전체 (완료 시 저장) |
| `error` | TEXT | Nullable | 실패 시 오류 메시지 |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 작업 생성 일시 |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 작업 최종 수정 일시 |

### result JSONB 컬럼 상세 구조

```json
{
  "result_id": "uuid",
  "season": "autumn",
  "label": "가을 웜톤",
  "description": "깊고 따뜻한 캐멜, 테라코타, 올리브 계열",
  "palette": ["#D2691E", "#CD853F", "#8B4513", "#556B2F", "#DAA520"],
  "makeup": {
    "lip": "따뜻한 브라운/핑크 계열",
    "shadow": "브라운 계열"
  },
  "hair": "골든 브라운 (골든 8 : 코퍼 2)",
  "fashion": "내추럴 & 웜, 어스톤 & 카키"
}
```

### status 상태값 정의

| status | 의미 | 전이 조건 |
|--------|------|----------|
| `queued` | 대기 중 | job_id 발급 직후 |
| `processing` | AI Worker 분석 중 | BackgroundTask 시작 시 |
| `done` | 분석 완료 | AI Worker 결과 반환 시 |
| `failed` | 분석 실패 | AI Worker 오류 발생 시 |

---

## 4. 관계 정의 (Relationship Definition)

현재(Phase 5) 구현은 `jobs` 단일 테이블로, 엔티티 간 관계는 **result JSONB 컬럼 내부**에서 처리됩니다.

**Phase 6 이후 확장 예정 관계:**

| 관계 | 카디널리티 | 설명 |
|------|-----------|------|
| USER ↔ jobs | 1 : N | 한 사용자가 여러 번 진단 가능 (NextAuth 연동 후 user_id 컬럼 추가 예정) |

---

## 5. ERD 다이어그램

### 현재 구현 (Phase 5 — 단일 테이블)

```mermaid
erDiagram
    JOBS {
        text job_id PK "분석 작업 ID (UUID)"
        text status "queued / processing / done / failed"
        text result_id "결과 ID (완료 시 생성)"
        jsonb result "AI 분석 결과 전체"
        text error "실패 시 오류 메시지"
        timestamptz created_at "작업 생성 일시"
        timestamptz updated_at "작업 최종 수정 일시"
    }
```

### Phase 6 이후 확장 설계 (NextAuth 연동 시)

```mermaid
erDiagram
    USER ||--o{ JOBS : "requests"

    USER {
        uuid id PK "사용자 고유 식별자"
        varchar oauth_id "OAuth 제공자 고유 ID"
        varchar email "사용자 이메일"
        timestamptz created_at "가입 일시"
    }

    JOBS {
        text job_id PK "분석 작업 ID (UUID)"
        uuid user_id FK "요청한 사용자 ID (Phase 6 추가 예정)"
        text status "queued / processing / done / failed"
        text result_id "결과 ID (완료 시 생성)"
        jsonb result "AI 분석 결과 전체"
        text error "실패 시 오류 메시지"
        timestamptz created_at "작업 생성 일시"
        timestamptz updated_at "작업 최종 수정 일시"
    }
```

---

## 6. 실제 DDL (PostgreSQL — Phase 5 운영 중)

```sql
CREATE TABLE IF NOT EXISTS jobs (
    job_id      TEXT PRIMARY KEY,
    status      TEXT NOT NULL DEFAULT 'queued',
    result_id   TEXT,
    result      JSONB,
    error       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> **startup 시 자동 실행됨** — Backend Pod 기동 시 테이블 미존재 시 자동 생성 (10회 재시도 로직 포함)

---

## 7. 인프라 구성 (PostgreSQL StatefulSet)

| 리소스 | 이름 | 설정 |
|--------|------|------|
| StorageClass | local-storage | `kubernetes.io/no-provisioner`, WaitForFirstConsumer |
| PersistentVolume | postgresql-pv | 5Gi, local type, VM2(ubuntu-k8s-web) nodeAffinity 고정 |
| PersistentVolumeClaim | postgresql-pvc | 5Gi, ReadWriteOnce |
| StatefulSet | postgresql | `postgres:15-alpine`, PGDATA: `/var/lib/postgresql/data/pgdata` |
| Service | postgresql-svc | ClusterIP, 5432 |
| 데이터 경로 | VM2 | `/data/postgresql` |
| 연결 문자열 | — | `postgresql://colorai:****@postgresql-svc:5432/colorai_db` |

> ⚠️ `persistentVolumeReclaimPolicy: Retain` — Pod 삭제 후에도 데이터 영구 보존

---

## 8. E2E 테스트 검증 결과 (Phase 5)

| 검증 항목 | 결과 |
|-----------|------|
| POST /api/analyze → jobs 테이블 status=queued 저장 | ✅ |
| AI 분석 완료 → status=done + result JSONB 저장 | ✅ |
| GET /api/history → status=done 행만 반환 | ✅ |
| Pod 재시작 후 데이터 보존 (PV Retain) | ✅ |
