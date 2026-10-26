# 개발 및 운영 인계

현재 구현 기준은 밴드 로고 적용 커밋 `c5126c6`입니다. 다음 작업 시작 시 **앨범 재킷 포함 여부 검토**와 **레이팅 계산값 2배 변경(직관성 패치)**을 먼저 안내합니다. 두 항목은 아직 미적용이며 [다음 작업 메모](NEXT_STEPS.md)에 구현 범위·검증 예시가 있습니다. 이번 변경은 문서 정리입니다.

## 구성과 편집 위치

기존 로컬 버전은 외부 npm 패키지 없이 HTML/CSS/JavaScript, Node.js HTTP 서버 및 내장 SQLite를 사용합니다. 엑셀 변환에는 Python 표준 라이브러리만 사용합니다. 개발·검증에는 lockfile로 고정한 Wrangler·Miniflare·esbuild·jsdom을 사용하며 Node.js 24.15 이상에서 `npm ci`로 설치합니다.

| 파일 | 역할 |
| --- | --- |
| `AGENTS.md` | 새 작업·새 세션 시작 시 HANDOFF·다음 작업 메모를 읽고 안내하는 규칙 |
| `docs/NEXT_STEPS.md` | 앨범 재킷 검토·레이팅 2배 변경의 미적용 메모와 검증 항목 |
| `public/index.html` | 화면 구조, 문구, 요약 카드·필터·표·로그인 모달 |
| `public/styles.css` | 색상, 배치, 반응형 화면, 기록 체크박스 |
| `public/app.js` | API 호출, 로그인 상태, 필터·정렬·화면 렌더링·편집 모드와 일괄 저장 |
| `shared/record-changes.mjs` | 일괄 변경 검증 및 Node·D1 공통 JSON SQL |
| `public/rating.js` | 난이도별 레이팅, 곡별 최고 차트·상위 50곡 내역과 계정 합계 계산 |
| `server/app.mjs` | HTTP 라우팅, 인증, 입력 검증, DB 스키마와 기록 저장 |
| `server/index.mjs` | 서버 시작, 환경변수, 종료 처리 |
| `scripts/import_data.py` | `Data.xlsx` → `data/catalog.json` 변환 |
| `scripts/build-pages.mjs` | 공개 자산만 포함한 Pages 정적 미리보기 빌드 |
| `.github/workflows/pages.yml` | `main` 푸시 시 검증·빌드·Pages 배포 |
| `tests/pages.test.mjs` | 배포 자산 범위·하위 경로·로컬 모드 유지 검증 |
| `tests/server.test.mjs` | 임시 DB와 로컬 HTTP 서버를 사용하는 통합 검증 |
| `tests/rating.test.mjs` | 개별 난이도·곡별 최고 기록·상위 50곡 레이팅 검증 |
| `start.ps1` | 실행 환경 탐색, 엑셀 변환, 서버 시작 |
| `worker/index.mjs` | Workers HTTP API, D1 저장, HTTPS 세션, 만료 자료 정리 Cron |
| `wrangler.jsonc` | Workers·D1·정적 자산·Cron 연결 설정 |
| `migrations/0001_accounts.sql` | 새 D1용 계정·세션·기록·로그인 제한 테이블 |
| `scripts/build-worker.mjs` | CLOUD MODE 화면을 `dist-worker/`에 준비 |
| `tests/worker.test.mjs` | 실제 Workers 런타임·임시 D1 통합 검증 |
| `tests/editor.test.mjs` | 프런트엔드 jsdom 편집·취소·일괄 저장·실패 복구 검증 |
| `tests/batch-contract.mjs` | Node·D1 공통 일괄 저장 계약과 원자성 검증 |

`index.html`을 파일로 직접 여는 방식이 아니라 서버를 실행해 접속해야 계정·기록 API가 동작합니다. 정적 파일 추가 시 로컬 서버와 배포 빌드의 허용 목록을 함께 점검합니다. 아래 아이콘 교체 인계를 참고합니다.

## 현재 테마

`public/styles.css`의 `:root`에서 네이비·블루 팔레트를 관리합니다. 배경 `--bg: #0c1424`, 패널 `--surface: #14233b`, 강조 글자 `--accent: #8fb8ee`, 버튼 바탕 `--accent-solid: #315c96`, 버튼 hover `--accent-hover: #3e70b0`, 버튼 글자 `--on-accent: #f4f8ff`입니다. 글자 강조와 버튼 배경의 변수를 구분해 어두운 버튼에서 글자가 묻히지 않게 합니다. AP는 `#9daef5`, FC는 라벤더, 클리어는 하늘색입니다. HTML의 theme-color와 favicon도 블루로 맞춰져 있습니다.

