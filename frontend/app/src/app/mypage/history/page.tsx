'use client'

import { useRouter } from 'next/navigation'

const MOCK_HISTORY = [
  { id: '001', date: '2026.03.09', season: 'summer', seasonKo: '여름 쿨톤 뮤트', palette: ['#B0C4DE', '#DDA0DD', '#98D8C8'] },
  { id: '002', date: '2026.02.14', season: 'spring', seasonKo: '봄 웜톤 브라이트', palette: ['#FFB7C5', '#FF8C69', '#FFD700'] },
  { id: '003', date: '2026.01.20', season: 'winter', seasonKo: '겨울 쿨톤 딥', palette: ['#1C1C2E', '#DC143C', '#F0F0F5'] },
]

const SEASON_ACCENT: Record<string, string> = {
  spring: '#FF8C69',
  summer: '#DDA0DD',
  autumn: '#D2691E',
  winter: '#DC143C',
}

export default function HistoryPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-black px-6 pt-16 pb-12">

      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.back()}
          className="text-gray-400 text-sm"
        >
          ←
        </button>
        <h1 className="text-white text-xl font-bold">진단 이력</h1>
      </div>

      {/* 이력 없을 때 */}
      {MOCK_HISTORY.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center text-2xl">
            🎨
          </div>
          <p className="text-gray-400 text-sm">아직 진단 이력이 없습니다</p>
          <button
            onClick={() => router.push('/capture')}
            className="px-6 py-3 rounded-2xl bg-white text-black text-sm font-semibold"
          >
            첫 진단 시작하기
          </button>
        </div>
      )}

      {/* 이력 목록 */}
      <div className="space-y-3">
        {MOCK_HISTORY.map((item) => (
          <button
            key={item.id}
            onClick={() => router.push(`/result/${item.id}`)}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gray-900 border border-gray-800 active:scale-95 transition-transform text-left"
          >
            {/* 컬러 팔레트 미리보기 */}
            <div className="flex gap-1 shrink-0">
              {item.palette.map((color, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-lg"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            {/* 텍스트 */}
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">{item.seasonKo}</p>
              <p className="text-gray-500 text-xs mt-0.5">{item.date}</p>
            </div>

            {/* 액센트 닷 */}
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: SEASON_ACCENT[item.season] }}
            />
          </button>
        ))}
      </div>

      {/* 하단 새 진단 버튼 */}
      <div className="fixed bottom-8 left-6 right-6">
        <button
          onClick={() => router.push('/capture')}
          className="w-full py-4 rounded-2xl bg-white text-black font-semibold text-sm"
        >
          새 진단 시작하기
        </button>
      </div>
    </div>
  )
}
