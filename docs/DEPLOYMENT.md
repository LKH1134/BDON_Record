# GitHub Pages 배포 인계

## 공개 범위

사용자의 2026-10-26 배포 요청에 따라 현재 화면을 GitHub Pages의 정적 미리보기로 제공합니다. 예상 기본 주소는 <https://lkh1134.github.io/BDON_Record/>이며, 실제 배포 상태는 저장소 Actions와 Pages 화면에서 확인합니다.

- 공개본: 91곡 목록, 난이도 탭, 곡명·원문·밴드 검색, 밴드·기록 필터, 레벨 정렬. 개인 기록이 없는 미리보기이므로 기록 필터의 clear/fc/ap 결과는 비어 있습니다.
- 공개본의 계정 로그인과 체크박스 저장은 비활성화합니다. 개인 레이팅과 기록 수는 `—`로 표시합니다.
- 로컬 서버의 계정·기록·레이팅 기능은 유지합니다. Pages에서 로컬 SQLite에 접근하거나 로컬 계정 데이터를 업로드하지 않습니다.

## 빌드와 배포 흐름

```sh
npm run sync-data
npm test
npm run build:pages
```

`scripts/build-pages.mjs`는 `dist/`에 `index.html`, `styles.css`, `app.js`, `rating.js`, `brand-icon.webp`, `catalog.json`, `.nojekyll`만 생성합니다. 다른 파일이 출력 폴더에 있으면 오류로 중단합니다. `dist/`는 Git 제외 대상입니다. 헤더 아이콘 원본은 `public/brand-icon.webp`입니다.

원본 HTML 대신 배포용 HTML에만 `<meta name="bdon-mode" content="static">`을 삽입합니다. `public/app.js`는 이 표식을 읽어 카탈로그를 같은 폴더의 `catalog.json`에서 불러오고 계정 API 요청을 하지 않습니다. `/BDON_Record/` 하위 경로에서 동작하도록 HTML 자산·홈 링크는 상대 경로를 사용합니다. 원본 HTML을 제공하는 로컬 서버는 기존 `/api/...` 경로를 계속 사용합니다.

`.github/workflows/pages.yml` 흐름:

1. `main` 푸시 또는 `workflow_dispatch`로 실행합니다.
2. Node.js 24와 Python 3.13을 준비하고 엑셀을 변환합니다.
3. 테스트를 통과한 경우 정적 빌드 결과만 Pages artifact로 업로드합니다.
4. 별도 deploy job이 `github-pages` 환경에 배포합니다. 이 job에만 `pages: write`, `id-token: write` 권한을 부여합니다.

## 저장소 설정 및 확인

GitHub 연결 도구는 코드 작성 기능을 제공하지만 Pages 설정 변경 기능은 제공하지 않습니다. 인증된 브라우저 또는 Pages 관리 권한이 있는 별도 API 인증으로 아래 초기 설정을 한 번 적용해야 합니다.

1. [저장소 Pages 설정](https://github.com/LKH1134/BDON_Record/settings/pages)을 엽니다.
2. Build and deployment → Source를 **GitHub Actions**로 선택합니다.
3. [Actions](https://github.com/LKH1134/BDON_Record/actions)에서 **Deploy GitHub Pages**가 성공했는지 확인합니다. 최초 실행이 설정 전에 실패했다면 설정 후 다시 실행합니다.
4. Pages가 표시한 실제 URL에서 곡 목록 로딩·검색·레벨 정렬을 확인합니다. 로그인·저장 버튼은 비활성 상태이고 읽기 전용 안내가 보여야 합니다.

Pages 초기 설정이 없어도 코드 업로드와 빌드 준비를 완료할 수 있지만, 배포 성공으로 기록하려면 deploy job 성공 또는 실제 URL 응답 확인이 필요합니다.

## 검증 기록

- 로컬 Node.js v24.16.0에서 `npm test`: 21개 통과, 실패 0개.
- 배포 자산의 허용 목록, 저장소 하위 경로 자산 링크, 원본 HTML의 로컬 모드 유지, 예상하지 않은 파일의 공개 방지를 자동 테스트합니다.
- `/BDON_Record/` 하위 경로를 재현한 정적 서버에서 91곡 로딩, 로그인·체크박스 비활성, 기타 필터의 CRYCHIC 유지, 레벨 정렬과 곡 검색을 확인했습니다.

## 이후 변경

프런트엔드 편집은 기존 `public/` 파일에서 수행합니다. 데이터는 `Data.xlsx`를 편집합니다. `main`에 푸시하면 동일 파이프라인이 갱신합니다. 배포 출력물을 직접 수정하지 않습니다.

Cloudflare 계정 API를 연결하는 작업은 별도입니다. 브라우저에 보관한 임시 계정·가짜 로그인으로 서버 계정 기능을 대체하지 않습니다. 실제 백엔드가 준비되면 인증·API 주소·쿠키·CSP/CORS·기록 격리 검증 후 공개본의 저장 기능을 활성화합니다.

공식 참고: [GitHub Pages custom workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [GitHub Pages REST API](https://docs.github.com/en/rest/pages/pages).
