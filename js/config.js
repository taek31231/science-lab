// ===== 사이트 설정 =====
// Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹)에서 복사한 값을 붙여넣으세요.
// apiKey가 비어 있으면 "데모 모드"로 동작합니다 (데이터가 이 브라우저에만 저장됨).
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDcY4bUefVLmqJJ9JmyXxXgEAV_DJwfsuI",
  authDomain: "science-lab-a3ef2.firebaseapp.com",
  projectId: "science-lab-a3ef2",
  storageBucket: "science-lab-a3ef2.firebasestorage.app",
  messagingSenderId: "963858416664",
  appId: "1:963858416664:web:68cf0b19f25eeb93862f6d"
};

window.SITE = {
  schoolName: "용산고등학교",
  deptName: "과학정보부",
  targetHours: 40, // 과학·수학 연간 이수 목표 시간
  labs: ["물리실험실", "화학실험실", "생명과학실험실", "지구과학실험실"],
  purposes: ["과학 동아리", "수업 실험", "개인/모둠 탐구", "기타"],
  eventTypes: {
    lab:   { label: "실험실 사용", color: "#2563eb" },
    event: { label: "과학행사",   color: "#059669" }
  },
  eventStatus: {
    scheduled: "예정",
    done: "완료",
    cancelled: "취소"
  }
};
// 예전 데이터 호환: 종류 '천체관측'(astro)은 과학행사로, 상태 '시행 확정'(confirmed)은 예정으로 표시
window.SITE.typeOf = (e) => window.SITE.eventTypes[e.type] || window.SITE.eventTypes.event;
window.SITE.statusOf = (s) => window.SITE.eventStatus[s] || (s === "confirmed" ? "예정" : "");
