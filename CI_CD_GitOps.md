# CI/CD 파이프라인 구성 (GitOps Pipeline)

개발자의 코드 푸시부터 K8s 클러스터 배포까지의 전 과정은 **GitLab CI**와 **ArgoCD**를 통한 GitOps 방식으로 자동화되어 무중단 배포(Zero-Downtime Deployment)를 실현합니다.

> 실제 운영 중인 VM4(GitLab) + VM1(ArgoCD) 환경을 기준으로 작성되었습니다.

---

## 전체 파이프라인 흐름

```
개발자 코드 push (GitLab / VM4)
  │
  ▼
GitLab CI Runner (VM4 / docker executor)
  ├── Docker 이미지 빌드 (--network=host)
  └── GitLab Container Registry push (192.168.10.248:5050)
  │
  ▼
ArgoCD (VM1 / K8s 내부)
  └── Helm Chart 변경 감지 → K8s 자동 Sync
        ├── color-ai-frontend  → VM2 (Rolling Update)
        ├── color-ai-backend   → VM2 (Rolling Update)
        └── color-ai-ai-worker → VM3 (Rolling Update)
```

---

## 인프라 구성

| 구성요소 | 위치 | 설정 |
|---------|------|------|
| GitLab CE | VM4 (192.168.10.248) | Container Registry 포트: 5050 |
| CI Runner | VM4 | executor: docker, tag: color-ai |
| Container Registry | VM4 (192.168.10.248:5050) | insecure registry (HTTP) |
| ArgoCD | VM1 (192.168.10.245) | NodePort: 192.168.10.246:30080 |
| Helm Chart 저장소 | GitLab (VM4) | ArgoCD가 직접 감시 |

---

## Continuous Integration (GitLab CI)

### 실제 구현 방식

기존 설계(Lint → Test → Build → Push → Manifest 업데이트)와 달리,  
현재 환경은 **단일 build 스테이지**로 구성되어 이미지 빌드와 Registry push만 수행합니다.

> **Lint/Test 미적용 이유:**  
> VirtualBox 브리지 + Docker 중첩 환경의 네트워크 제약으로  
> 외부 패키지 설치가 불안정하여 build 단계에 집중합니다.

### .gitlab-ci.yml (backend / ai-worker 공통)

```yaml
stages:
  - build

variables:
  IMAGE: "192.168.10.248:5050/root/color-ai-{서비스명}"

build:
  stage: build
  tags:
    - color-ai
  before_script:
    # Registry 인증 (base64 -w 0 필수 — 개행 시 인증 실패)
    - mkdir -p ~/.docker
    - echo "{\"auths\":{\"192.168.10.248:5050\":{\"auth\":\"$(echo -n root:${GITLAB_PAT} | base64 -w 0)\"}}}" > ~/.docker/config.json
    # 빌드 컨테이너 내부 MTU 설정 (VirtualBox 환경 필수)
    - ip link set dev eth0 mtu 1400 || true
  script:
    # --network=host: 중첩 NAT 제거로 외부 연결 안정화
    - docker build --network=host -t ${IMAGE}:${CI_COMMIT_SHORT_SHA} -t ${IMAGE}:latest .
    - docker push ${IMAGE}:${CI_COMMIT_SHORT_SHA}
    - docker push ${IMAGE}:latest
```

> ⚠️ **frontend .gitlab-ci.yml은 `docker login` 방식으로 운영 중 → 변경 금지**

### Runner 설정 (VM4 — /etc/gitlab-runner/config.toml)

```toml
[[runners]]
  executor = "docker"
  [runners.docker]
    image = "docker:24-dind"
    pull_policy = ["if-not-present"]   # ← 필수 (없으면 매번 Docker Hub pull → 타임아웃)
    privileged = true
    volumes = ["/var/run/docker.sock:/var/run/docker.sock", "/cache"]
```

### Docker daemon 설정 (VM4 — /etc/docker/daemon.json)

```json
{
  "insecure-registries": ["192.168.10.248:5050"],
  "dns": ["8.8.8.8", "8.8.4.4"],
  "mtu": 1400,
  "iptables": true
}
```

