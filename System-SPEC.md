# System Specification: Personal Color AI Analysis

본 문서는 서비스에 도입된 각 기술 스택이 어떠한 비즈니스 가치를 제공하며,  
실제 사용자 화면(UI/UX)에서 어떻게 구동되는지 상세히 정의합니다.

---

## 시스템 구성 개요

```
사용자
  │
  ▼
MetalLB (192.168.10.136)           ← 베어메탈 LoadBalancer (외부 IP 할당)
  │
  ▼
Nginx Ingress Controller (VM2)     ← L7 라우팅
  ├── /          → Next.js Pod     [color-ai-frontend:3000, VM2]
  └── /api       → FastAPI Pod     [color-ai-backend:8000, VM2]
                       │
                       ├── AI Worker Pod  [color-ai-ai-worker:8001, VM3]
                       │     └── OpenCV → MediaPipe → ONNX Runtime
                       │
                       └── PostgreSQL Pod [postgresql-svc:5432, VM2]
```

### 현재 Pod 상태 (Phase 5 완료 기준)

| Pod | 상태 | 배포 노드 | 비고 |
|-----|------|----------|------|
| color-ai-frontend | ✅ Running | VM2 | MOCK → 실제 API 연동 예정 (Phase 6) |
| color-ai-backend | ✅ Running | VM2 | PostgreSQL 연동 완료 |
| color-ai-ai-worker | ✅ Running | VM3 | OpenCV fallback 동작 중, ONNX 미적용 |
| postgresql-0 | ✅ Running | VM2 | StatefulSet, PV Retain |

---

## 1. Frontend Layer (사용자 접점)

사용자가 직접 보고 만지는 영역으로, 초기 진입 속도와 부드러운 상태 전환에 집중합니다.

| 기술 | UI 구동 및 역할 | 상세 스펙 및 사용 이유 |
|------|----------------|----------------------|
| **Next.js** | 페이지 간 이동이 즉각적이며, 첫 화면 로딩 시 지연 시간을 최소화합니다. | App Router 기반 SSR/SSG 지원. 모바일 최우선 반응형 렌더링으로 초기 로딩 속도를 확보하여 사용자 이탈을 방지합니다. |
| **Tailwind CSS** | 모든 기기에서 일관된 톤앤매너를 유지하며, 세련된 애니메이션을 제공합니다. | 유틸리티 클래스 기반 고속 스타일링. AI 대기 시간을 상쇄할 인터랙티브 UI 컴포넌트를 신속하게 구축합니다. |
| **Zustand** | "현재 조명 밝기", "분석 job_id" 등의 데이터를 실시간으로 UI에 업데이트합니다. | 경량 전역 상태 관리. 보일러플레이트 없이 `capturedImage`, `jobId`, `resultId`, `analysisResult`를 페이지 간 공유합니다. |
| **NextAuth.js** | "로그인 후 결과 저장" 기능을 위해 소셜 연동을 지원합니다. | OAuth 통합. 사용자별 진단 이력을 PostgreSQL과 정확히 매핑합니다. |

### 주요 페이지 구성

| 페이지 | 파일 | 상태 |
|--------|------|------|
| `/login` | `app/src/app/login/page.tsx` | ✅ 완료 |
| `/capture` | `app/src/app/capture/page.tsx` | ✅ 완료 |
| `/analyzing` | `app/src/app/analyzing/page.tsx` | ✅ 완료 |
| `/result/[id]` | `app/src/app/result/[id]/page.tsx` | ✅ 완료 (MOCK) |
| `/mypage/history` | `app/src/app/mypage/history/page.tsx` | ✅ 완료 (MOCK) |

### 환경변수

| 변수 | 값 |
|------|----|
| `NEXTAUTH_URL` | `http://www.color-ai.com` |
| `NEXT_PUBLIC_API_URL` | `http://www.color-ai.com/api` |
| `NEXT_PUBLIC_POLL_INTERVAL_MS` | `1000` |

---

## 2. Network & Routing Layer (관문 계층)

사용자의 요청을 안전하게 수용하고 적절한 서비스로 라우팅합니다.

| 기술 | UI 구동 및 역할 | 상세 스펙 및 사용 이유 |
|------|----------------|----------------------|
| **MetalLB** | 외부 사용자가 `192.168.10.136`으로 서비스에 접속할 수 있는 통로를 제공합니다. | 베어메탈 환경에서 클라우드와 동일하게 LoadBalancer External IP를 할당합니다. IP Pool: `192.168.10.136~152` |
| **Nginx Ingress** | 사용자가 접속하는 경로(`/api`, `/`)에 따라 프론트/백엔드로 자동 분기합니다. | L7 로드밸런싱. `/` → Next.js Pod(3000), `/api` → FastAPI Pod(8000)으로 라우팅. rewrite 불필요 (backend가 `/api/...` 형태로 엔드포인트 정의). |

