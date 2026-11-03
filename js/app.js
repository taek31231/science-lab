// ===== 화면(페이지) =====
// 주소 뒤 #/경로 로 페이지를 바꾸는 단일 페이지 사이트입니다. (GitHub Pages에서 그대로 동작)
(function () {
  const S = window.SITE, Store = window.Store, Forms = window.Forms;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const view = $("#view");
  let isAdmin = false;
  let adminTab = "requests";

  const REQ_STATUS = { pending: "검토 중", approved: "승인", rejected: "반려" };
  const fmtDate = (iso) => {
    const d = new Date(iso); if (isNaN(d)) return iso;
    return `${d.getMonth() + 1}/${d.getDate()}(${"일월화수목금토"[d.getDay()]}) ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const today = () => { const t = new Date(); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 10); };
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} }
  };
  const LAST_TEAM = "sci-last-team", DRAFT_LAB = "sci-draft-lab", DRAFT_PUR = "sci-draft-purchase";
  const teamInput = (val) => `<label class="inline">신청팀(동아리·팀명)<input id="team" value="${esc(val || "")}" placeholder="동아리 또는 팀 이름"></label>`;
  const itemsTotal = (p) => Forms.filledItems(p).reduce((a, it) => a + (+it.qty || 0) * (+it.price || 0), 0);
  const userList = (r) => (r.users || []).filter((u) => u && (u.sid || u.name));
  async function busy(btn, fn) {
    const t = btn.textContent; btn.disabled = true; btn.textContent = "처리 중…";
    try { await fn(); } catch (e) { console.error(e); alert("문제가 발생했습니다: " + e.message); }
    finally { btn.disabled = false; btn.textContent = t; }
  }

  // ---------- 라우터 ----------
  const routes = { "/": home, "/calendar": calendarView, "/apply": applyView, "/purchase": purchaseView,
    "/status": statusView, "/hours": hoursView, "/admin": adminView };

  async function render() {
    const [path, qs] = (location.hash.slice(1) || "/").split("?");
    document.querySelectorAll(".topbar nav a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + path));
    document.body.classList.remove("nav-open");
    view.innerHTML = '<p class="muted">불러오는 중…</p>';
    try { await (routes[path] || home)(new URLSearchParams(qs || "")); }
    catch (e) { console.error(e); view.innerHTML = `<div class="card error">문제가 발생했습니다: ${esc(e.message)}</div>`; }
  }

  // ---------- 홈 ----------
  async function home() {
    const events = await Store.listEvents();
    const now = Date.now(), in3w = now + 21 * 864e5;
    const upcoming = events
      .filter((e) => e.type !== "lab" && new Date(e.end || e.start).getTime() >= now && new Date(e.start).getTime() <= in3w)
      .sort((a, b) => a.start.localeCompare(b.start));
    view.innerHTML = `
      <h1>${esc(S.schoolName)} 과학실 안내</h1>
      <p class="lead">실험실 사용 신청, 과학행사 일정, 과학·수학 이수시간을 한 곳에서 확인하세요.</p>
      <div class="card">
        <h2>📢 다가오는 과학행사 · 천체관측</h2>
        ${upcoming.length ? upcoming.map((e) => `
          <div class="notice">
            <span class="dot" style="background:${S.eventTypes[e.type]?.color}"></span>
            <div>
              <b>${esc(e.title)}</b> <span class="badge ${e.status}">${esc(S.eventStatus[e.status] || "")}</span><br>
              <span class="muted">${fmtDate(e.start)}${e.note ? " · " + esc(e.note) : ""}</span>
            </div>
          </div>`).join("") : '<p class="muted">3주 이내 예정된 행사가 없습니다.</p>'}
      </div>
      <div class="grid">
        ${tile("#/calendar", "📅", "일정 캘린더", "실험실 예약 현황과 행사 일정")}
        ${tile("#/apply", "🧪", "실험실 사용 신청", "신청서·시약 조사서·계획서 작성, PDF 저장")}
        ${tile("#/purchase", "🛒", "물품 구입 신청", "신청서 작성 후 PDF·엑셀로 저장")}
        ${tile("#/status", "✅", "신청 결과 조회", "팀명으로 승인/반려 확인")}
        ${tile("#/hours", "⏱", "이수시간 조회", `학번으로 ${S.targetHours}시간 달성 현황 확인`)}
      </div>`;
  }
  const tile = (href, ico, t, d) => `<a class="card tile" href="${href}"><span class="ico">${ico}</span><b>${t}</b><span class="muted">${d}</span></a>`;

  // ---------- 캘린더 ----------
  async function calendarView() {
    const events = await Store.listEvents();
    view.innerHTML = `
      <h1>일정 캘린더</h1>
      <p class="lead">승인된 실험실 사용 일정과 천체관측·과학행사가 표시됩니다. 일정을 누르면 상세 내용이 나옵니다.</p>
      <div class="legend">${Object.values(S.eventTypes).map((t) => `<span style="--c:${t.color}">${t.label}</span>`).join("")}
        <span style="--c:#9ca3af">취소된 일정</span></div>
      <div id="cal"></div>
      <div id="evDetail"></div>`;
    const cal = new FullCalendar.Calendar($("#cal"), {
      locale: "ko",
      initialView: window.innerWidth < 700 ? "listMonth" : "dayGridMonth",
      headerToolbar: { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,listMonth" },
      height: "auto",
      dayMaxEvents: 3,
      events: events.map((e) => ({
        id: e.id, title: e.title, start: e.start, end: e.end,
        color: e.status === "cancelled" ? "#9ca3af" : S.eventTypes[e.type]?.color,
        classNames: [e.status], extendedProps: e
      })),
      eventClick(info) {
        const e = info.event.extendedProps;
        $("#evDetail").innerHTML = `
          <div class="card" style="margin-top:16px">
            <h2>${esc(e.title)}</h2>
            <p><span class="badge ${e.status}">${esc(S.eventStatus[e.status] || "")}</span>
              <span class="muted">${esc(S.eventTypes[e.type]?.label)}</span></p>
            <p>${fmtDate(e.start)} ~ ${e.end ? fmtDate(e.end).split(" ").pop() : ""}</p>
            ${e.note ? `<p>${esc(e.note)}</p>` : ""}
          </div>`;
        $("#evDetail").scrollIntoView({ behavior: "smooth" });
      }
    });
    cal.render();
  }

  // ---------- 실험실 사용 신청 (학교 A4 양식 3종) ----------
  async function applyView() {
    const events = await Store.listEvents();
    let data = ls.get(DRAFT_LAB) || { reagents: [{}], team: ls.get(LAST_TEAM) || "" };
    view.innerHTML = `
      <h1>실험실 사용 신청</h1>
      <p class="lead">학교 양식(신청서 · 시약·시액 조사서 · 실험 계획서)과 같은 모양입니다. 파란 칸을 채우고 <b>온라인 제출</b>하세요.
        <b>모든 서류는 실험실 사용 7일 전까지</b> 제출해야 합니다.</p>
      <div class="toolbar">${teamInput(data.team)}<span class="muted small">신청 결과는 이 팀명으로 조회합니다.</span></div>
      <div class="toolbar">
        <button class="btn ghost" id="addReagent">＋ 시약·시액 조사서 추가</button>
        <button class="btn ghost" id="pdfBtn">PDF로 저장</button>
        <button class="btn ghost" id="clearBtn">새로 작성</button>
        <button class="btn" id="submitBtn">온라인 제출</button>
      </div>
      <p id="conflict" class="warn"></p>
      <p class="muted small">작성 중인 내용은 이 기기에 자동 임시저장됩니다. 사용하는 시약이 여러 개면 조사서를 추가하세요.</p>
      <div class="sheet-scroll" id="sheets"></div>`;
    const box = $("#sheets");
    const draw = () => { box.innerHTML = Forms.labSheets(data); };
    const read = () => ({ ...Forms.readForm(box), team: $("#team").value.trim() });
    const update = () => {
      data = { ...Forms.syncMirrors(box).data, team: $("#team").value.trim() };
      ls.set(DRAFT_LAB, data);
      const hit = data.date && data.start && data.end && data.lab && events.find((x) => x.type === "lab" && x.lab === data.lab && x.status !== "cancelled"
        && x.start < `${data.date}T${data.end}` && (x.end || x.start) > `${data.date}T${data.start}`);
      $("#conflict").textContent = hit ? `⚠ 같은 시간에 ${data.lab} 승인된 일정이 있습니다 (${hit.title}). 시간을 조정해 주세요.` : "";
    };
    draw(); update();
    box.addEventListener("input", update);
    box.addEventListener("change", update);
    $("#team").addEventListener("input", update);
    box.addEventListener("click", (e) => {
      const i = e.target.dataset.rmReagent; if (i == null) return;
      if (!confirm("이 시약·시액 조사서를 삭제할까요?")) return;
      data = read();
      data.reagents.splice(+i, 1);
      if (!data.reagents.length) data.reagents = [{}];
      draw(); update();
    });
    $("#addReagent").onclick = () => {
      data = read();
      data.reagents = [...(data.reagents || []), {}];
      draw(); update();
      box.querySelectorAll(".a4")[data.reagents.length].scrollIntoView({ behavior: "smooth" });
    };
    $("#clearBtn").onclick = () => {
      if (!confirm("작성 중인 내용을 모두 지울까요?")) return;
      data = { reagents: [{}] }; ls.del(DRAFT_LAB); $("#team").value = ""; draw(); update();
    };
    $("#pdfBtn").onclick = (e) => busy(e.target, () =>
      Forms.sheetsToPDF([...box.querySelectorAll(".a4")], `실험실사용신청서_${data.date || ""}_${data.users?.[0]?.name || ""}.pdf`));
    $("#submitBtn").onclick = (e) => {
      const d = read();
      const u0 = d.users?.[0] || {};
      const miss = [];
      if (!d.team) miss.push("신청팀(동아리·팀명)");
      if (!d.date) miss.push("사용 날짜");
      if (!d.start || !d.end) miss.push("사용 시각");
      if (!d.lab) miss.push("실험 장소");
      if (!d.purpose) miss.push("사용 목적");
      if (!u0.sid || !u0.name) miss.push("사용자 1번 학번·이름");
      if (!d.teacher) miss.push("지도교사");
      if (!d.agree) miss.push("준수사항 서약 체크 (신청서 맨 아래)");
      if (miss.length) return alert("다음 항목을 채워 주세요:\n- " + miss.join("\n- "));
      const badSid = (d.users || []).find((u) => u.sid && !window.parseSid(u.sid));
      if (badSid) return alert(`학번 '${badSid.sid}'이(가) 올바르지 않습니다. 5자리로 입력하세요 (예: 20315).`);
      if (d.end <= d.start) return alert("종료 시각이 시작 시각보다 늦어야 합니다.");
      const days = Math.round((new Date(d.date) - new Date(today())) / 864e5);
      if (days < 7 && !confirm(`사용일까지 ${days}일 남았습니다. 서류는 7일 전까지 제출해야 합니다.\n그래도 제출할까요?`)) return;
      d.users = (d.users || []).map((u) => (u.sid || u.name ? u : {}));
      d.materials = (d.materials || []).filter((m) => m && (m.name || m.spec || m.qty));
      d.reagents = (d.reagents || []).filter((r) => r && Object.values(r).some(Boolean));
      d.applyDate = today();
      busy(e.target, async () => {
        await Store.submitRequest(d);
        ls.set(LAST_TEAM, d.team);
        ls.del(DRAFT_LAB);
        view.innerHTML = receipt(d.team, "실험실 사용 신청");
      });
    };
  }

  const receipt = (team, what) => `
    <div class="card">
      <h2>✅ ${what}이 접수되었습니다</h2>
      <p>신청팀: <b>${esc(team)}</b></p>
      <p class="muted">'신청 결과 조회'에서 팀명으로 승인/반려 여부를 확인할 수 있습니다.</p>
      <a class="btn" href="#/status?team=${encodeURIComponent(team)}">결과 조회하기</a>
    </div>`;

  // ---------- 물품 구입 신청 (학교 A4 양식) ----------
  async function purchaseView() {
    let data = ls.get(DRAFT_PUR) || { team: ls.get(LAST_TEAM) || "" };
    view.innerHTML = `
      <h1>물품 구입 신청</h1>
      <p class="lead">심화프로젝트 집중탐구 및 동아리 지원 물품 구입 신청서입니다. 예상금액은 수량 × 예상단가로 자동 계산됩니다.</p>
      <div class="toolbar">
        ${teamInput(data.team)}
        <span class="total">합계 <b id="total">0</b>원</span>
      </div>
      <div class="toolbar">
        <button class="btn ghost" id="pdfBtn">PDF로 저장</button>
        <button class="btn ghost" id="xlsBtn">엑셀로 저장</button>
        <button class="btn ghost" id="clearBtn">새로 작성</button>
        <button class="btn" id="submitBtn">온라인 제출</button>
      </div>
      <p class="muted small">작성 중인 내용은 이 기기에 자동 임시저장됩니다. 배송비는 별도 줄에 적고, 사이트 칸을 비우면 위 줄과 같은 구입처로 처리됩니다.</p>
      <div class="sheet-scroll" id="sheets">${Forms.purchaseSheet(data)}</div>`;
    const box = $("#sheets");
    const update = () => {
      const r = Forms.syncMirrors(box);
      data = { ...r.data, team: $("#team").value.trim() };
      $("#total").textContent = Forms.won(r.total) || "0";
      ls.set(DRAFT_PUR, data);
    };
    update();
    box.addEventListener("input", update);
    $("#team").addEventListener("input", update);
    $("#clearBtn").onclick = () => {
      if (!confirm("작성 중인 내용을 모두 지울까요?")) return;
      data = {}; ls.del(DRAFT_PUR); $("#team").value = ""; box.innerHTML = Forms.purchaseSheet(data); update();
    };
    $("#pdfBtn").onclick = (e) => busy(e.target, () =>
      Forms.sheetsToPDF([...box.querySelectorAll(".a4")], `물품구입신청서_${data.team || data.name || ""}.pdf`));
    $("#xlsBtn").onclick = (e) => {
      if (!Forms.filledItems(data).length) return alert("품목을 한 줄 이상 입력하세요.");
      busy(e.target, () => Forms.purchasesToXlsx([data], `물품신청내역_${data.team || data.name || ""}.xlsx`));
    };
    $("#submitBtn").onclick = (e) => {
      update();
      const miss = [];
      if (!data.team) miss.push("신청팀");
      if (!data.purpose) miss.push("실험 목적 및 내용");
      if (!data.sid || !data.name) miss.push("신청자 학번 / 이름");
      if (!data.teacher) miss.push("지도교사");
      if (!Forms.filledItems(data).length) miss.push("구입 품목 (한 줄 이상)");
      if (miss.length) return alert("다음 항목을 채워 주세요:\n- " + miss.join("\n- "));
      if (!window.parseSid(data.sid)) return alert("학번은 5자리로 입력하세요 (예: 20315).");
      const p = { ...data, items: Forms.filledItems(data) };
      busy(e.target, async () => {
        await Store.submitPurchase(p);
        ls.set(LAST_TEAM, p.team);
        ls.del(DRAFT_PUR);
        view.innerHTML = receipt(p.team, "물품 구입 신청");
      });
    };
  }

  // ---------- 신청 결과 조회 ----------
  async function statusView(q) {
    const team0 = q.get("team") || ls.get(LAST_TEAM) || "";
    view.innerHTML = `
      <h1>신청 결과 조회</h1>
      <p class="lead">신청할 때 적은 팀명(동아리명)으로 실험실 사용·물품 구입 신청의 승인/반려 여부를 확인합니다. 띄어쓰기는 무시됩니다.</p>
      <form class="card actions" id="stForm">
        <input name="team" placeholder="팀명 또는 동아리명" value="${esc(team0)}" style="flex:1;min-width:200px" required>
        <button class="btn">조회</button>
      </form>
      <div id="stResult"></div>`;
    const show = async (team) => {
      team = team.trim(); if (!team) return;
      const list = await Store.listStatusByTeam(team);
      $("#stResult").innerHTML = list.length ? `
        <div class="card"><h2>'${esc(team)}' 신청 내역 (${list.length}건)</h2>
          ${list.map((r) => `
            <div class="notice"><div style="flex:1">
              <b>${r.kind === "lab" ? `🧪 실험실 사용 · ${esc(r.lab)}` : "🛒 물품 구입"}</b>
              <span class="badge ${r.status}">${REQ_STATUS[r.status]}</span><br>
              <span class="muted">${r.kind === "lab" ? `${esc(r.date)} ${esc(r.start)}~${esc(r.end)}` : `품목 ${r.itemCount}개 · 합계 ${Forms.won(r.total) || 0}원${r.useDate ? ` · 사용예정일 ${esc(r.useDate)}` : ""}`}
                · 신청일 ${new Date(r.createdAt).toLocaleDateString("ko-KR")}</span>
              ${r.adminNote ? `<div><b>실무사 메모:</b> ${esc(r.adminNote)}</div>` : ""}
            </div></div>`).join("")}
        </div>` : `<div class="card error">'${esc(team)}' 팀명으로 접수된 신청이 없습니다. 신청할 때 적은 팀명을 확인해 주세요.</div>`;
    };
    $("#stForm").addEventListener("submit", (e) => { e.preventDefault(); show(new FormData(e.target).get("team")); });
    if (team0) show(team0);
  }

  // ---------- 이수시간 조회 ----------
  async function hoursView(q) {
    view.innerHTML = `
      <h1>과학·수학 이수시간 조회</h1>
      <p class="lead">이름 없이 학번(학년·반·번호 5자리)으로만 조회합니다. 연간 목표: ${S.targetHours}시간</p>
      <form class="card actions" id="hForm">
        <input name="sid" placeholder="학번 5자리 (예: 20315)" pattern="[1-3][0-9]{4}" required value="${esc(q.get("sid") || "")}" style="flex:1;min-width:200px">
        <button class="btn">조회</button>
      </form>
      <div id="hResult"></div>`;
    const show = async (sid) => {
      const p = window.parseSid(sid);
      if (!p) return ($("#hResult").innerHTML = '<div class="card error">학번 5자리를 정확히 입력하세요.</div>');
      const h = await Store.getHours(p.sid);
      const total = h ? h.total : 0;
      const pct = Math.min(100, Math.round((total / S.targetHours) * 100));
      const recs = h ? [...h.records].sort((a, b) => b.date.localeCompare(a.date)) : [];
      $("#hResult").innerHTML = `
        <div class="card">
          <p class="muted">${p.grade}학년 ${p.cls}반 ${p.num}번</p>
          <div class="big">${total}<span class="muted" style="font-size:18px"> / ${S.targetHours}시간</span></div>
          <div class="progress" style="margin:10px 0"><div style="width:${pct}%"></div></div>
          <p>${total >= S.targetHours ? "🎉 목표 시간을 달성했습니다!" : `목표까지 <b>${+(S.targetHours - total).toFixed(1)}시간</b> 남았습니다.`}</p>
        </div>
        <div class="card"><h2>인정 내역</h2>
          ${recs.length ? `<div class="table-wrap"><table><tr><th>날짜</th><th>활동</th><th>시간</th></tr>
            ${recs.map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(r.activity)}</td><td>${r.hours}</td></tr>`).join("")}</table></div>`
            : '<p class="muted">아직 등록된 내역이 없습니다.</p>'}
        </div>`;
    };
    $("#hForm").addEventListener("submit", (e) => { e.preventDefault(); show(new FormData(e.target).get("sid")); });
    if (q.get("sid")) show(q.get("sid"));
  }

  // ---------- 관리자 ----------
  async function adminView() {
    if (!isAdmin) {
      view.innerHTML = `
        <h1>관리자 로그인</h1>
        <form class="card" id="loginForm" style="max-width:420px">
          ${Store.isDemo ? '<p class="muted">데모 모드에서는 아무 값이나 입력해도 로그인됩니다.</p>' : ""}
          <div class="row"><label>이메일<input type="email" name="email" ${Store.isDemo ? "" : "required"}></label></div>
          <div class="row"><label>비밀번호<input type="password" name="pw" ${Store.isDemo ? "" : "required"}></label></div>
          <button class="btn">로그인</button>
        </form>`;
      $("#loginForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        try { await Store.login(d.email, d.pw); } catch (err) { alert("로그인 실패: " + err.message); }
      });
      return;
    }
    const tabs = { requests: "실험실 신청 승인", purchases: "물품 구입 신청", events: "행사·천체관측 일정", hours: "이수시간 입력", hoursList: "이수시간 현황" };
    view.innerHTML = `
      <div class="actions" style="justify-content:space-between;margin-bottom:12px">
        <h1>관리자</h1><button class="btn ghost sm" id="logout">로그아웃</button></div>
      <div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button data-t="${k}" class="${k === adminTab ? "on" : ""}">${v}</button>`).join("")}</div>
      <div id="adminBody"></div>`;
    $("#logout").onclick = () => Store.logout();
    view.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { adminTab = b.dataset.t; adminView(); }));
    await ({ requests: adminRequests, purchases: adminPurchases, events: adminEvents, hours: adminHours, hoursList: adminHoursList })[adminTab]();
  }

  async function adminRequests() {
    const [reqs, events] = await Promise.all([Store.listRequests(), Store.listEvents()]);
    const body = $("#adminBody");
    const byId = Object.fromEntries(reqs.map((r) => [r.id, r]));
    const pending = reqs.filter((r) => r.status === "pending");
    const done = reqs.filter((r) => r.status !== "pending");
    const conflict = (r) => events.find((x) => x.type === "lab" && x.lab === r.lab && x.requestId !== r.id && x.status !== "cancelled"
      && x.start < `${r.date}T${r.end}` && (x.end || x.start) > `${r.date}T${r.start}`);
    const card = (r) => {
      const mats = (r.materials || []).filter((m) => m && m.name).map((m) => `${m.name}${m.spec ? `(${m.spec})` : ""}${m.qty ? ` ×${m.qty}` : ""}`);
      const reag = (r.reagents || []).map((x) => x && x.name).filter(Boolean);
      const c = conflict(r);
      return `
      <div class="card">
        <div class="actions" style="justify-content:space-between">
          <b>${esc(r.date)} ${esc(r.start)}~${esc(r.end)} · ${esc(r.lab)}</b>
          <span class="badge ${r.status}">${REQ_STATUS[r.status]}</span>
        </div>
        <p style="margin:6px 0"><b>[${esc(r.team || "팀명 없음")}]</b> ${esc(r.purpose)}</p>
        <p class="muted" style="margin:0">사용자: ${userList(r).map((u) => `${esc(u.sid)} ${esc(u.name)}`).join(", ")} · 지도교사 ${esc(r.teacher)}</p>
        <p class="muted" style="margin:0">재료·기자재: ${esc(mats.join(", ") || "없음")}</p>
        <p class="muted" style="margin:0 0 6px">시약: ${esc(reag.join(", ") || "없음")}${r.plan?.title ? ` · 실험 제목: ${esc(r.plan.title)}` : ""}</p>
        ${c ? `<p class="warn">⚠ 겹치는 승인 일정: ${esc(c.title)} ${fmtDate(c.start)}</p>` : ""}
        <div class="actions">
          <input placeholder="학생에게 보낼 메모 (반려 사유 등)" data-note="${esc(r.id)}" value="${esc(r.adminNote)}" style="flex:1;min-width:200px">
          <button class="btn ok sm" data-act="approved" data-id="${esc(r.id)}">승인</button>
          <button class="btn bad sm" data-act="rejected" data-id="${esc(r.id)}">반려</button>
          <button class="btn ghost sm" data-pdf="${esc(r.id)}">신청서 PDF</button>
        </div>
      </div>`;
    };
    body.innerHTML = `
      <h2>대기 중 (${pending.length})</h2>${pending.map(card).join("") || '<p class="muted">대기 중인 신청이 없습니다.</p>'}
      <details><summary class="muted" style="cursor:pointer;margin:16px 0">처리 완료 ${done.length}건 보기</summary>${done.map(card).join("")}</details>`;
    body.querySelectorAll("[data-act]").forEach((b) => (b.onclick = async () => {
      const note = body.querySelector(`[data-note="${CSS.escape(b.dataset.id)}"]`).value;
      if (b.dataset.act === "rejected" && !note && !confirm("반려 사유 없이 반려할까요?")) return;
      await Store.decideRequest(b.dataset.id, b.dataset.act, note);
      adminRequests();
    }));
    body.querySelectorAll("[data-pdf]").forEach((b) => (b.onclick = () => {
      const r = byId[b.dataset.pdf];
      busy(b, () => Forms.dataToPDF("lab", r, `실험실사용신청서_${r.date}_${userList(r)[0]?.name || ""}.pdf`));
    }));
  }

  async function adminPurchases() {
    const list = await Store.listPurchases();
    const byId = Object.fromEntries(list.map((p) => [p.id, p]));
    const body = $("#adminBody");
    body.innerHTML = `
      <div class="card">
        <div class="actions" style="justify-content:space-between;margin-bottom:10px">
          <h2 style="margin:0">물품 구입 신청 (${list.length})</h2>
          <div class="actions">
            <label class="inline-check"><input type="checkbox" id="pAll"> 전체 선택</label>
            <button class="btn sm" id="pXls">선택 항목 엑셀로 내보내기</button>
          </div>
        </div>
        <p class="muted small">여러 팀을 선택하면 학교 '물품 신청내역' 엑셀과 같은 형식(팀별로 신청팀 칸 병합)으로 한 파일에 합쳐집니다.</p>
        <div class="table-wrap"><table>
          <tr><th></th><th>접수일</th><th>신청팀</th><th>신청자</th><th>품목</th><th>합계</th><th>상태</th><th></th></tr>
          ${list.map((p) => `
            <tr>
              <td><input type="checkbox" data-sel="${esc(p.id)}"></td>
              <td>${new Date(p.createdAt).toLocaleDateString("ko-KR")}</td>
              <td><b>${esc(p.team)}</b></td>
              <td>${esc(p.sid)} ${esc(p.name)}<br><span class="muted small">지도교사 ${esc(p.teacher)}</span></td>
              <td>${Forms.filledItems(p).length}개</td>
              <td>${Forms.won(itemsTotal(p))}원</td>
              <td><span class="badge ${p.status}">${REQ_STATUS[p.status]}</span></td>
              <td class="actions"><button class="btn ghost sm" data-detail="${esc(p.id)}">상세</button></td>
            </tr>
            <tr class="detail" id="d-${esc(p.id)}" hidden><td colspan="8">
              <p style="margin:0 0 6px"><b>실험 목적 및 내용:</b> ${esc(p.purpose)} · 사용예정일 ${esc(p.useDate || "-")}</p>
              <table class="mini"><tr><th>내용</th><th>규격</th><th>수량</th><th>예상단가</th><th>예상금액</th><th>사이트</th><th>상품코드</th></tr>
                ${Forms.filledItems(p).map((it) => `<tr><td>${esc(it.name)}</td><td>${esc(it.spec)}</td><td>${esc(it.qty)}</td>
                  <td>${Forms.won(it.price)}</td><td>${Forms.won((+it.qty || 0) * (+it.price || 0))}</td><td>${esc(it.site)}</td><td>${esc(it.code)}</td></tr>`).join("")}
              </table>
              <div class="actions" style="margin-top:8px">
                <input placeholder="학생에게 보낼 메모" data-note="${esc(p.id)}" value="${esc(p.adminNote)}" style="flex:1;min-width:200px">
                <button class="btn ok sm" data-act="approved" data-id="${esc(p.id)}">승인</button>
                <button class="btn bad sm" data-act="rejected" data-id="${esc(p.id)}">반려</button>
                <button class="btn ghost sm" data-pdf="${esc(p.id)}">신청서 PDF</button>
                <button class="btn ghost sm" data-xls="${esc(p.id)}">이 팀만 엑셀</button>
              </div>
            </td></tr>`).join("") || '<tr><td colspan="8" class="muted">신청이 없습니다.</td></tr>'}
        </table></div>
      </div>`;
    const sels = () => [...body.querySelectorAll("[data-sel]:checked")].map((c) => byId[c.dataset.sel]);
    $("#pAll").onchange = (e) => body.querySelectorAll("[data-sel]").forEach((c) => (c.checked = e.target.checked));
    $("#pXls").onclick = (e) => {
      const s = sels(); if (!s.length) return alert("내보낼 신청을 선택하세요.");
      busy(e.target, () => Forms.purchasesToXlsx(s, `물품신청내역_${today()}.xlsx`));
    };
    body.querySelectorAll("[data-detail]").forEach((b) => (b.onclick = () => { const r = $(`#d-${CSS.escape(b.dataset.detail)}`); r.hidden = !r.hidden; }));
    body.querySelectorAll("[data-act]").forEach((b) => (b.onclick = async () => {
      const note = body.querySelector(`[data-note="${CSS.escape(b.dataset.id)}"]`).value;
      if (b.dataset.act === "rejected" && !note && !confirm("반려 사유 없이 반려할까요?")) return;
      await Store.decidePurchase(b.dataset.id, b.dataset.act, note);
      adminPurchases();
    }));
    body.querySelectorAll("[data-pdf]").forEach((b) => (b.onclick = () => {
      const p = byId[b.dataset.pdf];
      busy(b, () => Forms.dataToPDF("purchase", p, `물품구입신청서_${p.team || p.name}.pdf`));
    }));
    body.querySelectorAll("[data-xls]").forEach((b) => (b.onclick = () => {
      const p = byId[b.dataset.xls];
      busy(b, () => Forms.purchasesToXlsx([p], `물품신청내역_${p.team || p.name}.xlsx`));
    }));
  }

  async function adminEvents() {
    const events = (await Store.listEvents()).filter((e) => e.type !== "lab").sort((a, b) => b.start.localeCompare(a.start));
    const body = $("#adminBody");
    body.innerHTML = `
      <form class="card" id="evForm">
        <h2 id="evFormTitle">새 일정 등록</h2>
        <input type="hidden" name="id">
        <div class="row">
          <label>종류<select name="type"><option value="astro">천체관측</option><option value="event">과학행사</option></select></label>
          <label>제목<input name="title" required placeholder="예) 11월 천체관측"></label>
          <label>상태<select name="status">${Object.entries(S.eventStatus).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
        </div>
        <div class="row">
          <label>날짜<input type="date" name="date" required></label>
          <label>시작<input type="time" name="start" required value="19:30"></label>
          <label>종료<input type="time" name="end" required value="21:30"></label>
        </div>
        <div class="row"><label>안내 문구<input name="note" placeholder="예) 우천 시 취소, 전날 17시 확정 공지"></label></div>
        <div class="actions"><button class="btn">저장</button><button type="button" class="btn ghost" id="evReset">새로 작성</button></div>
      </form>
      <div class="card"><h2>등록된 일정</h2><div class="table-wrap"><table>
        <tr><th>일시</th><th>제목</th><th>상태 (바로 변경)</th><th></th></tr>
        ${events.map((e) => `<tr>
          <td>${fmtDate(e.start)}</td><td>${esc(e.title)}</td>
          <td><select data-status="${esc(e.id)}">${Object.entries(S.eventStatus).map(([k, v]) => `<option value="${k}" ${k === e.status ? "selected" : ""}>${v}</option>`).join("")}</select></td>
          <td class="actions"><button class="btn ghost sm" data-edit="${esc(e.id)}">수정</button><button class="btn bad sm" data-del="${esc(e.id)}">삭제</button></td>
        </tr>`).join("")}
      </table></div></div>`;
    const f = $("#evForm");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      await Store.saveEvent({ id: d.id || undefined, type: d.type, title: d.title, status: d.status, note: d.note,
        start: `${d.date}T${d.start}`, end: `${d.date}T${d.end}` });
      adminEvents();
    });
    $("#evReset").onclick = () => adminEvents();
    const byId = Object.fromEntries(events.map((e) => [e.id, e]));
    body.querySelectorAll("[data-status]").forEach((s) => (s.onchange = async () => {
      await Store.saveEvent({ ...byId[s.dataset.status], status: s.value }); adminEvents();
    }));
    body.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
      if (confirm("이 일정을 삭제할까요?")) { await Store.deleteEvent(b.dataset.del); adminEvents(); }
    }));
    body.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => {
      const e = byId[b.dataset.edit];
      Object.entries({ id: e.id, type: e.type, title: e.title, status: e.status, note: e.note || "",
        date: e.start.slice(0, 10), start: e.start.slice(11, 16), end: (e.end || "").slice(11, 16) })
        .forEach(([k, v]) => (f.elements[k].value = v));
      $("#evFormTitle").textContent = "일정 수정";
      f.scrollIntoView({ behavior: "smooth" });
    }));
  }

  async function adminHours() {
    const body = $("#adminBody");
    body.innerHTML = `
      <form class="card" id="hrForm">
        <h2>이수시간 일괄 입력</h2>
        <p class="muted">행사 참가 학생들의 학번을 한 번에 붙여넣으면 모두에게 같은 시간이 부여됩니다. (엑셀에서 학번 열을 복사해 붙여넣기 가능)</p>
        <div class="row">
          <label>활동명<input name="activity" required placeholder="예) 11월 천체관측"></label>
          <label>날짜<input type="date" name="date" required value="${today()}"></label>
          <label>인정 시간<input type="number" name="hours" step="0.5" min="0.5" value="2" required></label>
        </div>
        <div class="row"><label>학번 목록 (줄바꿈·쉼표·공백으로 구분)<textarea name="sids" required placeholder="20315&#10;20316&#10;10101"></textarea></label></div>
        <p id="hrPreview" class="muted"></p>
        <button class="btn">입력하기</button>
      </form>`;
    const f = $("#hrForm");
    const parse = () => {
      const raw = (f.elements.sids.value.match(/\d+/g) || []);
      const ok = [...new Set(raw.filter((s) => window.parseSid(s)))];
      const bad = raw.filter((s) => !window.parseSid(s));
      $("#hrPreview").innerHTML = `유효한 학번 <b>${ok.length}명</b>${bad.length ? ` · <span class="warn">잘못된 값: ${esc(bad.join(", "))}</span>` : ""}`;
      return ok;
    };
    f.elements.sids.addEventListener("input", parse);
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const sids = parse(); if (!sids.length) return;
      const d = Object.fromEntries(new FormData(f));
      if (!confirm(`${sids.length}명에게 '${d.activity}' ${d.hours}시간을 부여할까요?`)) return;
      await Store.addHours(sids, { activity: d.activity, date: d.date, hours: +d.hours });
      alert("입력되었습니다."); f.elements.sids.value = ""; parse();
    });
  }

  async function adminHoursList() {
    const list = await Store.listHours();
    $("#adminBody").innerHTML = `
      <div class="card"><h2>학생별 이수시간 (${list.length}명)</h2>
        <div class="table-wrap"><table><tr><th>학번</th><th>학년/반/번호</th><th>누적</th><th>달성률</th></tr>
        ${list.map((h) => `<tr><td>${esc(h.sid)}</td><td>${h.grade}-${h.cls}-${h.num}</td><td>${h.total}</td>
          <td>${Math.min(100, Math.round((h.total / S.targetHours) * 100))}%</td></tr>`).join("")}
        </table></div></div>`;
  }

  // ---------- 시작 ----------
  $("#brandName").textContent = S.schoolName;
  $("#footerDept").textContent = `${S.schoolName} ${S.deptName}`;
  if (Store.isDemo) $("#demoBanner").hidden = false;
  window.addEventListener("hashchange", render);
  let first = true;
  Store.onAuth((a) => { isAdmin = a; if (first) { first = false; render(); } else if (location.hash.startsWith("#/admin")) render(); });
})();