> ⚠️ **MTU 1400 필수** — VirtualBox 브리지 + Docker 중첩 환경에서 패킷 단편화 방지

### 핵심 트러블슈팅 포인트 3가지

| 포인트 | 문제 | 해결 |
|--------|------|------|
| `base64 -w 0` | 기본 base64는 76자마다 개행 → config.json 인증 실패 | `-w 0` 옵션으로 개행 제거 |
| `ip link set dev eth0 mtu 1400` | 빌드 컨테이너 내부 MTU 기본 1500 → 외부 연결 불안정 | 빌드 전 MTU 직접 설정 |
| `docker build --network=host` | 중첩 NAT로 apt-get install 실패 | host 네트워크 사용으로 안정화 |

---

## Continuous Deployment (ArgoCD)

### 실제 구현 방식

Helm Chart `values.yaml`의 이미지 태그를 수동으로 업데이트하거나  
GitLab CI에서 push 후 ArgoCD가 Registry의 `latest` 태그를 감지하여 자동 Sync합니다.

> **Manifest 자동 업데이트 미적용 이유:**  
> 현재 환경은 단일 GitLab 저장소에 앱 코드 + Helm Chart가 함께 존재하며,  
> Image Tag 자동 커밋 스크립트 없이 ArgoCD의 `latest` 태그 감지 방식으로 운영합니다.

### ArgoCD Application 구성 (3개)

| Application | Chart 경로 | 배포 노드 | 이미지 |
|-------------|-----------|----------|--------|
| color-ai-frontend | helm-charts/frontend | VM2 | 192.168.10.248:5050/root/color-ai-frontend |
| color-ai-backend | helm-charts/backend | VM2 | 192.168.10.248:5050/root/color-ai-backend |
| color-ai-ai-worker | helm-charts/ai-worker | VM3 | 192.168.10.248:5050/root/color-ai-ai-worker |

### ArgoCD 접속 정보

| 항목 | 값 |
|------|-----|
| URL | http://192.168.10.246:30080 |
| 계정 | admin |
| 연동 저장소 | http://192.168.10.248/root/color-ai-* |

### Detect Changes → Sync → Rollout 흐름

```
GitLab Registry에 latest 이미지 push
  │
  ▼
ArgoCD가 Helm Chart 저장소 변경 감지
  │
  ▼
K8s Rolling Update 실행
  ├── 기존 Pod 하나씩 종료
  ├── 새 Pod 기동 (새 이미지)
  └── Readiness Probe 통과 확인 후 트래픽 전환
  │
  ▼
배포 완료 (무중단)
```

### Helm Chart 핵심 설정

#### imagePullPolicy

```yaml
# values.yaml
image:
  repository: 192.168.10.248:5050/root/color-ai-backend
  tag: latest
  pullPolicy: Always   # ← latest 태그 사용 시 Always 필수
```

#### deployment.yaml env 블록 (필수)

```yaml
# templates/deployment.yaml
{{- with .Values.env }}
env:
  {{- range $key, $value := . }}
  - name: {{ $key }}
    value: {{ $value | quote }}
  {{- end }}
{{- end }}
```

> ⚠️ 이 블록 없으면 values.yaml의 env가 Pod에 전혀 주입되지 않음  
> → AI_WORKER_URL DNS 실패 → 분석 요청 전부 failed

#### values.yaml 환경변수 현황

| 서비스 | 변수 | 값 |
|--------|------|----|
| backend | DATABASE_URL | `postgresql://colorai:****@postgresql-svc:5432/colorai_db` |
| backend | AI_WORKER_URL | `http://color-ai-ai-worker:8001` |
| backend | ENVIRONMENT | `production` |
| frontend | NEXTAUTH_URL | `http://www.color-ai.com` |
| frontend | NEXT_PUBLIC_API_URL | `http://www.color-ai.com/api` |
| frontend | NEXT_PUBLIC_POLL_INTERVAL_MS | `1000` |

---

## HPA (Horizontal Pod Autoscaler)

트래픽 급증 시 수동 개입 없이 Pod를 자동 스케일아웃합니다.

### metrics-server 설치

