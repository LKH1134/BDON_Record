# Cloudflare Workers + D1 실행·배포

갱신일: 2026-10-29. 운영은 <https://bdon-record.kh12.workers.dev>이며 93곡·372차트와 계정별 기록 저장을 제공합니다. 기타 분류 로고 교체를 운영 반영했습니다. GitHub Pages는 별도 읽기 전용 미리보기입니다.

## 현재 운영 상태

| 항목 | 상태 |
| --- | --- |
| Worker / D1 이름 | `bdon-record` |
| D1 Database ID | `5e15c295-24e9-443d-b9f6-fedc67fd3e87` |
| 바인딩 | D1 `DB`, 정적 자산 `ASSETS` |
| 설정 / API | `wrangler.jsonc` / `worker/index.mjs` |
| Workers 버전 | `56d8d686-5ae5-47b4-a9d1-e00dad9f8ba9` |
| 적용된 migration | `0001_accounts.sql`, `0002_song_ids.sql` |
| 기록 점검 모드 | `RECORDS_MAINTENANCE=0` (해제) |

D1 이름·ID는 대상 확인용 식별자이며 인증값이 아닙니다. Cloudflare 계정은 이 D1이 속한 계정을 사용합니다.

## 2026-10-29 로고 배포 결과

- 기타 분류(CRYCHIC)의 임시 아이콘을 사용자 제공 투명 WebP 로고로 교체하고 `test` 검증 후 `main`에서 배포했습니다.
- 전체 테스트 58개와 Workers dry-run을 통과했습니다. 운영 JS·새 로고·카탈로그의 SHA-256이 로컬 파일과 일치합니다.
- `/`, `/api/catalog`, `/api/me`의 200과 비로그인 `/api/records`의 401을 확인했습니다. DB migration과 사용자 기록 변경은 없습니다.
- `7b3d3e9`의 [Pages workflow](https://github.com/LKH1134/BDON_Record/actions/runs/40813019858)도 성공했고 공개 미리보기의 새 로고·화면 코드·카탈로그 내용을 확인했습니다. `main`·`test`와 양쪽 원격을 동기화했습니다.
- 10월 29일 마무리 문서 갱신은 GitHub README와 인계 문서 반영 작업입니다. Workers 버전과 D1은 유지하며 문서 갱신만을 위한 운영 재배포는 필요하지 않습니다.

## 2026-10-28 검증·배포 결과

- 6자리 곡 ID·분류 개편과 「怪物 / KAIBUTSU」 추가를 `test`에서 검증하고 `main`에 병합했습니다.
- 엑셀/카탈로그의 93곡·93개 문자열·372차트 일치, 기존 92곡의 이름·밴드·레벨과 이전 대응표를 확인했습니다.
- 전체 테스트 58개와 Workers dry-run을 통과했습니다.
- 점검 모드에서 D1 전체 export를 백업하고 임시 메모리 DB 복원으로 유효성을 확인했습니다.
- `0002_song_ids.sql`로 운영 기록 160개를 이전하고 새 ID 대응·상태·수정 시각·계정·세션·레이팅 합계 보존을 확인했습니다.
- 점검 모드를 해제한 뒤 운영 화면·카탈로그·JS/CSS·로고와 비로그인 기록 접근 보호를 확인했습니다.

백업·전후 검증 자료는 `.local/deploy-song-ids/`의 Git 제외 자료입니다. 파일 위치와 상세 이력은 [HANDOFF](../HANDOFF.md)에 있습니다. 실제 Node 로컬 사용자 DB는 이전하지 않았습니다.

## 설치와 로컬 검증

Node.js 24.15 이상과 Python 3을 준비합니다. Python은 엑셀 변환과 importer 테스트에 사용합니다.

```powershell
npm ci
# 엑셀 변경 시
npm run sync-data

# 로컬 D1에 미적용 migration 반영
npm run db:local
npm run dev:worker
```

기본 주소는 `http://127.0.0.1:8787`입니다. `.wrangler/`의 로컬 D1, Node의 `.local/bdon.sqlite`, 운영 D1은 별도 DB입니다. 로컬 화면의 CLOUD MODE는 실행 모드를 의미하며 데이터가 운영에 저장된다는 뜻이 아닙니다.

```powershell
npm test
npm run check:worker
```

테스트는 임시 SQLite·Miniflare D1으로 계정·세션·기록 격리, 372차트 일괄 저장, 오류 롤백, ID 이전·반복 실행·충돌·점검 모드와 레이팅을 검증합니다. `check:worker`는 번들·바인딩의 dry-run이며 실제 업로드를 하지 않습니다. 루프백 EACCES가 발생하면 로컬 접속 제한을 확인합니다.

## 로그인과 DB 대상 확인

```powershell
npx wrangler login
npx wrangler whoami
npx wrangler d1 migrations list DB --remote
```

브라우저에서 직접 로그인합니다. 여러 계정이 있다면 위 D1이 속한 계정을 선택합니다. 인증 토큰·세션·테스트 비밀번호는 저장소나 문서에 넣지 않습니다.

## D1 migration

현재 운영에는 아래 두 migration이 적용됐습니다.

| 파일 | 역할 |
| --- | --- |
| `migrations/0001_accounts.sql` | 계정·세션·기록·로그인 제한 테이블 생성 |
| `migrations/0002_song_ids.sql` | 기존 곡 ID 92개를 새 6자리 ID로 대응시켜 기록 이전 |

새 D1을 만들거나 실제 미적용 migration이 있을 때 대상과 목록을 확인하고 실행합니다.

```powershell
npm run db:remote
```

이 명령은 원격 D1을 변경합니다. Wrangler는 `d1_migrations` 이력으로 미적용 항목만 실행합니다. 기존 운영 DB를 초기화하거나 초기 SQL을 수동으로 중복 적용하지 않습니다.

`0002_song_ids.sql`은 곡 ID만 바꾸며 계정·상태·수정 시각을 보존합니다. 적용 후에는 단순 코드 롤백만으로 이전 ID를 사용하는 구버전을 복원할 수 없으므로, 문제가 생기면 점검 상태에서 코드와 DB의 대응을 함께 확인합니다. 전체 절차는 [Songs 인덱스](SONG_IDS.md)를 따릅니다.

## Workers 운영 업데이트

큰 기능은 `test`에서 로컬 검증하고 공개 반영 요청이 있는 변경을 `main`에 병합합니다. 이후 검증한 `main`에서 배포합니다.

일반 코드·데이터 업데이트는 다음 순서입니다.

```powershell
npm test
npm run check:worker
npm run deploy:worker
```

엑셀이 바뀌었다면 먼저 `npm run sync-data`를 실행해 JSON을 갱신합니다. 원격 DB 변경이 필요하면 배포 전에 migration 목록·백업·적용 순서를 별도로 확인합니다.

기존 기록 ID를 변경해야 하는 경우에는 기록 요청을 잠시 차단하고 검증 후 다시 엽니다.

```powershell
# 기록 조회·저장 점검 모드
npm run deploy:worker -- --var RECORDS_MAINTENANCE:1

# 백업 파일은 새 이름을 지정하고 Git 제외 위치에 보관
npx wrangler d1 export DB --remote --output .local/d1-before-change.sql

# 대상·미적용 목록과 충돌 여부 확인 후 적용
npm run db:remote

# 전후 기록·계정·세션·레이팅 보존 확인 후 점검 해제
npm run deploy:worker
```

실제 백업은 덮어쓰지 않는 새 경로를 사용하고 임시 DB 복원으로 유효성을 확인합니다. SQL export와 전후 비교 자료를 Git에 넣지 않습니다. 기본 `RECORDS_MAINTENANCE` 값은 `0`이며 점검 모드에서는 기록 경로가 503을 반환합니다. 이전 ID 기록이 남아 있는 새 Worker도 로그인 사용자의 기록 접근을 차단합니다.

`deploy:worker`는 `build:worker`로 `dist-worker/`를 준비한 뒤 화면·API를 배포합니다. `build:pages`의 `dist/`는 GitHub Pages용입니다.

### 배포 후 확인

- `/`, `/api/catalog`, `/catalog.json`의 응답과 검증한 카탈로그·자산의 일치
- 점검 모드 해제, 비로그인 기록 요청 401, 로그인 세션과 계정별 기록
- 변경 시 기존 기록 수·상태·시각·레이팅 합계 보존
- 임시 QA 계정·로컬 테스트의 편집·저장·취소·일괄 저장 계약
- Pages workflow 성공과 공개 카탈로그 일치

2026-10-28 운영 확인은 기존 사용자 기록의 추가 편집 없이 수행했습니다. 실제 브라우저의 PC·모바일 편집·저장 확인 기록은 이전 UI 작업 기준이며, UI가 바뀌면 다시 검증합니다.

## GitHub 자동 배포 구분

`main` 푸시는 [Pages workflow](DEPLOYMENT.md)를 실행합니다. 현재 확인한 Workers 배포는 CLI 실행이며 Cloudflare Git 자동 배포 연결 여부는 확인되지 않았습니다. 푸시만으로 Workers 운영 반영을 완료했다고 판단하지 않습니다.

향후 Cloudflare Git 배포를 연결한다면 저장소 `LKH1134/BDON_Record`, 브랜치 `main`, Node.js 24.15 이상, `npm ci`, `npm run build:worker`, `npx wrangler deploy`를 기준으로 설정합니다. DB migration은 자동 배포와 분리합니다.

문서만 갱신하는 작업에는 Workers 재배포·DB migration이 필요하지 않습니다.

## 인증·저장 동작

- 비밀번호는 salt와 scrypt, 세션 토큰은 SHA-256 해시로 저장합니다.
- 운영 HTTPS 쿠키는 `__Host-bdon_session`, `Secure`·`HttpOnly`·`SameSite=Strict`·`Path=/`, 수명 30일입니다. Node 로컬 쿠키는 `bdon_session`입니다.
- 쓰기 요청은 동일 Origin만 허용하고 사용자 ID는 세션에서 결정합니다.
- 가입·로그인은 IP별 60초간 합계 20회로 제한합니다. D1에는 IP 원문 대신 해시 키를 보관합니다.
- 기록 일괄 저장은 검증 후 삭제·upsert를 단일 D1 batch로 적용합니다.
- 매시간 Cron이 만료된 세션·로그인 제한 자료를 정리합니다.
- Node 계정의 D1 이관, 게임 UID 자동 수집, 비밀번호 찾기·이메일 인증은 미구현입니다. 같은 SQLite 안의 곡 ID 이전 도구와 구분합니다.

공식 참고: [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [Workers 정적 자산](https://developers.cloudflare.com/workers/static-assets/binding/), [Node crypto 호환성](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/).
