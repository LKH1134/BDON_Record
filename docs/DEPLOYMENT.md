# GitHub Pages 배포 인계

## 공개 범위

사용자의 2026-10-26 배포 요청에 따라 <https://lkh1134.github.io/BDON_Record/>에 읽기 전용 미리보기를 제공합니다. 운영 계정 저장 페이지는 별도 주소 <https://bdon-record.kh12.workers.dev>입니다. 최근 확인한 밴드 로고 커밋 `c5126c6`의 [Pages workflow](https://github.com/LKH1134/BDON_Record/actions/runs/40323291800)는 성공했습니다.

- 공개본: 91곡 목록, 난이도 탭, 곡명·원문·밴드 검색, 밴드·기록 필터, 레벨 정렬. 개인 기록이 없는 미리보기이므로 기록 필터의 clear/fc/ap 결과는 비어 있습니다.
- 공개본의 계정 로그인과 체크박스 저장은 비활성화합니다. 개인 레이팅과 기록 수는 `—`로 표시합니다.
- 로컬 서버의 계정·기록·레이팅 기능은 유지합니다. Pages에서 로컬 SQLite에 접근하거나 로컬 계정 데이터를 업로드하지 않습니다.

## 빌드와 배포 흐름

```sh
npm run sync-data
npm test
npm run build:pages
```

`scripts/build-pages.mjs`는 `dist/`에 `index.html`, `styles.css`, `app.js`, `rating.js`, `brand-icon.webp`, `catalog.json`, `.nojekyll`과 `band-logos/` 안의 밴드 로고 5개를 생성합니다. 총 공개 파일은 12개입니다. 다른 파일이 출력 폴더에 있으면 오류로 중단합니다. `dist/`는 Git 제외 대상입니다. 헤더 아이콘 원본은 `public/brand-icon.webp`입니다.

원본 HTML 대신 배포용 HTML에만 `<meta name="bdon-mode" content="static">`을 삽입합니다. `public/app.js`는 이 표식을 읽어 카탈로그를 같은 폴더의 `catalog.json`에서 불러오고 계정 API 요청을 하지 않습니다. `/BDON_Record/` 하위 경로에서 동작하도록 HTML 자산·홈 링크는 상대 경로를 사용합니다. 원본 HTML을 제공하는 로컬 서버는 기존 `/api/...` 경로를 계속 사용합니다.

`.github/workflows/pages.yml` 흐름:

1. `main` 푸시 또는 `workflow_dispatch`로 실행합니다.
2. Node.js 24와 Python 3.13을 준비하고 `npm ci` 후 엑셀을 변환합니다.
3. 전체 테스트와 Workers dry-run, Pages 빌드를 통과하면 정적 결과만 Pages artifact로 업로드합니다. Workers dry-run은 실제 Cloudflare 배포를 실행하지 않습니다.
4. 별도 deploy job이 `github-pages` 환경에 배포합니다. 이 job에만 `pages: write`, `id-token: write` 권한을 부여합니다.

## 저장소 설정 및 확인

사용자가 Source를 **GitHub Actions**로 설정했으며 Pages 배포 성공을 확인했습니다. 새 저장소에 옮길 때는 아래 초기 설정을 적용합니다.

1. [저장소 Pages 설정](https://github.com/LKH1134/BDON_Record/settings/pages)을 엽니다.
2. Build and deployment → Source를 **GitHub Actions**로 선택합니다.
3. [Actions](https://github.com/LKH1134/BDON_Record/actions)에서 **Deploy GitHub Pages**가 성공했는지 확인합니다. 최초 실행이 설정 전에 실패했다면 설정 후 다시 실행합니다.
4. Pages가 표시한 실제 URL에서 곡 목록 로딩·검색·레벨 정렬을 확인합니다. 로그인·저장 버튼은 비활성 상태이고 읽기 전용 안내가 보여야 합니다.

Pages 초기 설정이 없어도 코드 업로드와 빌드 준비를 완료할 수 있지만, 배포 성공으로 기록하려면 deploy job 성공 또는 실제 URL 응답 확인이 필요합니다.

## 검증 기록

- 밴드 로고 적용 후 전체 테스트: 52개 통과, 실패 0개. 해당 커밋의 CI에서 테스트·Workers dry-run·Pages 빌드·배포가 성공했습니다. 초기 단계의 테스트 수는 현재 기준이 아닙니다.
- 배포 자산의 허용 목록, 저장소 하위 경로 자산 링크, 원본 HTML의 로컬 모드 유지, 예상하지 않은 파일의 공개 방지를 자동 테스트합니다.
- `/BDON_Record/` 하위 경로를 재현한 정적 서버에서 91곡 로딩, 로그인·체크박스 비활성, 기타 필터의 CRYCHIC 유지, 레벨 정렬과 곡 검색을 확인했습니다.

## 이후 변경

프런트엔드 편집은 기존 `public/` 파일에서 수행합니다. 데이터는 `Data.xlsx`를 편집합니다. `main`에 푸시하면 동일 파이프라인이 갱신합니다. 배포 출력물을 직접 수정하지 않습니다.

Cloudflare 계정 API·D1 저장과 네이비 테마는 이미 운영에 반영되어 있습니다. Workers 업데이트 방법은 [Cloudflare 안내](CLOUDFLARE.md)를 참고합니다. GitHub Pages는 읽기 전용 미리보기로 유지합니다.

밴드 로고 5개의 교체는 완료했습니다. `scripts/build-pages.mjs`는 로고 폴더와 파일명도 검증하고 `tests/pages.test.mjs`는 파일 보존과 미허용 자산 거부를 확인합니다. 향후 이미지 추가 시 양쪽 허용 목록과 복사 로직, 저장소 하위 경로에서의 로딩을 함께 점검합니다. 상세 매핑은 [개발 인계](DEVELOPMENT.md#곡-앞-밴드-로고)에 있습니다.

다음 시작 시 안내할 앨범 재킷 포함 여부와 레이팅 2배 변경은 [별도 메모](NEXT_STEPS.md)에 기록되어 있으며 아직 구현·배포하지 않았습니다. 재킷을 추가하게 되면 정적 자산 허용 목록·복사·하위 경로 로딩 검증을 함께 갱신합니다.

공식 참고: [GitHub Pages custom workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [GitHub Pages REST API](https://docs.github.com/en/rest/pages/pages).
