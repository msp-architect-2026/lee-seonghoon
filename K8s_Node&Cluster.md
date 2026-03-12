# K8s 노드 & 클러스터 구성: Personal Color AI Analysis

본 문서는 온프레미스 VirtualBox 환경에서 실제 구축된 K8s 클러스터의 VM 구성, 네트워크 설계, 역할 분담을 정의합니다.  
Phase 5 완료 기준으로 작성되었습니다.

---

## 물리 인프라 개요

| 항목 | 값 |
|------|-----|
| 물리 PC | 2대 (PC-A, PC-B) |
| 공유기 게이트웨이 | 192.168.10.1 |
| PC-A 호스트 IP | 192.168.10.75 |
| PC-B 호스트 IP | 192.168.10.39 |
| VM 총 개수 | 4대 |
| VM 어댑터1 | NAT (enp0s3 / 10.0.2.15) — 외부 인터넷 |
| VM 어댑터2 | 브리지 (enp0s8) — 클러스터 내부 통신 (무작위 모드: 모두 허용) |

> ⚠️ **권장 사양:** 호스트 PC RAM 32GB 이상, 12코어 이상 CPU, SSD 여유공간 200GB 이상  
> RAM 32GB 환경이라면 호스트 OS용 6~8GB를 반드시 남겨두세요.

---

## VM 구성 전체 요약

| VM | 호스트명 | IP (브리지 고정) | 물리 PC | 역할 |
|----|----------|-----------------|---------|------|
| VM1 | ubuntu-k8s-master | 192.168.10.245 | PC-A | K8s Master, ArgoCD, Helm 관리 |
| VM2 | ubuntu-k8s-web | 192.168.10.246 | PC-B | Nginx Ingress, Next.js, FastAPI, PostgreSQL |
| VM3 | ubuntu-k8s-ai | 192.168.10.247 | PC-B | AI Worker (OpenCV, MediaPipe, ONNX) |
| VM4 | ubuntu-k8s-gitlab | 192.168.10.248 | PC-A | GitLab CE, CI Runner, Container Registry |

---

## 네트워크 설계

| 구분 | 값 |
|------|-----|
| K8s Pod 대역 | 10.244.0.0/16 (Flannel) |
| K8s Service 대역 | 10.96.0.0/12 |
| MetalLB IP 풀 | 192.168.10.136 ~ 192.168.10.152 |
| Nginx Ingress External IP | 192.168.10.136 (MetalLB 할당 완료) |
| ArgoCD NodePort | 192.168.10.246:30080 |

### 트래픽 흐름

```
사용자
  │
  ▼
MetalLB (192.168.10.136)           ← 외부 IP 할당 (베어메탈 LoadBalancer)
  │
  ▼
Nginx Ingress Controller (VM2)     ← L7 라우팅
  ├── /          → Next.js Pod     [color-ai-frontend:3000, VM2]
  └── /api       → FastAPI Pod     [color-ai-backend:8000, VM2]
                       │
                       ├── AI Worker (ClusterIP) [color-ai-ai-worker:8001, VM3]
                       └── PostgreSQL (ClusterIP) [postgresql-svc:5432, VM2]
```

### Pod 외부 인터넷 연결 (필수 설정)

> ⚠️ Pod 트래픽이 enp0s8(브리지)로 나가면 공유기에서 차단됨 → iptables MASQUERADE 필수

```bash
# 전 노드(VM1, VM2, VM3) 실행
sudo iptables -t nat -A POSTROUTING -s 10.244.0.0/16 ! -d 10.244.0.0/16 -o enp0s3 -j MASQUERADE
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save   # 재부팅 후에도 유지
```

---

## VM1 — Master Node (Control Plane + ArgoCD)

### 스펙

| 항목 | 설정값 |
|------|--------|
| OS | Ubuntu Server 22.04 LTS (64-bit) |
| RAM | 6GB |
| CPU | 3 vCPU |
| 디스크 | 50GB (동적 할당 VDI) |
| 비디오 메모리 | 16MB |

### 네트워크 어댑터

| 어댑터 | 종류 | 인터페이스 | IP | 용도 |
|--------|------|-----------|-----|------|
| 어댑터1 | NAT | enp0s3 | 10.0.2.15 (DHCP) | 외부 인터넷 (apt, helm, 이미지 pull) |
| 어댑터2 | 브리지 | enp0s8 | 192.168.10.245 (고정) | K8s 클러스터 내부 통신 |

