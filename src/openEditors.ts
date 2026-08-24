import type { Editor } from "@tiptap/react";

// 화면에 떠 있는 메모의 편집기 인스턴스 (경로 → 편집기).
// 검색 모달이 지금 보고 있는 메모 안을 바로 찾고 그 자리로 이동하는 데 쓴다.
export const openEditors = new Map<string, Editor>();
