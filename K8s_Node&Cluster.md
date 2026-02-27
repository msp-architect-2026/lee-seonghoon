### 프로젝트 전체 흐름 분석 및 **VirtualBox VM** 구성 가이드

**프로젝트 전체 흐름 분석**

이 프로젝트는**사용자 얼굴 사진-> AI퍼스널 컬러 진단-> 결과 큐레이션 제공**하는 **Mobile-First**웹앱입니다.
전체 흐름은 크게 5단계로 구성됩니다.

```Plaintext
[사용자 모바일 브라우저]
        │ HTTPS 접속
        ▼
[VM1: Master Node / ArgoCD] ◄── (GitLab CI 빌드 완료 시 배포 트리거)
        │ GitOps 배포 명령
        ├─────────────────────────────────────────┐
        ▼                                         ▼
[VM2: Web/API Worker]                     [VM3: AI Inference Worker]
 ├─ Nginx Ingress (L7 라우팅)               ├─ FastAPI BackgroundTasks
 ├─ Next.js (캡처/분석/결과 UI)             ├─ OpenCV (조명 보정)
 ├─ FastAPI (폴링 /analysis/status)         ├─ MediaPipe (랜드마크 추출)
 └─ PostgreSQL (결과 텍스트 저장)           └─ ONNX Runtime (컬러 추론)
        │                                        │
        └─────────── 내부 클러스터 통신 ──────────┘
```

**핵심 데이터 흐름**

1. `/login` : **NextAuth → OAuth** 소셜 로그인 **→ JWT** 발급
2. `/capture` : 카메라 스트림 → 프론트 조명 점수 측정 → `POST /analysis/start` (multipart)
3. `202 Accepted` 즉시 반환 → `task_id` 발급 → **VM3**에서 백그라운드 **AI** 분석 시작
4. `/analyzing` : 0.5초 간격 폴링 (`GET /analysis/status/{task_id}`) + 레이저 스캔 애니메이션
5. `status: completed` 수신 → `/result/[id]` 렌더링 → 헥스 팔레트 + 헤어/메이크업 큐레이션
6. 결과 텍스트만 **PostgreSQL** 저장, 원본 이미지는 메모리에서 즉시 파기

---

### VirtualBox VM 구성 계획
**VM 총 개수: 3대**

| **VM** | **역할** | **K8s역할** |
| :--- | :--- | :--- |
| VM1 | Master Node | Control Plane + ArgoCD |
| VM2 | Worker Node-Web/API Pool | Next.js+FastAPI(폴링)+PostgreSQL+Nginx Ingress |
| VM3 | Worker Node-AI Inference Pool | FastAPI_BackgroundTasks+OpenCV+MediaPipe+ONNX |

- ⚠️ 호스트PC 권장사양 : RAM 32GB 이상, 12코어 이상 CPU, SSD 여유공간 200GB 이상

---

### 각 VM 상세 스펙
**VM1 — Master Node (Control Plane + ArgoCD)**

| 항목 | 설정값 | 이유 |
| :--- | :--- | :--- |
| OS | Ubuntu Server 22.04 LTS(64-bit) | K8s 공식 지원 LTS |
| Base Memory | 4096MB(4GB) | etcd+API Server+Scheduler 구동 최소선 |
| CPU | 2vCPU | Control Plane은 연산보단 안정성 우선 |
| 하드디스크 | 50GB(동적할당VDI) | ArgoCD 이미지, etcd스냅샷, kubeconfig 저장 |
| 비디오 메모리 | 16MB(GUI불필요,최소) | 서버용이므로 최소값 |
| 스왑 | 2GB 별도 파티션 권장 | K8s는 swap off필요, 파티션은 별도 관리 |

 * **네트워크 어댑터 구성**

| 어댑터 | 종류 | 설정 | 용도 |
| :--- | :--- | :--- | :--- |
| 어댑터1 | NAT | DHCP자동 | 인터넷접속(apt,helm,argocd이미지 pull 등)
| 어댑터2 | Host-Only Adapter | 고정IP:`192.168.56.10` | VM간 K8s클러스터 내부 통신 전용 |