### 할당 기능

**K8s Control Plane 전담**
- `kube-apiserver` — 모든 kubectl/API 요청 수신
- `etcd` — 클러스터 전체 상태 KV 저장소
- `kube-scheduler` — Pod 배치 노드 결정
- `kube-controller-manager` — ReplicaSet, Deployment 상태 조정

**ArgoCD 운영**
- GitLab 저장소의 Helm Chart 감시
- values.yaml 또는 Chart 변경 감지 시 VM2/VM3에 Rolling Update 자동 실행
- 접속: `http://192.168.10.246:30080` (NodePort)

**kubeadm init 실행**
```bash
kubeadm init \
  --apiserver-advertise-address=192.168.10.245 \
  --pod-network-cidr=10.244.0.0/16
```

**Flannel CNI 설정**
```bash
# ⚠️ VirtualBox 환경에서 Flannel이 enp0s3(NAT)을 선택할 수 있음
# kube-flannel DaemonSet에 --iface=enp0s8 옵션 추가 필수
```

---

## VM2 — Worker Node: Web/API Pool

### 스펙

| 항목 | 설정값 |
|------|--------|
| OS | Ubuntu Server 22.04 LTS (64-bit) |
| RAM | 8GB |
| CPU | 4 vCPU |
| 디스크 | 80GB (동적 할당 VDI) |
| 비디오 메모리 | 16MB |

### 네트워크 어댑터

| 어댑터 | 종류 | 인터페이스 | IP | 용도 |
|--------|------|-----------|-----|------|
| 어댑터1 | NAT | enp0s3 | 10.0.2.15 (DHCP) | 외부 인터넷 (이미지 pull, npm 패키지) |
| 어댑터2 | 브리지 | enp0s8 | 192.168.10.246 (고정) | K8s 클러스터 내부 통신 + 호스트 PC 브라우저 접근 |

> 기존 설계의 어댑터3(Bridge — 브라우저 테스트용)은 **어댑터2(브리지)로 통합** 운영됩니다.  
> 브리지 어댑터가 클러스터 내부 통신과 외부 브라우저 접근을 모두 담당합니다.

### 할당 기능

**Nginx Ingress Controller**
- 외부 트래픽 단일 진입점 (External IP: 192.168.10.136)
- `/api/*` → FastAPI Pod, 그 외 → Next.js Pod 경로 기반 라우팅
- rewrite 불필요 — backend가 `/api/...` 형태로 엔드포인트 정의

**Next.js Pod**
- `/login`, `/capture`, `/analyzing`, `/result/[id]`, `/mypage/history` 5개 화면 담당
- Zustand로 capturedImage, jobId, resultId, analysisResult 전역 상태 관리
- 현재 MOCK 데이터 사용 중 → Phase 6에서 실제 API 연동 예정

**FastAPI Backend Pod**
- POST /api/analyze, GET /api/status/{job_id}, GET /api/result/{result_id}, GET /api/history 처리
- BackgroundTask로 AI Worker(VM3)에 분석 위임
- asyncpg로 PostgreSQL 비동기 연결

**PostgreSQL StatefulSet**
- 데이터 경로: VM2 `/data/postgresql`
- PV: 5Gi, local type, VM2 nodeAffinity 고정
- 원본 이미지 절대 저장 금지 — 비식별 결과값(컬러 코드, 시즌 타입)만 보관

**Node 설정**
```bash
# 레이블
kubectl label node ubuntu-k8s-web role=web

# AI 파드 배치 방지
kubectl taint nodes ubuntu-k8s-web dedicated=web:NoSchedule
```

**HPA**
- color-ai-frontend: CPU 60%, min 1, max 4
- color-ai-backend: CPU 60%, min 1, max 4

---

## VM3 — Worker Node: AI Inference Pool

### 스펙

| 항목 | 설정값 |
|------|--------|
| OS | Ubuntu Server 22.04 LTS (64-bit) |
| RAM | 12GB |
| CPU | 4 vCPU |
| 디스크 | 60GB (동적 할당 VDI) |
| 비디오 메모리 | 16MB |

