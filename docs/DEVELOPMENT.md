# 개발 및 운영 인계

## 구성과 편집 위치

외부 npm 패키지 없이 브라우저의 HTML/CSS/JavaScript, Node.js HTTP 서버 및 내장 SQLite를 사용합니다. 엑셀 변환에는 Python 표준 라이브러리만 사용합니다.

| 파일 | 역할 |
| --- | --- |
| `public/index.html` | 화면 구조, 문구, 요약 카드·필터·표·로그인 모달 |
| `public/styles.css` | 색상, 배치, 반응형 화면, 기록 체크박스 |
| `public/app.js` | API 호출, 로그인 상태, 필터·정렬·화면 렌더링·자동 저장 |
| `public/rating.js` | 난이도별 및 계정 전체 레이팅 계산 |
| `server/app.mjs` | HTTP 라우팅, 인증, 입력 검증, DB 스키마와 기록 저장 |
| `server/index.mjs` | 서버 시작, 환경변수, 종료 처리 |
| `scripts/import_data.py` | `Data.xlsx` → `data/catalog.json` 변환 |
| `scripts/build-pages.mjs` | 공개 자산만 포함한 Pages 정적 미리보기 빌드 |
| `.github/workflows/pages.yml` | `main` 푸시 시 검증·빌드·Pages 배포 |
| `tests/pages.test.mjs` | 배포 자산 범위·하위 경로·로컬 모드 유지 검증 |
| `tests/server.test.mjs` | 임시 DB와 로컬 HTTP 서버를 사용하는 통합 검증 |
| `tests/rating.test.mjs` | 개별 난이도·곡별 최고 기록·상위 50곡 레이팅 검증 |
| `start.ps1` | 실행 환경 탐색, 엑셀 변환, 서버 시작 |

`index.html`을 파일로 직접 여는 방식이 아니라 서버를 실행해 접속해야 계정·기록 API가 동작합니다. 정적 파일을 추가하면 `server/app.mjs`의 `assets` 경로 목록도 확장해야 합니다.

## 실행 명령과 환경변수

```powershell
# 엑셀 변환 후 서버 실행. 종료는 Ctrl+C.
.\start.ps1

# Node.js 24 이상과 Python 3이 PATH에 있는 경우
npm run sync-data
npm start

# 서버 코드 변경 감지
npm run dev

# 테스트
npm test
```

패키지 설치 과정은 필요하지 않습니다. `start.ps1`은 PATH의 Node.js 24 이상을 사용하며 필요할 때 현재 사용자의 Codex 번들 런타임을 찾습니다. Python도 번들 경로를 먼저 확인한 뒤 `python` 명령으로 대체합니다. Codex가 없는 환경에서는 Node.js 24 이상과 Python 3을 준비합니다.

| 환경변수 | 기본값 | 용도 |
| --- | --- | --- |
| `PORT` | `3000` | 1~65535 범위의 포트 |
| `BDON_DB_PATH` | 프로젝트의 `.local/bdon.sqlite` | 기본 DB와 분리된 개발·QA DB 경로 |

예를 들어 현재 PowerShell 세션에서 `$env:PORT = '3001'`과 `$env:BDON_DB_PATH = Join-Path $PWD '.local/dev.sqlite'`를 설정한 뒤 실행할 수 있습니다. 사용 후에는 필요에 따라 `Remove-Item Env:PORT` 및 `Remove-Item Env:BDON_DB_PATH`로 해당 세션의 설정을 해제합니다.

서버는 `127.0.0.1`에 바인딩됩니다. 카탈로그는 서버 시작 시 메모리로 읽으므로 엑셀을 변환한 다음 서버를 재시작해야 새 데이터가 반영됩니다. HTML/CSS/프런트엔드 JS 변경은 새로고침으로 확인합니다.

## 카탈로그 데이터 계약

`Data.xlsx`의 첫 행은 헤더입니다. importer가 읽는 열은 아래와 같습니다.

| 시트 | 열 | 의미 |
| --- | --- | --- |
| `Songs` | A / B / C | 곡 ID / 문자열 ID 참조 / 실제 밴드명 |
| `Songs` | D / E / F / G | Expert / Hard / Normal / Easy 레벨 |
| `Strings` | A / B / C | 문자열 ID / 원문 / 번역명 |

JSON의 `songs`는 `{ id, nameId, band, levels }`, `strings`는 `{ id, original, translated }` 배열입니다. 번역명은 비어 있으면 `null`이며 UI가 원문을 대체 표시합니다. `source`는 `Data.xlsx`, `generatedAt`은 변환 시각입니다. 재변환하면 실제 데이터 변경이 없어도 `generatedAt`이 변경됩니다.

곡 ID와 문자열 ID는 서로 다른 식별자입니다. 기존 ID는 변경하거나 다른 곡에 재사용하지 않습니다. 외부 서비스의 곡 ID와도 같은 번호라고 가정하지 않습니다. 현재 importer는 중복 ID·잘못된 문자열 참조·없는 밴드명·정수 범위를 벗어난 레벨을 거부합니다. 수식이 있다면 계산 결과 캐시가 필요하며 Python이 엑셀 수식을 다시 계산하지는 않습니다.

## 계정 및 기록 저장

| 테이블 | 주요 필드와 제약 |
| --- | --- |
| `users` | `id`, `username`, 고유한 `username_key`, `salt`, `password_hash`, `created_at` |
| `sessions` | `token_hash` 기본 키, `user_id`, `expires_at`(Unix 밀리초) |
| `records` | `(user_id, song_id, difficulty)` 복합 기본 키, `status`, `updated_at`(ISO 문자열) |

