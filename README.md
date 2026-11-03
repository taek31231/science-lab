# 과학중점 과학실 예약 · 이수시간 사이트

과학정보부 과학실무사 업무용 웹사이트입니다. 빌드 도구 없이 HTML/CSS/JS만으로 동작하며, GitHub Pages에 그대로 올릴 수 있습니다.

## 기능

| 구분 | 학생 (로그인 없음) | 과학실무사 (관리자 로그인) |
|---|---|---|
| 일정 캘린더 | 승인된 실험실 사용, 천체관측·과학행사 보기 | — |
| 실험실 사용 신청 | 학교 A4 양식 3종(신청서·시약·시액 조사서·실험 계획서) 작성 → PDF 저장 / 온라인 제출 | 승인/반려 + 메모, 겹침 경고, 제출된 신청서 PDF 저장 |
| 물품 구입 신청 | 학교 A4 양식 작성 → PDF·엑셀 저장 / 온라인 제출 | 여러 팀 선택 → 학교 '물품 신청내역' 형식 엑셀 한 파일로 내보내기 |
| 신청 결과 조회 | 팀명(동아리명)으로 승인/반려와 실무사 메모 확인 (이름·학번은 표시 안 됨) | — |
| 행사 · 천체관측 | 홈 화면 공지에 "예정 / 시행 확정 / 취소" 표시 | 일정 등록, 상태 즉시 변경 (날씨 대응) |
| 이수시간 | 학번 5자리로 누적 시간·내역·40시간 달성률 확인 | 학번 여러 개 붙여넣기로 일괄 부여, 전체 현황 |

## 파일 구성

```
index.html        페이지 뼈대 (메뉴)
css/style.css     디자인
js/config.js      ★ Firebase 설정, 학교명, 실험실 목록, 목표시간 등
js/store.js       데이터 저장 (Firebase 또는 데모용 브라우저 저장)
js/forms.js       A4 양식, PDF 저장, 엑셀(품목내역) 저장
js/app.js         각 화면
firestore.rules   ★ 보안 규칙 (Firebase 콘솔에 붙여넣기)
```

`js/config.js`의 `apiKey`가 비어 있으면 **데모 모드**로 동작합니다(데이터는 그 브라우저에만 저장). `index.html`을 더블클릭해서 바로 볼 수 있습니다.

## Firebase 연결 (관리자 계정)

1. https://console.firebase.google.com 에서 프로젝트 만들기 (Google Analytics는 꺼도 됨)
2. **빌드 > Firestore Database** → 데이터베이스 만들기 (위치: `asia-northeast3 (서울)`, 프로덕션 모드)
3. **Firestore > 규칙** 탭에 `firestore.rules` 내용 붙여넣고 게시
4. **빌드 > Authentication** → 시작하기 → 로그인 방법에서 **이메일/비밀번호** 사용 설정
5. **Authentication > 사용자** → 사용자 추가 (실무사 이메일/비밀번호) → 생성된 **사용자 UID** 복사
6. **Firestore > 데이터** → 컬렉션 `admins` 생성 → 문서 ID에 위 UID 붙여넣기 → 필드 아무거나 하나 (예: `name` = `과학실무사`)
7. **프로젝트 설정(톱니바퀴) > 내 앱 > 웹 앱 추가(</>)** → 표시되는 `firebaseConfig` 값을 `js/config.js`에 붙여넣기
8. **Authentication > 설정 > 승인된 도메인**에 `<GitHub아이디>.github.io` 추가

> 관리자 계정을 늘리려면 5~6번만 반복하면 됩니다. 학생은 계정이 필요 없습니다.
> 무료(Spark) 요금제로 충분합니다 (하루 읽기 5만 회 / 쓰기 2만 회).

## GitHub Pages로 공개

1. GitHub에서 새 저장소 만들기 (예: `science-lab`, Public)
2. 이 폴더의 파일을 모두 업로드 (Git이 없으면 저장소 화면의 **Add file > Upload files**로 끌어다 놓기)
3. 저장소 **Settings > Pages** → Source: `Deploy from a branch`, Branch: `main` / `(root)` → Save
4. 1~2분 뒤 `https://<GitHub아이디>.github.io/science-lab/` 주소로 접속

## 학번 규칙

5자리: 학년(1) + 반(2) + 번호(2). 예) `20315` = 2학년 3반 15번. 다르면 `js/store.js`의 `parseSid`를 수정합니다.
