# UI/UX Guide: Personal Color AI Analysis

본 문서는 'Personal Color AI Analysis' 모바일 웹 애플리케이션의 프론트엔드 화면 개발 및 UI 디자인을 위한 공통 가이드라인입니다.

---

## 핵심 UX 원칙 3가지

| 원칙 | 설명 |
|------|------|
| 🔒 **Privacy-First** | 원본 안면 이미지는 메모리에서만 처리 후 즉시 파기. 결과값(컬러 코드)만 DB 저장 |
| ⚡ **Zero-Boredom** | AI 대기 1~2초를 레이저 스캔 애니메이션으로 대체. 단순 스피너 전면 금지 |
| 🎨 **Impactful Curation** | 결과 화면 70% 이상을 컬러 팔레트로 채워 시각적 카타르시스 제공 |

---

## 1. 메뉴 구조 (Information Architecture)

```
/login
  └── 소셜 로그인 (Onboarding)

/capture
  └── 스마트 캡처 (카메라 권한, 얼굴 가이드라인, 실시간 조명 피드백)

/analyzing
  └── 인터랙티브 로딩 (레이저 스캔 애니메이션 + 폴링)

/result/[id]
  └── 진단 결과 (70% 컬러 팔레트 + Bottom Sheet 큐레이션)

/mypage/history
  └── 과거 진단 이력 조회 목록
```

---

## 2. 화면별 상세 정의

### 2-1. `/login` — 소셜 로그인

| 항목 | 내용 |
|------|------|
| 목적 | 서비스 진입점, 로그인 후 /capture로 이동 |
| 구현 | NextAuth.js OAuth 연동 |
| 상태 관리 | 로그인 세션 (NextAuth) |

---

### 2-2. `/capture` — 스마트 캡처

#### 레이아웃

- 화면 전체를 뷰파인더로 사용 (상/하단 네비게이션 최소화)
- 중앙에 얼굴 오버레이 가이드라인 표시
- 하단에 촬영 버튼 배치

#### 조명 상태 실시간 피드백

| 조명 상태 | UI 동작 | UX Writing |
|-----------|---------|------------|
| 정상 | 촬영 버튼 활성화 (Primary) | — |
| 불량 (어두움/역광) | 촬영 버튼 비활성화 (Disabled) + Toast 경고 | "조명이 너무 어둡습니다. 밝은 곳으로 이동해 주세요." |

#### 촬영 완료 후 흐름

```
이미지 캡처
  → POST /api/analyze 호출
  → 202 응답 수신 + job_id 저장 (Zustand)
  → /analyzing 페이지로 이동
```

#### Zustand 상태

```typescript
// useColorAiStore.ts
capturedImage: string | null   // 캡처된 이미지 데이터
jobId: string | null           // 분석 job ID
```

---

### 2-3. `/analyzing` — 인터랙티브 로딩

#### Zero-Boredom UX 원칙

> ⚠️ 단순 스피너(Spinner) 사용 **전면 금지**

- 202 응답 수신 즉시 캡처 이미지를 배경으로 레이저 스캔 애니메이션 재생
- 분석 단계별 텍스트 변경 ("피부톤 분석 중...", "컬러 매칭 중...")

#### 폴링 로직

```
GET /api/status/{job_id} → 1000ms 간격 반복
  ├── status: queued/processing → 애니메이션 유지
  ├── status: done → result_id 저장 → /result/{result_id} 이동
  └── status: failed → 에러 처리 → /capture 복귀
```

#### 환경변수

```
NEXT_PUBLIC_POLL_INTERVAL_MS=1000
```

#### Zustand 상태

```typescript
jobId: string | null           // 폴링 대상 job ID
resultId: string | null        // 완료 시 저장
```

---

### 2-4. `/result/[id]` — 진단 결과

#### 레이아웃 구성

```
┌─────────────────────────────┐
│                             │
│   컬러 팔레트 영역 (70%)    │  ← Hex 코드 기반 동적 색상 블록
│   season, label,            │
│   description               │
│                             │
├─────────────────────────────┤
│   Bottom Sheet (30%)        │  ← 스크롤 가능
│   ├── 메이크업 (lip, shadow) │
│   ├── 헤어 추천             │
│   └── 패션 스타일           │
└─────────────────────────────┘
```

#### 컬러 팔레트 컴포넌트