**할당 기능 상세**
VM1은 전체 K8s 클러스터의 두뇌이자 GitOps 배포의 종착점입니다.

* **K8s Control Plane 구성요소 전담**: `kube-apiserver`(모든 kubectl/API 요청 수신), `etcd`(클러스터 전체 상태 데이터 KV 저장소), `kube-scheduler`(어떤 워커노드에 파드를 올릴지 결정), `kube-controller-manager`(ReplicaSet, Deployment 등 상태 조정 루프 실행) 4가지를 모두 이 노드에서 실행합니다.
* **ArgoCD 설치 및 운영**: GitLab 레포지토리의 `helm/` 디렉토리를 감시(Watch)하다가 `values.yaml` 또는 Helm Chart에 변경이 감지되면, 자동으로 워커 노드에 Rolling Update를 실행합니다. 개발자가 `git push`만 하면 VM2/VM3의 파드가 무중단으로 교체됩니다.
* **Helm 관리 포인트**: 각 서비스(Next.js, FastAPI, PostgreSQL, ONNX Worker)의 Helm Chart 템플릿과 `values-dev.yaml`, `values-prod.yaml` 환경별 변수 파일을 이 노드의 ArgoCD가 읽어 배포를 조율합니다.
* **kubeadm init 실행 노드**: 최초 클러스터 생성 시 `kubeadm init --apiserver-advertise-address=192.168.56.10 --pod-network-cidr=10.244.0.0/16` 명령을 이 VM에서 실행하며, 이후 **VM2/VM3**은 `kubeadm join`으로 이 노드에 합류합니다.

---

**VM2 — Worker Node: Web/API Pool**
| 항목 | 설정값 | 이유 |
| :--- | :--- | :--- |
| OS | Ubuntu Server22.04LTS(64bit) | 동일 OS로 클러스터 일관성 확보 |
| Base Memory | 8192MB(8GB) | Next.js SSR+FastAPI+PostgreSQL 동시 구동 |
| CPU | 4vCPU | Nginx+Next.js SSR+폴링 처리 동시성 확보 |
| 하드디스크 | 80GB(동적할당 VDI) | PostgreSQL 데이터볼륨+컨테이너 이미지 저장 |
| 비디오 메모리 | 16MB | 서버용 최소값 |

* **네트워크 어댑터 구성 (VM2)**

| 어댑터 | 종류 | 설정 | 용도 |
| :--- | :--- | :--- | :--- |
| 어댑터1 | NAT | DHCP자동 | 인터넷접속(이미지 pull, npm 패키지)
| 어댑터2 | Host-Only Adapter | 고정IP:`192.168.56.11` | K8s 클러스터 내부 통신 (VM1/VM3과 연결) |
| 어댑터3 | Bridge Adapter | DHCP (호스트 네트워크 공유) | 호스트 PC 브라우저 → Nginx Ingress 직접 접근 테스트용 |

- 어댑터 3(Bridged)은 개발 환경에서 호스트 브라우저로 `http://192.168.x.x`로 직접 접근해 UI 테스트를 할 때 사용합니다.

**할당 기능 상세**
VM2는 사용자가 체감하는 모든 속도와 응답성을 책임지는 노드입니다. AI 연산을 철저히 배제하고 I/O 중심 작업만 담당합니다.

