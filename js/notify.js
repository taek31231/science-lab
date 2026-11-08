// ===== 관리자 알림: 대기 중인 신청 수를 작업 표시줄 아이콘·창 제목·탭 아이콘에 표시 =====
// 사이트를 앱으로 설치(크롬·웨일)하고 창을 열어 두면(최소화 가능), 새 신청이 들어올 때 숫자가 바로 바뀝니다.
(function () {
  const BASE_TITLE = document.title;
  const KINDS = { lab: "실험실", purchase: "물품", pw: "비밀번호", app: "앱·사이트" };
  let counts = {}, unsubs = [], timer = null, lastTotal = null, installEvt = null;
  const iconLink = document.querySelector('link[rel="icon"]');
  const ICON = "img/icon-192.png";

  // 앱 설치용 서비스 워커 등록
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("message", (e) => { if (e.data && e.data.type === "open-admin") location.hash = "#/admin"; });
  }
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; refreshControl(); });
  window.addEventListener("appinstalled", () => { installEvt = null; refreshControl(); });
  const installed = () => matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: window-controls-overlay)").matches;

  // 탭 아이콘에 빨간 숫자
  let iconImg = null;
  function drawFavicon(n) {
    if (!iconLink) return;
    if (!n) { iconLink.href = "img/logo.png"; return; }
    const paint = () => {
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const g = c.getContext("2d");
      g.drawImage(iconImg, 0, 0, 64, 64);
      g.fillStyle = "#e11d48"; g.beginPath(); g.arc(44, 20, 20, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff"; g.font = "bold 26px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(n > 99 ? "99" : String(n), 44, 21);
      iconLink.href = c.toDataURL("image/png");
    };
    if (iconImg && iconImg.complete) paint();
    else { iconImg = new Image(); iconImg.onload = paint; iconImg.src = ICON; }
  }

  function show() {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    document.title = total ? `(${total}) ${BASE_TITLE}` : BASE_TITLE;
    drawFavicon(total);
    try { if (navigator.setAppBadge) total ? navigator.setAppBadge(total) : navigator.clearAppBadge(); } catch {}
    const link = document.querySelector(".topbar .admin-link");
    if (link) link.dataset.count = total ? (total > 99 ? "99+" : total) : "";
    if (lastTotal !== null && total > lastTotal) notify(total - lastTotal, total);
    lastTotal = total;
    refreshControl();
  }

  async function notify(added, total) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const body = Object.entries(counts).filter(([, v]) => v).map(([k, v]) => `${KINDS[k]} ${v}`).join(" · ");
    const opt = { body: `대기 중: ${body}`, icon: ICON, badge: ICON, tag: "sci-new-request", renotify: true };
    try {
      const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
      if (reg) await reg.showNotification(`새 신청 ${added}건 (대기 ${total}건)`, opt);
      else new Notification(`새 신청 ${added}건 (대기 ${total}건)`, opt);
    } catch {}
  }

  // 대기 건수 세기 시작/멈춤 (관리자 로그인 동안만)
  function start() {
    stop();
    if (window.Store.isDemo) {
      const tick = () => {
        const get = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
        const s = get("sci-demo-v5"), d = get("sci-dibut-demo-v1");
        const pend = (o) => Object.values(o || {}).filter((r) => r.status === "pending").length;
        counts = { lab: pend(s.requests), purchase: pend(s.purchases), pw: pend(d.pw), app: pend(d.apps) };
        show();
      };
      tick(); timer = setInterval(tick, 5000);
      return;
    }
    const db = firebase.firestore();
    const cols = { lab: "labRequests", purchase: "purchaseRequests", pw: "pwRequests", app: "appRequests" };
    let ready = 0;
    for (const [k, col] of Object.entries(cols)) {
      unsubs.push(db.collection(col).where("status", "==", "pending").onSnapshot((snap) => {
        counts[k] = snap.size;
        if (ready < 4) { ready++; if (ready < 4) return; } // 처음엔 네 가지를 다 받은 뒤 한 번에 표시 (알림 안 띄움)
        show();
      }, () => {}));
    }
  }
  function stop() {
    unsubs.forEach((u) => u()); unsubs = [];
    if (timer) clearInterval(timer); timer = null;
    counts = {}; lastTotal = null;
    document.title = BASE_TITLE; drawFavicon(0);
    try { navigator.clearAppBadge && navigator.clearAppBadge(); } catch {}
    const link = document.querySelector(".topbar .admin-link"); if (link) link.dataset.count = "";
    refreshControl();
  }

  // 관리자 화면 위쪽: 앱 설치·알림 켜기 버튼
  let ctl = null;
  function renderControl(el) { ctl = el; refreshControl(); }
  function refreshControl() {
    if (!ctl || !document.body.contains(ctl)) return;
    const perm = "Notification" in window ? Notification.permission : "unsupported";
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    ctl.innerHTML = `
      <span class="muted small">대기 <b>${total}</b>건</span>
      ${installed() ? '<span class="badge approved" title="작업 표시줄 아이콘에 대기 건수가 표시됩니다">앱으로 실행 중</span>'
        : `<button class="btn ghost sm" data-install>${installEvt ? "앱으로 설치" : "앱 설치 방법"}</button>`}
      ${perm === "granted" ? '<span class="badge approved">새 신청 알림 켜짐</span>'
        : perm === "denied" ? '<span class="badge rejected" title="브라우저 주소창 왼쪽 자물쇠 → 알림 → 허용으로 바꿀 수 있습니다">알림 차단됨</span>'
        : perm === "default" ? '<button class="btn ghost sm" data-notif>새 신청 알림 켜기</button>' : ""}`;
    const ib = ctl.querySelector("[data-install]");
    if (ib) ib.onclick = async () => {
      if (installEvt) { installEvt.prompt(); await installEvt.userChoice; installEvt = null; refreshControl(); return; }
      alert("앱으로 설치하는 방법\n\n" +
        "■ 크롬: 주소창 오른쪽 끝의 '설치' 아이콘(모니터+화살표) 클릭\n   또는 ⋮ 메뉴 → 전송, 저장, 공유 → '페이지를 앱으로 설치'\n\n" +
        "■ 웨일: 주소창 오른쪽의 설치 아이콘 클릭, 또는 메뉴(⋯)에서 '앱 설치' 항목\n\n" +
        "설치되면 앱 창이 따로 열립니다. 작업 표시줄의 아이콘을 오른쪽 클릭 → '작업 표시줄에 고정'.\n" +
        "앱 창을 열어 둔 채(최소화 가능) 관리자로 로그인해 두면 아이콘에 대기 건수가 표시됩니다.");
    };
    const nb = ctl.querySelector("[data-notif]");
    if (nb) nb.onclick = async () => { await Notification.requestPermission(); refreshControl(); };
  }

  window.AdminBadge = { start, stop, renderControl };
})();
