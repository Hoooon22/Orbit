// 단색 선 아이콘 (레일 아이콘과 같은 16×16 격자·굵기). 흑백 디자인에 맞춰 이모지 대신 쓴다.

const PATHS = {
  folder: <path d="M2 4.5h4.5l1.5 2H14v6.5H2z" />,
  folderOpen: (
    <>
      <path d="M2 13V4.5h4.5l1.5 2H13V8" />
      <path d="M2 13 4 8h10.5l-2 5z" />
    </>
  ),
  file: (
    <>
      <path d="M4 2.5h5.5L12 5v8.5H4z" />
      <path d="M6 8h4M6 10.5h4" />
    </>
  ),
  bolt: <path d="M9 2 4 9h3.5L7 14l5-7H8.5z" />,
  star: <path d="m8 2.5 1.7 3.6 3.8.5-2.8 2.7.7 3.9L8 11.3l-3.4 1.9.7-3.9L2.5 6.6l3.8-.5z" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3.5 3.5" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
