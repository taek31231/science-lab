// ===== 관리자 알림: 대기 중인 신청 수를 작업 표시줄 아이콘·창 제목·탭 아이콘에 표시 =====
// 사이트를 앱으로 설치(크롬·웨일)하고 창을 열어 두면(최소화 가능), 새 신청이 들어올 때 숫자가 바로 바뀝니다.
(function () {
  const BASE_TITLE = document.title;
  const KINDS = { lab: "실험실", purchase: "물품", pw: "비밀번호", app: "앱·사이트" };
  const ICONS = { lab: "🧪", purchase: "🛒", pw: "🔑", app: "📱" };
  // 알림창 항목을 누르면 갈 관리자 화면: [관리자 탭, 디벗 관리 안쪽 탭]
  const GOTO = { lab: ["requests"], purchase: ["purchases"], pw: ["dibut", "pw"], app: ["dibut", "apps"] };
  let counts = {}, items = {}, unsubs = [], timer = null, lastTotal = null, installEvt = null;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ms = (t) => (t && t.toMillis ? t.toMillis() : +t || 0);
  // 신청 한 건 → 알림창 한 줄 (누가, 무엇을)
  function summarize(kind, r) {
    const u0 = (r.users || []).find((u) => u && (u.sid || u.name)) || {};
    const who = { lab: [r.team, [u0.sid, u0.name].filter(Boolean).join(" ")].filter(Boolean).join(" · "),
      purchase: [r.team, [r.sid, r.name].filter(Boolean).join(" ")].filter(Boolean).join(" · "),
      pw: [r.sid, r.name].filter(Boolean).join(" "), app: [r.sid, r.name].filter(Boolean).join(" ") }[kind];
    const what = { lab: [r.date, r.start && `${r.start}~${r.end}`, r.lab].filter(Boolean).join(" "),
      purchase: `품목 ${(r.items || []).length}개${r.useDate ? ` · 사용예정 ${r.useDate}` : ""}`,
      pw: "구글 비밀번호 재설정", app: `${r.kind === "site" ? "사이트" : "앱"} '${r.title || ""}'${r.googleAuth ? " 🔐" : ""}` }[kind];
    return { kind, id: r.id, at: ms(r.createdAt), who: who || "(이름 없음)", what };
  }
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

  // 이 컴퓨터에서 받을 알림 종류 (브라우저에 저장, 기본: 모두 켬)
  const PREF = "sci-notify-kinds";
  let prefs = (() => { try { return JSON.parse(localStorage.getItem(PREF)) || {}; } catch { return {}; } })();
  const isOn = (k) => prefs[k] !== false;
  const myTotal = () => Object.keys(KINDS).filter(isOn).reduce((a, k) => a + (counts[k] || 0), 0);
  function setPref(k, on) {
    prefs = { ...prefs, [k]: on };
    try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch {}
    lastTotal = null; // 설정을 바꿀 때는 '새 신청' 알림을 띄우지 않음
    show();
  }

  function show() {
    const total = myTotal();
    document.title = total ? `(${total}) ${BASE_TITLE}` : BASE_TITLE;
    drawFavicon(total);
    try { if (navigator.setAppBadge) total ? navigator.setAppBadge(total) : navigator.clearAppBadge(); } catch {}
    const link = document.querySelector(".topbar .admin-link");
    if (link) link.dataset.count = total ? (total > 99 ? "99+" : total) : "";
    if (lastTotal !== null && total > lastTotal) notify(total - lastTotal, total);
    lastTotal = total;
    refreshControl();
    drawBell();
  }

  // ---------- 🔔 알림창 (상단 메뉴) ----------
  const SEEN = "sci-bell-seen";
  const seen = () => { try { return +localStorage.getItem(SEEN) || 0; } catch { return 0; } };
  const fmt = (t) => { if (!t) return ""; const d = new Date(t), p = (n) => String(n).padStart(2, "0");
    const today = new Date().toDateString() === d.toDateString();
    return `${today ? "오늘" : `${d.getMonth() + 1}/${d.getDate()}`} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  let bell = null, panel = null;
  function ensureBell() {
    if (bell) return;
    const bar = document.querySelector(".topbar");
    bell = document.createElement("button");
    bell.className = "bell"; bell.type = "button"; bell.title = "대기 중인 신청"; bell.hidden = true;
    bell.innerHTML = '🔔<span class="bell-cnt"></span>';
    panel = document.createElement("div");
    panel.className = "bell-panel"; panel.hidden = true;
    bar.insertBefore(bell, bar.querySelector(".menu-btn"));
    document.body.appendChild(panel);
    // 종을 누르면 열기/닫기, 창 바깥을 누르거나 Esc를 누르면 닫기
    bell.onclick = (e) => { e.stopPropagation(); if (panel.hidden) { panel.hidden = false; drawPanel(); } else closePanel(); };
    document.addEventListener("click", (e) => { if (!panel.hidden && !panel.contains(e.target)) closePanel(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });
  }
  function closePanel() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    try { localStorage.setItem(SEEN, String(Date.now())); } catch {} // 열어 본 시각 → 그 뒤 들어온 것만 NEW
    drawBell();
  }
  const allItems = () => Object.keys(items).filter(isOn).flatMap((k) => items[k] || []).sort((a, b) => b.at - a.at);
  function drawBell() {
    ensureBell();
    const list = allItems(), fresh = list.filter((x) => x.at > seen()).length;
    bell.hidden = !unsubs.length && !timer;
    bell.classList.toggle("has-new", fresh > 0);
    bell.querySelector(".bell-cnt").textContent = list.length ? (list.length > 99 ? "99+" : list.length) : "";
    if (!panel.hidden) drawPanel(false);
  }
  function drawPanel() {
    const list = allItems(), s = seen();
    const anyOn = Object.keys(KINDS).some(isOn);
    panel.innerHTML = `
      <div class="bell-head"><b>대기 중인 신청 ${list.length}건</b>
        <div class="bell-prefs"><span class="muted small">이 컴퓨터에서 받을 알림</span>
          ${Object.keys(KINDS).map((k) => `<label class="bell-pref ${isOn(k) ? "on" : ""}"><input type="checkbox" data-pref="${k}" ${isOn(k) ? "checked" : ""}>${ICONS[k]} ${KINDS[k]} <b>${(items[k] || []).length}</b></label>`).join("")}
        </div></div>
      <div class="bell-list">${list.map((x, i) => `
        <button type="button" class="bell-item ${x.at > s ? "new" : ""}" data-i="${i}">
          <span class="bell-ico">${ICONS[x.kind]}</span>
          <span class="bell-body"><span class="bell-top"><b>${KINDS[x.kind]}</b>${x.at > s ? '<span class="bell-new">NEW</span>' : ""}<span class="bell-time">${fmt(x.at)}</span></span>
            <span class="bell-who">${esc(x.who)}</span><span class="bell-what muted">${esc(x.what)}</span></span>
        </button>`).join("") || `<p class="muted" style="padding:16px;margin:0;text-align:center">${anyOn ? "대기 중인 신청이 없습니다." : "받을 알림이 모두 꺼져 있습니다."}</p>`}</div>
      <div class="bell-foot muted small">항목을 누르면 처리 화면으로 이동합니다. 끈 종류는 숫자·목록·윈도우 알림에서 빠집니다.</div>`;
    panel.querySelectorAll("[data-pref]").forEach((c) => (c.onchange = () => setPref(c.dataset.pref, c.checked)));
    panel.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => {
      const x = list[+b.dataset.i];
      closePanel();
      if (window.App && window.App.openAdmin) window.App.openAdmin(...GOTO[x.kind]);
    }));
  }

  async function notify(added, total) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const body = Object.entries(counts).filter(([k, v]) => v && isOn(k)).map(([k, v]) => `${KINDS[k]} ${v}`).join(" · ");
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
        const pend = (k, o) => Object.values(o || {}).filter((r) => r.status === "pending").map((r) => summarize(k, r));
        items = { lab: pend("lab", s.requests), purchase: pend("purchase", s.purchases), pw: pend("pw", d.pw), app: pend("app", d.apps) };
        counts = Object.fromEntries(Object.entries(items).map(([k, v]) => [k, v.length]));
        show();
      };
      timer = setInterval(tick, 5000); tick();
      return;
    }
    const db = firebase.firestore();
    const cols = { lab: "labRequests", purchase: "purchaseRequests", pw: "pwRequests", app: "appRequests" };
    let ready = 0;
    for (const [k, col] of Object.entries(cols)) {
      unsubs.push(db.collection(col).where("status", "==", "pending").onSnapshot((snap) => {
        items[k] = snap.docs.map((x) => summarize(k, { id: x.id, ...x.data() }));
        counts[k] = snap.size;
        if (ready < 4) { ready++; if (ready < 4) return; } // 처음엔 네 가지를 다 받은 뒤 한 번에 표시 (알림 안 띄움)
        show();
      }, () => {}));
    }
  }
  function stop() {
    unsubs.forEach((u) => u()); unsubs = [];
    if (timer) clearInterval(timer); timer = null;
    counts = {}; items = {}; lastTotal = null;
    if (panel) panel.hidden = true;
    if (bell) drawBell();
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
    const total = myTotal();
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