<a name="다음-ui-작업-곡-앞-아이콘-교체"></a>

## 곡 앞 밴드 로고

사용자가 제공한 5개 밴드 로고를 악곡 목록에 적용했습니다. 제공된 WebP 파일 모두 RGBA 투명 배경이 포함되어 있어 이미지 재생성·배경 재처리 없이 원본을 그대로 복사했습니다. 웹에서 사용하는 원본은 `public/band-logos/`에 보관합니다.

| 실제 밴드명 | 로고 파일 |
| --- | --- |
| MyGO!!!!! | `public/band-logos/mygo.webp` |
| Ave Mujica | `public/band-logos/avemujica.webp` |
| 무겐다이 뮤타입 | `public/band-logos/ymmt.webp` |
| millsage | `public/band-logos/millsage.webp` |
| 일가 Dumb Rock! | `public/band-logos/dr.webp` |

`public/app.js`의 `bandLogos`가 실제 밴드명으로 이미지 파일을 연결하고 `renderSongs()`가 상대 경로 `./band-logos/...`를 렌더링합니다. 원본 밴드명과 곡·문자열 ID는 변경하지 않았습니다. 로고가 제공되지 않은 CRYCHIC은 기존 CC 아이콘을 유지하며 필터에서는 계속 기타로 분류합니다. 헤더 캐릭터 이미지 `public/brand-icon.webp`는 별도입니다.

`public/styles.css`의 `.track-art.band-logo-frame`은 흰 바탕, `--accent` 블루 2px 테두리, 둥근 모서리를 사용합니다. 데스크톱 액자는 112×56px, 모바일은 84×42px입니다. `object-fit: contain`으로 로고 전체와 비율을 보존합니다. 모바일에서는 로고를 숨기지 않고 곡명 위에 배치합니다. 기존 장식 원은 로고 액자에서 제거했습니다.

이미지 추가·교체 시 다음 위치를 함께 점검합니다.

- `public/app.js`: 밴드별 파일 매핑과 상대 경로
- `server/app.mjs`: Node 정적 경로 허용 목록과 WebP MIME
- `scripts/build-pages.mjs`: 로고 폴더·파일 허용 목록과 복사 로직. 기본 공개 파일 7개와 로고 5개, 총 12개를 빌드하며 로고 폴더 내부의 예상하지 않은 파일도 거부합니다.
- `scripts/build-worker.mjs`: Pages 빌드를 재사용하므로 같은 로고가 Workers 출력에도 포함됩니다.
- `tests/pages.test.mjs`, `tests/server.test.mjs`, `tests/worker.test.mjs`: 빌드의 로고 원본 보존, 미허용 파일 거부와 실제 HTTP 제공을 검증합니다.

PC·모바일에서 흰 바탕과 테두리, 비율 보존, 검색·필터·정렬 후 밴드 대응과 로딩을 확인합니다. 편집·저장·취소와 레이팅 상세 보기는 기존 동작을 유지합니다.

## 레이팅 상세 보기

현재 차트 점수는 `레벨 × 기록 계수`이며 2배 변경 전입니다. 후속 패치에서는 행별 점수·전체 합계·상세 목록을 함께 변경하고 이 절의 적용 공식과 관련 테스트 기대값도 갱신합니다.

요약 레이팅 옆 `#rating-details-button`은 로그인 후 활성화되며 `#rating-dialog`를 엽니다. `public/rating.js`의 `getRatingBreakdown(songs, records)`가 `{ total, entries }`를 반환하고 메인 합계와 상세 목록이 이를 함께 사용합니다. 각 entry는 `songId`, `difficulty`, `level`, `status`, `rating`을 가집니다. 한 곡에서 최고 점수의 차트 하나만 선택해 점수 내림차순으로 최대 50개를 반환합니다. 차트 동점은 카탈로그 난이도 순서(현재 Expert 우선), 곡 동점은 카탈로그 곡 순서를 유지합니다. 합계는 기존처럼 100분의 1 정수 점수로 계산해 합산 오차를 피합니다. `calculateRating()`은 같은 함수의 total을 반환하는 호환 함수입니다.

