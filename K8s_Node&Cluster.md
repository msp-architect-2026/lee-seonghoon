### 1. 노드 구성 및 권장 스펙 (Node Architecture)
 **Master Node (Control Plane)**
클러스터의 두뇌 역할을 하며, 시스템 전체의 상태를 관리하고 배포 파이프라인의 종착지 역할을 수행합니다.

* **권장 스펙:** 4 vCPU, 8GB RAM

* **운영체제:** Ubuntu Server 22.04 LTS

* **핵심 스택:** Kubernetes Control Plane (API Server, Scheduler, etcd)

* **DevOps 스택:** ArgoCD (GitOps 배포 에이전트)

* **역할 및 설계 목적:**

  * K8s 핵심 컴포넌트를 구동하여 워커 노드의 부하와 완전히 격리합니다. 이를 통해 클러스터 전체가 다운되는 단일 장애점(SPOF)을 방지합니다.

  * 애플리케이션 구동 환경과 클러스터 관리 환경을 물리적으로 분리합니다. GitLab CI에서 빌드된 이미지가 레지스트리에 푸시되면 ArgoCD가 이를 감지해 무중단 배포를 수행하여 100% 가용성을 확보합니다.

  **Worker Node - Web/API Pool**
사용자와 직접 맞닿는 프론트엔드 영역과 가벼운 API 통신, 영구 데이터 저장을 담당합니다.

* **권장 스펙:** 4 vCPU, 8GB RAM

* **운영체제:** Ubuntu Server 22.04 LTS

* **인프라 스택:** Nginx Ingress Controller

* **프론트엔드 스택:** Next.js (SSR/SSG), Tailwind CSS, v0.app 컴포넌트, Zustand, NextAuth.js

* **백엔드 스택:** FastAPI (API Gateway 및 `/analysis/status` 0.5초 폴링 전담)

* **데이터베이스:** PostgreSQL (StatefulSet 기반, 진단 결과 텍스트만 저장)

* **역할 및 설계 목적:**

  * I/O 작업 및 가벼운 SSR 렌더링을 전담합니다.

  * 무거운 AI 연산을 배제하여 프론트엔드 파드의 CPU/Memory 자원을 온전히 보장합니다. AI 분석 대기 시간 동안 화려한 스캔 애니메이션(Zero-Boredom UX)이 버벅거림 없이 60fps로 부드럽게 렌더링되도록 합니다.

### Worker Node - AI Inference Pool
보안과 연산 성능에 집중하여 실제 안면 이미지를 분석하고 결과를 도출하는 '백그라운드 워커' 영역입니다.

* **권장 스펙:** 8 vCPU, 16GB+ RAM (Compute/Memory Optimized)

* **운영체제:** Ubuntu Server 22.04 LTS

* **백엔드 스택:** FastAPI (BackgroundTasks 활용, 메인 스레드 블로킹 방지)

* **AI 엔진 스택:** OpenCV (조명/화이트밸런스 보정), MediaPipe (얼굴 랜드마크 추출), ONNX Runtime (가중치 최적화 추론)

* **역할 및 설계 목적:**

  * ONNX와 MediaPipe의 CPU 멀티스레딩 최적화를 위해 다수의 코어와 넉넉한 메모리를 할당합니다.

  * 이미지를 디스크에 저장하지 않고 In-Memory로 처리하여 퍼스널 컬러 진단의 퀄리티를 높이고 Privacy-First 원칙을 강제합니다.

---

### 2. K8s 클러스터 아키텍처 및 핵심 설정
**A. L7 라우팅 및 엔드포인트 관리**
* **컴포넌트:** Nginx Ingress Controller

* **설정 및 목적:** 단일 엔드포인트에서 트래픽을 받아 /api/analysis 등의 경로는 FastAPI 파드로, 그 외 일반 경로는 Next.js 파드로 라우팅합니다. SSL/TLS 인증서를 Ingress 단에서 처리(Termination)하여 파드들의 연산 부담을 줄이고 보안을 강화합니다.

**B. Privacy-First 파드 설계 (Memory-Backed Volume)**
* **컴포넌트:** K8s emptyDir (tmpfs)

* **설정 및 목적:** AI 분석 파드 배포 시 볼륨 매체를 메모리(RAM)로 지정합니다. OpenCV 등 불가피하게 파일 경로를 요구하는 라이브러리 사용 시, 물리 디스크가 아닌 RAM 디스크를 제공하여 프로세스 종료나 파드 재시작 시 원본 얼굴 이미지가 물리적으로 완전 증발하도록 강제합니다(유출 원천 차단).
```YAML
# K8s Deployment 볼륨 설정 예시 (Privacy-First)
volumes:
  - name: mem-temp-dir
    emptyDir:
      medium: Memory
      sizeLimit: 1Gi
```
**C. 노이즈 네이버(Noisy Neighbor) 방지 격리**
  * **컴포넌트:** Node Affinity & Taints

  * **설정 및 목적:** 무거운 행렬 연산을 수행하는 AI 파드가 프론트엔드 파드의 자원을 뺏지 못하도록 철저히 격리합니다.

    * **Node Affinity/nodeSelector:** AI 파드가 반드시 'AI Inference Pool' 노드에만 배포되도록 강제합니다.

    * **Taints & Tolerations:** AI Inference 노드에 Taint를 걸어 일반 Web/API 파드가 해당 노드에 섞여 배포되지 않도록 차단합니다.

**D. 트래픽 대응 자동 확장 (HPA)**
* **컴포넌트:** Horizontal Pod Autoscaler

* **설정 및 목적:** 사용자 유입 증가 시 폴링 요청과 무거운 이미지 분석 파이프라인의 병목을 방지합니다. 특히 AI Inference 풀만 독립적으로 스케일 아웃하여 GPU 없이 CPU 기반 추론으로 인프라 비용을 절감합니다.
| Target Pod | Scale Out Trigger (임계치) |
| :--- | :--- |
| **FastAPI AI Worker** | CPU 사용량 **75%** 또는 Memory 사용량 **70%** 도달 시 |
| **Next.js Frontend** | CPU 사용량 **60%** 도달 시 |