* **Nginx Ingress Controller:** 외부에서 들어오는 모든 HTTPS 트래픽의 단일 진입점입니다. 경로 기반 라우팅 규칙으로 `/api/*` 요청은 FastAPI 파드로, 그 외 모든 경로는 Next.js 파드로 전달합니다. TLS 인증서 처리(SSL Termination)도 이 계층에서 수행하여 파드들이 암호화/복호화 연산 부담을 지지 않도록 합니다.
* **Next.js 파드:** `/login`, `/capture`, `/analyzing`, `/result/[id]`, `/mypage/history` 5개 핵심 화면의 SSR/SSG 렌더링을 담당합니다. 특히 `/analyzing` 화면에서 v0.app 기반 레이저 스캔 애니메이션이 60fps로 끊김 없이 렌더링되도록 이 노드의 CPU 자원이 AI Worker와 분리되어 있습니다. Zustand로 관리되는 조명 상태, 분석 진행률 등 전역 상태를 폴링 결과에 따라 실시간 업데이트합니다.
* **FastAPI 폴링 전담 인스턴스:** `GET /analysis/status/{task_id}` 엔드포인트만 처리하는 경량 역할입니다. 프론트엔드가 0.5초 간격으로 보내는 상태 확인 요청을 받아 PostgreSQL에서 작업 상태를 조회한 뒤 `processing` 또는 `completed` + 결과 JSON을 반환합니다. AI 연산이 전혀 없는 순수 DB 조회 작업이므로 VM2에 배치합니다.
* **PostgreSQL (StatefulSet):** 사용자 계정 정보, 진단 결과(season_type, 헥스 코드, 큐레이션 텍스트), 이력 데이터를 저장합니다. 원본 이미지는 절대 저장하지 않으며, `history_id`, `analyzed_at`, `season_type`, `thumbnail_color` 등 텍스트성 메타데이터만 보관합니다. StatefulSet으로 배포하여 파드 재시작 시에도 데이터 볼륨(PersistentVolumeClaim)이 유지되도록 구성합니다. 하드디스크 80GB 중 약 20GB를 DB 전용 PV로 할당하는 것을 권장합니다.
* **K8s Node Taint 설정:** `kubectl taint nodes vm2 workload=web:NoSchedule`로 AI 관련 파드가 이 노드에 배치되지 않도록 강제합니다.
* **HPA 설정:** CPU 60% 초과 시 Next.js 파드 자동 스케일아웃 (최소 1개 → 최대 3개).

---

**VM3 — Worker Node: AI Inference Pool**
| 항목 | 설정값 | 이유 |
| :--- | :--- | :--- |
| OS | Ubuntu Server22.04LTS(64bit) | 동일 OS 일관성 |
| Base Memory | 12288MB(12GB) | In-Memory 이미지 처리(tmpfs) + ONNX 모델 로딩 + MediaPipe |
| CPU | 4vCPU | OpenCV/MediaPipe/ONNX 멀티스레드 병렬 추론 |
| 하드디스크 | 60GB (동적 할당 VDI) | ONNX 모델 파일(.onnx), 컨테이너 이미지, 시스템 |
| 비디오 메모리 | 16MB() | 서버용 최소값 |

- ⚠️ **VM3**의 메모리가 가장 높은 이유: 이미지를 디스크 대신 RAM(tmpfs)에 올려 처리하는 Privacy-First 설계 때문입니다. ONNX 모델 자체도 수백MB~수GB를 차지할 수 있습니다.

**네트워크 어댑터 구성 (VM3)**

| 어댑터 | 종류 | 설정 | 용도 |
| :--- | :--- | :--- | :--- |
| 어댑터1 | NAT | DHCP자동 | 인터넷접속(ONNX 모델 다운로드, pip install)
| 어댑터2 | Host-Only Adapter | 고정IP:`192.168.56.12` | K8s 클러스터 내부 통신 전용 |

- VM3은 외부에서 직접 접근할 필요가 없으므로 Bridged 어댑터가 불필요합니다. 모든 요청은 VM2의 FastAPI를 통해 내부 통신으로만 전달됩니다.

**할당 기능 상세**
VM3은 퍼스널 컬러 진단 품질을 결정짓는 핵심 연산 노드이자 Privacy-First 원칙이 물리적으로 강제되는 공간입니다.