### 라우팅 규칙

| 경로 | 대상 Service | 포트 | 결과 |
|------|-------------|------|------|
| `/` | color-ai-frontend | 3000 | 307 (Next.js 리다이렉트) |
| `/api` | color-ai-backend | 8000 | 200 + JSON |
| `/api/nonexistent` | — | — | 404 |

---

## 3. API & Business Layer (통신 및 비즈니스)

| 기술 | UI 구동 및 역할 | 상세 스펙 및 사용 이유 |
|------|----------------|----------------------|
| **FastAPI** | 촬영 버튼 클릭 시 "요청 접수" 응답을 즉시 보내 화면 멈춤을 방지합니다. | Python AI 생태계와 완벽 호환. 비동기 처리로 병목 없이 동시 요청을 수용합니다. |
| **BackgroundTasks** | 레이저 스캔 애니메이션이 재생되는 동안 서버 뒷단에서 실제 AI 분석을 수행합니다. | Non-blocking 처리. 무거운 메시지 큐 없이도 AI 연산을 백그라운드로 위임하여 API 응답성을 극대화합니다. |
| **asyncpg** | DB 연결을 비동기로 처리하여 PostgreSQL과의 통신에서 응답 지연을 방지합니다. | 비동기 PostgreSQL 드라이버 (v0.29.0). startup 시 연결 풀 생성 + 10회 재시도 로직 포함. |

### Backend 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/health` | 헬스체크 (status + db 상태) |
| POST | `/api/analyze` | 이미지 수신 → BackgroundTask 위임 → job_id 반환 (202) |
| GET | `/api/status/{job_id}` | 분석 상태 폴링 (queued/processing/done/failed) |
| GET | `/api/result/{result_id}` | 분석 결과 조회 |
| GET | `/api/history` | 완료된 진단 이력 목록 |

---

## 4. AI Analysis Layer (지능형 분석 엔진)

| 기술 | UI 구동 및 역할 | 상세 스펙 및 사용 이유 |
|------|----------------|----------------------|
| **OpenCV** | 어떤 조명 환경에서 촬영해도 표준화된 피부 톤 데이터를 추출합니다. | 화이트밸런스 보정 및 전처리 정규화로 데이터 일관성을 확보합니다. (`opencv-python-headless==4.10.0.84`) |
| **MediaPipe** | 얼굴 랜드마크 468개를 추출하여 피부, 눈동자, 머리카락 ROI를 분리합니다. | 초고속 랜드마크 추출. (`mediapipe==0.10.9` ⚠️ 0.10.14는 numpy 충돌로 사용 금지) |
| **ONNX Runtime** | 분석 시작 후 1초 이내에 결과 페이지로 전환될 수 있도록 모델을 가속합니다. | 무거운 PyTorch/TF 모델을 최적화 포맷으로 변환하여 추론 속도 단축. (`onnxruntime==1.19.2`) |

### AI Worker 처리 흐름

```
POST /analyze (이미지 수신)
  │
  ▼
OpenCV 화이트밸런스 보정
  │
  ▼
MediaPipe 얼굴 랜드마크 추출 (ROI 분리)
  │
  ▼
ONNX Runtime 4계절 분류 추론
(현재: OpenCV 간이 분석 fallback 동작 중 — ONNX 모델 미적용)
  │
  ▼
del image_bytes  ← Privacy-First: 원본 이미지 즉시 파기
  │
  ▼
결과 반환 (season, palette, makeup, hair, fashion)
```

### AI Worker 현재 상태

| 항목 | 상태 |
|------|------|
| OpenCV 전처리 | ✅ 동작 중 |
| MediaPipe 랜드마크 | ✅ 동작 중 |
| ONNX 추론 | ⏳ Phase 6 예정 (현재 OpenCV fallback) |
| Privacy-First 파기 | ✅ `del image_bytes` 적용 |

---

## 5. Data Layer (데이터 저장소)

| 기술 | UI 구동 및 역할 | 상세 스펙 및 사용 이유 |
|------|----------------|----------------------|
| **PostgreSQL** | 사용자가 언제든 과거 진단 결과를 다시 확인할 수 있게 합니다. | StatefulSet 배포. 진단 메타데이터 및 결과 JSONB를 무결성 있게 보관합니다. (원본 이미지는 즉시 파기) |

### DB 구성

| 리소스 | 이름 | 설정 |
|--------|------|------|
| StorageClass | local-storage | `kubernetes.io/no-provisioner`, WaitForFirstConsumer |
| PersistentVolume | postgresql-pv | 5Gi, local type, VM2 nodeAffinity 고정 |
| PersistentVolumeClaim | postgresql-pvc | 5Gi, ReadWriteOnce |
| StatefulSet | postgresql | `postgres:15-alpine`, VM2 고정, PGDATA: `/var/lib/postgresql/data/pgdata` |
| Service | postgresql-svc | ClusterIP, 5432 |

