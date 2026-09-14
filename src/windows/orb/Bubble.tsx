import { showDashboard } from "../../shared/api";
import { reportError } from "../../shared/stores/error";
import { useBubble } from "./bubbleStore";

// 오브 옆 말풍선 한 장. 클릭하면 관련 화면을 열고 닫힌다.
export default function Bubble() {
  const b = useBubble((s) => s.current);
  const dismiss = useBubble((s) => s.dismiss);
  if (!b) return null;
  return (
    <button
      className="orb-bubble"
      title="클릭하면 Orbit 창에서 봅니다"
      onClick={() => {
        showDashboard(b.view).catch(reportError);
        dismiss();
      }}
    >
      <span className="orb-bubble-title">{b.title}</span>
      <span className="orb-bubble-body">{b.body}</span>
    </button>
  );
}
