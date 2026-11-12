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
  labs: ["물리실험실", "화학실험실", "생명과학실험실", "지구과학실험실", "융합과학실"],
  purposes: ["과학 동아리", "수업 실험", "개인/모둠 탐구", "기타"],
  eventTypes: {
    lab:   { label: "실험실 사용", color: "#2563eb" },
    event: { label: "과학행사",   color: "#059669" }
  },
  // 디벗(학생 태블릿) 업무: 기기대장 고정 칸과 구글 계정 도메인
  dibut: {
    ledger: { office: "서울시", region: "용산구", level: "고등학교", found: "공립", school: "용산고등학교", os: "ANDROID" },
    domain: "yongsan.sen.hs.kr",
    orgPath: "/학생/1학년",   // 신입생 구글 계정 조직 경로 (기본값)
    model: "갤럭시탭 S9 FE+"
  },
  // 물품 구입 진행 상태 (검토 중 다음에 관리자가 골라서 바꿈)
  purchaseStatus: {
    preparing: "준비중",
    later: "추후예정",
    delivered: "배송완료",
    hold: "보류",
    canceled: "구매취소",
    handed: "인계완료"
  },
  // 관리자 권한: 마스터는 모든 탭 + 관리자 계정 관리 + 학년도 정리, 나머지는 맡은 업무 탭만
  roles: {
    master:  { label: "마스터",          desc: "모든 탭, 관리자 계정·권한 관리, 학년도 정리" },
    lab:     { label: "과학실 운영",     desc: "실험실 신청 승인, 물품 구입 신청 처리, 시약 대장" },
    program: { label: "행사·과중 기획",  desc: "행사 일정, 수강신청, 이수시간 입력·현황" },
    dibut:   { label: "디벗",            desc: "디벗 기기·신청 처리, 계정 CSV, 구글 계정 명단" }
  },
  eventStatus: {
    scheduled: "예정",
    done: "완료",
    cancelled: "취소"
  }
};
// 예전 데이터 호환: 종류 '천체관측'(astro)은 과학행사로, 상태 '시행 확정'(confirmed)은 예정으로 표시
window.SITE.typeOf = (e) => window.SITE.eventTypes[e.type] || window.SITE.eventTypes.event;
// 신청 상태 이름 (실험실: 검토 중/승인/반려, 물품: 검토 중 + 위 6가지. 예전 물품 승인/반려 기록도 표시)
window.SITE.reqStatusOf = (s) => ({ pending: "검토 중", approved: "승인", rejected: "반려", ...window.SITE.purchaseStatus })[s] || s;
window.SITE.statusOf =(s) => window.SITE.eventStatus[s] || (s === "confirmed" ? "예정" : "");
