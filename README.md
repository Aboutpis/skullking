# Skull King · 해적 테이블 v0.4.0

개인용 스컬킹 온라인 게임. **GitHub 소스 보관 + Cloudflare Pages 정적 배포 + 별도 Workers/SQLite Durable Objects 게임 서버**로 전환했습니다. Firebase SDK·배포 설정은 새 버전에서 제거했습니다. 기존 시계탑 프로젝트에는 접속하거나 변경하지 않았습니다.

**현재:** Pages에서 AI 연습 버전을 운영 중입니다. v0.4.0은 확정 시안을 참고한 해적 원화, 한 화면 테이블, 부채꼴 손패와 카드 이동을 적용한 UI 업데이트입니다. 온라인 Workers 배포는 아직 진행하지 않았습니다. 실제 스마트폰 터치감과 최종 디자인 평가는 사용자 확인이 필요합니다.

## v0.4.0 화면과 조작

- 테이블·상대 좌석·내 손패·제출 버튼을 동적 뷰포트 `100dvh` 한 화면에 고정합니다.
- 상대가 낸 카드는 해당 선원의 좌석 방향에 놓이고 이름을 표시합니다.
- 카드를 누르면 손패에서 들어 올립니다. **카드 내기**를 누르거나 카드를 위로 52px 이상 밀면 제출합니다.
- 티그리스는 잘못된 역할 제출을 막기 위해 스와이프 시 역할 선택 후 버튼 제출을 요구합니다.
- 자신의 카드는 손패 위치에서, 상대 카드는 그 좌석에서 테이블로 620ms 동안 이동합니다. 동작 줄이기 설정을 따릅니다.
- 채팅·규칙·전체 기록·AI 진행은 상단 메뉴와 옆 창에서 엽니다. 긴 규칙/결과만 해당 창 안에서 스크롤합니다.
- 10장 손패와 8인 좌석을 포함해 360×640, 390×780, 844×390, 1024×768 CSS 뷰포트에서 검증했습니다. 이는 실제 Android 기기 테스트와 구분됩니다.
- 새 그래픽도 해시 URL로 Pages가 직접 제공하며 게임 Worker는 거치지 않습니다.

## 무엇이 달라졌나

| 영역 | 경로/서비스 | 게임 서버 무료 한도 사용 |
|---|---|---|
| 앱 코드·카드·배경·추가 효과음 | Pages의 `dist/` 정적 파일 | 게임 Worker/DO를 호출하지 않음 |
| 기본 파일 캐시·업데이트 | 콘텐츠 해시 URL + Service Worker | 변경된 정적 파일만 Pages에서 받음 |
| 방 생성·참가 | 별도 Worker의 `/api/rooms` | 사용 |
| 배분·입찰·제출·판정·점수·AI·채팅 | 방별 SQLite Durable Object와 WebSocket | 사용 |
| 재접속 | 개인 토큰으로 자기 좌석·손패 복원 | 사용 |

Pages에는 Functions 디렉터리나 `_worker.js`가 없고, `_routes.json`은 모든 경로를 Functions에서 제외합니다. 게임 서버에는 정적 파일 바인딩·이미지 프록시가 없습니다. 두 앱은 별도 주소로 배포합니다. Pages 파일을 게임 서버 주소로 프록시하지 마세요.

## 바로 AI 연습

- `web/play.html`은 독립 실행본입니다. 브라우저가 로컬 JavaScript를 허용하면 인터넷 서버 없이 AI 연습을 할 수 있습니다.
- Android 파일 미리보기에서 실행이 차단되면 Pages에 배포한 주소를 사용하세요.
- `AI와 연습하기 → AI 3명 → 항해 시작`. AI 2명은 3인 플레이이며 전체 인원 3~8명으로 시작합니다.
- 0~3 AI 선택, AI 자동/한 수 진행, 카드 선택 후 제출, 티그리스 역할 선택, 트릭 판정 예제·기록·점수 분해 표시를 유지합니다.
- 숫자 4무늬와 특수 카드 8종에 해적풍 원화를 적용했습니다. 숫자와 무늬 기호는 HTML로 표시해 작아도 구분되게 합니다. `docs/approved-design.png`는 원본 시안입니다.

