'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface ResultData {
  id: string
  season: 'spring' | 'summer' | 'autumn' | 'winter'
  seasonKo: string
  subType: string
  palette: string[]
  makeup: { category: string; items: string[] }[]
  hair: { name: string; recipe: string }[]
  fashion: string[]
}

const SEASON_CONFIG = {
  spring: {
    label: '봄 웜톤',
    gradient: 'linear-gradient(160deg, #FFB7C5 0%, #FF8C69 40%, #FFD700 100%)',
    accent: '#FF8C69',
  },
  summer: {
    label: '여름 쿨톤',
    gradient: 'linear-gradient(160deg, #B0C4DE 0%, #DDA0DD 50%, #98D8C8 100%)',
    accent: '#DDA0DD',
  },
  autumn: {
    label: '가을 웜톤',
    gradient: 'linear-gradient(160deg, #D2691E 0%, #8B6914 50%, #CD853F 100%)',
    accent: '#D2691E',
  },
  winter: {
    label: '겨울 쿨톤',
    gradient: 'linear-gradient(160deg, #1C1C2E 0%, #4B0082 50%, #DC143C 100%)',
    accent: '#DC143C',
  },
}

// 임시 목업 데이터 — 실제 API 연동 전
const MOCK_RESULT: ResultData = {
  id: 'mock',
  season: 'summer',
  seasonKo: '여름 쿨톤 뮤트',
  subType: 'Light Summer',
  palette: ['#B0C4DE', '#DDA0DD', '#98D8C8', '#E6E6FA', '#C8A2C8', '#B8D4E8'],
  makeup: [
    { category: '립', items: ['모브 핑크 (Mauve Pink)', '로즈 베이지 (Rose Beige)', '누디 핑크 (Nude Pink)'] },
    { category: '섀도우', items: ['라벤더 (Lavender)', '그레이 핑크 (Gray Pink)', '스모키 모브 (Smoky Mauve)'] },
    { category: '블러셔', items: ['쿨 핑크 (Cool Pink)', '소프트 로즈 (Soft Rose)'] },
  ],
  hair: [
    { name: '애쉬 그레이지 (Ash Greige)', recipe: '애쉬 6 : 베이지 3 : 블루 1 (탈색 1~2회 권장)' },
    { name: '쿨 브라운 (Cool Brown)', recipe: '애쉬 브라운 7 : 바이올렛 3 (탈색 없이 가능)' },
  ],
  fashion: ['#B0C4DE', '#E6E6FA', '#98D8C8', '#DDA0DD', '#F0F0F5', '#C8A2C8'],
}

export default function ResultPage() {
  const router = useRouter()
  const params = useParams()
  const [result, setResult] = useState<ResultData>(MOCK_RESULT)
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  const seasonConfig = SEASON_CONFIG[result.season]

  return (
    <div className="min-h-screen bg-black flex flex-col relative overflow-hidden">

      {/* 상단 70% — 컬러 팔레트 */}
      <div
        className="relative flex flex-col items-center justify-center"
        style={{ height: '70vh', background: seasonConfig.gradient }}
      >
        {/* 뒤로가기 */}
        <button
          onClick={() => router.push('/capture')}
          className="absolute top-12 left-4 text-white/80 text-sm flex items-center gap-1"
        >
          ← 다시 진단
        </button>

        {/* 시즌 타입 */}
        <div className="text-center space-y-3 px-6">
          <p className="text-white/70 text-sm tracking-widest uppercase">Your Personal Color</p>
          <h1 className="text-4xl font-bold text-white drop-shadow-lg">{result.seasonKo}</h1>
          <p className="text-white/80 text-base">{result.subType}</p>
        </div>

        {/* 컬러 팔레트 스와치 */}
        <div className="flex gap-3 mt-8">
          {result.palette.map((color, i) => (
            <div
              key={i}
              className="rounded-full shadow-xl border-2 border-white/30"
              style={{
                backgroundColor: color,
                width: i === 0 || i === 5 ? '40px' : '52px',
                height: i === 0 || i === 5 ? '40px' : '52px',
              }}
            />
          ))}
        </div>

        {/* 스크롤 유도 */}
        <button
          onClick={() => setIsSheetOpen(true)}
          className="absolute bottom-6 flex flex-col items-center gap-1 text-white/60 text-xs"
        >
          <span>큐레이션 보기</span>
          <div className="w-0.5 h-6 bg-white/40 animate-bounce" />
        </button>
      </div>

      {/* 하단 30% — 큐레이션 Bottom Sheet */}
      <div
        className="flex-1 bg-black rounded-t-3xl overflow-y-auto transition-all duration-300"
        style={{ minHeight: '30vh' }}
      >
        <div className="px-6 pt-4 pb-12 space-y-6">

          {/* 핸들 바 */}
          <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto" />

          {/* 메이크업 섹션 */}
          <section>
            <h2 className="text-white font-semibold text-base mb-3">💄 메이크업 추천</h2>
            <div className="space-y-3">
              {result.makeup.map((group) => (
                <div key={group.category}>
                  <p className="text-gray-400 text-xs mb-1.5">{group.category}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((item) => (
                      <span
                        key={item}
                        className="text-xs px-3 py-1.5 rounded-full border text-white"
                        style={{ borderColor: seasonConfig.accent + '60' }}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 헤어 섹션 */}
          <section>
            <h2 className="text-white font-semibold text-base mb-3">✂️ 헤어 컬러 레시피</h2>
            <div className="space-y-2">
              {result.hair.map((item) => (
                <div
                  key={item.name}
                  className="rounded-xl p-3 border border-gray-800 bg-gray-900"
                >
                  <p className="text-white text-sm font-medium">{item.name}</p>
                  <p className="text-gray-400 text-xs mt-1">{item.recipe}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 패션 섹션 */}
          <section>
            <h2 className="text-white font-semibold text-base mb-3">👗 패션 컬러 팔레트</h2>
            <div className="flex gap-2">
              {result.fashion.map((color, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div
                    className="w-10 h-10 rounded-xl shadow-md"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs text-gray-500">{color}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 이력 저장 버튼 */}
          <button
            onClick={() => router.push('/mypage/history')}
            className="w-full py-4 rounded-2xl font-semibold text-sm text-black"
            style={{ backgroundColor: seasonConfig.accent }}
          >
            진단 이력 보기
          </button>
        </div>
      </div>
    </div>
  )
}
