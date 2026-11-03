// ===== 사이트 설정 =====
// Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹)에서 복사한 값을 붙여넣으세요.
// apiKey가 비어 있으면 "데모 모드"로 동작합니다 (데이터가 이 브라우저에만 저장됨).
window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

window.SITE = {
  schoolName: "○○고등학교 과학중점",
  deptName: "과학정보부",
  targetHours: 40, // 과학·수학 연간 이수 목표 시간
  labs: ["물리실험실", "화학실험실", "생명과학실험실", "지구과학실험실"],
  purposes: ["과학 동아리", "수업 실험", "개인/모둠 탐구", "기타"],
  eventTypes: {
    lab:   { label: "실험실 사용", color: "#2563eb" },
    astro: { label: "천체관측",   color: "#7c3aed" },
    event: { label: "과학행사",   color: "#059669" }
  },
  eventStatus: {
    scheduled: "예정 (날씨 확인 중)",
    confirmed: "시행 확정",
    cancelled: "취소"
  }
};