## 현재 배포 연결 상태와 다음 단계

- 저장소: `Aboutpis/skullking`, Public, `main`
- 기존 Pages 프로젝트: `aboutpis-skullking`
- 앱 주소: https://aboutpis-skullking.pages.dev
- 기존 GitHub Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`를 그대로 사용
- 기존 토큰은 Pages 배포 전용. 이 버전의 배포 workflow는 Worker 배포를 시도하지 않음

이미 만들어진 Pages 프로젝트와 계정을 다시 만들지 않습니다. 이 소스를 기존 저장소 루트에 반영합니다. `package.json`, `web`, `server`, `shared`, `.github`가 저장소 루트에 있어야 합니다. ZIP 자체만 올리면 게임이 배포되지 않습니다.

## 배포 A: 기존 GitHub Actions → Pages 유지

`.github/workflows/deploy.yml`을 기존 파일과 교체합니다. `main`에 저장하면 다음 순서로 진행합니다.

1. Node 22 + `npm ci`
2. `npm run check`, `npm test`
3. `npm run build`
4. `pages deploy dist --project-name=aboutpis-skullking --branch=main`

기존 `public` 배포를 `dist` 배포로 바꾸고, 연결 확인용 페이지 자동 생성은 제거했습니다. 새 프레임워크를 도입하지 않습니다. Pages 콘솔의 Git 직접 빌드나 별도 프로젝트를 추가할 필요가 없습니다. 원래 사용하던 두 Secrets 이름을 유지합니다.

Actions의 **Deploy Pages**가 성공한 뒤 기존 앱 주소를 열면 **AI와 연습하기 → AI 3명 → 항해 시작**으로 테스트할 수 있습니다. AI 연습은 기기 안에서 실행되므로 게임 Worker를 호출하지 않습니다. 실시간 방은 서버 배포 전까지 연결되지 않습니다.

이번 단계에서 유료 플랜 변경, 결제수단 등록, Firebase 접속은 수행하지 않습니다. 무료 한도에 도달하면 제한을 허용하며, 자동 유료 전환을 설정하지 않습니다. 계정 플랜 상태 자체는 실제 Cloudflare 대시보드에서 확인해야 합니다.

## 배포 B: 별도 Cloudflare Worker + Durable Object

`server/wrangler.jsonc`의 `ALLOWED_ORIGINS`에 **실제 Pages 주소**를 넣습니다. 끝의 `/`는 빼고, 여러 주소는 쉼표로 구분합니다. 현재 값에 `https://aboutpis-skullking.pages.dev`가 이미 등록되어 있습니다. 미리보기 배포 주소는 허용하지 않으며, 다른 주소를 사용한다면 명시적으로 추가해야 합니다.

```json
"vars": {"ALLOWED_ORIGINS":"https://실제-앱-주소.pages.dev"}
```

### PC 또는 개발 터미널

```bash
npm ci
npx wrangler login
npm test
npm run build
npm run test:server
npm run deploy:server
```

`skullking-game-server`라는 별도 Worker와 `SkullRoom` SQLite Durable Object를 배포합니다. SQLite 클래스 생성 마이그레이션이 설정되어 있어 무료 플랜에서 사용하는 구조입니다. 이 Worker에 Pages 앱 전체를 연결하는 와일드카드 도메인 경로를 추가하지 마세요.

### 스마트폰에서 Git 연결 배포

Cloudflare에서 같은 저장소를 연결하는 **Worker 프로젝트**를 별도로 만듭니다. Worker 이름은 `skullking-game-server`로 맞춥니다. 저장소 루트에서 다음 명령을 사용합니다.

- Build command: 비워두거나 검증용 `npm run check`
- Deploy command: `npx wrangler deploy --config server/wrangler.jsonc`

Cloudflare 빌드 환경의 의존성 자동 설치를 사용합니다. 실제 대시보드에서 설정명/옵션이 달라 보이면 배포 로그와 화면을 기준으로 확인하세요. `server/index.mjs`만 웹 편집기에 붙여넣으면 상대 경로의 공유 엔진이 없어 실행되지 않습니다. Git 빌드 또는 CLI로 배포하세요.

## 배포 C: 두 주소 연결

Worker 배포 결과의 실제 기본 주소를 `web/server-config.json`에 기록합니다.