상세 보기는 브라우저의 전체 기록 Map으로 계산하므로 검색·밴드·기록 필터·선택 난이도와 무관하고 추가 통신이 없습니다. 기록이 없으면 빈 상태를, 50곡 미만이면 실제 반영된 곡만 보여줍니다. 편집 중에는 임시 기록으로 계산한다는 안내가 표시되며 취소·저장 후 최신 상태로 열립니다. 로그아웃 시 상세 데이터도 지웁니다. PC·모바일·가로 화면에서 목록 영역만 스크롤하고, 닫기 및 Escape로 종료하면 상세 보기 버튼으로 초점이 복귀합니다.

자동 테스트는 상위 50곡 경계·동점·중복 차트·미기록 제외·합계 일치, 검색·난이도 독립성, 임시 편집·취소·빈 계정과 추가 통신 없음을 검증합니다. 이 기능에 API 또는 DB migration은 추가하지 않았습니다.

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

기존 로컬 서버 실행에는 패키지 설치 과정이 필요하지 않습니다. 전체 테스트와 Workers 개발에는 `npm ci`를 먼저 실행합니다. `start.ps1`은 PATH의 Node.js 24 이상을 사용하며 필요할 때 현재 사용자의 Codex 번들 런타임을 찾습니다. Python도 번들 경로를 먼저 확인한 뒤 `python` 명령으로 대체합니다. Codex가 없는 환경에서는 Node.js 24 이상과 Python 3을 준비합니다.

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

응답은 JSON이며 오류는 `{ "error": "사용자에게 표시할 메시지" }` 형식입니다. 수정 요청에는 동일 출처 `Origin`이 필요합니다. JSON 본문은 `Content-Type: application/json`이며 기본 최대 4096바이트, 일괄 저장만 최대 1MiB입니다. `Host`는 실제 실행 포트의 `127.0.0.1` 또는 `localhost`만 허용합니다.

| 메서드 | 경로 | 입력 / 결과 |
| --- | --- | --- |
| GET | `/api/catalog` | 공개 카탈로그 반환 |
| GET | `/api/me` | `{ user: { id, username } }` 또는 `{ user: null }` |
| POST | `/api/register` | `{ username, password }`; 201, 로그인 쿠키 발급 |
| POST | `/api/login` | `{ username, password }`; 200, 로그인 쿠키 발급 |
| POST | `/api/logout` | 프런트엔드는 `{}` 전송; 세션 삭제, `{ ok: true }` |
| GET | `/api/records` | 로그인 필요; `{ records: [{ songId, difficulty, status, updatedAt }] }` |
| PUT | `/api/records` | 로그인 필요; `{ records: [{ songId, difficulty, status }] }`; 변경분 일괄 반영 후 `{ ok: true }` |
| PUT | `/api/records/{songId}/{difficulty}` | 로그인 필요; `{ status: "clear" / "fc" / "ap" / null }`; 교체 또는 삭제 후 `{ record: { songId, difficulty, status, updatedAt } }` |

가입·로그인은 IP별 60초 동안 합계 20회까지 허용하는 메모리 제한을 사용합니다. 사용자 ID는 클라이언트 입력 대신 세션에서 결정합니다. 알려진 정적 자산만 제공하며 DB·엑셀·서버 소스는 HTTP로 제공하지 않습니다.

## 검증 방법

`npm test`는 임시 폴더와 DB를 만들고 테스트 후 정리합니다. 실제 `.local/bdon.sqlite`를 사용하지 않습니다. HTTP 통합 테스트에는 루프백 접속 권한이 필요합니다. 샌드박스에서 `connect EACCES 127.0.0.1`이 발생하면 환경의 네트워크 제한 여부를 확인합니다.

UI를 바꾼 경우 다음을 수동으로 확인합니다.

1. 비로그인 카탈로그 표시, 로그인 후 편집·저장·취소, 로그아웃 후 기록 비표시.
2. 같은 행에서 상태 교체·해제, 난이도 탭 전환, 새로고침 후 기록 유지.
3. 레벨 정렬, 검색·필터, `기타` 선택 시 CRYCHIC 악곡 표시 및 실제 밴드명 유지.
4. 행 레이팅의 레벨 왼쪽 표시와 갱신, 요약 오른쪽의 전체 레이팅 및 집계 기준.
5. 데스크톱·모바일에서 체크박스 접근과 가로 넘침 여부.

### 편집 모드와 일괄 저장