> ⚠️ **VM3 RAM이 가장 높은 이유:**  
> 이미지를 디스크 대신 메모리(BytesIO)에서 처리하는 Privacy-First 설계 +  
> ONNX 모델 파일 로딩 + MediaPipe Face Mesh 동시 운용

### 네트워크 어댑터

| 어댑터 | 종류 | 인터페이스 | IP | 용도 |
|--------|------|-----------|-----|------|
| 어댑터1 | NAT | enp0s3 | 10.0.2.15 (DHCP) | 외부 인터넷 (pip install, ONNX 모델 다운로드) |
| 어댑터2 | 브리지 | enp0s8 | 192.168.10.247 (고정) | K8s 클러스터 내부 통신 전용 |

> VM3은 외부 직접 접근 불필요. 모든 요청은 VM2 FastAPI → ClusterIP를 통해 내부 전달.

### 할당 기능

**AI Worker FastAPI Pod**
- POST /analyze 수신 → OpenCV → MediaPipe → ONNX 추론 파이프라인 실행
- 현재: OpenCV 기반 간이 분석 fallback 동작 중 (ONNX 모델 미적용 — Phase 6 예정)

**AI 분석 파이프라인**

```
이미지 수신
  │
  ▼
OpenCV 화이트밸런스 보정
(Gray World 알고리즘 — 조명 환경 정규화)
  │
  ▼
MediaPipe Face Mesh
(468개 랜드마크 추출 → 피부/눈동자/머리카락 ROI 분리)
  │
  ▼
ONNX Runtime 추론
(4계절 분류 → season, palette, makeup, hair, fashion 생성)
현재: OpenCV fallback 동작 중
  │
  ▼
del image_bytes  ← Privacy-First: 원본 이미지 즉시 파기
```

**Privacy-First 물리적 보장**
- 원본 이미지는 메모리(BytesIO)에서만 처리
- 분석 완료 즉시 `del image_bytes` 실행
- 디스크 저장 절대 금지

**Node 설정**
```bash
# 레이블
kubectl label node ubuntu-k8s-ai role=ai

# 일반 웹 파드 배치 방지 (AI 전용 격리)
kubectl taint nodes ubuntu-k8s-ai dedicated=ai:NoSchedule
```

**HPA**
- color-ai-ai-worker: CPU 70%, min 1, max 3

**AI Worker 현재 상태**

| 모듈 | 상태 |
|------|------|
| OpenCV 전처리 | ✅ 동작 중 |
| MediaPipe 랜드마크 | ✅ 동작 중 |
| ONNX 추론 | ⏳ Phase 6 예정 |
| Privacy-First 파기 | ✅ `del image_bytes` 적용 |

---

## VM4 — GitLab CE 서버

### 스펙

| 항목 | 설정값 |
|------|--------|
| OS | Ubuntu Server 22.04 LTS (64-bit) |
| RAM | 8GB |
| CPU | 4 vCPU |
| 디스크 | 100GB (동적 할당 VDI) |
| 비디오 메모리 | 16MB |

> 디스크 100GB 이유: CI 빌드 반복 시 아티팩트 + Docker 레이어 누적으로 디스크 부족 방지

### 네트워크 어댑터

| 어댑터 | 종류 | 인터페이스 | IP | 용도 |
|--------|------|-----------|-----|------|
| 어댑터1 | NAT | enp0s3 | 10.0.2.15 (DHCP) | 외부 인터넷 (GitLab 패키지 설치, Runner 이미지 pull) |
| 어댑터2 | 브리지 | enp0s8 | 192.168.10.248 (고정) | VM1 ArgoCD Webhook 통신, VM2/VM3 이미지 push/pull, 호스트 GitLab Web UI 접근 |

### 할당 기능

**GitLab CE**
- 소스코드 저장소: frontend, backend, ai-worker 앱 코드 + Helm Chart
- 개발자 `git push` 시 전체 자동화의 출발점
- GitLab URL: `http://192.168.10.248`

**GitLab Container Registry**
- 빌드된 Docker 이미지 저장 (내부 레지스트리)
- Registry URL: `http://192.168.10.248:5050`
- VM2/VM3 K8s Pod들이 이 레지스트리에서 이미지 pull

| 서비스 | 이미지 경로 |
|--------|------------|
| frontend | 192.168.10.248:5050/root/color-ai-frontend |
| backend | 192.168.10.248:5050/root/color-ai-backend |
| ai-worker | 192.168.10.248:5050/root/color-ai-ai-worker |