```json
{"apiBase":"https://실제-게임서버.실제-계정.workers.dev"}
```

GitHub에 저장하면 Pages가 다시 빌드합니다. 실제 Pages 주소에서 방을 만들고 다른 브라우저/기기가 참가합니다. 설정 파일을 아직 수정하지 못했다면 앱의 `온라인 연결 설정`에 같은 Worker 주소를 각 기기에서 입력해 임시 사용해도 됩니다. 저장된 수동 서버 주소가 있으면 그 기기에서는 수동 값이 우선합니다.

사이트를 여러 번 바꿔 배포하면 브라우저별 좌석 정보도 별도 취급됩니다. 항상 같은 Pages 주소와 같은 브라우저로 돌아오세요. 좌석 토큰을 URL·채팅·로그에 넣지 않으며, 브라우저 사이트 데이터를 삭제하면 좌석을 복구할 수 없습니다. 방 코드는 공개 초대 수단이므로 아는 사람에게만 공유합니다.

## 저전송 설계

- 서버가 각 참가자의 비공개 뷰를 만든 뒤, 이전 버전과 달라진 필드만 압축된 키/카드 번호로 전송합니다.
- 손패는 본인에게만 전송합니다. 미공개 입찰은 값 대신 제출 여부만 보입니다.
- 트릭 기록과 라운드 결과는 새 항목만 추가합니다. 채팅 60개 한도가 차면 오래된 항목 삭제 수와 새 메시지만 보냅니다.
- 상시 폴링이나 초 단위 타이머 동기화가 없습니다. 화면 복귀/네트워크 복구 때만 연결을 확인합니다.
- WebSocket Hibernation API를 쓰며 서버에 `setInterval`이나 장시간 대기 타이머가 없습니다. 필요할 때의 ping/pong은 native auto response를 사용합니다.
- 마지막 게임 행동 이후 48시간이 지나면 방 데이터를 정리합니다. 백그라운드 앱의 무한 새로고침을 만들지 않습니다.
- 재접속할 때는 현재 비공개 상태를 한 번 받습니다. 그 후 다시 변경분만 받습니다.

## 캐시와 그래픽 다운로드

`dist/assets`의 파일명에는 콘텐츠 해시가 있습니다. 동일 파일은 1년 immutable 캐시를 사용하고, Service Worker는 새 버전 설치 시 기존 캐시의 같은 파일을 재사용합니다. 바뀐 파일과 작은 HTML/설정/버전 확인 파일만 다시 요청합니다. 해당 요청도 Pages 정적 요청이며 게임 서버를 실행하지 않습니다.

브라우저가 저장 공간을 정리하거나 사용자가 사이트 데이터를 삭제하면 그래픽을 다시 받을 수 있습니다. 그 경우에도 Pages에서 직접 제공하며 게임 Worker·DO를 경유하지 않습니다. 최초 캐시 설치/업데이트는 HTTPS Pages에 배포한 뒤 실제 기기에서 최종 검증해야 합니다. Google Fonts를 사용하는 현재 CSS의 폰트는 Google 정적 서버에서 제공하며 게임 서버를 거치지 않습니다.

## 실제 로컬 테스트와 측정

```bash
npm ci
npm test
npm run build
npm run check
npm run test:server
```

- 규칙/비공개/압축 전송/정적 분리/캐시 변경 테스트 33개
- Cloudflare workerd 통합 테스트 4개: HTTP·WebSocket, 개인 손패, 비공개 입찰, 권한, 중복 명령, 재접속, 서버 재시작 복구, 실제 프런트엔드 연결 클래스, 서버 AI
- 실제 규칙 엔진으로 서로 다른 100게임 및 옵션 16게임 자동 진행
- 4인·6인 WebSocket 전체 게임 측정 결과: `docs/LOCAL_MEASUREMENTS.json`

이 파일의 바이트는 **앱 메시지 본문**입니다. 초기 HTTP 본문·헤더, WebSocket/TCP/TLS 부가량, 압축 효과, 정적 그래픽 다운로드, 운영 서버의 과금 CPU/GB-s를 포함하지 않습니다. 로컬 실시간 게임을 빠르게 자동 진행한 측정이며 1시간 플레이를 재현한 테스트가 아닙니다. 빠른 부하 테스트는 로컬 실행의 메시지 속도 제한만 1000건/10초로 올렸고, 배포 기본값은 45건/10초입니다.

