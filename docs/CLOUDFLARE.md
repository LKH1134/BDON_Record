# Cloudflare Workers + D1 실행·배포

2026-10-26 사용자가 원격 D1 초기화와 Workers 첫 배포를 완료했습니다. GitHub Pages는 읽기 전용 미리보기로 유지합니다. 아래 명령은 새 환경의 초기 설정과 이후 업데이트에도 사용할 수 있습니다.

현재 편집 모드에서는 체크 변경을 브라우저에 보관하고 저장할 때만 변경분을 한 요청으로 보냅니다. Node와 Worker 모두 `PUT /api/records`를 제공하며 D1에서는 검증 후 삭제·upsert를 단일 batch 트랜잭션으로 적용합니다. **이번 편집 모드 업데이트에는 DB 스키마 변경이 없으므로 새 migration이 필요하지 않습니다.** 기존 운영 DB를 초기화하지 않습니다.

운영 주소: <https://bdon-record.kh12.workers.dev>. 최근 배포는 2026-10-28 MyGO!!!!!의 「논브레스 오블리주」 추가이며 Worker 버전은 `1362bfa7-dc46-414b-9c91-cf21ba286d5e`입니다. CLI로 배포했으며 운영 화면·카탈로그 API의 HTTP 200과 92곡 카탈로그 전체 일치를 확인했습니다. 전체 테스트 53개와 Workers dry-run을 통과했고 368차트 일괄 저장을 검증했습니다. 실제 사용자 기록 수정이나 DB migration은 실행하지 않았습니다. 레이팅 계수 2.0 / 2.1 / 2.2, 편집 모드·일괄 저장, 네이비·블루 테마와 밴드 로고 5개를 유지합니다. 로고 매핑과 자산 관리는 [개발 인계](DEVELOPMENT.md#곡-앞-밴드-로고)에 있습니다.

## 연결할 리소스

| 항목 | 값 |
| --- | --- |
| Worker 이름 | `bdon-record` |
| D1 이름 | `bdon-record` |
| D1 Database ID | `5e15c295-24e9-443d-b9f6-fedc67fd3e87` |
| D1 바인딩 이름 | `DB` |
| 정적 자산 바인딩 | `ASSETS` |
| 설정 파일 | `wrangler.jsonc` |
| API 진입점 | `worker/index.mjs` |
| 초기 테이블 정의 | `migrations/0001_accounts.sql` |

DB 이름과 ID는 사용자가 만든 D1을 가리킵니다. Cloudflare 로그인 계정도 이 D1이 속한 계정이어야 합니다. 이 값들은 접근 비밀키가 아닙니다.

## 1. 설치 및 로컬 검증

프로젝트 폴더의 PowerShell에서 실행합니다. 개발 의존성·테스트에는 Node.js 24.15 이상이 필요하며, 엑셀을 갱신할 경우 Python 3도 필요합니다.

```powershell
npm ci
# 엑셀을 변경했다면 먼저 실행
npm run sync-data

# 로컬 D1에 테이블 생성. Cloudflare 로그인 불필요.
npm run db:local
npm run dev:worker
```

Wrangler가 출력한 로컬 URL에 접속합니다. 기본 포트는 8787입니다. 이 모드는 `.wrangler/`에 로컬 DB를 만들며 원격 D1이나 기존 `.local/bdon.sqlite`를 수정하지 않습니다. 로컬 Worker의 화면에 표시되는 CLOUD MODE는 코드 실행 모드이며 로컬 개발 중에는 데이터도 로컬 D1에 저장됩니다.

현재 Node.js 로컬 버전은 계속 `./start.ps1` 또는 `npm start`로 실행합니다. 두 버전은 DB가 분리되어 있습니다.

```powershell
# 기존 로컬 버전 및 실제 Workers 런타임 통합 테스트
npm test

# 실제 업로드 없이 Wrangler 번들·바인딩 검증
npm run check:worker
```

