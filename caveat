##PostgreSQL은 JSONB가 매우 강력

*내부 필드에 인덱스 가능
*부분 검색 빠름
*NoSQL처럼 확장 가능
*이 프로젝트에서는 Hybrid 설계가 합리적.

---

##FastAPI + BackgroundTask
  *단일 인스턴스 내에서만 동작
  *파드가 죽으면 작업 날아감
  *분산 처리 아님
  
  *Kubernetes + HPA사용의 경우
  *Celery + Redis / Kafka같은 메시지 브로커가 더 안전함.
  *MVP -> BackgroundTasks
Production Scale 메시지 큐 도입
방식이 더 합리적

---

##AI 서빙 구조
**ONNX Runtime 사용 시**
병목 주의사항
  *이미지 업로드 크기
  *OpenCV 전처리 CPU 사용량
  *MediaPipe 동시성 처리
  *Python GIL

해결 전략
  *이미지 업로드 1MB 이하로 제한
  *Gunicorn + Uvicorn workers 다중 프로세스
  *AI 전용 Pod 분리 (API Pod와 분리)
  *CPU request/limit 정교하게 설정

---

##Privacy-First
**이미지 저장 안하는 구조는 좋지만**
  *메모리 덤프
  *에러 로그
  *APM 트레이스
  *디버깅 로그
이미지 바이트 추가되면 위험

해결 전략
  *logging 필터링
  *request body logging 비활성화
  *APM에서 binary payload 마스킹

---

사전 DB 설계 시 
  *versioned model
  *inference confidence score
  *raw feature vector 일부 저장
