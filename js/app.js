// ===== 화면(페이지) =====
// 주소 뒤 #/경로 로 페이지를 바꾸는 단일 페이지 사이트입니다. (GitHub Pages에서 그대로 동작)
(function () {
  const S = window.SITE, Store = window.Store, Forms = window.Forms;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const view = $("#view");
  // 로그인한 관리자의 권한 (예: ["lab"]). 마스터는 모든 탭
  let roles = null;
  const can = (r) => !!roles && (roles.includes("master") || roles.includes(r));
  let adminTab = "";
  const curYear = () => window.schoolYear();
  let adminYear = curYear();
  const addDays = (ds, n) => { const d = new Date(ds + "T00:00"); d.setDate(d.getDate() + n); return window.localDate(d); };

  const REQ_STATUS = { pending: "검토 중", approved: "승인", rejected: "반려" };
  // 시각 없는 날짜(YYYY-MM-DD)는 종일 일정
  const allDay = (iso) => !!iso && !iso.includes("T");
  const fmtDate = (iso) => {
    const d = new Date(allDay(iso) ? iso + "T00:00" : iso); if (isNaN(d)) return iso;
    const day = `${d.getMonth() + 1}/${d.getDate()}(${"일월화수목금토"[d.getDay()]})`;
    return allDay(iso) ? `${day} 종일` : `${day} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  // 일정이 끝나는 시각 (종일 일정은 그날 23:59)
  const endTime = (e) => { const x = e.end || e.start; return new Date(allDay(x) ? x + "T23:59" : x).getTime(); };
  const today = () => window.localDate();
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
    "/status": statusView, "/hours": hoursView, "/admin": adminView, "/dibut": (q) => window.Dibut.studentView(view, q), "/course": () => window.Course.studentView(view) };

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
    const events = await Store.listEvents({ from: today(), to: addDays(today(), 22) });
    const now = Date.now();
    const upcoming = events
      .filter((e) => e.type !== "lab" && endTime(e) >= now)
      .sort((a, b) => a.start.localeCompare(b.start));
    view.innerHTML = `
      <div class="hero"><img src="img/logo.png" alt=""><div><h1>${esc(S.schoolName)} ${esc(S.deptName)}</h1>
      <p class="lead">실험실 사용 신청, 과학행사 일정, 과학·수학 이수시간을 한 곳에서 확인하세요.</p></div></div>
      <div class="card">
        <h2>📢 다가오는 행사 일정</h2>
        ${upcoming.length ? upcoming.map((e) => `
          <div class="notice">
            <span class="dot" style="background:${S.typeOf(e).color}"></span>
            <div>
              <b>${esc(e.title)}</b> <span class="badge ${e.status}">${esc(S.statusOf(e.status))}</span><br>
              <span class="muted">${fmtDate(e.start)}${e.note ? " · " + esc(e.note) : ""}</span>
            </div>
          </div>`).join("") : '<p class="muted">3주 이내 예정된 행사가 없습니다.</p>'}
      </div>
      <div class="grid">
        ${tile("#/calendar", "📅", "일정 캘린더", "실험실 예약 현황과 행사 일정")}
        ${tile("#/apply", "🧪", "실험실 사용 신청", "신청서·시약 조사서·계획서 작성, PDF 저장")}
        ${tile("#/purchase", "🛒", "물품 구입 신청", "신청서 작성 후 PDF·엑셀로 저장")}
        ${tile("#/status", "✅", "신청 결과 조회", "팀명으로 승인 여부·구매 진행 상황 확인")}
        ${tile("#/course", "🎓", "수강신청", "심화실험 캠프·이공계 진로특강 신청")}
        ${tile("#/hours", "⏱", "이수시간 조회", `학번으로 ${S.targetHours}시간 달성 현황 확인`)}
      </div>`;
  }
  const tile = (href, ico, t, d) => `<a class="card tile" href="${href}"><span class="ico">${ico}</span><b>${t}</b><span class="muted">${d}</span></a>`;

  // ---------- 캘린더 ----------
  async function calendarView() {
    view.innerHTML = `
      <h1>일정 캘린더</h1>
      <p class="lead">승인된 실험실 사용 일정과 과학행사 일정이 표시됩니다. 일정을 누르면 상세 내용이 나옵니다.</p>
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
      // 화면에 보이는 기간의 일정만 불러옵니다 (해가 쌓여도 읽기 횟수 일정)
      events(info, ok, fail) {
        Store.listEvents({ from: info.startStr.slice(0, 10), to: info.endStr.slice(0, 10) })
          .then((list) => ok(list.map((e) => ({
            id: e.id, title: e.title, start: e.start, end: allDay(e.start) ? undefined : e.end, allDay: allDay(e.start),
            color: e.status === "cancelled" ? "#9ca3af" : S.typeOf(e).color,
            classNames: [e.status], extendedProps: e
          }))))
          .catch(fail);
      },
      eventClick(info) {
        const e = info.event.extendedProps;
        $("#evDetail").innerHTML = `
          <div class="card" style="margin-top:16px">
            <h2>${esc(e.title)}</h2>
            <p><span class="badge ${e.status}">${esc(S.statusOf(e.status))}</span>
              <span class="muted">${esc(S.typeOf(e).label)}</span></p>
            <p>${fmtDate(e.start)}${!allDay(e.start) && e.end ? " ~ " + fmtDate(e.end).split(" ").pop() : ""}</p>
            ${e.note ? `<p>${esc(e.note)}</p>` : ""}
          </div>`;
        $("#evDetail").scrollIntoView({ behavior: "smooth" });
      }
    });
    cal.render();
  }

  // ---------- MSDS 확인 ----------
  // 안전보건공단 MSDS는 검색어를 주소로 넘길 수 없어서, 물질명을 복사해 두고 사이트를 열어 붙여넣게 함
  const KOSHA = "https://msds.kosha.or.kr/MSDSInfo/";
  const msdsBtns = (name) => `
    <button type="button" class="btn sm" data-msds-open="${esc(name)}" title="물질명을 복사하고 안전보건공단 MSDS를 엽니다. 검색창에 붙여넣기(Ctrl+V)">안전보건공단 MSDS ↗</button>
    <a class="btn ghost sm" href="https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(name)}" target="_blank" rel="noopener noreferrer" title="영문명·CAS 번호로 찾을 때">PubChem ↗</a>`;
  function bindMsds(root) {
    root.querySelectorAll("[data-msds-open]").forEach((b) => (b.onclick = () => {
      const name = b.dataset.msdsOpen;
      if (name) copyText(name).catch(() => {});
      window.open(KOSHA, "_blank", "noopener");
      if (name) { const t = b.textContent; b.textContent = `'${name}' 복사됨 → 검색창에 붙여넣기`; setTimeout(() => (b.textContent = t), 3000); }
    }));
  }
  const MSDS_STEPS = `<p class="muted small" style="margin:6px 0">[안전보건공단 MSDS ↗]를 누르면 물질명이 복사되고 사이트가 열립니다 → 검색창에 붙여넣기 → 'MSDS 요약정보'를 조사서와 대조한 뒤 '확인' 체크.</p>`;
  // 시약 목록 + 하나씩 '확인' 체크. seen: 확인한 물질명 목록. onChange(seen)
  // all: 학교 시약 대장 (대장에 있는 시약은 사이트 안에서 요약 MSDS를 읽으면 확인 처리)
  function msdsPanel(el, names, seen, onChange, all = []) {
    const draw = () => {
      el.innerHTML = names.length ? `
        <div class="msds-list">${names.map((n) => `
          <div class="msds-row ${seen.includes(n) ? "ok" : ""}"><b>🧪 ${esc(n)}</b>${window.Reagents.find(all, n)
            ? `<button type="button" class="btn sm" data-rg="${esc(n)}">요약 MSDS 읽기</button><span class="muted small">학교 시약 대장</span>`
            : msdsBtns(n)}
            <label class="inline-check"><input type="checkbox" data-seen="${esc(n)}" ${seen.includes(n) ? "checked" : ""}> MSDS와 조사서 대조 확인</label></div>`).join("")}
        </div>
        <p class="small ${names.every((n) => seen.includes(n)) ? "ok-t" : "warn"}">${names.every((n) => seen.includes(n)) ? "✅ 확인했습니다." : `확인할 시약 ${names.filter((n) => !seen.includes(n)).length}개 남음 (모두 확인해야 온라인 제출됩니다)`}</p>`
        : '<p class="muted small">시약·시액 조사서에 물질명을 적으면 여기에 나타납니다. 시약을 쓰지 않으면 확인할 것이 없습니다.</p>';
      bindMsds(el);
      el.querySelectorAll("[data-rg]").forEach((b) => (b.onclick = async () => {
        const n = b.dataset.rg;
        if (await window.Reagents.showMsds(window.Reagents.find(all, n), { take: "읽었습니다" })) { seen = [...new Set([...seen, n])]; onChange(seen); draw(); }
      }));
      el.querySelectorAll("[data-seen]").forEach((c) => (c.onchange = () => {
        const n = c.dataset.seen;
        seen = c.checked ? [...new Set([...seen, n])] : seen.filter((x) => x !== n);
        onChange(seen); draw();
      }));
    };
    draw();
    // cur: 바깥에서 바뀐 확인 목록 (검색 칸에서 '읽고 담기'를 한 경우)
    return { update(newNames, cur) { names = newNames; if (cur) seen = cur; seen = seen.filter((n) => names.includes(n)); onChange(seen); draw(); } };
  }
  const reagentNames = (d) => [...new Set((d.reagents || []).map((r) => r && (r.name || "").trim()).filter(Boolean))];
  const MSDS_SEEN = "sci-msds-seen";

  // ---------- 실험실 사용 신청 (학교 A4 양식 3종) ----------
  async function applyView() {
    let events = [], eventsDate = null; // 고른 날짜의 일정만 불러와 겹침 확인
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
      <p class="muted small">작성 중인 내용은 이 기기에 자동 임시저장됩니다. 사용하는 시약이 여러 개면 조사서를 추가하세요.
        이름·지도교사 칸은 한글만, 수량 칸은 한글·숫자만 입력됩니다.</p>
      <div class="card" id="msdsCard">
        <div class="actions" style="justify-content:space-between"><b>🧪 사용할 시약</b><span class="muted small" id="msdsSum"></span></div>
        <p class="muted small" style="margin:4px 0 8px">[MSDS 확인]을 눌러 읽어야 [+ 담기]가 됩니다. 담으면 시약·시액 조사서가 자동으로 채워집니다.</p>
        <div id="rgPick"></div>
        <div id="msdsOther"><p class="small" style="margin:12px 0 0"><b>목록에 없는 시약</b></p>${MSDS_STEPS}<div id="msdsBox"></div></div>
      </div>
      <div class="sheet-scroll" id="sheets"></div>`;
    const box = $("#sheets");
    Forms.bindOnly(box);
    let seen = ls.get(MSDS_SEEN) || [];
    const msdsSum = () => { const n = reagentNames(data); $("#msdsSum").textContent = n.length ? `시약 ${n.length}개 중 ${n.filter((x) => seen.includes(x)).length}개 확인` : "시약 없음"; };
    const K = window.Reagents.keyOf;
    const rg = await window.Reagents.picker($("#rgPick"), {
      isSeen: (n) => seen.includes(n),
      markSeen: (n) => { seen = [...new Set([...seen, n])]; ls.set(MSDS_SEEN, seen); msdsSum(); },
      isTaken: (n) => reagentNames(data).some((x) => K(x) === K(n)),
      onTake: (r) => {
      // 담기: 같은 시약 조사서가 있으면 그 장, 없으면 빈 장, 그것도 없으면 새 장에 요약 MSDS를 채움
      data = read();
      const rs = data.reagents && data.reagents.length ? data.reagents : [{}];
      let i = rs.findIndex((x) => x && K(x.name) === K(r.name));
      if (i < 0) i = rs.findIndex((x) => !x || !Object.values(x).some(Boolean));
      if (i < 0) { rs.push({}); i = rs.length - 1; }
      rs[i] = { ...window.Reagents.toSheet(r) };
      data.reagents = rs;
      seen = [...new Set([...seen, r.name])]; ls.set(MSDS_SEEN, seen);
      draw(); update();
      box.querySelectorAll(".a4")[i + 1]?.scrollIntoView({ behavior: "smooth" });
    } });
    // 목록에 없는 시약만 아래 칸에서 안전보건공단으로 확인 (목록에 있는 시약은 위에서 MSDS 확인)
    const others = (names) => names.filter((n) => !window.Reagents.find(rg.all, n));
    const msds = msdsPanel($("#msdsBox"), others(reagentNames(data)), seen, (v) => {
      // 아래 칸은 목록에 없는 시약만 다루므로, 위에서 확인한 시약 기록은 지우지 않음
      const keep = seen.filter((n) => window.Reagents.find(rg.all, n));
      seen = [...new Set([...keep, ...v])]; ls.set(MSDS_SEEN, seen); msdsSum();
    }, rg.all);
    const showOther = () => { $("#msdsOther").hidden = !others(reagentNames(data)).length; };
    showOther();
    msdsSum();
    let lastNames = reagentNames(data).join("|");
    let lastSeen = seen;
    const draw = () => { box.innerHTML = Forms.labSheets(data); };
    const read = () => ({ ...Forms.readForm(box), team: $("#team").value.trim() });
    const update = () => {
      data = { ...Forms.syncMirrors(box).data, team: $("#team").value.trim() };
      ls.set(DRAFT_LAB, data);
      const names = reagentNames(data);
      if (names.join("|") !== lastNames || seen !== lastSeen) {
        lastNames = names.join("|"); lastSeen = seen;
        msds.update(others(names), seen.filter((n) => !window.Reagents.find(rg.all, n)));
        rg.redraw(); showOther();
      }
      if (data.date && data.date !== eventsDate) {
        eventsDate = data.date;
        Store.listEvents({ from: data.date, to: addDays(data.date, 1) }).then((l) => { events = l; if (eventsDate === data.date) update(); }).catch(() => {});
      }
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
      data = { reagents: [{}] }; ls.del(DRAFT_LAB); ls.del(MSDS_SEEN); $("#team").value = ""; draw(); update();
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
      if (!d.sign?.teacher) miss.push("지도교사 서명 ((인) 칸을 눌러 서명)");
      if (!d.sign?.applicant) miss.push("신청자 서명 (신청서 맨 아래 (자필서명) 칸)");
      if (!d.agree) miss.push("준수사항 서약 체크 (신청서 맨 아래)");
      const unseen = reagentNames(d).filter((n) => !seen.includes(n));
      if (unseen.length) miss.push(`MSDS 확인 (위쪽 '사용할 시약'에서 ${unseen.join(", ")})`);
      if (miss.length) {
        if (unseen.length) $("#msdsCard").scrollIntoView({ behavior: "smooth" });
        return alert("다음 항목을 채워 주세요:\n- " + miss.join("\n- "));
      }
      const badOnly = Forms.onlyProblems(box);
      if (badOnly.length) return alert("입력 형식을 고쳐 주세요 (빨간 칸):\n- " + badOnly.join("\n- "));
      const badSid = (d.users || []).find((u) => u.sid && !window.parseSid(u.sid));
      if (badSid) return alert(`학번 '${badSid.sid}'이(가) 올바르지 않습니다. 5자리로 입력하세요.`);
      if (d.end <= d.start) return alert("종료 시각이 시작 시각보다 늦어야 합니다.");
      const days = Math.round((new Date(d.date) - new Date(today())) / 864e5);
      if (days < 7 && !confirm(`사용일까지 ${days}일 남았습니다. 서류는 7일 전까지 제출해야 합니다.\n그래도 제출할까요?`)) return;
      d.users = (d.users || []).map((u) => (u.sid || u.name ? u : {}));
      d.materials = (d.materials || []).filter((m) => m && (m.name || m.spec || m.qty));
      d.reagents = (d.reagents || []).filter((r) => r && Object.values(r).some(Boolean));
      d.applyDate = today();
      d.year = window.schoolYear(d.date);
      d.msdsOk = true; // 시약이 있으면 위에서 모두 확인해야 여기까지 옴
      busy(e.target, async () => {
        await Store.submitRequest(d);
        ls.set(LAST_TEAM, d.team);
        ls.del(DRAFT_LAB); ls.del(MSDS_SEEN);
        view.innerHTML = receipt(d.team, "실험실 사용 신청");
      });
    };
  }

  const receipt = (team, what) => `
    <div class="card">
      <h2>✅ ${what}이 접수되었습니다</h2>
      <p>신청팀: <b>${esc(team)}</b></p>
      <p class="muted">'신청 결과 조회'에서 팀명으로 처리 상태를 확인할 수 있습니다.</p>
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
      <p class="muted small">작성 중인 내용은 이 기기에 자동 임시저장됩니다. 배송비는 별도 줄에 적고, 사이트 칸을 비우면 위 줄과 같은 구입처로 처리됩니다.
        학번은 숫자만, 이름·지도교사는 한글만 입력됩니다.</p>
      <div class="sheet-scroll" id="sheets">${Forms.purchaseSheet(data)}</div>`;
    const box = $("#sheets");
    Forms.bindOnly(box);
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
      if (!data.sign?.applicant) miss.push("신청자 서명 (서명 칸을 눌러 서명)");
      if (!data.sign?.teacher) miss.push("지도교사 서명 ((인) 칸을 눌러 서명)");
      if (!Forms.filledItems(data).length) miss.push("구입 품목 (한 줄 이상)");
      if (miss.length) return alert("다음 항목을 채워 주세요:\n- " + miss.join("\n- "));
      if (!window.parseSid(data.sid)) return alert("학번은 5자리로 입력하세요.");
      const badOnly = Forms.onlyProblems(box);
      if (badOnly.length) return alert("입력 형식을 고쳐 주세요 (빨간 칸):\n- " + badOnly.join("\n- "));
      const p = { ...data, items: Forms.filledItems(data), year: curYear() };
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
      <p class="lead">신청할 때 적은 팀명(동아리명)으로 실험실 사용 신청의 승인/반려와 물품 구입 진행 상황(준비중·배송완료·인계완료 등)을 확인합니다. 띄어쓰기는 무시됩니다.</p>
      <form class="card actions" id="stForm">
        <input name="team" placeholder="팀명 또는 동아리명" value="${esc(team0)}" style="flex:1;min-width:200px" required>
        <button class="btn">조회</button>
      </form>
      <div id="stResult"></div>
      <div id="dibutStatusBox"></div>`;
    window.Dibut.statusSection($("#dibutStatusBox"));
    const show = async (team) => {
      team = team.trim(); if (!team) return;
      const list = await Store.listStatusByTeam(team);
      $("#stResult").innerHTML = list.length ? `
        <div class="card"><h2>'${esc(team)}' 신청 내역 (${list.length}건)</h2>
          ${list.map((r) => `
            <div class="notice"><div style="flex:1">
              <b>${r.kind === "lab" ? `🧪 실험실 사용 · ${esc(r.lab)}` : "🛒 물품 구입"}</b>
              <span class="badge ${r.status}">${esc(S.reqStatusOf(r.status))}</span><br>
              <span class="muted">${r.kind === "lab" ? `${esc(r.date)} ${esc(r.start)}~${esc(r.end)}` : `품목 ${r.itemCount}개 · 합계 ${Forms.won(r.total) || 0}원${r.useDate ? ` · 사용예정일 ${esc(r.useDate)}` : ""}`}
                · 신청일 ${new Date(r.createdAt).toLocaleDateString("ko-KR")}</span>
              ${r.adminNote ? `<div><b>관리자 메모:</b> ${esc(r.adminNote)}</div>` : ""}
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
      <p class="lead"><b>${curYear()}학년도</b>(${curYear()}.3.1 ~ ${curYear() + 1}.2월 말) 기록입니다. 이름 없이 학번(학년·반·번호 5자리)으로만 조회합니다. 연간 목표: ${S.targetHours}시간</p>
      <form class="card actions" id="hForm">
        <input name="sid" placeholder="학번 5자리" pattern="[1-3][0-9]{4}" required value="${esc(q.get("sid") || "")}" style="flex:1;min-width:200px">
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
    if (!roles) {
      view.innerHTML = `
        <h1>관리자 로그인</h1>
        <form class="card" id="loginForm" style="max-width:420px">
          ${Store.isDemo ? `<p class="muted">데모 모드에서는 아무 값이나 입력해도 로그인됩니다. 권한을 골라 그 담당자 화면을 연습할 수 있습니다.</p>
          <div class="row"><label>데모 권한<select name="role">${Object.entries(S.roles).map(([k, v]) => `<option value="${k}">${v.label} – ${v.desc}</option>`).join("")}</select></label></div>` : ""}
          <div class="row"><label>이메일<input type="email" name="email" ${Store.isDemo ? "" : "required"}></label></div>
          <div class="row"><label>비밀번호<input type="password" name="pw" ${Store.isDemo ? "" : "required"}></label></div>
          <div class="actions"><button class="btn">로그인</button>
            ${Store.isDemo ? "" : '<button type="button" class="btn ghost sm" id="forgotPw">비밀번호를 잊었어요</button>'}</div>
        </form>`;
      $("#loginForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target));
        try { await Store.login(d.email, d.pw, d.role); } catch (err) { alert("로그인 실패: " + err.message); }
      });
      const fp = $("#forgotPw");
      if (fp) fp.onclick = () => {
        const email = $("#loginForm").elements.email.value.trim();
        if (!email) return alert("위 이메일 칸에 로그인 이메일을 먼저 적어 주세요.");
        busy(fp, async () => { await Store.sendReset(email); alert("비밀번호 재설정 메일을 보냈습니다. 받은편지함(또는 스팸함)을 확인하세요."); });
      };
      return;
    }
    // 탭마다 필요한 권한 (마스터는 모두)
    const ALL_TABS = { requests: ["실험실 신청 승인", "lab"], purchases: ["물품 구입 신청", "lab"], reagents: ["시약 대장", "lab"], events: ["행사 일정", "program"],
      course: ["수강신청", "program"], hours: ["이수시간 입력", "program"], hoursList: ["이수시간 현황", "program"],
      dibut: ["디벗 관리", "dibut"], accounts: ["관리자 계정", "master"], cleanup: ["학년도 정리", "master"] };
    const tabs = Object.fromEntries(Object.entries(ALL_TABS).filter(([, [, r]]) => can(r)).map(([k, [t]]) => [k, t]));
    if (!tabs[adminTab]) adminTab = Object.keys(tabs)[0];
    const years = [0, 1, 2, 3, 4].map((i) => curYear() - i);
    view.innerHTML = `
      <div class="actions" style="justify-content:space-between;margin-bottom:12px">
        <h1>관리자</h1>
        <div class="actions">
          <span class="badge approved" title="이 계정이 쓸 수 있는 업무">${roles.map((r) => esc((S.roles[r] || { label: r }).label)).join(" · ")}</span>
          <span class="actions" id="badgeCtl"></span>
          <label class="inline-check">학년도
            <select id="yearSel">${years.map((y) => `<option value="${y}" ${y === adminYear ? "selected" : ""}>${y}학년도${y === curYear() ? " (현재)" : ""}</option>`).join("")}</select></label>
          <button class="btn ghost sm" id="logout">로그아웃</button>
        </div></div>
      <div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button data-t="${k}" class="${k === adminTab ? "on" : ""}">${v}</button>`).join("")}</div>
      <div id="adminBody"></div>`;
    $("#logout").onclick = () => Store.logout();
    window.AdminBadge.renderControl($("#badgeCtl"));
    $("#yearSel").onchange = (e) => { adminYear = +e.target.value; adminView(); };
    view.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { adminTab = b.dataset.t; adminView(); }));
    await ({ requests: adminRequests, purchases: adminPurchases, events: adminEvents, course: () => window.Course.admin($("#adminBody"), adminYear), hours: adminHours, hoursList: adminHoursList, cleanup: adminCleanup, accounts: adminAccounts, reagents: () => window.Reagents.admin($("#adminBody")), dibut: () => window.Dibut.admin($("#adminBody")) })[adminTab]();
  }

  // 서명 미리보기. 지도교사 서명 = 지도교사가 미리 허락했다는 뜻이므로 실무사는 바로 승인할 수 있음.
  // 확인이 더 필요할 때만 [확인 요청 문구 복사] → 메신저로 보내고, 답을 받으면 '다시 확인함'(선택) 체크
  const signCheck = (r) => {
    const s = r.sign || {};
    const img = (u, who) => `<span>${who} ${u ? `<img src="${esc(u)}" alt="${who} 서명">` : '<span class="warn">(서명 없음)</span>'}</span>`;
    return `<div class="sig-thumbs">${img(s.applicant, "신청자")}${img(s.teacher, `지도교사(${esc(r.teacher || "-")})`)}
      <span class="actions" style="gap:6px">
        <button type="button" class="btn ghost sm" data-askt="${esc(r.id)}" title="메신저에 붙여넣을 확인 요청 문구를 복사합니다">지도교사 확인 요청 문구 복사</button>
        <label class="inline-check"><input type="checkbox" data-tcheck="${esc(r.id)}" ${r.teacherChecked ? "checked" : ""}>
          지도교사에게 다시 확인함 <span class="muted small">(선택)</span></label></span></div>`;
  };
  const wd = (ds) => { const d = new Date(ds + "T00:00"); return isNaN(d) ? ds : `${d.getMonth() + 1}/${d.getDate()}(${"일월화수목금토"[d.getDay()]})`; };
  // 메신저로 보낼 지도교사 확인 요청 문구
  function askTeacherText(kind, r) {
    const t = r.teacher ? `${r.teacher} 선생님` : "선생님";
    if (kind === "lab") {
      return `[과학실 사용 확인 요청]\n${t}, 안녕하세요. 과학실입니다.\n` +
        `'${r.team || "팀명 없음"}' 팀이 ${wd(r.date)} ${r.start}~${r.end} ${r.lab} 사용을 신청했습니다.\n` +
        `- 사용자: ${userList(r).map((u) => [u.sid, u.name].filter(Boolean).join(" ")).join(", ")}\n` +
        `- 목적: ${r.purpose || "-"}\n` +
        ((r.reagents || []).some((x) => x && x.name) ? `- 시약: ${(r.reagents || []).map((x) => x && x.name).filter(Boolean).join(", ")}\n` : "") +
        `선생님 서명으로 접수되었습니다. 지도해 주시는 실험이 맞는지 회신 부탁드립니다.`;
    }
    return `[물품 구입 확인 요청]\n${t}, 안녕하세요. 과학실입니다.\n` +
      `'${r.team || "팀명 없음"}' 팀(${[r.sid, r.name].filter(Boolean).join(" ")})이 물품 ${Forms.filledItems(r).length}개, 합계 ${Forms.won(itemsTotal(r)) || 0}원 구입을 신청했습니다.\n` +
      `- 목적: ${r.purpose || "-"}\n선생님 서명으로 접수되었습니다. 구입을 진행해도 되는지 회신 부탁드립니다.`;
  }
  async function copyText(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
    if (btn) { const t = btn.textContent; btn.textContent = "복사됨 ✓ 메신저에 붙여넣으세요"; setTimeout(() => (btn.textContent = t), 2500); }
  }
  function bindTeacherCheck(body, kind, byId) {
    body.querySelectorAll("[data-askt]").forEach((b) => (b.onclick = () => copyText(askTeacherText(kind, byId[b.dataset.askt]), b)));
    body.querySelectorAll("[data-tcheck]").forEach((c) => (c.onchange = async () => {
      const id = c.dataset.tcheck, on = c.checked;
      c.disabled = true;
      try { await Store.setTeacherChecked(kind, id, on); byId[id].teacherChecked = on; }
      catch (err) { c.checked = !on; alert("저장하지 못했습니다: " + err.message); }
      c.disabled = false;
    }));
  }

  // 반려된 신청 삭제 (하나씩 / 모두). 학생의 '신청 결과 조회'에서도 사라짐
  // 삭제 가능: 반려(실험실) · 구매취소(물품)
  const deletable = (r) => r.status === "rejected" || r.status === "canceled";
  const delBtn = (r) => (deletable(r) ? `<button class="btn ghost sm del-t" data-delrej="${esc(r.id)}">삭제</button>` : "");
  const delAllBtn = (list) => {
    const n = list.filter(deletable).length;
    const what = list.some((r) => r.status === "canceled") ? "반려·구매취소된" : "반려된";
    return n ? `<div class="actions" style="margin:0 0 10px"><button class="btn ghost sm del-t" data-delrej-all>${what} 신청 ${n}건 모두 삭제</button></div>` : "";
  };
  function bindDeleteRejected(body, kind, list, rerender) {
    const warn = "\n\n삭제하면 되돌릴 수 없고, 학생의 '신청 결과 조회'에서도 사라집니다.";
    body.querySelectorAll("[data-delrej]").forEach((b) => (b.onclick = () => {
      const r = list.find((x) => x.id === b.dataset.delrej);
      if (!confirm(`${S.reqStatusOf(r.status)}된 신청 [${r.team || "팀명 없음"}]을(를) 삭제할까요?${warn}`)) return;
      busy(b, async () => { await Store.deleteRequests(kind, [r.id]); rerender(); });
    }));
    const all = body.querySelector("[data-delrej-all]");
    if (all) all.onclick = () => {
      const ids = list.filter(deletable).map((r) => r.id);
      if (!confirm(`${all.textContent.replace(/ 모두 삭제$/, "")}을 모두 삭제할까요?${warn}`)) return;
      busy(all, async () => { await Store.deleteRequests(kind, ids); rerender(); });
    };
  }

  async function adminRequests() {
    const [reqs, rgAll, rgStock] = await Promise.all([Store.listRequests(adminYear),
      window.Reagents.list(true).catch(() => []), window.Reagents.listStock().catch(() => ({}))]);
    const rgOf = (name) => window.Reagents.find(rgAll, name);
    const dates = reqs.filter((r) => r.date).map((r) => r.date).sort();
    const events = dates.length ? await Store.listEvents({ from: dates[0], to: addDays(dates[dates.length - 1], 1) }) : [];
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
        <p class="muted" style="margin:0">시약: ${esc(reag.join(", ") || "없음")}${reag.length ? (r.msdsOk ? ' <span class="badge approved">학생 MSDS 확인함</span>' : ' <span class="badge pending">MSDS 확인 기록 없음</span>') : ""}${r.plan?.title ? ` · 실험 제목: ${esc(r.plan.title)}` : ""}</p>
        ${(r.reagents || []).filter((x) => x && x.name).map((x) => `
          <details class="reag-detail"><summary class="small">🧪 <b>${esc(x.name)}</b> ${rgOf(x.name)
              ? `<span class="muted">📍 ${esc(rgStock[rgOf(x.name).id]?.location || "위치 미입력")} · 보유 ${esc(rgStock[rgOf(x.name).id]?.qty || "-")}</span>`
              : '<span class="warn">학교 시약 대장에 없음</span>'} · 조사서 내용 보기</summary>
            <div class="actions" style="margin-top:6px">${rgOf(x.name) ? `<button type="button" class="btn sm" data-rgv="${esc(x.name)}">학교 요약 MSDS</button>` : ""}${msdsBtns(x.name)}</div>
            <dl>${[["유해·위험", x.hazard], ["눈에 들어갔을 때", x.eye], ["피부 접촉", x.skin], ["냄새", x.smell], ["녹는점", x.melt], ["끓는점", x.boil], ["인화점", x.flash],
              ["안정성·반응성", x.stability], ["화재 시 대처", x.fire], ["그 외", x.etc]].map(([k, v]) => `<dt>${k}</dt><dd>${v ? esc(v) : '<span class="warn">비어 있음</span>'}</dd>`).join("")}</dl>
          </details>`).join("")}
        <div style="margin-bottom:6px"></div>
        ${c ? `<p class="warn">⚠ 겹치는 승인 일정: ${esc(c.title)} ${fmtDate(c.start)}</p>` : ""}
        ${signCheck(r)}
        <div class="actions">
          <input placeholder="학생에게 보낼 메모 (반려 사유 등)" data-note="${esc(r.id)}" value="${esc(r.adminNote)}" style="flex:1;min-width:200px">
          <button class="btn ok sm" data-act="approved" data-id="${esc(r.id)}">승인</button>
          <button class="btn bad sm" data-act="rejected" data-id="${esc(r.id)}">반려</button>
          <button class="btn ghost sm" data-pdf="${esc(r.id)}">신청서 PDF</button>
          ${delBtn(r)}
        </div>
      </div>`;
    };
    body.innerHTML = `
      <h2>대기 중 (${pending.length})</h2>${pending.map(card).join("") || '<p class="muted">대기 중인 신청이 없습니다.</p>'}
      <details><summary class="muted" style="cursor:pointer;margin:16px 0">처리 완료 ${done.length}건 보기</summary>
        ${delAllBtn(reqs)}${done.map(card).join("")}</details>`;
    bindDeleteRejected(body, "lab", reqs, adminRequests);
    body.querySelectorAll("[data-act]").forEach((b) => (b.onclick = async () => {
      const note = body.querySelector(`[data-note="${CSS.escape(b.dataset.id)}"]`).value;
      if (b.dataset.act === "rejected" && !note && !confirm("반려 사유 없이 반려할까요?")) return;
      await Store.decideRequest(b.dataset.id, b.dataset.act, note);
      adminRequests();
    }));
    bindTeacherCheck(body, "lab", byId);
    bindMsds(body);
    body.querySelectorAll("[data-rgv]").forEach((b) => (b.onclick = () => { const r = rgOf(b.dataset.rgv); window.Reagents.showMsds(r, { stock: rgStock[r.id] }); }));
    body.querySelectorAll("[data-pdf]").forEach((b) => (b.onclick = () => {
      const r = byId[b.dataset.pdf];
      busy(b, () => Forms.dataToPDF("lab", r, `실험실사용신청서_${r.date}_${userList(r)[0]?.name || ""}.pdf`));
    }));
  }

  async function adminPurchases() {
    const list = await Store.listPurchases(adminYear);
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
        ${delAllBtn(list)}
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
              <td><span class="badge ${p.status}">${esc(S.reqStatusOf(p.status))}</span></td>
              <td class="actions"><button class="btn ghost sm" data-detail="${esc(p.id)}">상세</button></td>
            </tr>
            <tr class="detail" id="d-${esc(p.id)}" hidden><td colspan="8">
              <p style="margin:0 0 6px"><b>실험 목적 및 내용:</b> ${esc(p.purpose)} · 사용예정일 ${esc(p.useDate || "-")}</p>
              <table class="mini"><tr><th>내용</th><th>규격</th><th>수량</th><th>예상단가</th><th>예상금액</th><th>사이트</th><th>상품코드</th><th>주소</th></tr>
                ${Forms.filledItems(p).map((it) => `<tr><td>${esc(it.name)}</td><td>${esc(it.spec)}</td><td>${esc(it.qty)}</td>
                  <td>${Forms.won(it.price)}</td><td>${Forms.won((+it.qty || 0) * (+it.price || 0))}</td><td>${esc(it.site)}</td><td>${esc(it.code)}</td>
                  <td>${/^https?:\/\//i.test(it.url || "") ? `<a href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">열기 ↗</a>` : esc(it.url || "")}</td></tr>`).join("")}
              </table>
              <div style="margin-top:8px">${signCheck(p)}</div>
              <div class="actions" style="margin-top:8px">
                <input placeholder="학생에게 보낼 메모 (배송 예정일, 보류 사유 등)" data-note="${esc(p.id)}" value="${esc(p.adminNote)}" style="flex:1;min-width:200px">
                <select data-pstatus="${esc(p.id)}">
                  ${p.status in S.purchaseStatus ? "" : `<option value="" selected disabled>${esc(S.reqStatusOf(p.status))} → 상태 선택</option>`}
                  ${Object.entries(S.purchaseStatus).map(([k, v]) => `<option value="${k}" ${k === p.status ? "selected" : ""}>${v}</option>`).join("")}
                </select>
                <button class="btn ok sm" data-pset="${esc(p.id)}">상태 저장</button>
                <button class="btn ghost sm" data-pdf="${esc(p.id)}">신청서 PDF</button>
                <button class="btn ghost sm" data-xls="${esc(p.id)}">이 팀만 엑셀</button>
                ${delBtn(p)}
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
    // 상태 저장 (지도교사 서명이 있으면 바로 진행. 다시 확인은 필요할 때만)
    body.querySelectorAll("[data-pset]").forEach((b) => (b.onclick = () => {
      const id = b.dataset.pset, p = byId[id];
      const st = body.querySelector(`[data-pstatus="${CSS.escape(id)}"]`).value;
      const note = body.querySelector(`[data-note="${CSS.escape(id)}"]`).value;
      if (!st) return alert("바꿀 상태를 고르세요.");
      if (st === "canceled" && !note && !confirm("취소 사유 메모 없이 구매취소할까요?")) return;
      busy(b, async () => { await Store.decidePurchase(id, st, note); adminPurchases(); });
    }));
    bindTeacherCheck(body, "purchase", byId);
    bindDeleteRejected(body, "purchase", list, adminPurchases);
    body.querySelectorAll("[data-pdf]").forEach((b) => (b.onclick = () => {
      const p = byId[b.dataset.pdf];
      busy(b, () => Forms.dataToPDF("purchase", p, `물품구입신청서_${p.team || p.name}.pdf`));
    }));
    body.querySelectorAll("[data-xls]").forEach((b) => (b.onclick = () => {
      const p = byId[b.dataset.xls];
      busy(b, () => Forms.purchasesToXlsx([p], `물품신청내역_${p.team || p.name}.xlsx`));
    }));
  }

  // ---------- 엑셀 일괄 등록 (행사 일정 / 이수시간 공통) ----------
  const bulkCard = (what) => `
    <div class="card bulk">
      <h2>엑셀로 일괄 등록</h2>
      <p class="muted">${what}이 많을 때 ① 양식을 내려받아 ② 채운 뒤 ③ 올리면, 미리보기를 확인하고 한꺼번에 등록할 수 있습니다. (xlsx 파일)</p>
      <div class="actions">
        <button type="button" class="btn ghost" data-tpl>① 양식 내려받기</button>
        <label class="btn ghost">② 채운 엑셀 파일 올리기<input type="file" accept=".xlsx" hidden data-up></label>
      </div>
      <div data-preview></div>
    </div>`;
  // parse(rows) → { head:[열 이름], list:[{row, cells:[글자], item?, msg?, dup?}] }, save(items) → 등록
  function bindBulk(root, kind, parse, save, after) {
    const card = root.querySelector(".bulk");
    const out = card.querySelector("[data-preview]");
    card.querySelector("[data-tpl]").onclick = (e) => busy(e.target, () => Forms.bulkTemplate(kind));
    const up = card.querySelector("[data-up]");
    up.onchange = async () => {
      const file = up.files[0]; up.value = "";
      if (!file) return;
      out.innerHTML = '<p class="muted">읽는 중…</p>';
      let res;
      try { res = await parse(await Forms.readBulkXlsx(file)); }
      catch (err) { out.innerHTML = `<p class="warn">${esc(err.message)}</p>`; return; }
      const ok = res.list.filter((x) => x.item), dup = res.list.filter((x) => x.dup), bad = res.list.filter((x) => !x.item && !x.dup);
      out.innerHTML = `
        <p style="margin:12px 0 6px"><b>${esc(file.name)}</b> · 등록 가능 <b class="ok-t">${ok.length}건</b>
          ${dup.length ? ` · 중복(건너뜀) <b>${dup.length}건</b>` : ""}${bad.length ? ` · <span class="warn">오류 ${bad.length}건 (등록 안 됨)</span>` : ""}</p>
        <div class="table-wrap" style="max-height:360px;overflow:auto"><table class="mini">
          <tr><th>행</th>${res.head.map((h) => `<th>${h}</th>`).join("")}<th>확인</th></tr>
          ${res.list.map((x) => `<tr class="${x.item ? "" : x.dup ? "muted" : "bad-row"}"><td>${x.row}</td>${x.cells.map((c) => `<td>${esc(c)}</td>`).join("")}
            <td>${x.item ? "✅" : x.dup ? "중복" : `⚠ ${esc(x.msg)}`}</td></tr>`).join("") || `<tr><td colspan="${res.head.length + 2}" class="muted">입력된 줄이 없습니다.</td></tr>`}
        </table></div>
        <div class="actions" style="margin-top:10px">
          <button class="btn" data-go ${ok.length ? "" : "disabled"}>${ok.length}건 등록하기</button>
          ${bad.length ? '<span class="muted small">오류 줄은 엑셀에서 고친 뒤 다시 올리면 됩니다. (이미 등록된 줄은 중복으로 건너뜀)</span>' : ""}
        </div>`;
      out.querySelector("[data-go]").onclick = (e) => busy(e.target, async () => {
        if (!confirm(`${ok.length}건을 등록할까요?`)) return;
        await save(ok.map((x) => x.item));
        alert(`${ok.length}건이 등록되었습니다.`);
        after();
      });
    };
  }

  async function parseEventRows(rows) {
    const T = Forms.cellText;
    const list = rows.map(({ row, cells }) => {
      const [title, date, start, end, status, note] = cells;
      const x = { row, cells: [T(title), Forms.toDateStr(date) || T(date), Forms.toTimeStr(start) || T(start), Forms.toTimeStr(end) || T(end), T(status), T(note)] };
      if (/^예\)/.test(T(title))) return null; // 예시 줄
      const st = T(status);
      const e = { type: "event", title: T(title), note: T(note),
        status: !st || /예정/.test(st) ? "scheduled" : /완료/.test(st) ? "done" : /취소/.test(st) ? "cancelled" : null };
      const d = Forms.toDateStr(date), s = Forms.toTimeStr(start);
      let en = Forms.toTimeStr(end);
      if (!e.title) x.msg = "제목이 비어 있음";
      else if (!d) x.msg = "날짜 형식 (예: 2026-11-20)";
      else if (T(start) && !s) x.msg = "시작 시각 형식 (예: 19:30)";
      else if (T(end) && !en) x.msg = "종료 시각 형식 (예: 21:30)";
      else if (!s && en) x.msg = "종료 시각만 있음 (시작 시각도 적거나 둘 다 비우기)";
      else if (!e.status) x.msg = "상태는 예정 / 완료 / 취소";
      if (x.msg) return x;
      if (!s) { x.cells[2] = "종일"; x.item = { ...e, start: d, end: "" }; return x; } // 시각 없으면 종일 일정
      if (!en) { const m = Math.min(+s.slice(0, 2) * 60 + +s.slice(3) + 120, 23 * 60 + 59); en = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; x.cells[3] = en; }
      if (en <= s) { x.msg = "종료 시각이 시작보다 빠름"; return x; }
      x.item = { ...e, start: `${d}T${s}`, end: `${d}T${en}` };
      return x;
    }).filter(Boolean);
    // 이미 등록된 일정·파일 안 중복 거르기
    const items = list.filter((x) => x.item).map((x) => x.item.start.slice(0, 10)).sort();
    const have = items.length ? await Store.listEvents({ from: items[0], to: addDays(items[items.length - 1], 1) }) : [];
    const seen = new Set(have.map((e) => `${e.start}|${e.title}`));
    for (const x of list) {
      if (!x.item) continue;
      const k = `${x.item.start}|${x.item.title}`;
      if (seen.has(k)) { x.dup = true; delete x.item; } else seen.add(k);
    }
    return { head: ["제목", "날짜", "시작", "종료", "상태", "안내"], list };
  }

  async function parseHourRows(rows) {
    const T = Forms.cellText;
    const list = rows.map(({ row, cells }) => {
      const [sid, date, activity, hours] = cells;
      const x = { row, cells: [T(sid), Forms.toDateStr(date) || T(date), T(activity), T(hours)] };
      if (/^예\)/.test(T(activity))) return null;
      const p = window.parseSid(T(sid).replace(/\D/g, "")), d = Forms.toDateStr(date), h = parseFloat(T(hours));
      if (!p) x.msg = "학번은 5자리";
      else if (!d) x.msg = "날짜 형식 (예: 2026-11-20)";
      else if (!T(activity)) x.msg = "활동명이 비어 있음";
      else if (!(h > 0 && h <= 24)) x.msg = "인정 시간은 0보다 큰 숫자";
      else x.item = { sid: p.sid, date: d, activity: T(activity), hours: h };
      return x;
    }).filter(Boolean);
    // 이미 있는 기록(같은 학번·날짜·활동명)과 파일 안 중복 거르기
    const years = [...new Set(list.filter((x) => x.item).map((x) => window.schoolYear(x.item.date)))];
    const seen = new Set();
    for (const y of years) for (const h of await Store.listHours(y)) for (const r of h.records || []) seen.add(`${h.sid}|${r.date}|${r.activity}`);
    for (const x of list) {
      if (!x.item) continue;
      const k = `${x.item.sid}|${x.item.date}|${x.item.activity}`;
      if (seen.has(k)) { x.dup = true; delete x.item; } else seen.add(k);
    }
    return { head: ["학번", "날짜", "활동명", "시간"], list };
  }

  async function saveHourRows(items) {
    const groups = {};
    for (const it of items) (groups[JSON.stringify([it.date, it.activity, it.hours])] ||= []).push(it.sid);
    for (const [k, sids] of Object.entries(groups)) {
      const [date, activity, hours] = JSON.parse(k);
      await Store.addHours(sids, { activity, date, hours });
    }
  }

  async function adminEvents() {
    const events = (await Store.listEvents(window.yearRange(adminYear))).filter((e) => e.type !== "lab").sort((a, b) => b.start.localeCompare(a.start));
    const body = $("#adminBody");
    body.innerHTML = `
      <form class="card" id="evForm">
        <h2 id="evFormTitle">새 일정 등록</h2>
        <input type="hidden" name="id">
        <div class="row">
          <label>제목<input name="title" required placeholder="예) 11월 천체관측"></label>
          <label>상태<select name="status">${Object.entries(S.eventStatus).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
        </div>
        <div class="row">
          <label>날짜<input type="date" name="date" required></label>
          <label>시작 (비우면 종일)<input type="time" name="start"></label>
          <label>종료<input type="time" name="end"></label>
        </div>
        <div class="row"><label>안내 문구<input name="note" placeholder="예) 우천 시 취소, 전날 17시 공지"></label></div>
        <div class="actions"><button class="btn">저장</button><button type="button" class="btn ghost" id="evReset">새로 작성</button></div>
      </form>
      ${bulkCard("등록할 행사 일정")}
      <div class="card"><h2>${adminYear}학년도 등록된 일정</h2><div class="table-wrap"><table>
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
      if (!d.start && d.end) return alert("시작 시각을 적거나, 종일 일정이면 종료 시각도 비워 주세요.");
      if (d.start && d.end && d.end <= d.start) return alert("종료 시각이 시작 시각보다 늦어야 합니다.");
      await Store.saveEvent({ id: d.id || undefined, type: "event", title: d.title, status: d.status, note: d.note,
        start: d.start ? `${d.date}T${d.start}` : d.date, end: d.start && d.end ? `${d.date}T${d.end}` : "" });
      adminEvents();
    });
    $("#evReset").onclick = () => adminEvents();
    bindBulk(body, "events", parseEventRows, (items) => Store.saveEvents(items), adminEvents);
    const byId = Object.fromEntries(events.map((e) => [e.id, e]));
    body.querySelectorAll("[data-status]").forEach((s) => (s.onchange = async () => {
      await Store.saveEvent({ ...byId[s.dataset.status], status: s.value }); adminEvents();
    }));
    body.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
      if (confirm("이 일정을 삭제할까요?")) { await Store.deleteEvent(b.dataset.del); adminEvents(); }
    }));
    body.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => {
      const e = byId[b.dataset.edit];
      Object.entries({ id: e.id, title: e.title, status: S.eventStatus[e.status] ? e.status : "scheduled", note: e.note || "",
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
        <div class="row"><label>학번 목록 (줄바꿈·쉼표·공백으로 구분)<textarea name="sids" required placeholder="학번을 한 줄에 하나씩"></textarea></label></div>
        <p id="hrPreview" class="muted"></p>
        <button class="btn">입력하기</button>
      </form>
      ${bulkCard("학생마다 활동·시간이 다르거나 입력할 내역")}`;
    bindBulk(body, "hours", parseHourRows, saveHourRows, adminHours);
    const f = $("#hrForm");
    const parse = () => {
      const raw = (f.elements.sids.value.match(/\d+/g) || []);
      const ok = [...new Set(raw.filter((s) => window.parseSid(s)))];
      const bad = raw.filter((s) => !window.parseSid(s));
      const y = f.elements.date.value ? window.schoolYear(f.elements.date.value) : curYear();
      $("#hrPreview").innerHTML = `유효한 학번 <b>${ok.length}명</b> · <b>${y}학년도</b> 기록으로 저장됩니다${bad.length ? ` · <span class="warn">잘못된 값: ${esc(bad.join(", "))}</span>` : ""}`;
      return ok;
    };
    f.elements.sids.addEventListener("input", parse);
    f.elements.date.addEventListener("change", parse);
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
    const list = await Store.listHours(adminYear);
    $("#adminBody").innerHTML = `
      <div class="card"><h2>${adminYear}학년도 학생별 이수시간 (${list.length}명)</h2>
        <div class="table-wrap"><table><tr><th>학번</th><th>학년/반/번호</th><th>누적</th><th>달성률</th></tr>
        ${list.map((h) => `<tr><td>${esc(h.sid)}</td><td>${h.grade}-${h.cls}-${h.num}</td><td>${h.total}</td>
          <td>${Math.min(100, Math.round((h.total / S.targetHours) * 100))}%</td></tr>`).join("")}
        </table></div></div>`;
  }

  // 학년도가 끝나면: 엑셀로 백업 → 삭제
  async function adminCleanup() {
    const y = adminYear, body = $("#adminBody");
    const r = window.yearRange(y);
    const data = await Store.yearData(y);
    const isPast = y < curYear();
    const lastDay = addDays(r.to, -1);
    let backedUp = false;
    body.innerHTML = `
      <div class="card">
        <h2>${y}학년도 기록 정리</h2>
        <p class="muted">대상 기간: ${r.from} ~ ${lastDay}</p>
        <table style="max-width:420px">
          <tr><td>실험실 사용 신청</td><td><b>${data.requests.length}</b>건</td></tr>
          <tr><td>물품 구입 신청</td><td><b>${data.purchases.length}</b>건</td></tr>
          <tr><td>이수시간 기록</td><td><b>${data.hours.length}</b>명</td></tr>
          <tr><td>캘린더 일정</td><td><b>${data.events.length}</b>건</td></tr>
        </table>
        <ol style="margin:16px 0 0;padding-left:20px;line-height:2.2">
          <li><button class="btn" id="bkBtn">엑셀로 백업 다운로드</button>
            <span class="muted small">신청서 내용(시약 조사서·실험 계획서 포함), 물품 품목내역, 이수시간, 일정이 시트별로 저장됩니다.</span></li>
          <li><button class="btn bad" id="delBtn" disabled>${y}학년도 기록 삭제</button>
            <span class="muted small" id="delHint">${isPast ? "먼저 1번 백업을 받아야 삭제할 수 있습니다." : "진행 중인 학년도는 삭제할 수 없습니다. 학년도가 끝난 뒤(3월 1일 이후) 정리하세요."}</span></li>
        </ol>
      </div>
      <p class="muted small">삭제하면 되돌릴 수 없습니다. 백업 엑셀 파일은 학교 업무용 저장소(공유 드라이브 등)에 보관하세요.</p>`;
    $("#bkBtn").onclick = (e) => busy(e.target, async () => {
      await Forms.backupXlsx(y, data, `과학실_${y}학년도_백업_${today()}.xlsx`);
      backedUp = true;
      if (isPast) { $("#delBtn").disabled = false; $("#delHint").textContent = "백업 파일이 잘 열리는지 확인한 뒤 삭제하세요."; }
    });
    $("#delBtn").onclick = (e) => {
      if (!isPast || !backedUp) return;
      const typed = prompt(`정말 ${y}학년도 기록을 모두 삭제할까요? 되돌릴 수 없습니다.\n확인하려면 ${y} 를 입력하세요.`);
      if (typed !== String(y)) return alert("입력한 값이 달라 삭제하지 않았습니다.");
      busy(e.target, async () => {
        const n = await Store.deleteYear(y);
        alert(`${y}학년도 기록 ${n}건을 삭제했습니다.`);
        adminCleanup();
      });
    };
  }

  // ---------- 관리자 계정·권한 (마스터만) ----------
  // 마스터가 계정을 만들고 맡은 업무(과학실 운영·행사·과중 기획·디벗)를 정함. Firebase 콘솔을 열 필요 없음
  async function adminAccounts() {
    const body = $("#adminBody");
    const list = (await Store.listAdmins()).sort((a, b) => (b.roles.includes("master") - a.roles.includes("master")) || String(a.name || "").localeCompare(b.name || ""));
    const me = Store.myUid();
    const roleBoxes = (name, on, dis = "") => Object.entries(S.roles).map(([k, v]) =>
      `<label class="inline-check" title="${esc(v.desc)}"><input type="checkbox" name="${name}" value="${k}" ${on.includes(k) ? "checked" : ""} ${dis}> ${esc(v.label)}</label>`).join(" ");
    body.innerHTML = `
      <div class="card">
        <h2>관리자 계정 (${list.length})</h2>
        <p class="muted">계정마다 맡은 업무만 열립니다. <b>마스터</b>는 모든 탭과 이 화면, 학년도 정리를 씁니다.</p>
        <ul class="muted small" style="margin:0 0 10px;padding-left:18px">
          ${Object.values(S.roles).map((v) => `<li><b>${esc(v.label)}</b>: ${esc(v.desc)}</li>`).join("")}
        </ul>
        <div class="table-wrap"><table>
          <tr><th>이름</th><th>로그인 이메일</th><th>권한</th><th></th></tr>
          ${list.map((a) => `<tr data-uid="${esc(a.uid)}">
            <td><input data-aname value="${esc(a.name || "")}" style="width:140px"></td>
            <td>${esc(a.email || "-")}${a.uid === me ? ' <span class="badge approved">나</span>' : ""}</td>
            <td>${roleBoxes("r_" + a.uid, a.roles)}</td>
            <td><div class="actions"><button class="btn ok sm" data-asave>저장</button>
              ${a.uid === me ? "" : '<button class="btn bad sm" data-adel>삭제</button>'}
              ${a.email ? '<button class="btn ghost sm" data-areset title="이 이메일로 비밀번호 재설정 메일을 보냅니다">비밀번호 재설정 메일</button>' : ""}</div></td>
          </tr>`).join("")}
        </table></div>
      </div>
      <form class="card" id="newAdmin">
        <h2>새 관리자 계정</h2>
        <div class="row">
          <label>이름<input name="name" required placeholder="예) 과학실무사"></label>
          <label>로그인 이메일<input name="email" type="email" required></label>
          <label>처음 비밀번호 (6자 이상)<input name="pw" type="text" minlength="6" required autocomplete="off"></label>
        </div>
        <div class="row"><div>${roleBoxes("roles", [])}</div></div>
        <p class="muted small">만든 뒤 이름·이메일·처음 비밀번호를 본인에게 직접 전달하고, 첫 로그인 뒤 [비밀번호 재설정 메일]로 바꾸게 안내하세요.</p>
        <button class="btn">계정 만들기</button>
        <details style="margin-top:12px"><summary class="muted" style="cursor:pointer">이미 Firebase에 있는 계정을 UID로 추가</summary>
          <div class="row" style="margin-top:8px"><label>사용자 UID (Firebase 콘솔 → Authentication)<input id="byUid"></label>
            <label>이름<input id="byUidName"></label></div>
          <button type="button" class="btn ghost sm" id="byUidBtn">위에서 고른 권한으로 추가</button></details>
      </form>`;
    const pick = (name) => [...body.querySelectorAll(`input[name="${CSS.escape(name)}"]:checked`)].map((c) => c.value);
    body.querySelectorAll("[data-asave]").forEach((b) => (b.onclick = () => {
      const tr = b.closest("tr"), id = tr.dataset.uid, r = pick("r_" + id);
      if (!r.length) return alert("권한을 하나 이상 고르세요. (계정을 없애려면 삭제)");
      if (id === me && !r.includes("master")) return alert("내 계정의 마스터 권한은 뺄 수 없습니다. 다른 마스터 계정에서 바꾸세요.");
      busy(b, async () => { await Store.saveAdmin(id, tr.querySelector("[data-aname]").value.trim(), r); adminAccounts(); });
    }));
    body.querySelectorAll("[data-adel]").forEach((b) => (b.onclick = () => {
      const tr = b.closest("tr"), a = list.find((x) => x.uid === tr.dataset.uid);
      if (!confirm(`'${a.name || a.email}' 계정의 관리자 권한을 없앨까요?\n(로그인해도 관리자 화면이 열리지 않습니다)`)) return;
      busy(b, async () => { await Store.removeAdmin(a.uid); adminAccounts(); });
    }));
    body.querySelectorAll("[data-areset]").forEach((b) => (b.onclick = () => {
      const a = list.find((x) => x.uid === b.closest("tr").dataset.uid);
      if (!confirm(`${a.email} 로 비밀번호 재설정 메일을 보낼까요?`)) return;
      busy(b, async () => { await Store.sendReset(a.email); alert("메일을 보냈습니다. 받은편지함(또는 스팸함)의 링크로 새 비밀번호를 정하면 됩니다."); });
    }));
    const f = $("#newAdmin");
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f)), r = pick("roles");
      if (!r.length) return alert("권한을 하나 이상 고르세요.");
      busy(f.querySelector("button.btn:not(.ghost)"), async () => { await Store.createAdmin(d.email.trim(), d.pw, d.name.trim(), r); alert("계정을 만들었습니다."); adminAccounts(); });
    });
    $("#byUidBtn").onclick = (e) => {
      const id = $("#byUid").value.trim(), r = pick("roles");
      if (!id || !r.length) return alert("UID와 권한을 넣으세요.");
      busy(e.target, async () => { await Store.addAdminByUid(id, $("#byUidName").value.trim(), r); adminAccounts(); });
    };
  }

  // 알림창(🔔)에서 항목을 누르면 해당 관리자 화면으로 이동
  window.App = {
    openAdmin(tab, sub) {
      adminTab = tab; adminYear = curYear();
      if (sub) window.Dibut.setSub(sub);
      if (location.hash.split("?")[0] === "#/admin") render(); else location.hash = "#/admin";
    }
  };

  // ---------- 시작 ----------
  $("#brandName").textContent = `${S.schoolName} ${S.deptName}`;
  $("#footerDept").textContent = `${S.schoolName} ${S.deptName}`;
  if (Store.isDemo) $("#demoBanner").hidden = false;
  window.addEventListener("hashchange", render);
  let first = true;
  Store.onAuth((a) => {
    roles = a && a.length ? a : null;
    roles ? window.AdminBadge.start(can) : window.AdminBadge.stop(); // 대기 건수 → 작업 표시줄·창 제목 (맡은 업무만)
    if (first) { first = false; render(); } else if (location.hash.startsWith("#/admin")) render();
  });
})();