로그인 후 `기록 편집`을 누르면 저장 당시 Map을 복사해 기준값으로 보관합니다. 체크는 화면의 Map만 수정하고 요약·레이팅·행을 즉시 다시 계산합니다. `저장`은 모든 난이도에서 기준값과 다른 항목만 한 번의 `PUT /api/records`로 전송합니다. 여러 번 바꾼 항목은 최종 상태만 보내고, 원래대로 되돌린 항목은 보내지 않습니다. 빈 변경분과 취소는 HTTP 요청을 만들지 않습니다.

저장 성공 시 편집을 종료하고 체크박스를 비활성화합니다. 실패 시 기준값·임시 기록을 유지해 재시도할 수 있습니다. 저장 중에는 체크·저장·취소를 비활성화해 중복 요청을 방지합니다. 계정 전환과 로그아웃은 편집 종료 후 허용하며, 로그인 만료 오류도 임시 기록을 유지합니다. 이때 명시적으로 취소하면 임시 기록을 버리고 로그인 창을 엽니다. 새로고침 전 미저장 경고만 제공하며 자동 임시 저장은 없습니다.

일괄 API는 카탈로그의 악곡·난이도·상태·중복 키와 최대 항목 수(곡 수 × 4)를 전부 검증한 뒤 쓰기 작업을 시작합니다. `null`은 해당 계정의 해당 차트만 삭제하며 생략한 차트는 유지합니다. JSON 입력을 사용하는 삭제·upsert 두 SQL문을 SQLite 트랜잭션 또는 D1 `batch()`로 원자적으로 실행하므로 전체 364차트도 SQL 쿼리 수가 늘지 않습니다. 단건 PUT은 기존 클라이언트 호환을 위해 유지합니다.

`tests/editor.test.mjs`는 실제 프런트엔드 코드를 jsdom에서 실행해 체크·필터·난이도 변경 시 통신 0회, 저장 1회, 취소·무변경 0회, 실패 후 재시도·중복 저장 방지·만료 세션을 검증합니다. `tests/batch-contract.mjs`는 같은 계약을 Node와 실제 D1에 적용해 전체 차트 저장, 계정 분리, 잘못된 요청 전체 거부와 강제 DB 오류 시 롤백을 검증합니다. 개발 의존성을 설치해 테스트하려면 Node.js 24.15 이상을 사용합니다.

## 클라우드 운영 인계

Workers·D1 계정 저장은 <https://bdon-record.kh12.workers.dev>에 배포되어 있습니다. 사용자가 초기 D1 생성·migration·첫 배포를 완료했으며 편집 모드와 네이비 테마도 이후 반영했습니다. 기존 로컬 DB를 D1으로 이전하는 기능은 아직 없습니다. 명령과 연결 ID는 [Cloudflare 안내](CLOUDFLARE.md)를 참고합니다.

- Workers 코드는 현재 API 및 `(user_id, song_id, difficulty)` 제약을 보존하고 D1 비동기 접근을 사용합니다. 새 D1용 migration은 준비했으며 기존 로컬 DB 데이터 이전은 아직 없습니다.
- Workers는 화면과 API를 동일 출처에서 제공하고 HTTPS 세션 쿠키·Origin 검사·D1 로그인 제한을 적용합니다. 기존 Node 서버의 루프백 Host 제한은 그대로 유지합니다.
- GitHub Pages는 상대 자산 경로를 사용하는 읽기 전용 미리보기입니다. Cloudflare 버전은 화면과 API를 동일 출처에서 제공하므로 별도 API URL이나 CORS 설정 없이 동작합니다.
- 실제 운영 환경에서 DB 백업과 이전, 비밀번호 해시 호환성, 계정별 기록 격리, 로그아웃·만료·CPU 제한 동작을 확인해야 합니다. 로컬 DB를 저장소에 업로드하는 방식으로 이전하지 않습니다.
- UID 불러오기는 [별도 조사 문서](UID_API_RESEARCH.md)를 기준으로 실제 데이터 접근 방법과 곡 ID 대응표부터 검증합니다. UID 자체를 사이트 로그인 수단이나 계정 소유 증명으로 사용하지 않습니다.

Pages 자동 배포 workflow와 Cloudflare용 `wrangler.jsonc`가 포함되어 있습니다. Cloudflare 인증 토큰은 저장소에 없습니다. Pages 초기 설정·운영 방법은 [배포 문서](DEPLOYMENT.md)를 참고합니다.
