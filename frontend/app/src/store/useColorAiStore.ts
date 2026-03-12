import { create } from 'zustand'

type LightingStatus = 'ok' | 'dark' | 'backlight'

interface ColorAiStore {
  lightingStatus: LightingStatus
  analysisProgress: number
  capturedImage: string | null
  resultId: string | null
  jobId: string | null
  setLightingStatus: (status: LightingStatus) => void
  setAnalysisProgress: (progress: number) => void
  setCapturedImage: (image: string | null) => void
  setResultId: (id: string | null) => void
  setJobId: (id: string | null) => void
  reset: () => void
}

export const useColorAiStore = create<ColorAiStore>((set) => ({
  lightingStatus: 'ok',
  analysisProgress: 0,
  capturedImage: null,
  resultId: null,
  jobId: null,
  setLightingStatus: (status) => set({ lightingStatus: status }),
  setAnalysisProgress: (progress) => set({ analysisProgress: progress }),
  setCapturedImage: (image) => set({ capturedImage: image }),
  setResultId: (id) => set({ resultId: id }),
  setJobId: (id) => set({ jobId: id }),
  reset: () => set({
    lightingStatus: 'ok',
    analysisProgress: 0,
    capturedImage: null,
    resultId: null,
    jobId: null,
  }),
}))