* **FastAPI BackgroundTasks 워커:** `POST /analysis/start` 요청이 VM2에서 수신되면, VM2의 FastAPI가 VM3의 이 워커에 작업을 위임합니다. `task_id`를 생성하고 즉시 `202 Accepted`를 반환한 뒤, BackgroundTasks를 통해 아래의 AI 파이프라인을 논블로킹으로 실행합니다. 파이프라인 완료 시 결과를 PostgreSQL(VM2)에 write하고 task 상태를 `completed`로 업데이트합니다.
* **OpenCV 전처리 모듈:** 업로드된 이미지의 조명 환경을 정규화합니다. 화이트밸런스 알고리즘(Gray World 또는 Retinex 계열)을 적용하여 형광등, 자연광, 실내조명 등 어떤 환경에서 촬영해도 피부 톤 RGB 값이 일관된 기준으로 추출되도록 보정합니다. 프론트에서 전송된 `lighting_score` 값이 임계치 미만이면 이 단계에서 `POOR_LIGHTING_CONDITION` 오류를 반환합니다.
* **MediaPipe Face Mesh 모듈:** OpenCV 보정 완료 이미지에서 468개 얼굴 랜드마크를 실시간 추출합니다. 이를 통해 피부 영역(볼, 이마), 눈동자 색상 영역, 머리카락 영역을 각각 마스킹(Segmentation)하여 독립적인 컬러 샘플링이 가능한 3개의 ROI(Region of Interest)를 생성합니다. 이 단계가 ONNX 추론의 입력 품질을 결정합니다.
* **ONNX Runtime 추론 엔진:** MediaPipe가 추출한 피부/눈동자/머리카락 RGB 벡터를 입력으로 받아 4계절 16분류(봄 웜 브라이트, 여름 쿨 뮤트 등) 중 하나를 출력합니다. PyTorch나 TensorFlow 원본 모델 대비 추론 속도가 수배 빠르며, 추론 완료 후 결과 JSON(season_type, main_colors 헥스코드 배열, worst_colors, makeup/hair 큐레이션)을 생성합니다.
* **K8s emptyDir Memory tmpfs 볼륨:** OpenCV 또는 MediaPipe가 내부적으로 임시 파일을 생성할 경우를 대비해, 파드에 `emptyDir: {medium: Memory, sizeLimit: 1Gi}` 볼륨을 마운트합니다. 이 볼륨은 RAM 기반이므로 파드가 종료되거나 재시작되는 순간 데이터가 물리적으로 완전 소멸합니다. 원본 이미지가 절대 디스크에 기록되지 않음을 K8s 인프라 레벨에서 보장합니다.
* **Node Taint & Affinity:** `kubectl taint nodes vm3 workload=ai-inference:NoSchedule`로 일반 웹 파드가 이 노드에 올라오지 못하도록 격리합니다. AI 파드에는 `nodeAffinity`로 반드시 VM3에만 배치되도록 강제합니다. 이를 통해 Noisy Neighbor 문제를 원천 차단하고 AI 연산에 CPU/메모리 자원을 100% 보장합니다.
* **HPA 설정:** CPU 75% 또는 Memory 70% 초과 시 AI Worker 파드 자동 스케일아웃 (단, 로컬 VirtualBox 환경에서는 VM이 1대이므로 파드 복제 수 조정으로 시뮬레이션).

---

### 전체 네트워크 구성 요약

```plaintext
                   [호스트 PC 브라우저]
    |                                              |
    | (서비스 접근)                                 | (GitLab Web UI)
    ↓                                              ↓
[VM2: Nginx - 56.11]                    [VM4: GitLab - 56.13]
    |                                              |
    |    Host-Only Network (192.168.56.0/24)       |
    |                                              |
    ├── [VM1: Master/ArgoCD - 56.10] ←── Webhook ──┘
    |        ↓ GitOps Sync
    └── [VM3: AI Inference - 56.12]

[모든 VM] ──NAT──→ 인터넷
```

---

### VM4-GitLab CE서버 스펙

