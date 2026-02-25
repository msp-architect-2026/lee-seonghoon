# User Flow: Personal Color AI Analysis Application

본 문서는 사용자가 앱에 접속하여 최종 퍼스널 컬러 진단 결과를 얻고 이력을 관리하기까지의 전체 경험(UX)과 백엔드 시스템(K8s/AI)의 상호작용을 정의한 유저 플로우입니다.

## User Flow Diagram

```mermaid
sequenceDiagram
    actor User
    participant Frontend as Frontend (Next.js/v0)
    participant Backend as Backend (FastAPI/K8s)
    participant AI as AI Engine (ONNX)
    participant DB as Database (PostgreSQL)

    User->>Frontend: 1. 앱 접속 및 소셜 로그인
    Frontend->>User: 2. 카메라 접근 권한 요청 및 UI 렌더링
    User->>Frontend: 3. 얼굴 촬영 (가이드라인 맞춤)
    
    rect rgb(255, 240, 240)
        Note over User, Frontend: Smart Capture & Light Feedback
        Frontend->>Frontend: 명도/대비 실시간 분석
        alt 조명 불량 (역광/어두움)
            Frontend-->>User: "조명이 어둡습니다. 밝은 곳으로 이동해 주세요." (재촬영 유도)
        end
    end

    Frontend->>Backend: 4. 최적의 이미지 전송 (API 호출)
    
    rect rgb(240, 240, 255)
        Note over User, Frontend: Zero-Boredom Loading UX
        Backend-->>Frontend: 202 Accepted (분석 시작 응답)
        Frontend->>User: 화려한 얼굴 스캔 레이저 애니메이션 재생
    end

    rect rgb(240, 255, 240)
        Note over Backend, AI: High-Speed AI Inference & Privacy-First
        Backend->>AI: 화이트밸런스 보정 (OpenCV)
        AI->>AI: 얼굴 랜드마크 추출 (MediaPipe)
        AI->>AI: 4계절 컬러 추론 (ONNX Runtime)
        AI-->>Backend: 진단 결과 (컬러, 스타일 추천) 반환
        Backend->>Backend: **[보안] 메모리 내 원본 이미지 즉시 파기**
    end

    Backend->>DB: 5. 메타데이터 및 도출된 텍스트 결과만 저장
    Backend-->>Frontend: 6. 최종 분석 결과 전송
    
    rect rgb(255, 255, 240)
        Note over Frontend, User: Impactful Curation
        Frontend->>User: 7. 결과 렌더링 (화면 70% 컬러 팔레트 시각화)
        Frontend->>User: 8. 메이크업, 의상, 맞춤형 헤어 염색 레시피 추천
    end

---

## 단계별 상세 플로우 (Step-by-Step Flow)
**Step 1: 진입 및 인증 (Onboarding & Auth)**
    1. **랜딩 페이지:** 사용자가 모바일 웹으로 접속. (Next.js기반 빠른 초기 렌더링)
    2. **로그인:** NextAuth.js를 통한 간편 소셜 로그인(OAuth) 진행.
    3. **권한 승인:** 카메라 사용 권한 요청하고 승인.

**Step 2: 스마트 캡쳐 및 조명 피드백 (Smart Capture)**
    1. **가이드라인 제공:** 화면에 얼굴을 맞출 수 있는 오버레이 가이드라인 표시.
    2. **실시간 조명 진단:** Zustand로 관리되는 상태값을 통해, 프론트엔드에서 캡처 전 명도와 대비 즉각 평가.
        * **[예외 처리]** 조명이 기준치 미달일 경우: 경고 UI(ex:"조명이 너무 어둡습니다")와 함께 촬영 버튼 비활성화.
    3. **촬영:** 최적의 상태에서 사용자가 사진 촬영.

**Step 3: 분석 요청 및 인터랙티브 로딩 (Loading UX)**
    1. **데이터 전송:** 촬영된 이미지가 K8s Nginx Ingress를 거쳐 FastAPI 백엔드로 전송됨.
    2. **논블로킹 응답:** 서버는 이미지를 받자마자 BackgroundTasks로 분석을 넘기고, 프론트엔드에 즉시 응답을 보냄.
    3. **시각적 대기화면:** v0.app으로 제작된 화려한 얼굴 스캔 애니메이션 컴포넌트가 작동. 지루한 스피너 대신 시각적 즐거움을 주어 1~2초의 AI연산 대기 시간 동안 사용자의 이탈을 방지.

**Step 4: 지능형 분석 및 프라이버시 처리 (AI Inference & Privacy-First)**
    1. **전처리:** OpenCV를 통해 화이트밸런스 정규화.
    2. **특징 추출:** Mediapipe가 가벼운 리소스로 피부,눈동자,머리카락 영역을 빠르게 분리.
    3. **추론:** 최적화된 ONNX Runtime 모델이 4계절 퍼스널 컬러 도출.
    4. **데이터 파기(Privacy First):** 분석이 완료된 즉시 서버 메모리에서 원본 안면 이미지 파기.
    5. **데이터 저장:** 최종 도출된 컬러 텍스트와 메타데이터만 PostgreSQL에 안전히 저장됨.

**Step 5: 결과 큐레이션 및 시각적 타격감 (Impactful Curation)
    1. **결과 노출:** 분석이 완료되면 로딩 애니메이션이 극적으로 전환되며 최종 결과 페이지가 나타남.
    2. **시각적 카타르시스:** 도출된 퍼스널 컬러(ex: 여름 쿨톤 뮤트)가 모바일 화면의 70% 이상을 가득채우며 강렬한 시각적 효과 제공.
    3. **맞춤형 추천 제공:**
    * **메이크업 & 뷰티:** 립, 섀도우 톤 추천.
    * **헤어 스타일링:** 단순한 색상 추천을 넘어, 해당 톤에 가장 잘 어울리는 **구체적인 헤어 염색 레시피와 믹스비율**을 제안.
    * **패션:** 대비감 및 의상 컬러 팔레트 매칭.
    4. **이력 조회:** 마이페이지에서 과거 진단 결과 확인 가능.
