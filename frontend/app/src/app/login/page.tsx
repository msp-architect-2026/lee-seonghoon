'use client'

import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()

  const handleLogin = () => {
    router.push('/capture')
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-between px-6 py-12">

      {/* 상단 브랜딩 */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        <div className="text-center space-y-3">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, #f9c5d1, #a8d8ea, #ffd6a5, #b5ead7)' }}
          />
          <h1 className="text-3xl font-bold tracking-tight">Personal Color AI</h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            나만의 퍼스널 컬러를 AI로 진단하고<br />
            맞춤형 뷰티 큐레이션을 받아보세요
          </p>
        </div>

        {/* 계절 컬러 프리뷰 */}
        <div className="grid grid-cols-4 gap-2 w-full max-w-xs">
          {[
            { label: '봄', colors: ['#FFB7C5', '#FF8C69', '#FFD700'] },
            { label: '여름', colors: ['#B0C4DE', '#DDA0DD', '#98D8C8'] },
            { label: '가을', colors: ['#D2691E', '#8B6914', '#CD853F'] },
            { label: '겨울', colors: ['#1C1C2E', '#DC143C', '#F0F0F5'] },
          ].map((season) => (
            <div key={season.label} className="flex flex-col items-center gap-1">
              <div className="flex gap-0.5">
                {season.colors.map((color, i) => (
                  <div key={i} className="w-4 h-8 rounded-sm" style={{ backgroundColor: color }} />
                ))}
              </div>
              <span className="text-xs text-gray-400">{season.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 하단 로그인 버튼 */}
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={handleLogin}
          className="w-full py-4 rounded-2xl font-semibold text-base flex items-center justify-center gap-3 transition-opacity active:opacity-80"
          style={{ backgroundColor: '#FEE500', color: '#000' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3C6.477 3 2 6.477 2 10.5c0 2.667 1.677 5.014 4.237 6.395L5.177 21l5.051-2.688C10.74 18.434 11.365 18.5 12 18.5c5.523 0 10-3.477 10-8S17.523 3 12 3z"/>
          </svg>
          카카오로 시작하기
        </button>

        <button
          onClick={handleLogin}
          className="w-full py-4 rounded-2xl font-semibold text-base flex items-center justify-center gap-3 bg-white text-black transition-opacity active:opacity-80"
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Google로 시작하기
        </button>

        <p className="text-xs text-gray-600 text-center mt-2">
          로그인 시 개인정보 처리방침에 동의하게 됩니다
        </p>
      </div>
    </div>
  )
}