**GitLab CI Runner**
- executor: docker
- tag: color-ai
- 핵심 설정: `pull_policy=["if-not-present"]`, MTU 1400, `--network=host`

**ArgoCD Webhook 연동**
```
GitLab CI → Registry push
  → GitLab이 VM1 ArgoCD로 Webhook 발송
  → ArgoCD Helm Chart 변경 감지 → K8s 자동 Sync
  → VM2/VM3 Pod Rolling Update (무중단 배포)
```

---

## 전체 네트워크 구성도

```
                    [호스트 PC 브라우저 / 사용자]
                              │
                              │ http://192.168.10.136
                              ▼
                    [MetalLB → Nginx Ingress]
                       VM2 (192.168.10.246)
                              │
          ┌───────────────────┴───────────────────┐
          │                                       │
    [Next.js Pod]                          [FastAPI Pod]
       (VM2)                                   (VM2)
                                               │
                              ┌────────────────┴──────────────────┐
                              │                                    │
                    [AI Worker Pod]                    [PostgreSQL StatefulSet]
                        (VM3)                               (VM2)
                   192.168.10.247                      192.168.10.246

    브리지 네트워크 (192.168.10.0/24)
    ├── VM1 (192.168.10.245) — PC-A  ← ArgoCD GitOps
    ├── VM2 (192.168.10.246) — PC-B  ← Web/API
    ├── VM3 (192.168.10.247) — PC-B  ← AI Inference
    └── VM4 (192.168.10.248) — PC-A  ← GitLab CI/CD

    [모든 VM] ──NAT(enp0s3)──→ 인터넷
```

---

## 클러스터 구성 명령어 요약

### kubeadm init (VM1)
```bash
kubeadm init \
  --apiserver-advertise-address=192.168.10.245 \
  --pod-network-cidr=10.244.0.0/16
```

### 워커 노드 합류 (VM2, VM3)
```bash
# VM1에서 토큰 재발급 (만료 시)
kubeadm token create --print-join-command

# VM2, VM3에서 실행
kubeadm join 192.168.10.245:6443 --token ... --discovery-token-ca-cert-hash ...
```

### 노드 레이블 및 Taint (VM1)
```bash
kubectl label node ubuntu-k8s-web  role=web
kubectl label node ubuntu-k8s-ai   role=ai

kubectl taint nodes ubuntu-k8s-web dedicated=web:NoSchedule
kubectl taint nodes ubuntu-k8s-ai  dedicated=ai:NoSchedule
```

### Flannel CNI 설치 (VM1)
```bash
# ⚠️ --iface=enp0s8 옵션 추가 필수 (브리지 인터페이스 고정)
kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml
# kube-flannel DaemonSet args에 "--iface=enp0s8" 추가
```

### MetalLB 설치 (VM1)
```bash
helm repo add metallb https://metallb.github.io/metallb
helm install metallb metallb/metallb --namespace metallb-system --create-namespace
# IPAddressPool: 192.168.10.136 ~ 192.168.10.152
```

### Nginx Ingress Controller 설치 (VM1)
```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx
# External IP: 192.168.10.136 (MetalLB 할당)
```

---

## swap 비활성화 (전 노드 필수)

```bash
# K8s 요구사항 — swap 활성화 시 kubelet 실행 불가
sudo swapoff -a
sudo sed -i '/swap/s/^/#/' /etc/fstab   # 재부팅 후에도 유지
```

---

## 기존 설계 대비 실제 구현 변경사항

| 항목 | 기존 설계 | 실제 구현 |
|------|----------|----------|
| 클러스터 내부 통신 | Host-Only (192.168.56.x) | **브리지 (192.168.10.x)** |
| VM 개수 | 3대 (GitLab 미포함) | **4대 (VM4 GitLab 별도)** |
| VM1 RAM | 4GB | **6GB** |
| VM4 RAM | — | **8GB** |
| VM4 CPU | — | **4 vCPU** |
| VM2 어댑터3 (브라우저 테스트) | Bridge 별도 | **어댑터2 브리지로 통합** |
| Pod 외부 인터넷 | 미언급 | **iptables MASQUERADE 필수** |
| Flannel iface | 미지정 | **enp0s8 고정 필수** |