기록 난이도는 `expert`, `hard`, `normal`, `easy`, 상태는 `clear`, `fc`, `ap`입니다. 미기록은 DB 행이 없는 상태입니다. 클라이언트는 `${songId}:${difficulty}`를 키로 사용하는 Map을 구성합니다. 레이팅 결과는 DB에 저장하지 않고 카탈로그와 기록으로 계산합니다.

사용자 이름은 NFKC 정규화·앞뒤 공백 제거 후 저장하며 소문자 비교 키로 중복을 확인합니다. 비밀번호는 무작위 salt와 scrypt로 해싱합니다. 세션 원문은 쿠키에, SHA-256 해시는 DB에 저장합니다. 쿠키명은 `bdon_session`, 속성은 `HttpOnly; SameSite=Strict; Path=/`, 수명은 30일입니다. 로컬 HTTP용으로 `Secure`는 설정되어 있지 않습니다.

## HTTP API

응답은 JSON이며 오류는 `{ "error": "사용자에게 표시할 메시지" }` 형식입니다. 수정 요청에는 동일 출처 `Origin`이 필요합니다. JSON 본문은 `Content-Type: application/json`이며 최대 4096바이트입니다. `Host`는 실제 실행 포트의 `127.0.0.1` 또는 `localhost`만 허용합니다.

| 메서드 | 경로 | 입력 / 결과 |
| --- | --- | --- |
| GET | `/api/catalog` | 공개 카탈로그 반환 |
| GET | `/api/me` | `{ user: { id, username } }` 또는 `{ user: null }` |
| POST | `/api/register` | `{ username, password }`; 201, 로그인 쿠키 발급 |
| POST | `/api/login` | `{ username, password }`; 200, 로그인 쿠키 발급 |
| POST | `/api/logout` | 프런트엔드는 `{}` 전송; 세션 삭제, `{ ok: true }` |
| GET | `/api/records` | 로그인 필요; `{ records: [{ songId, difficulty, status, updatedAt }] }` |
| PUT | `/api/records/{songId}/{difficulty}` | 로그인 필요; `{ status: "clear" / "fc" / "ap" / null }`; 교체 또는 삭제 후 `{ record: { songId, difficulty, status, updatedAt } }` |

가입·로그인은 IP별 60초 동안 합계 20회까지 허용하는 메모리 제한을 사용합니다. 사용자 ID는 클라이언트 입력 대신 세션에서 결정합니다. 알려진 정적 자산만 제공하며 DB·엑셀·서버 소스는 HTTP로 제공하지 않습니다.

## 검증 방법

`npm test`는 임시 폴더와 DB를 만들고 테스트 후 정리합니다. 실제 `.local/bdon.sqlite`를 사용하지 않습니다. HTTP 통합 테스트에는 루프백 접속 권한이 필요합니다. 샌드박스에서 `connect EACCES 127.0.0.1`이 발생하면 환경의 네트워크 제한 여부를 확인합니다.

UI를 바꾼 경우 다음을 수동으로 확인합니다.

1. 비로그인 카탈로그 표시, 로그인 후 자동 저장, 로그아웃 후 기록 비표시.
2. 같은 행에서 상태 교체·해제, 난이도 탭 전환, 새로고침 후 기록 유지.
3. 레벨 정렬, 검색·필터, `기타` 선택 시 CRYCHIC 악곡 표시 및 실제 밴드명 유지.
4. 행 레이팅의 레벨 왼쪽 표시와 갱신, 요약 오른쪽의 전체 레이팅 및 집계 기준.
5. 데스크톱·모바일에서 체크박스 접근과 가로 넘침 여부.

## 클라우드 전환 인계

사용자 의도는 충분한 로컬 검증 후 배포하고, 계정 데이터를 Cloudflare에 저장하는 것입니다. 아래는 아직 구현하지 않은 후속 작업 목록입니다.

- Workers 등 실행 환경과 DB 이전 방법을 정하고, 현재 API 및 `(user_id, song_id, difficulty)` 제약을 보존합니다. D1을 선택하는 경우 현재 동기식 `node:sqlite` 접근을 대상 런타임에 맞게 교체하고 마이그레이션을 준비합니다.
- 현재 Host·Origin 제한과 CSP의 `connect-src 'self'`는 로컬·동일 출처 전용입니다. 실제 프런트엔드/API 주소에 맞춰 조정하고, HTTPS 세션 쿠키·CORS·CSRF·로그인 제한을 검증합니다.
- 프런트엔드는 사용자의 후속 요청에 따라 GitHub Pages 정적 미리보기로 구성했습니다. 자산은 상대 경로로 제공하며 API는 공개본에서 사용하지 않습니다. 실제 백엔드 연결 시 API 주소 처리가 필요합니다.
- DB 백업과 이전, 비밀번호 해시 호환성, 계정별 기록 격리, 로그아웃·만료 동작을 배포 대상에서 확인합니다. 로컬 DB를 저장소에 업로드하는 방식으로 이전하지 않습니다.
- UID 불러오기는 [별도 조사 문서](UID_API_RESEARCH.md)를 기준으로 실제 데이터 접근 방법과 곡 ID 대응표부터 검증합니다. UID 자체를 사이트 로그인 수단이나 계정 소유 증명으로 사용하지 않습니다.

Pages 자동 배포 workflow는 저장소에 포함되어 있습니다. Cloudflare 배포 설정과 클라우드 비밀값은 없습니다. Pages 초기 설정·운영 방법은 [배포 문서](DEPLOYMENT.md)를 참고합니다.