| 항목 | 설정값 | 이유 |
| :--- | :--- | :--- |
| OS | Ubuntu Server22.04LTS(64bit) | GitLab 공식 지원 OS |
| Base Memory | 6144 MB (6GB) | GitLab 공식 최소 4GB + Sidekiq/CI Runner 여유분 |
| CPU | 2 vCPU | GitLab 자체는 I/O 위주, 코어보다 메모리가 중요 |
| 하드디스크 | 100GB (동적 할당 VDI) | Git 레포지토리, CI 아티팩트, Docker 이미지 레이어 누적 |
| 비디오 메모리 | 16MB | 서버용 최소값 |

- 하드디스크를 100GB로 넉넉하게 잡는 이유는 GitLab CI가 빌드를 반복할수록 아티팩트와 캐시가 쌓이고, Docker 레이어도 누적되기 때문입니다. 나중에 디스크가 꽉 차서 CI 파이프라인이 멈추는 상황을 방지하기 위함입니다.

**네트워크 어댑터 구성 (VM4)**

| 어댑터 | 종류 | 설정 | 용도 |
| :--- | :--- | :--- | :--- |
| 어댑터1 | NAT | DHCP자동 | 인터넷접속(GitLab 패키지 설치, Runner 이미지 pull)
| 어댑터2 | Host-Only Adapter | 고정IP:`192.168.56.13` | VM1(ArgoCD)과 Webhook 통신, VM2/VM3 이미지 push/pull |
| 어댑터3 | Bridge Adapter | DHCP | 호스트 PC 브라우저에서 GitLab Web UI 접근 |

**VM4의 할당 기능 상세**

**GitLab CE (Core 서버):** 소스코드 저장소 역할입니다. Next.js 프론트엔드 코드, FastAPI 백엔드 코드, Helm Chart YAML, ONNX 모델 관련 스크립트가 모두 이 VM의 GitLab 레포지토리에서 관리됩니다. 개발자가 코드를 `git push`하는 순간 이후 모든 자동화의 출발점이 됩니다.
**GitLab CI Runner:** `.gitlab-ci.yml`에 정의된 파이프라인을 실제로 실행하는 에이전트입니다. 이 프로젝트에서 Runner가 수행하는 작업은 구체적으로 다음과 같습니다. Next.js 빌드 및 Docker 이미지 생성, FastAPI 이미지 빌드, 빌드된 이미지에 버전 태그(예: `v1.0.3`) 부착 후 컨테이너 레지스트리에 push, Helm Chart의 `values.yaml`에서 image tag 값을 새 버전으로 자동 업데이트한 뒤 commit합니다.
**GitLab Container Registry:** 빌드된 Docker 이미지를 저장하는 내부 레지스트리입니다. VM2/VM3의 K8s 파드들이 이 레지스트리에서 이미지를 pull하여 컨테이너를 실행합니다. 외부 Docker Hub를 쓰지 않고 내부 레지스트리를 사용하므로 이미지 pull 속도가 빠르고 외부 의존성이 줄어듭니다.
**ArgoCD Webhook 수신 트리거:** GitLab CI가 `values.yaml`의 image tag를 업데이트하고 commit/push하면, GitLab이 VM1의 ArgoCD로 Webhook을 발송합니다. ArgoCD는 이 신호를 받고 변경된 Helm Chart를 K8s 클러스터에 즉시 적용(Sync)합니다. 이것이 `git push` 한 번으로 VM2/VM3의 파드가 무중단 교체되는 GitOps 자동화의 전체 흐름입니다.


- 💡 호스트 PC RAM이 32GB라면 VM에 30GB를 할당하면 호스트 OS가 불안정해질 수 있습니다. 호스트 OS용으로 최소 6~8GB는 남겨두어야 하므로, 호스트 RAM이 32GB라면 VM3의 메모리를 10GB로 줄이거나, VM2를 6GB로 낮추는 조정이 필요합니다. 가능하다면 호스트 RAM 40GB 이상 환경을 권장합니다.