`npm test`의 Workers 테스트는 Miniflare와 임시 D1을 사용합니다. 가입, 비밀번호 해시, HTTPS 쿠키, 사용자별 기록 격리, 저장·해제, 요청 검증, 로그아웃·토큰 교체·만료, 재시작 후 계정·기록·로그인 시도 제한 유지를 검증합니다.

밴드 로고 적용 후 전체 테스트는 52개 통과이며, [해당 커밋의 CI](https://github.com/LKH1134/BDON_Record/actions/runs/40323291800)도 성공했습니다. 전체 364차트 일괄 저장과 강제 DB 오류 시 롤백, 상위 50곡 상세 내역·합계 일치·추가 통신 없음, 로고 5개의 HTTP 제공·원본 일치·미허용 자산 거부를 검증합니다. 실제 브라우저에서 편집·저장·취소, 상위 50곡 합계, 로고 액자·매핑·로딩과 PC·모바일·가로 화면을 확인했습니다. 이번 문서 정리에서는 코드와 운영 배포를 변경하지 않았습니다.

다음 시작 시 안내할 앨범 재킷 검토·레이팅 직관성 패치 상태는 [다음 작업 메모](NEXT_STEPS.md)에 있습니다. 계수 2.0 / 2.1 / 2.2를 `main`에 병합하고 운영 배포를 완료했습니다. 공식은 `레벨 × 기록 계수`이며 이 변경에 DB migration은 필요하지 않습니다. 전체 테스트 53개와 Workers dry-run도 통과했습니다.

## 2. Cloudflare 로그인

```powershell
npx wrangler login
npx wrangler whoami
```

브라우저에서 직접 로그인합니다. 여러 Cloudflare 계정이 보이면 위 D1을 만든 계정을 선택합니다. 필요할 때만 `wrangler.jsonc`에 해당 계정의 `account_id`를 명시합니다. 로그인 인증값은 코드나 Git에 넣지 않습니다.

## 3. 원격 D1 테이블 생성

아직 비어 있는 새 D1에 초기 테이블을 생성합니다.

```powershell
npm run db:remote
```

이 명령은 **실제 원격 D1을 변경**합니다. 적용 전에 대상 이름·ID와 migration 목록을 확인합니다. `0001_accounts.sql`은 새 DB용이며 이미 같은 이름의 테이블이 있는 별도 DB에 강제로 적용하지 않습니다. Wrangler가 적용 이력을 `d1_migrations`에 기록하므로 이후 같은 명령은 미적용 migration만 실행합니다.

테이블은 `users`, `sessions`, `records`, `auth_attempts`입니다. 마지막 테이블은 로그인 시도 제한을 위한 내부 자료입니다. 기존 로컬 계정·기록을 자동으로 가져오지는 않습니다. 초기 migration을 수동 SQL로 중복 실행하지 않습니다.

## 4. Workers 배포

```powershell
npm run deploy:worker
```

정적 화면과 API가 함께 배포되며 완료 시 실제 `https://bdon-record.<계정별이름>.workers.dev` 주소가 출력됩니다. 화면과 API를 같은 주소에서 제공하므로 별도 CORS 허용 목록이나 외부 API 주소를 입력할 필요가 없습니다.

현재 `npm run build:pages`는 GitHub Pages용 읽기 전용 파일을 만듭니다. Cloudflare에는 `npm run build:worker`가 만드는 **`dist-worker/`**를 사용합니다. 배포 스크립트가 이 빌드를 먼저 실행합니다.

배포 후 확인합니다.

1. 로그인 후 `기록 편집`에서 여러 곡·난이도를 체크합니다. 체크 중에는 기록 API 요청이 없고, `저장` 시 일괄 PUT 한 번만 발생해야 합니다. 저장 후 새로고침해 유지되는지 확인합니다.
2. 로그아웃 뒤 다른 계정에는 기존 계정의 기록이 보이지 않아야 합니다.
3. 다른 기기에서 같은 계정으로 로그인해 같은 기록을 확인합니다.
4. 레이팅과 난이도별 집계가 로컬 버전과 동일한지 확인합니다.
5. 로그인·가입 요청의 실행 시간과 오류 로그를 확인합니다. 로컬 검증은 운영 환경의 CPU 제한·동시 부하까지 검증한 결과는 아닙니다.

최초 코드 준비 단계에서는 원격 migration과 배포를 실행하지 않았으며, 이후 사용자가 직접 완료했습니다. GitHub Pages 주소는 자동으로 Cloudflare 주소로 바뀌지 않습니다.

## GitHub 연결로 자동 배포할 경우

초기 원격 migration과 첫 배포 확인 후 Cloudflare Workers & Pages에서 이 저장소를 연결할 수 있습니다.

- 저장소: `LKH1134/BDON_Record`
- 브랜치: `main`
- 루트 디렉터리: 저장소 루트
- 빌드 명령: `npm run build:worker`
- 배포 명령: `npx wrangler deploy`

빌드 환경은 Node.js 24.15 이상을 사용하고 `npm ci`로 lockfile에 맞는 개발 의존성을 설치해야 합니다. 저장소의 `data/catalog.json`을 빌드에 사용합니다. 엑셀 변경 시 JSON도 변환해 함께 커밋합니다. DB migration은 자동 배포와 분리해 필요한 시점에 대상 DB를 확인한 뒤 적용합니다.

GitHub Pages workflow는 계속 읽기 전용 미리보기를 배포합니다. Cloudflare 자동 배포를 연결하기 전에는 GitHub에 푸시해도 Workers가 자동 배포되지 않습니다.

현재까지 확인한 Workers 업데이트는 CLI의 `npm run deploy:worker`를 사용했습니다. Cloudflare 대시보드의 Git 자동 배포 연결 여부는 확인되지 않았으므로 푸시만으로 운영 반영이 끝났다고 기록하지 않습니다. 문서만 정리한 변경은 Workers 재배포가 필요하지 않습니다.

## 데이터·인증 동작

- 사용자 이름·곡 ID·난이도·상태와 레이팅 규칙은 기존 로컬 버전과 동일합니다.
- 비밀번호는 무작위 salt와 scrypt, 세션 토큰은 SHA-256 해시로 저장합니다. 로컬과 같은 해시 형식을 사용하지만 로컬 DB 이전 도구는 아직 없습니다.
- 운영 HTTPS에서는 `__Host-bdon_session` 쿠키에 `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`를 적용합니다. 세션은 30일입니다. 로컬 HTTP에서는 개발용 `bdon_session` 이름을 사용합니다.
- 쓰기 요청은 동일한 Origin만 허용합니다. 계정 ID는 요청 본문이 아닌 로그인 세션에서 결정합니다.
- 가입·로그인은 IP별 60초 동안 합계 20회까지 허용합니다. D1에는 IP 원문 대신 해시 키와 만료 시각을 기록합니다. 공유 네트워크에서는 여러 사용자가 이 제한을 공유합니다.
- 매시간 Cron이 만료된 세션과 로그인 제한 자료를 정리합니다. 만료 여부는 조회 시에도 검사하므로 Cron 지연으로 로그인 수명이 늘어나지는 않습니다.
- 비밀번호 찾기·이메일 인증·게임 UID 가져오기는 이번 작업 범위에 포함하지 않았습니다.

로컬 Cron 확인은 개발 서버 실행 중 `http://127.0.0.1:8787/cdn-cgi/local/scheduled`를 호출할 수 있습니다. 운영에서는 `wrangler.jsonc`의 Cron 설정으로 실행됩니다.

공식 참고: [D1 시작 안내](https://developers.cloudflare.com/d1/get-started/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [Workers 정적 자산](https://developers.cloudflare.com/workers/static-assets/binding/), [Node crypto 호환성](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/).
