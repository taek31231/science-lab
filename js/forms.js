// ===== A4 양식 (실험실 사용 신청서 3종, 물품 구입 신청서) + PDF/엑셀 저장 =====
// 양식 칸마다 data-k="경로" 를 붙여 두고, readForm()으로 한 번에 읽어 객체로 만듭니다.
(function () {
  const S = window.SITE;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const get = (o, p) => p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
  function set(o, p, v) {
    const ks = p.split(".");
    let c = o;
    ks.slice(0, -1).forEach((k, i) => {
      if (c[k] == null) c[k] = /^\d+$/.test(ks[i + 1]) ? [] : {};
      c = c[k];
    });
    c[ks[ks.length - 1]] = v;
  }
  const v = (d, k) => esc(get(d, k) ?? "");
  const I = (d, k, a = "") => `<input data-k="${k}" value="${v(d, k)}" ${a}>`;
  const T = (d, k, h, a = "") => `<textarea data-k="${k}" style="height:${h}" ${a}>${v(d, k)}</textarea>`;
  const SEL = (d, k, opts) =>
    `<select data-k="${k}">${["", ...opts].map((o) => `<option ${get(d, k) === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  const won = (n) => (n ? Number(n).toLocaleString("ko-KR") : "");

  function fmt(val, kind) {
    if (!val) return "";
    if (kind === "date") { const [y, m, d] = val.split("-"); return `${y}년 ${+m}월 ${+d}일`; }
    if (kind === "time") { const [h, m] = val.split(":"); return `${+h}시 ${m}분`; }
    return val;
  }
  const mirror = (d, k, kind = "") => `<span data-mirror="${k}" data-fmt="${kind}">${esc(fmt(get(d, k), kind))}</span>`;

  // 서명 칸: 누르면 서명 패드가 열림. 서명 전에는 (인)/(자필서명) 글자가 보이고, PDF에도 그대로 찍힘
  const SIG = (d, k, ph, who) => {
    const val = get(d, k) || "";
    return `<span class="sig ${val ? "has" : ""}" data-sig="${k}" data-who="${esc(who)}" title="${esc(who)} 서명">` +
      `<input type="hidden" data-k="${k}" value="${esc(val)}">` +
      `<img alt="" ${val ? `src="${esc(val)}"` : ""}>` +
      `<span class="sig-ph">${ph}</span><span class="sig-hint no-export">✍ 서명</span></span>`;
  };

  // ---------------- 실험실 사용 신청서 (3종) ----------------
  function labSheets(d) {
    const u = (i) => `<tr><th>${i + 1}</th><td>${I(d, `users.${i}.sid`, 'inputmode="numeric" maxlength="5"')}</td><td>${I(d, `users.${i}.name`)}</td>`;
    const m = (i) => `<td>${I(d, `materials.${i}.name`)}</td><td>${I(d, `materials.${i}.spec`)}</td><td>${I(d, `materials.${i}.qty`)}</td>`;
    const matRows = [...Array(8).keys()].map((i) => `<tr>${m(i)}${m(i + 8)}</tr>`).join("");
    const today = new Date().toISOString().slice(0, 10);

    const apply = `
    <div class="a4">
      <h1 class="t">실험실 사용 신청서</h1>
      <table class="f">
        <colgroup><col style="width:14%"><col style="width:6%"><col style="width:22%"><col style="width:22%"><col style="width:14%"><col style="width:22%"></colgroup>
        <tr class="h9"><th>사용 시간</th><td colspan="3" class="nw">${I(d, "date", 'type="date" data-fmt="date" class="w-date"')}
          ${I(d, "start", 'type="time" data-fmt="time" class="w-time"')} ~ ${I(d, "end", 'type="time" data-fmt="time" class="w-time"')}</td>
          <th>실험 장소</th><td>${SEL(d, "lab", S.labs)}</td></tr>
        <tr class="h9"><th>사용 목적</th><td colspan="5">${I(d, "purpose", 'placeholder="예) 케미스토리 동아리 – 산화환원 적정 실험"')}</td></tr>
        <tr><th rowspan="4">사용자</th><th></th><th>학번</th><th>이름</th><th colspan="2">지도교사 확인</th></tr>
        ${u(0)}<td colspan="2" rowspan="3" class="sign">${I(d, "teacher", 'placeholder="지도교사 성함" class="w-teacher"')}<span class="in">${SIG(d, "sign.teacher", "(인)", "지도교사")}</span></td></tr>
        ${u(1)}</tr>${u(2)}</tr>
        <tr><th>실험 재료<br>및<br>기자재<br>요청 사항</th><td colspan="5" class="inner">
          <table class="f mat"><colgroup><col style="width:21%"><col style="width:18%"><col style="width:9%"><col style="width:21%"><col style="width:18%"><col style="width:9%"></colgroup>
            <tr><th>품명</th><th>규격</th><th>수량</th><th class="thick-l">품명</th><th>규격</th><th>수량</th></tr>${matRows}</table>
        </td></tr>
        <tr><th>사용자<br>준수사항</th><td colspan="5" class="rules">
          <ol>
            <li>(과학정보부 비치) <u><b>‘(앞면)실험실 사용 신청서’</b></u>와 <u><b>‘(뒷면)시약·시액 조사서’, ‘실험계획서’</b></u>를 작성한다.</li>
            <li><u><b>지도 교사의 확인 서명</b></u>을 받는다.</li>
            <li><u><b>‘실험실 사용 신청서’, ‘시약·시액 조사서’, ‘실험계획서’</b></u>를 <b>과학정보부에 제출</b>하고 허락을 받는다. (웹사이트 온라인 제출 가능)
              <div class="note b">※ 모든 서류는 <span class="red">실험실 사용 7일 전까지 제출</span>해야함!!</div></li>
            <li>실험실 사용 당일, 점심시간에 사용할 시약·시액, <u><b>실험 도구 및 기자재를 미리 챙겨둔다.</b></u>
              <div class="note">※ 실험도구 및 기자재는 학생들이 찾고, 시약·시액은 과학실무사 선생님이 챙겨줌</div>
              <div class="note">※ 학생들은 준비실에는 출입할 수 없음</div></li>
            <li>실험실 사용 규칙을 지켜 안전하게 실험한다.</li>
            <li><u><b>실험실 사용 후, 뒷정리</b></u>를 한다.
              <div class="sub">1) 시약·시액 : 지정된 시약 반납 장소에 놓는다.</div>
              <div class="sub">2) 실험 도구 및 기자재 : 깨끗하게 세척한 후, 지정된 장소(화학실 뒤쪽 건조대)에서 건조시킨다.</div>
              <div class="sub">3) 만약 실험 재료 및 도구를 보관해야하는 경우, 지정된 장소에 이름을 적고 보관한다.</div>
              <div class="sub">4) 책상, 의자 등 실험실 비품 정리 및 실험실을 청소한다.</div>
              <div class="note">※ 정리가 제대로 되지 않은 경우,<br>&nbsp;&nbsp;&nbsp;실험실 사용 제한 및 자기주도적 심화 프로젝트 점수 감점, 동아리 활동 제한</div></li>
            <li><u class="red"><b>실험실 사용 일지를 작성하고 제출</b></u>한 후 <u><b>퇴실</b></u>한다.</li>
          </ol>
        </td></tr>
      </table>
      <p class="pledge">본인은 상기 사용자 준수사항을 지킬 것을 서약하며, 내용과 같이 사용을 신청합니다.</p>
      <p class="pledge">${esc(fmt(d.applyDate || today, "date"))}</p>
      <p class="pledge">신청자 <span class="signline">${mirror(d, "users.0.name")}</span> ${SIG(d, "sign.applicant", "(자필서명)", "신청자")}</p>
      <label class="agree no-export"><input type="checkbox" data-k="agree" ${d.agree ? "checked" : ""}> 위 준수사항을 지킬 것을 서약합니다 (온라인 제출 시 필수)</label>
    </div>`;

    const reagents = (d.reagents && d.reagents.length ? d.reagents : [{}]).map((_, i) => {
      const k = (f) => `reagents.${i}.${f}`;
      return `
    <div class="a4">
      <button type="button" class="no-export rm-sheet" data-rm-reagent="${i}">이 조사서 삭제</button>
      <h1 class="t">시약 · 시액 조사서</h1>
      <div class="msds">
        <b>물질안전 보건자료(MSDS) 찾는 방법</b><br>
        1) ‘안전보건공단 화학물질정보 | 메인’ 접속<br>
        &nbsp;&nbsp;&nbsp;(<a href="https://msds.kosha.or.kr/MSDSInfo/" target="_blank" rel="noopener">https://msds.kosha.or.kr/MSDSInfo/</a>)<br>
        2) 통합 검색 &nbsp; 3) 찾고자 하는 화학물질 선택 &nbsp; 4) ‘MSDS 요약정보’ 선택
      </div>
      <table class="f l">
        <colgroup><col style="width:17%"><col style="width:16%"><col style="width:67%"></colgroup>
        <tr class="h11"><th colspan="2">1. 물질명</th><td>${I(d, k("name"), 'placeholder="예) 과망가니즈산 칼륨"')}</td></tr>
        <tr><th colspan="2">2. 유해성 및 위험성<br>&nbsp;(유해 및 위험 문구)</th><td>${T(d, k("hazard"), "36mm")}</td></tr>
        <tr><th rowspan="2">3. 응급조치<br>&nbsp;&nbsp;&nbsp;요령</th><th>1) 눈에<br>&nbsp;&nbsp;들어갔을 때</th><td>${T(d, k("eye"), "22mm")}</td></tr>
        <tr><th>2) 피부에<br>&nbsp;&nbsp;접촉했을 때</th><td>${T(d, k("skin"), "22mm")}</td></tr>
        <tr class="h8"><th rowspan="4">4. 물리화학적<br>&nbsp;&nbsp;&nbsp;성질</th><th>1) 냄새</th><td>${I(d, k("smell"))}</td></tr>
        <tr class="h8"><th>2) 녹는점</th><td>${I(d, k("melt"))}</td></tr>
        <tr class="h8"><th>3) 끓는점</th><td>${I(d, k("boil"))}</td></tr>
        <tr class="h8"><th>4) 인화점</th><td>${I(d, k("flash"))}</td></tr>
        <tr><th colspan="2">5. 안정성 및 반응성</th><td>${T(d, k("stability"), "17mm")}</td></tr>
        <tr><th colspan="2">6. 폭발 · 화재시 대처방법</th><td>${T(d, k("fire"), "17mm")}</td></tr>
        <tr><th colspan="2">7. 그 외 조사 내용</th><td>${T(d, k("etc"), "17mm")}</td></tr>
      </table>
    </div>`;
    }).join("");

    const plan = `
    <div class="a4">
      <h1 class="t">실험 계획서</h1>
      <table class="f">
        <colgroup><col style="width:11%"><col style="width:46%"><col style="width:7%"><col style="width:12%"><col style="width:12%"><col style="width:12%"></colgroup>
        <tr class="h9"><th>실험 제목</th><td>${I(d, "plan.title")}</td><th>학번</th>
          <td class="c">${mirror(d, "users.0.sid")}</td><td class="c">${mirror(d, "users.1.sid")}</td><td class="c">${mirror(d, "users.2.sid")}</td></tr>
        <tr class="h9"><th>일 시</th><td class="nw">${mirror(d, "date", "date")} ${I(d, "plan.period", 'class="w-period" placeholder="예) 8"')} 교시</td><th>이름</th>
          <td class="c">${mirror(d, "users.0.name")}</td><td class="c">${mirror(d, "users.1.name")}</td><td class="c">${mirror(d, "users.2.name")}</td></tr>
      </table>
      <div class="plan-box">
        <b>1. 연구 주제(제목)</b>${T(d, "plan.topic", "13mm")}
        <b>2. 준비물</b>${T(d, "plan.prep", "20mm")}
        <b>3. 주의사항</b>${T(d, "plan.caution", "20mm")}
        <b>4. 실험 과정</b>${T(d, "plan.steps", "92mm", 'placeholder="1) "')}
        <b>5. (예상)실험 결과</b>${T(d, "plan.result", "34mm")}
      </div>
    </div>`;
    return apply + reagents + plan;
  }

  // ---------------- 물품 구입 신청서 ----------------
  const ITEM_ROWS = 17;
  function purchaseSheet(d) {
    const rows = [...Array(ITEM_ROWS).keys()].map((i) => {
      const k = (f) => `items.${i}.${f}`;
      const it = (d.items || [])[i] || {};
      return `<tr>
        <td>${I(d, k("name"))}</td><td>${I(d, k("spec"))}</td>
        <td>${I(d, k("qty"), 'type="number" min="0" class="r"')}</td>
        <td>${I(d, k("price"), 'type="number" min="0" class="r"')}</td>
        <td class="r amt" data-amt="${i}">${won((+it.qty || 0) * (+it.price || 0))}</td>
        <td>${I(d, k("site"))}</td><td>${I(d, k("code"))}</td></tr>`;
    }).join("");
    return `
    <div class="a4 purchase">
      <h1 class="t bold">심화프로젝트 집중탐구 및 동아리 지원 물품 구입 신청서</h1>
      <table class="f thick">
        <colgroup><col style="width:58%"><col style="width:42%"></colgroup>
        <tr><td class="top" style="height:27mm"><b>실험 목적 및 내용:</b>${T(d, "purpose", "17mm")}</td>
            <td class="top"><b>신청자 학번 / 이름:</b><div class="pair">${I(d, "sid", 'inputmode="numeric" maxlength="5" placeholder="학번"')} / ${I(d, "name", 'placeholder="이름"')}</div>
              <div class="pair"><b>서명 :</b> ${SIG(d, "sign.applicant", "(서명)", "신청자")}</div></td></tr>
        <tr class="h11"><td class="nw"><b>사용예정일 :</b> ${I(d, "useDate", 'type="date" data-fmt="date" class="w-date"')}</td>
            <td class="nw"><b>지도교사 :</b> ${I(d, "teacher", 'class="w-teacher"')} <span class="in2">${SIG(d, "sign.teacher", "<b>(인)</b>", "지도교사")}</span></td></tr>
      </table>
      <table class="f thick items">
        <colgroup><col style="width:22%"><col style="width:17%"><col style="width:7.5%"><col style="width:12.5%"><col style="width:12.5%"><col style="width:10.5%"><col style="width:18%"></colgroup>
        <tr class="hd"><th>내용</th><th>규격</th><th>수량</th><th>예상단가</th><th>예상금액</th><th>사이트</th><th>상품코드번호</th></tr>
        ${rows}
      </table>
    </div>`;
  }

  // ---------------- 읽기 / 동기화 ----------------
  function readForm(root) {
    const data = {};
    root.querySelectorAll("[data-k]").forEach((el) => {
      set(data, el.dataset.k, el.type === "checkbox" ? el.checked : el.value.trim());
    });
    return data;
  }
  function syncMirrors(root) {
    const d = readForm(root);
    root.querySelectorAll("[data-mirror]").forEach((s) => (s.textContent = fmt(get(d, s.dataset.mirror), s.dataset.fmt)));
    let total = 0;
    root.querySelectorAll("[data-amt]").forEach((td) => {
      const it = (d.items || [])[td.dataset.amt] || {};
      const a = (+it.qty || 0) * (+it.price || 0);
      total += a; td.textContent = won(a);
    });
    return { data: d, total };
  }
  const filledItems = (d) => (d.items || []).filter((it) => it && (it.name || it.price));

  // ---------------- 서명 패드 ----------------
  // 손가락(휴대폰)·마우스로 서명 → 여백을 잘라낸 작은 PNG(data URL)로 돌려줌. 취소하면 null
  function openSignPad(who) {
    return new Promise((done) => {
      const back = document.createElement("div");
      back.className = "sigpad-back";
      back.innerHTML = `
        <div class="sigpad">
          <b>${esc(who)} 서명</b>
          <p class="muted small">아래 칸에 손가락이나 마우스로 서명하세요.</p>
          <canvas></canvas>
          <div class="actions">
            <button type="button" class="btn ghost sm" data-b="clear">지우기</button>
            <span style="flex:1"></span>
            <button type="button" class="btn ghost sm" data-b="cancel">취소</button>
            <button type="button" class="btn sm" data-b="ok">완료</button>
          </div>
        </div>`;
      document.body.appendChild(back);
      const cv = back.querySelector("canvas");
      const ratio = window.devicePixelRatio || 1;
      cv.width = cv.clientWidth * ratio; cv.height = cv.clientHeight * ratio;
      const g = cv.getContext("2d");
      g.scale(ratio, ratio); g.lineWidth = 2.6; g.lineCap = g.lineJoin = "round"; g.strokeStyle = "#111";
      let drawing = false, drawn = false, last = null;
      const pt = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      cv.addEventListener("pointerdown", (e) => { drawing = true; last = pt(e); try { cv.setPointerCapture(e.pointerId); } catch {} g.beginPath(); g.arc(last[0], last[1], 1.2, 0, 7); g.fillStyle = "#111"; g.fill(); drawn = true; });
      cv.addEventListener("pointermove", (e) => {
        if (!drawing) return;
        const p = pt(e); g.beginPath(); g.moveTo(...last); g.lineTo(...p); g.stroke(); last = p; drawn = true;
      });
      const stop = () => (drawing = false);
      cv.addEventListener("pointerup", stop); cv.addEventListener("pointercancel", stop);
      const close = (v) => { back.remove(); done(v); };
      back.addEventListener("click", (e) => {
        const b = e.target.dataset.b;
        if (b === "clear") { g.clearRect(0, 0, cv.width, cv.height); drawn = false; }
        if (b === "cancel") close(null);
        if (b === "ok") { if (!drawn) return alert("서명을 해 주세요."); close(trimSignature(cv)); }
      });
    });
  }
  function trimSignature(cv) {
    const { width: w, height: h } = cv;
    const px = cv.getContext("2d").getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    const sw = x1 - x0 + 1, sh = y1 - y0 + 1;
    const k = Math.min(1, 100 / sh, 300 / sw); // 최대 300×100 픽셀 (용량 작게)
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(sw * k)); out.height = Math.max(1, Math.round(sh * k));
    out.getContext("2d").drawImage(cv, x0, y0, sw, sh, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }
  // 신청서 화면의 서명 칸 누르기 → 서명 패드
  document.addEventListener("click", async (e) => {
    const box = e.target.closest && e.target.closest(".sig[data-sig]");
    if (!box || box.closest(".frozen,.export-holder")) return;
    const url = await openSignPad(box.dataset.who || "");
    if (!url) return;
    const inp = box.querySelector("input"), img = box.querySelector("img");
    inp.value = url; img.src = url; box.classList.add("has");
    inp.dispatchEvent(new Event("input", { bubbles: true })); // 임시저장
  });

  // ---------------- PDF ----------------
  const loaded = {};
  const loadScript = (src) => loaded[src] || (loaded[src] = new Promise((ok, no) => {
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("라이브러리를 불러오지 못했습니다")); document.head.appendChild(s);
  }));
  const LIB = {
    h2c: "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    exceljs: "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"
  };

  // 입력칸을 글자로 바꾼 복사본 (PDF에 입력칸 테두리·색이 찍히지 않게)
  function freeze(src) {
    const clone = src.cloneNode(true);
    clone.classList.add("frozen");
    const a = [...src.querySelectorAll("input,textarea,select")], b = [...clone.querySelectorAll("input,textarea,select")];
    a.forEach((el, i) => {
      if (el.type === "hidden") return b[i].remove(); // 서명 데이터 (이미지는 그대로 찍힘)
      const box = document.createElement(el.tagName === "TEXTAREA" ? "div" : "span");
      box.className = "fv " + (el.className || "");
      let val = el.type === "checkbox" ? (el.checked ? "☑" : "☐") : el.value;
      if (el.dataset.fmt) val = fmt(val, el.dataset.fmt);
      else if (el.type === "number") val = won(val);
      box.textContent = val;
      if (el.tagName === "TEXTAREA") box.style.height = el.style.height;
      b[i].replaceWith(box);
    });
    clone.querySelectorAll(".no-export").forEach((e) => e.remove());
    return clone;
  }

  async function sheetsToPDF(sheets, filename) {
    await Promise.all([loadScript(LIB.h2c), loadScript(LIB.jspdf)]);
    const holder = document.createElement("div");
    holder.className = "export-holder";
    document.body.appendChild(holder);
    try {
      const pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      for (let i = 0; i < sheets.length; i++) {
        const c = freeze(sheets[i]);
        holder.appendChild(c);
        const canvas = await window.html2canvas(c, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
        if (i) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);
        c.remove();
      }
      pdf.save(filename);
    } finally { holder.remove(); }
  }

  // 저장된 데이터로 양식을 화면 밖에 그려서 PDF로 (관리자용)
  async function dataToPDF(kind, data, filename) {
    const box = document.createElement("div");
    box.className = "export-holder";
    box.innerHTML = kind === "lab" ? labSheets(data) : purchaseSheet(data);
    document.body.appendChild(box);
    try { await sheetsToPDF([...box.querySelectorAll(".a4")], filename); } finally { box.remove(); }
  }

  // ---------------- 엑셀 (품목내역) ----------------
  // 학교 '물품 신청내역' 엑셀과 같은 열: 내용 | 규격 | 단위 | 수량 | 예상단가 | 예상금액 | 구입처 | 신청팀
  async function purchasesToXlsx(list, filename) {
    await loadScript(LIB.exceljs);
    const wb = new window.ExcelJS.Workbook();
    addPurchaseSheet(wb, list, "품목내역");
    await saveWorkbook(wb, filename);
  }
  async function saveWorkbook(wb, filename) {
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function addPurchaseSheet(wb, list, name) {
    const ws = wb.addWorksheet(name);
    const widths = [34, 20, 7.5, 7.5, 11, 11, 10, 16];
    ws.columns = widths.map((w) => ({ width: w }));
    const head = ["내용", "규격", "단위", "수량", "예상단가", "예상금액", "구입처", "신청팀"];
    ws.addRow(head);
    let row = 2;
    for (const p of list) {
      const items = filledItems(p);
      if (!items.length) continue;
      const start = row;
      let lastSite = "";
      const sites = items.map((it) => (lastSite = it.site || lastSite)); // 빈칸(배송비 등)은 위 구입처를 이어받음
      items.forEach((it, i) => {
        const qty = +it.qty || 0, price = +it.price || 0;
        ws.addRow([it.name, it.spec || "", it.unit || "개", qty, price, { formula: `D${row}*E${row}`, result: qty * price }, i === 0 || sites[i] !== sites[i - 1] ? sites[i] : null, i === 0 ? (p.team || p.name || "") : null]);
        row++;
      });
      let s = start;
      for (let r = start + 1; r <= row; r++) {
        if (r === row || sites[r - start] !== sites[s - start]) { if (r - 1 > s) ws.mergeCells(s, 7, r - 1, 7); s = r; }
      }
      if (row - 1 > start) ws.mergeCells(start, 8, row - 1, 8);
    }
    const total = list.reduce((a, p) => a + filledItems(p).reduce((b, it) => b + (+it.qty || 0) * (+it.price || 0), 0), 0);
    ws.addRow(["", "", "", "", "", { formula: row > 2 ? `SUM(F2:F${row - 1})` : "0", result: total }, "", ""]);
    const thin = { style: "thin" };
    ws.eachRow((r, n) => {
      r.height = 20;
      r.eachCell({ includeEmpty: true }, (c, col) => {
        if (col > 8) return;
        c.border = { top: thin, left: thin, bottom: thin, right: thin };
        c.font = { name: "맑은 고딕", size: 10, bold: n === 1 };
        c.alignment = { vertical: "middle", horizontal: n === 1 || col >= 7 || col === 3 || col === 4 ? "center" : col >= 5 ? "right" : "left", wrapText: true };
        if (col === 5 || col === 6) c.numFmt = "#,##0";
        if (n === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
      });
    });
  }

  // ---------------- 학년도 백업 엑셀 ----------------
  function addTable(wb, name, cols, rows) {
    const ws = wb.addWorksheet(name);
    ws.columns = cols.map(([, w]) => ({ width: w }));
    ws.addRow(cols.map(([h]) => h));
    rows.forEach((r) => ws.addRow(r));
    const thin = { style: "thin" };
    ws.eachRow((r, n) => r.eachCell({ includeEmpty: true }, (c) => {
      c.border = { top: thin, left: thin, bottom: thin, right: thin };
      c.font = { name: "맑은 고딕", size: 10, bold: n === 1 };
      c.alignment = { vertical: "top", wrapText: true };
      if (n === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    }));
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  const ST = { pending: "검토 중", approved: "승인", rejected: "반려" };
  const day = (ms) => (ms ? new Date(ms).toLocaleDateString("ko-KR") : "");
  const lines = (arr) => arr.filter(Boolean).join("\n");

  async function backupXlsx(y, data, filename) {
    await loadScript(LIB.exceljs);
    const wb = new window.ExcelJS.Workbook();
    const users = (r) => (r.users || []).filter((u) => u && (u.sid || u.name));
    addTable(wb, "실험실 신청", [["신청일", 11], ["상태", 8], ["실무사 메모", 18], ["신청팀", 14], ["사용일", 11], ["시간", 12], ["실험실", 13],
      ["사용 목적", 24], ["지도교사", 9], ["사용자(학번 이름)", 18], ["재료·기자재", 26], ["시약·시액 조사", 40], ["실험 계획서", 50]],
      data.requests.map((r) => [day(r.createdAt), ST[r.status] || r.status, r.adminNote, r.team, r.date, `${r.start}~${r.end}`, r.lab,
        r.purpose, r.teacher, lines(users(r).map((u) => `${u.sid} ${u.name}`)),
        lines((r.materials || []).filter((m) => m && m.name).map((m) => `${m.name}${m.spec ? ` (${m.spec})` : ""}${m.qty ? ` ×${m.qty}` : ""}`)),
        lines((r.reagents || []).filter((x) => x && x.name).map((x) => lines([`■ ${x.name}`, x.hazard && `유해성: ${x.hazard}`, x.eye && `눈: ${x.eye}`,
          x.skin && `피부: ${x.skin}`, [x.smell && `냄새 ${x.smell}`, x.melt && `녹는점 ${x.melt}`, x.boil && `끓는점 ${x.boil}`, x.flash && `인화점 ${x.flash}`].filter(Boolean).join(", "),
          x.stability && `안정성: ${x.stability}`, x.fire && `화재 시: ${x.fire}`, x.etc && `기타: ${x.etc}`]))),
        (() => { const p = r.plan || {}; return lines([p.title && `제목: ${p.title}`, p.period && `${p.period}교시`, p.topic && `연구 주제: ${p.topic}`,
          p.prep && `준비물: ${p.prep}`, p.caution && `주의사항: ${p.caution}`, p.steps && `실험 과정: ${p.steps}`, p.result && `예상 결과: ${p.result}`]); })()]));
    addTable(wb, "물품 신청 목록", [["신청일", 11], ["상태", 8], ["실무사 메모", 18], ["신청팀", 16], ["신청자", 14], ["지도교사", 9],
      ["실험 목적 및 내용", 30], ["사용예정일", 11], ["품목 수", 7], ["합계(원)", 11]],
      data.purchases.map((p) => [day(p.createdAt), ST[p.status] || p.status, p.adminNote, p.team, `${p.sid} ${p.name}`, p.teacher,
        p.purpose, p.useDate, filledItems(p).length, filledItems(p).reduce((a, it) => a + (+it.qty || 0) * (+it.price || 0), 0)]));
    addPurchaseSheet(wb, data.purchases, "물품 품목내역");
    addTable(wb, "이수시간 합계", [["학번", 8], ["학년", 6], ["반", 6], ["번호", 6], ["누적 시간", 10], [`목표(${S.targetHours}시간) 달성`, 14]],
      data.hours.map((h) => [h.sid, h.grade, h.cls, h.num, h.total, h.total >= S.targetHours ? "달성" : "미달"]));
    addTable(wb, "이수시간 내역", [["학번", 8], ["날짜", 11], ["활동", 30], ["시간", 7]],
      data.hours.flatMap((h) => (h.records || []).slice().sort((a, b) => a.date.localeCompare(b.date)).map((r) => [h.sid, r.date, r.activity, r.hours])));
    addTable(wb, "일정", [["종류", 11], ["제목", 34], ["시작", 17], ["종료", 17], ["상태", 16], ["안내", 30]],
      data.events.slice().sort((a, b) => a.start.localeCompare(b.start)).map((e) => [S.eventTypes[e.type]?.label || e.type, e.title,
        e.start.replace("T", " "), (e.end || "").replace("T", " "), S.eventStatus[e.status] || e.status, e.note || ""]));
    await saveWorkbook(wb, filename);
  }

  window.Forms = { labSheets, purchaseSheet, readForm, syncMirrors, sheetsToPDF, dataToPDF, purchasesToXlsx, backupXlsx, filledItems, fmt, won };
})();
