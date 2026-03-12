'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useColorAiStore } from '@/store/useColorAiStore'

export default function AnalyzingPage() {
  const router = useRouter()
  const { capturedImage, jobId, setJobId, setAnalysisProgress, reset } = useColorAiStore()
  const [scanY, setScanY] = useState(0)
  const [statusText, setStatusText] = useState('이미지 전송 중...')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 캡처 이미지 없으면 capture로 복귀
  useEffect(() => {
    if (!capturedImage) {
      router.replace('/capture')
    }
  }, [capturedImage, router])

  // 레이저 스캔 애니메이션
  useEffect(() => {
    let y = 0
    intervalRef.current = setInterval(() => {
      y = (y + 1.5) % 100
      setScanY(y)
    }, 16)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  // 이미지 전송 및 폴링
  useEffect(() => {
    if (!capturedImage) return

    const analyze = async () => {
      try {
        // base64 → Blob 변환
        const res = await fetch(capturedImage)
        const blob = await res.blob()
        const formData = new FormData()
        formData.append('file', blob, 'capture.jpg')

        setStatusText('AI 분석 중...')

        // FastAPI에 전송
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? ''
        const response = await fetch(`${apiUrl}/analyze`, {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) throw new Error('분석 요청 실패')

        const data = await response.json()
        const newJobId = data.job_id
        setJobId(newJobId)
        setStatusText('결과 생성 중...')

        // 1초마다 상태 폴링
        let progress = 30
        pollRef.current = setInterval(async () => {
          try {
            const pollRes = await fetch(`${apiUrl}/status/${newJobId}`)
            const pollData = await pollRes.json()

            progress = Math.min(progress + 10, 95)
            setAnalysisProgress(progress)

            if (pollData.status === 'done') {
              if (pollRef.current) clearInterval(pollRef.current)
              setAnalysisProgress(100)
              router.push(`/result/${pollData.result_id}`)
            }
          } catch {
            // 폴링 오류는 무시하고 계속
          }
        }, Number(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS ?? 1000))

      } catch {
        alert('분석에 실패했습니다. 밝은 곳에서 정면을 보고 다시 시도해주세요.')
        reset()
        router.replace('/capture')
      }
    }

    analyze()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [capturedImage, setJobId, setAnalysisProgress, reset, router])

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">

      {/* 캡처 이미지 배경 */}
      {capturedImage && (
        <div className="absolute inset-0">
          <img
            src={capturedImage}
            alt="captured"
            className="w-full h-full object-cover opacity-40"
          />
          {/* 다크 오버레이 */}
          <div className="absolute inset-0 bg-black/50" />
        </div>
      )}

      {/* 레이저 스캔 라인 */}
      <div
        className="absolute left-0 right-0 h-0.5 z-10 pointer-events-none"
        style={{
          top: `${scanY}%`,
          background: 'linear-gradient(90deg, transparent, #ff2d8f, #ff2d8f, transparent)',
          boxShadow: '0 0 12px 4px rgba(255, 45, 143, 0.6)',
        }}
      />

      {/* 스캔 글로우 영역 */}
      <div
        className="absolute left-0 right-0 h-24 z-10 pointer-events-none"
        style={{
          top: `${scanY - 8}%`,
          background: 'linear-gradient(180deg, transparent, rgba(255,45,143,0.08), transparent)',
        }}
      />

      {/* 중앙 컨텐츠 */}
      <div className="relative z-20 flex flex-col items-center gap-6 px-8">

        {/* 얼굴 스캔 프레임 */}
        <div className="relative w-48 h-56">
          {/* 코너 브라켓 */}
          {[
            'top-0 left-0 border-t-2 border-l-2',
            'top-0 right-0 border-t-2 border-r-2',
            'bottom-0 left-0 border-b-2 border-l-2',
            'bottom-0 right-0 border-b-2 border-r-2',
          ].map((cls, i) => (
            <div key={i} className={`absolute w-6 h-6 border-pink-400 ${cls}`} />
          ))}

          {/* 중앙 점선 원 */}
          <div className="absolute inset-4 rounded-full border border-dashed border-pink-400/40 animate-spin"
            style={{ animationDuration: '8s' }}
          />
        </div>

        {/* 상태 텍스트 */}
        <div className="text-center space-y-2">
          <p className="text-white font-semibold text-lg">{statusText}</p>
          <div className="flex gap-1 justify-center">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>

        {/* 분석 항목 표시 */}
        <div className="flex flex-col gap-1.5 w-full">
          {['피부톤 분석', '눈동자 색상 추출', '머리카락 톤 감지', '계절 타입 분류'].map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
              <div className="w-1 h-1 rounded-full bg-pink-400/60" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