```bash
# ⚠️ VirtualBox 환경은 kubelet TLS 자체서명 → --kubelet-insecure-tls 필수
helm install metrics-server metrics-server/metrics-server \
  --namespace kube-system \
  --set args="{--kubelet-insecure-tls}"
```

### HPA 현황

| 서비스 | CPU 타겟 | Min | Max | 배포 노드 |
|--------|---------|-----|-----|----------|
| color-ai-frontend | 60% | 1 | 4 | VM2 |
| color-ai-backend | 60% | 1 | 4 | VM2 |
| color-ai-ai-worker | 70% | 1 | 3 | VM3 |

---

## containerd insecure registry 설정 (VM1, VM2, VM3)

GitLab Container Registry가 HTTP(insecure)이므로 전 노드에 설정 필요합니다.

```
# 파일 위치 (containerd v2.2.1 신버전 기준)
/etc/containerd/certs.d/192.168.10.248:5050/hosts.toml
```

```toml
[host."http://192.168.10.248:5050"]
  capabilities = ["pull", "resolve"]
  skip_verify = true
```

> ⚠️ containerd v2.2.1 신버전은 플러그인명이 변경됨  
> - 플러그인명: `io.containerd.cri.v1.images`  
> - `config_path`: 단일 경로만 사용 (`/etc/containerd/certs.d`)

---

## 터미널 재시작 시 체크리스트 (VM1)

```bash
# 클러스터 상태 확인
kubectl get nodes
kubectl get pods -A

# 환경변수 재설정 (세션마다 필요)
GITLAB_PAT="glpat-IOsw1AePR-n4faXI2Y0U_W86MQp1OjEH.01.0w0kofn14"
ARGOCD_PASSWORD="pjyQPIcGjmq9wlu-"

# ArgoCD 로그인 (세션마다 필요)
argocd login 192.168.10.246:30080 --username admin --password ${ARGOCD_PASSWORD} --insecure
argocd app list
```

### 영구 유지 항목 (재시작 후에도 유지)

| 항목 | 비고 |
|------|------|
| K8s 클러스터 상태 | etcd (VM1) |
| ArgoCD 설치 및 설정 | K8s 리소스 |
| GitLab + Registry | VM4 Docker 컨테이너 |
| Helm Chart 파일 | GitLab 저장소 |
| containerd insecure registry | 각 VM 파일시스템 |
| gitlab-registry-secret | K8s Secret |
| PostgreSQL 데이터 | VM2 /data/postgresql (PV Retain) |
| iptables MASQUERADE 규칙 | netfilter-persistent 저장 완료 |

---

## 주요 트러블슈팅 이력

| 문제 | 원인 | 해결 |
|------|------|------|
| docker:24-dind pull 타임아웃 | pull_policy가 always → 매번 Docker Hub 접근 | config.toml에 `pull_policy=["if-not-present"]` 추가 |
| apt-get install 실패 (exit 100) | VirtualBox 브리지 + Docker MTU 불일치 → 큰 패킷 유실 | 카카오 미러 + MTU 1400 + `--network=host` |
| debian-security NOSPLIT 에러 | 카카오 미러가 debian-security 미러링 안 함 | sed에 `/debian-security/!` 조건 추가 |
| base64 개행 인증 실패 | base64 기본 76자마다 개행 → config.json 인증 실패 | `base64 -w 0`으로 수정 |
| env 환경변수 미주입 | deployment.yaml에 env 블록 누락 | template에 range 루프 env 블록 추가 |
| AI_WORKER_URL DNS 실패 | Service명 오설정 (ai-worker-svc → color-ai-ai-worker) | values.yaml 수정 후 push |

---

## Phase 6 예정 개선사항

| 항목 | 현재 | Phase 6 이후 |
|------|------|-------------|
| Image Tag | `latest` 고정 | CI에서 `CI_COMMIT_SHORT_SHA` 태그로 자동 업데이트 |
| Lint/Test | 미적용 | flake8, pytest, ESLint 추가 예정 |
| Manifest 업데이트 | 수동 | CI에서 values.yaml Image Tag 자동 커밋 예정 |