### jobs 테이블 스키마

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

---

## 6. DevOps & Infrastructure Layer (인프라 및 배포)

| 기술 | UI 구동 및 역할 | 상세 스펙 및 사용 이유 |
|------|----------------|----------------------|
| **Kubernetes (K8s)** | 갑작스러운 트래픽 급증에도 서버 다운 없이 원활한 접속을 유지합니다. | HPA로 CPU 사용량 기반 Pod 자동 스케일아웃. `Pod 대역: 10.244.0.0/16` |
| **Helm Chart** | 환경별 설정 차이로 인한 버그를 방지하여 안정적인 배포를 제공합니다. | values.yaml로 이미지 경로, 환경변수, 리소스 요구량을 변수화하여 배포 규격을 표준화합니다. |
| **GitLab CI** | 코드 push 시 Docker 이미지를 자동으로 빌드하고 Registry에 push합니다. | `docker build --network=host` + `ip link set dev eth0 mtu 1400` (VirtualBox 환경 필수 설정) |
| **ArgoCD** | GitLab Registry에 새 이미지가 올라오면 K8s 클러스터를 자동으로 동기화합니다. | GitOps 기반 무중단 배포. NodePort: `192.168.10.246:30080` |
| **Flannel** | 여러 노드에 분산된 Pod들이 IP 충돌 없이 통신할 수 있게 합니다. | VXLAN 기반 오버레이 네트워크. `--iface=enp0s8` 고정 필수. |

### HPA 설정

| 서비스 | CPU 타겟 | Min | Max | 배포 노드 |
|--------|---------|-----|-----|----------|
| color-ai-frontend | 60% | 1 | 4 | VM2 |
| color-ai-backend | 60% | 1 | 4 | VM2 |
| color-ai-ai-worker | 70% | 1 | 3 | VM3 |

### GitLab CI 핵심 설정

```yaml
before_script:
  - echo "{\"auths\":{\"192.168.10.248:5050\":{\"auth\":\"$(echo -n root:${GITLAB_PAT} | base64 -w 0)\"}}}" > ~/.docker/config.json
  - ip link set dev eth0 mtu 1400 || true   # MTU 1400 필수

script:
  - docker build --network=host -t ${IMAGE}:${CI_COMMIT_SHORT_SHA} .
  - docker push ${IMAGE}:${CI_COMMIT_SHORT_SHA}
```

### Helm deployment.yaml env 블록 (필수)

```yaml
{{- with .Values.env }}
env:
  {{- range $key, $value := . }}
  - name: {{ $key }}
    value: {{ $value | quote }}
  {{- end }}
{{- end }}
```

> ⚠️ 이 블록 없으면 values.yaml의 env가 Pod에 주입되지 않음

---

## 7. 데이터 보안 및 파기 정책

| 항목 | 정책 |
|------|------|
| 안면 이미지 처리 | 서버 메모리(BytesIO)에서만 처리, 디스크 기록 없음 |
| 파기 시점 | ONNX 추론 함수 종료 즉시 (`del image_bytes`) |
| DB 저장 데이터 | 컬러 코드(Hex), 시즌 타입, 타임스탬프 등 비식별 결과값만 |
| 금지 항목 | 원본 이미지 디스크 저장, S3 등 오브젝트 스토리지 연동 일체 금지 |

---

## 8. 주요 트러블슈팅 이력

| 문제 | 원인 | 해결 |
|------|------|------|
| docker:24-dind pull 타임아웃 | Runner pull_policy가 always | config.toml에 `pull_policy=["if-not-present"]` 추가 |
| apt-get install 실패 (exit 100) | VirtualBox 브리지 + Docker 중첩 MTU 불일치 | 카카오 미러 + MTU 1400 + `--network=host` |
| CrashLoopBackOff (cv2 import 실패) | libGL.so.1 누락 | Dockerfile에 `libgl1` 추가 |
| AI_WORKER_URL DNS 실패 | Service명 오설정 (ai-worker-svc → color-ai-ai-worker) | values.yaml 수정 + deployment.yaml env 블록 추가 |
| Pod 외부 인터넷 불가 | 브리지(enp0s8)로 나가다 차단 | iptables MASQUERADE + netfilter-persistent 저장 |
| env 환경변수 미주입 | deployment.yaml에 env 블록 누락 | template에 range 루프 env 블록 추가 |
| mediapipe 버전 충돌 | 0.10.14가 numpy>=2.0 요구 | mediapipe 0.10.9로 다운그레이드 |

---

