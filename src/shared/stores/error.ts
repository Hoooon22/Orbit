import { create } from "zustand";

// 화면 위에 잠깐 띄우는 오류 문구. 스토어 액션이 실패하면 여기에 적고, 창이 표시한다.
type ErrorStore = {
  error: string | null;
  setError: (e: unknown) => void;
  clear: () => void;
};

export const useError = create<ErrorStore>((set) => ({
  error: null,
  setError: (e) => set({ error: String(e) }),
  clear: () => set({ error: null }),
}));

export const reportError = (e: unknown) => useError.getState().setError(e);