방장은 게임 화면의 `방 사용량 확인`으로 메시지·앱 바이트·SQL 쓰기 횟수·현재 상태 크기를 확인할 수 있습니다. 이는 서비스 제공자의 청구 집계와 동일하지 않습니다. 실제 계정의 Workers 요청·CPU, DO 요청·duration, SQLite read/write/storage는 Cloudflare 대시보드에서 별도로 확인해야 합니다.

## 무료로 가능한 판수

정적 다운로드를 게임 서버 한도에서 분리한 것은 구조 및 빌드 테스트로 확인했습니다. 그러나 무료 한도는 단순한 월 MB가 아니므로 `10GB ÷ 한 판 용량`으로 월 판수를 정하지 않습니다.

실서비스 배포 후:

1. 다른 게임 트래픽이 없는 상태에서 6인 정상 속도 3~5판을 진행합니다.
2. 게임 전후의 Workers 요청/CPU, DO 요청/duration, SQLite read/write, 저장량을 비교합니다.
3. 각각 `남은 일일 무료 한도 ÷ 1판당 사용량`을 계산하고, 가장 작은 값에 여유를 둡니다.
4. 일별 플레이 분포와 같은 계정의 다른 서비스 사용량을 반영합니다.

현재는 실서비스 무료 판수를 보장하지 않습니다. 단순한 앱 전송량으로는 월 300판이면 이번 6인 측정값의 약 300배이며, 정적 그래픽은 게임 서버 지표에 포함시키지 않습니다. 무료 플랜의 파일 크기·빌드 횟수·요청·실행·저장소 제한 자체가 없어지는 것은 아닙니다.

## 규칙과 디자인 범위

v0.2.0 규칙 엔진을 유지했습니다. 기본 70장 + 흰고래/크라켄/전리품, 기본/Rascal 점수, 3~8인, AI 최대 3명, 동점 연장전을 포함합니다. 해적 고유 능력·별도 확장팩·2인 Graybeard 규칙은 제외합니다.

공식 FAQ와 현재 영문 룰북의 중간 바다괴물 등장 후 무늬 유지 설명이 달라 선택 옵션으로 명시했습니다. 흰고래 숫자 없는 트릭의 선공·14 보너스 적용은 기존 검증판의 기준을 유지합니다. 모든 판본과 완전히 동일하다는 뜻은 아닙니다. 공식 규칙: https://www.grandpabecksgames.com/pages/skull-king

어두운 남색·금색·원목·양피지 테마와 원본 시안은 유지했습니다. 시안 기반 카드 원화·랜턴 테이블·달빛 해적선 배경을 적용했습니다. 공식 카드의 인쇄 원본을 복제하지 않았으며, 효과음은 이번 버전에 추가하지 않았습니다.

## 남은 검증

- 실제 Cloudflare 계정 배포, 3대 이상 스마트폰/태블릿 동시 테스트
- HTTPS에서 최초 다운로드·재방문·업데이트 시 네트워크/캐시 검증
- 운영 CPU/DO duration 및 무료 판수 계산
- 방장 위임, 참가자 퇴장/강퇴, 접속 정보 삭제 후 좌석 복구 정책
- 개인용 방을 넘어 공개 운영할 경우 별도의 가입/초대·악용 방지 정책

Pages 배포 전용 토큰에 Workers 권한을 자동 추가하지 않습니다. 별도 서버 배포 권한은 온라인 연결 단계에서 준비해야 합니다.

태그: `v0.4.0-pirate-table`. 이전 Firebase 버전은 Git 이력과 태그에 남아 있습니다. GitHub에는 이 소스만 업로드하고 `history.bundle`은 이력 복원용으로 별도 보관하세요.

## 공식 기술 문서

- 정적 요청 분리: https://developers.cloudflare.com/pages/functions/routing/
- 정적 요청 가격: https://developers.cloudflare.com/pages/functions/pricing/
- WebSocket Hibernation: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- SQLite 계측: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- 무료 한도/과금: https://developers.cloudflare.com/durable-objects/platform/pricing/
