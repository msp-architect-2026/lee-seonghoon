'use client'

import { useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useColorAiStore } from '@/store/useColorAiStore'

export default function CapturePage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { lightingStatus, setLightingStatus, setCapturedImage } = useColorAiStore()

  // 카메라 시작
  useEffect(() => {
    let stream: MediaStream
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch {
        alert('카메라 접근 권한이 필요합니다. 설정에서 허용해 주세요.')
      }
    }
    startCamera()
    return () => { stream?.getTracks().forEach((t) => t.stop()) }
  }, [])

  // 실시간 조명 분석 (500ms마다)
  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      canvas.width = 64
      canvas.height = 64
      ctx.drawImage(video, 0, 0, 64, 64)
      const { data } = ctx.getImageData(0, 0, 64, 64)

      let brightness = 0
      for (let i = 0; i < data.length; i += 4) {
        brightness += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114)
      }
      brightness /= (data.length / 4)

      // 역광 감지: 중앙과 가장자리 밝기 비교
      const centerData = ctx.getImageData(24, 24, 16, 16).data
      let centerBrightness = 0
      for (let i = 0; i < centerData.length; i += 4) {
        centerBrightness += (centerData[i] * 0.299 + centerData[i + 1] * 0.587 + centerData[i + 2] * 0.114)
      }
      centerBrightness /= (centerData.length / 4)

      if (brightness < 60) {
        setLightingStatus('dark')
      } else if (brightness - centerBrightness > 80) {
        setLightingStatus('backlight')
      } else {
        setLightingStatus('ok')
      }
    }, 500)
    return () => clearInterval(interval)
  }, [setLightingStatus])

  // 촬영
  const handleCapture = useCallback(() => {
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    if (!video) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const imageData = canvas.toDataURL('image/jpeg', 0.9)

    setCapturedImage(imageData)
    router.push('/analyzing')
  }, [setCapturedImage, router])

  const isDisabled = lightingStatus !== 'ok'

  const lightingMessage = {
    dark: '조명이 너무 어둡습니다. 밝은 곳으로 이동해 주세요.',
    backlight: '역광이 감지되었습니다. 빛을 앞쪽에 두고 촬영해 주세요.',
    ok: '',
  }

  return (
    <div className="relative min-h-screen bg-black overflow-hidden">

      {/* 카메라 뷰파인더 */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* 숨김 캔버스 — 조명 분석용 */}
      <canvas ref={canvasRef} className="hidden" />

      {/* 얼굴 가이드라인 오버레이 */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="border-2 border-white/60 rounded-full"
          style={{ width: '72vw', height: '88vw', maxWidth: '320px', maxHeight: '390px' }}
        />
      </div>

      {/* 상단 안내 */}
      <div className="absolute top-0 left-0 right-0 pt-12 pb-6 bg-gradient-to-b from-black/60 to-transparent">
        <p className="text-center text-white text-sm font-medium">
          얼굴을 가이드라인 안에 맞춰주세요
        </p>
      </div>

      {/* 조명 경고 토스트 */}
      {isDisabled && (
        <div className="absolute top-24 left-4 right-4">
          <div className="bg-yellow-400/90 text-black text-sm font-medium px-4 py-3 rounded-xl text-center">
            ⚠️ {lightingMessage[lightingStatus]}
          </div>
        </div>
      )}

      {/* 하단 촬영 버튼 */}
      <div className="absolute bottom-0 left-0 right-0 pb-12 pt-6 bg-gradient-to-t from-black/60 to-transparent flex flex-col items-center gap-4">

        {/* 촬영 버튼 */}
        <button
          onClick={handleCapture}
          disabled={isDisabled}
          className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all
            ${isDisabled
              ? 'border-gray-600 bg-gray-800 opacity-40 cursor-not-allowed'
              : 'border-white bg-white/20 active:scale-95 active:bg-white/40'
            }`}
        >
          <div className={`w-14 h-14 rounded-full ${isDisabled ? 'bg-gray-600' : 'bg-white'}`} />
        </button>

        <p className="text-xs text-gray-400">
          {isDisabled ? '조명 조건을 맞춰주세요' : '버튼을 눌러 촬영하세요'}
        </p>
      </div>
    </div>
  )
}
