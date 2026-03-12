# team-07
Team 07 - MSP Architect Training 2026
# 🎨 Personal Color AI Analysis

> 사용자의 안면 이미지를 분석하여 4계절 퍼스널 컬러를 진단하고,  
> 맞춤형 컬러 팔레트 · 메이크업 · 헤어 · 패션 추천을 제공하는 AI 기반 Mobile-First 웹 애플리케이션

![Phase](https://img.shields.io/badge/Phase-5%20Complete-brightgreen)
![E2E](https://img.shields.io/badge/E2E%20Test-Passed-brightgreen)
![K8s](https://img.shields.io/badge/Infra-Kubernetes-blue)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

## 📋 목차

1. [프로젝트 소개](#1-프로젝트-소개)
2. [핵심 3원칙](#2-핵심-3원칙)
3. [시스템 아키텍처](#3-시스템-아키텍처)
4. [기술 스택](#4-기술-스택)
5. [인프라 환경](#5-인프라-환경)
6. [네트워크 설계](#6-네트워크-설계)
7. [핵심 기능](#7-핵심-기능)
8. [데이터 파이프라인](#8-데이터-파이프라인)
9. [CI/CD 파이프라인](#9-cicd-파이프라인)
10. [API 명세](#10-api-명세)
11. [DB 스키마](#11-db-스키마)
12. [진행 현황](#12-진행-현황)
13. [운영 가이드](#13-운영-가이드)
14. [데이터 보안 정책](#14-데이터-보안-정책)

---

## 1. 프로젝트 소개

무거운 AI 분석이 진행되는 동안 레이저 스캔 애니메이션으로 대기 시간을 상쇄하고,  
도출된 결과는 화면의 **70% 이상을 컬러 팔레트**로 채워 시각적 카타르시스를 제공합니다.

백엔드와 인프라는 **Kubernetes + Helm + GitOps** 기반으로 구축되어  
잦은 UI 개편과 AI 가중치 업데이트에도 **무중단 배포 및 트래픽 자동 확장**이 가능합니다.

---

## 2. 핵심 3원칙

| 원칙 | 설명 |
|------|------|
| 🔒 **Privacy-First** | 원본 안면 이미지는 메모리에서만 처리 후 즉시 파기. 결과값(컬러 코드)만 DB 저장 |
| ⚡ **Zero-Boredom UX** | AI 대기 1~2초를 레이저 스캔 애니메이션으로 대체. 단순 스피너 사용 전면 금지 |
| 🎨 **Impactful Curation** | 결과 화면 70% 이상을 컬러 팔레트로 채워 시각적 카타르시스 제공 |

---

## 3. 시스템 아키텍처

```
사용자
  │
  ▼
MetalLB (192.168.10.136)          ← 베어메탈 LoadBalancer
  │
  ▼
Nginx Ingress Controller (VM2)    ← L7 라우팅
  ├── /          → Next.js Pod        [color-ai-frontend:3000]
  └── /api       → FastAPI Pod        [color-ai-backend:8000]
                       │
                       ├── AI Worker Pod (VM3) [color-ai-ai-worker:8001]
                       │     └── OpenCV → MediaPipe → ONNX Runtime
                       │
                       └── PostgreSQL Pod (VM2) [postgresql-svc:5432]
```

### 계층별 구성 요소

| 계층 | 기술 | 역할 |
|------|------|------|
| Frontend | Next.js, Tailwind CSS, Zustand | Mobile-First UI, 전역 상태 관리 |
| Network | MetalLB, Nginx Ingress | 외부 IP 할당, L7 라우팅 |
| API | FastAPI, BackgroundTasks | 비동기 요청 처리, AI 작업 위임 |
| AI | OpenCV, MediaPipe, ONNX Runtime | 이미지 전처리, 얼굴 분석, 퍼스널 컬러 추론 |
| Data | PostgreSQL (StatefulSet) | 비식별 결과값 영구 저장 |
| DevOps | GitLab CI, ArgoCD, Helm, Flannel | GitOps 무중단 배포, 오토스케일링 |

---

## 4. 기술 스택

### Frontend
- **Next.js** (App Router) — SSR/SSG 기반 Mobile-First 렌더링
- **TypeScript** — 타입 안정성 확보
- **Tailwind CSS** — 일관된 스타일링
- **Zustand** — 경량 전역 상태 관리
- **NextAuth.js** — OAuth 소셜 로그인

### Backend
| 패키지 | 버전 | 용도 |
|--------|------|------|
| fastapi | 0.115.0 | 웹 프레임워크 |
| uvicorn[standard] | 0.30.0 | ASGI 서버 |
| python-multipart | 0.0.9 | 파일 업로드 |
| httpx | 0.27.0 | AI Worker HTTP 호출 |
| asyncpg | 0.29.0 | PostgreSQL 비동기 드라이버 |

### AI Worker
| 패키지 | 버전 | 비고 |
|--------|------|------|
| opencv-python-headless | 4.10.0.84 | 화이트밸런스 보정 |
| mediapipe | 0.10.9 | 얼굴 랜드마크 추출 (⚠️ 0.10.14 사용 금지 — numpy 충돌) |
| onnxruntime | 1.19.2 | 퍼스널 컬러 추론 |
| numpy | 1.26.4 | |
| Pillow | 10.4.0 | |

### Infrastructure
- **Kubernetes** — 컨테이너 오케스트레이션, HPA 오토스케일링
- **Helm** — K8s 배포 템플릿 관리
- **Flannel** — Pod 간 오버레이 네트워크 (CNI)
- **MetalLB** — 베어메탈 LoadBalancer
- **Nginx Ingress** — L7 라우팅
- **GitLab CE** — 소스 관리 + Container Registry + CI Runner
- **ArgoCD** — GitOps 기반 지속적 배포

---

## 5. 인프라 환경

### 물리 구성

| 구분 | 값 |
|------|-----|
| 물리 PC | 2대 |
| 공유기 게이트웨이 | 192.168.10.1 |
| PC-A 호스트 IP | 192.168.10.75 |
| PC-B 호스트 IP | 192.168.10.39 |
| VM 어댑터1 | NAT (enp0s3) — 외부 인터넷 |
| VM 어댑터2 | 브리지 (enp0s8) — 클러스터 내부 통신 |

### VM 구성

| VM | 호스트명 | IP | 물리 PC | 역할 |
|----|----------|----|---------|------|
| VM1 | ubuntu-k8s-master | 192.168.10.245 | PC-A | K8s Master, ArgoCD, Helm |
| VM2 | ubuntu-k8s-web | 192.168.10.246 | PC-B | Nginx Ingress, Next.js, FastAPI, PostgreSQL |
| VM3 | ubuntu-k8s-ai | 192.168.10.247 | PC-B | AI Worker (OpenCV, MediaPipe, ONNX) |
| VM4 | ubuntu-k8s-gitlab | 192.168.10.248 | PC-A | GitLab CE, CI Runner, Container Registry |

---

## 6. 네트워크 설계

| 구분 | 값 |
|------|-----|
| K8s Pod 대역 | 10.244.0.0/16 (Flannel) |
| K8s Service 대역 | 10.96.0.0/12 |
| MetalLB IP 풀 | 192.168.10.136 ~ 192.168.10.152 |
| Nginx Ingress External IP | 192.168.10.136 |
| ArgoCD NodePort | 192.168.10.246:30080 |

### Pod 외부 인터넷 연결 설정

> ⚠️ Pod 트래픽이 enp0s8(브리지)로 나가면 공유기에서 차단됨 → iptables MASQUERADE 필수

```bash
sudo iptables -t nat -A POSTROUTING -s 10.244.0.0/16 ! -d 10.244.0.0/16 -o enp0s3 -j MASQUERADE
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

---

## 7. 핵심 기능

### 1) 실시간 조명 진단 및 스마트 캡처
카메라를 켜고 얼굴을 가이드라인에 맞추는 순간, 프론트엔드가 이미지 명도와 대비를 즉각 평가합니다.  
역광이거나 너무 어두울 경우 재촬영을 유도하여 **분석 정확도**를 사전에 확보합니다.

### 2) 초고속 AI 4계절 컬러 추론
서버로 인입된 이미지는 **OpenCV 화이트밸런스 보정 → MediaPipe 랜드마크 추출 → ONNX 추론** 순으로 처리됩니다.

| 계절 | 특징 |
|------|------|
| 🌸 Spring | 밝고 따뜻한 톤 |
| ☀️ Summer | 밝고 차가운 톤 |
| 🍂 Autumn | 깊고 따뜻한 톤 |
| ❄️ Winter | 깊고 차가운 톤 |

### 3) 시각적 타격감의 맞춤형 큐레이션
도출된 팔레트가 화면의 **70% 이상**을 채우며, 메이크업 · 헤어 · 패션 종합 큐레이션을 Bottom Sheet로 제공합니다.

**분석 결과 샘플 (Autumn)**
```
season  : autumn (가을 웜톤)
palette : #D2691E, #CD853F, #8B4513, #556B2F, #DAA520
lip     : 따뜻한 브라운/핑크 계열
shadow  : 브라운 계열
hair    : 골든 브라운 (골든 8 : 코퍼 2)
fashion : 내추럴 & 웜, 어스톤 & 카키
```

### 4) Zero-Boredom 로딩 UX
API 응답 대기 중 단순 스피너 대신 **레이저 스캔 애니메이션**을 렌더링하여 체감 대기 시간을 제거합니다.

### 5) Privacy-First 데이터 처리
업로드된 이미지는 메모리에서 분석 후 **즉시 파기** (`del image_bytes`).  
PostgreSQL에는 컬러 코드, 시즌 타입, 타임스탬프 등 **비식별 결과값만** 저장됩니다.

---

## 8. 데이터 파이프라인

```
[캡처 단계]  사용자 촬영 → 조명 상태 즉각 평가 → 재촬영 유도
      │
      ▼
[인입 단계]  POST /api/analyze → job_id 즉시 반환 (202)
             BackgroundTask로 AI Worker 위임
      │
      ▼
[분석 단계]  OpenCV 화이트밸런스 보정
             → MediaPipe 얼굴 랜드마크 추출 (ROI 분리)
             → ONNX Runtime 4계절 분류 추론
             → 원본 이미지 즉시 파기 (del image_bytes)
      │
      ▼
[저장 단계]  결과 JSONB → PostgreSQL jobs 테이블 저장 (status=done)
      │
      ▼
[결과 단계]  GET /api/result/{result_id} → 팔레트 70% 화면 렌더링
```

---

## 9. CI/CD 파이프라인

```
코드 push (GitLab)
  │
  ▼
GitLab CI Runner (VM4)
  ├── docker build --network=host
  ├── ip link set dev eth0 mtu 1400
  └── docker push → Registry (192.168.10.248:5050)
  │
  ▼
ArgoCD (VM1)
  └── Helm Chart 변경 감지 → K8s 자동 Sync
        ├── color-ai-frontend (VM2)
        ├── color-ai-backend (VM2)
        └── color-ai-ai-worker (VM3)
```

### HPA 설정

| 서비스 | CPU 타겟 | Min | Max | 배포 노드 |
|--------|---------|-----|-----|----------|
| color-ai-frontend | 60% | 1 | 4 | VM2 |
| color-ai-backend | 60% | 1 | 4 | VM2 |
| color-ai-ai-worker | 70% | 1 | 3 | VM3 |

---

## 10. API 명세

| Method | Endpoint | 설명 | 응답 |
|----|-------|-----------|-----------|
| GET | `/api/health` | 헬스체크 (DB 상태 포함) | `{"status":"ok","db":"ok"}` |
| POST | `/api/analyze` | 이미지 업로드 → 분석 시작 | `{"job_id":"...","status":"queued"}` (202) |
| GET | `/api/status/{job_id}` | 분석 진행 상태 폴링 | `{"status":"done","result_id":"..."}` |
| GET | `/api/result/{result_id}` | 분석 결과 조회 | season, palette, makeup, hair, fashion |
| GET | `/api/history` | 진단 이력 목록 | 완료된 job 목록 |

---

## 11. DB 스키마

```sql
CREATE TABLE IF NOT EXISTS jobs (
    job_id      TEXT PRIMARY KEY,
    status      TEXT NOT NULL DEFAULT 'queued',  -- queued / processing / done / failed
    result_id   TEXT,
    result      JSONB,
    error       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**DB 연결 정보**
```
postgresql://colorai:****@postgresql-svc:5432/colorai_db
```

---

## 12. 진행 현황

### 마일스톤

| Phase | 내용 | 상태 |
|-------|------|------|
| Phase 1 | 인프라 셋업 (VM, K8s, Network) | ✅ 완료 |
| Phase 2 | 코어 API & AI 파이프라인 | ✅ 완료 |
| Phase 3 | 프론트엔드 (Next.js, Zustand) | ✅ 완료 |
| Phase 4 | CI/CD & GitOps (GitLab CI, ArgoCD) | ✅ 완료 |
| Phase 5 | DB & E2E 테스트 | ✅ 완료 |
| Phase 6 | 도메인 연결 & ONNX 모델 적용 | ⏳ 진행 예정 |

### 현재 Pod 상태

| Pod | 상태 | 비고 |
|-----|------|------|
| color-ai-frontend | ✅ Running | MOCK → 실제 API 연동 예정 (Phase 6) |
| color-ai-backend | ✅ Running | PostgreSQL 연동 완료 |
| color-ai-ai-worker | ✅ Running | OpenCV fallback 동작 중, ONNX 미적용 |
| postgresql-0 | ✅ Running | StatefulSet, VM2 고정 |

### E2E 테스트 결과 (Phase 5 완료)

| 단계 | 테스트 | 결과 |
|------|--------|------|
| 1 | POST /api/analyze | ✅ job_id 반환 |
| 2 | GET /api/status/{job_id} | ✅ status: done |
| 3 | GET /api/result/{result_id} | ✅ 전체 필드 반환 |
| 4 | PostgreSQL 저장 확인 | ✅ JSONB 저장 확인 |
| 5 | GET /api/history | ✅ 이력 목록 반환 |

---

## 13. 운영 가이드

### 터미널 재시작 시 체크리스트 (VM1)

```bash
kubectl get nodes
GITLAB_PAT="YOUR_GITLAB_PAT"
ARGOCD_PASSWORD="YOUR_ARGOCD_PASSWORD"
argocd login 192.168.10.246:30080 --username admin --password ${ARGOCD_PASSWORD} --insecure
argocd app list
```

### UI 변경 배포
```bash
# 코드 수정 후 GitLab push → CI 자동 실행 → ArgoCD 자동 Sync
git add . && git commit -m "feat: update UI" && git push
```

### AI 모델 업데이트
```bash
# ONNX 모델 변환 후 /app/models/에 배치
# AI Worker Pod 재시작으로 새 모델 로드
kubectl rollout restart deployment/color-ai-ai-worker
```

### 트래픽 급증 대응
HPA가 CPU 사용량 기반으로 자동 스케일아웃합니다. 수동 개입 불필요.

```bash
# HPA 상태 확인
kubectl get hpa
```

---

## 14. 데이터 보안 정책

| 항목 | 정책 |
|------|------|
| 안면 이미지 처리 | 서버 메모리(BytesIO)에서만 처리, 디스크 기록 없음 |
| 이미지 파기 시점 | ONNX 추론 함수 종료 즉시 (`del image_bytes`) |
| DB 저장 데이터 | 컬러 코드(Hex), 시즌 타입, 타임스탬프 등 **비식별 결과값만** |
| 금지 항목 | 원본 이미지 디스크 저장, S3 등 오브젝트 스토리지 연동 일체 금지 |

---