- Hex 코드를 직접 렌더링하는 동적 색상 블록
- 팔레트 5개 스와치 표시
- 화면의 **70% 이상** 차지 (Impactful Curation 원칙)

#### 실제 결과 데이터 예시 (Autumn)

```
season      : autumn
label       : 가을 웜톤
description : 깊고 따뜻한 캐멜, 테라코타, 올리브 계열
palette     : #D2691E, #CD853F, #8B4513, #556B2F, #DAA520
lip         : 따뜻한 브라운/핑크 계열
shadow      : 브라운 계열
hair        : 골든 브라운 (골든 8 : 코퍼 2)
fashion     : 내추럴 & 웜, 어스톤 & 카키
```

#### API 연동 (Phase 6 예정)

현재 MOCK 데이터 사용 중 → Phase 6에서 실제 API로 교체

```typescript
// 현재 (MOCK)
const result = MOCK_RESULT

// Phase 6 이후 (실제 API)
const result = await fetch(`/api/result/${resultId}`)
```

---

### 2-5. `/mypage/history` — 진단 이력

#### 표시 내용

| 필드 | 설명 |
|------|------|
| `created_at` | 진단 날짜 |
| `season` | 계절 결과 |
| 대표 팔레트 | `palette[0]` 첫 번째 컬러 스와치 |

#### API 연동 (Phase 6 예정)

```typescript
// 현재 (MOCK)
const history = MOCK_HISTORY

// Phase 6 이후 (실제 API)
const history = await fetch('/api/history')
```

---

## 3. 공통 컴포넌트

### 버튼

| 타입 | 사용 상황 |
|------|----------|
| Primary Button | 촬영, 다음 단계 등 핵심 액션 (최고 대비, 최대 크기) |
| Disabled Button | 조명 불량 등 조건 미충족 시 액션 방지 |

### Color Palette 블록

- Hex 코드를 `backgroundColor`로 직접 적용
- 동적 색상 블록 컴포넌트
- 클릭 시 Hex 코드 클립보드 복사 가능

### Toast / 오버레이 경고

- 조명 불량 시 화면 하단 Toast로 즉시 노출
- 2초 후 자동 사라짐

---

## 4. 전역 상태 관리 (Zustand)

```typescript
// app/src/store/useColorAiStore.ts

interface ColorAiStore {
  capturedImage: string | null      // 캡처된 이미지 데이터
  jobId: string | null              // 분석 job ID
  resultId: string | null           // 결과 ID
  analysisResult: AnalysisResult | null  // 분석 결과 전체

  setCapturedImage: (image: string) => void
  setJobId: (id: string) => void
  setResultId: (id: string) => void
  setAnalysisResult: (result: AnalysisResult) => void
  reset: () => void
}
```

---

## 5. 에러 처리

| 상황 | UI 동작 |
|------|---------|
| 카메라 권한 거부 | 권한 안내 팝업 + 설정 이동 유도 |
| 조명 불량 | 촬영 버튼 비활성화 + Toast 경고 |
| 분석 실패 (status: failed) | "분석에 실패했습니다. 밝은 곳에서 정면을 보고 다시 시도해주세요." + /capture 복귀 |
| 네트워크 오류 | 재시도 버튼 제공 |

---

## 6. UX Writing 가이드

### 큐레이션 문구 원칙

단순 나열이 아닌 **전문적이고 시각적인 묘사** 사용

| ❌ 하지 말 것 | ✅ 올바른 예시 |
|--------------|--------------|
| "이 색이 어울립니다" | "따뜻한 브라운/핑크 계열" |
| "헤어 추천" | "골든 브라운 (골든 8 : 코퍼 2)" |
| "편한 옷을 입으세요" | "내추럴 & 웜, 어스톤 & 카키" |

### 조명 피드백 문구

```
"조명이 너무 어둡습니다. 밝은 곳으로 이동해 주세요."
"역광이 감지되었습니다. 빛을 정면으로 받아주세요."
```

---

## 7. Phase 6 예정 작업

| 항목 | 내용 |
|------|------|
| MOCK → 실제 API | POST /api/analyze, GET /api/history 실제 호출로 교체 |
| 폴링 구현 | GET /api/status/{job_id} 1000ms 간격 폴링 |
| 결과 렌더링 | 실제 palette, makeup, hair, fashion 데이터로 렌더링 |
