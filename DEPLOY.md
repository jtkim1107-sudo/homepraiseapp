# 배포 가이드 (GitHub Pages)

> 터미널 여는 법: 파일 탐색기에서 `homeapp` 폴더 열고 → 빈 곳 우클릭 → "터미널에서 열기"

## 최초 1회 설정

```powershell
# 1. Git에 내 서명 등록 (이 컴퓨터에서 한 번만)
git config --global user.name "GitHub아이디"
git config --global user.email "GitHub가입이메일"
```

## 처음 올릴 때

```powershell
# 2. 변경 파일 담기 → 확인 → 저장(커밋)
git add .
git status
git commit -m "우리집 칭찬가게 첫 버전"
```

3. github.com에서 새 저장소 만들기
   - New repository → 이름 `praise-shop` → **Public**
   - ⚠️ "Add a README file" 체크하지 않기
   - Create repository

```powershell
# 4. 원격 주소 등록 후 업로드 (아이디 부분 바꾸기!)
git remote add origin https://github.com/GitHub아이디/praise-shop.git
git push -u origin main
# → 브라우저에 GitHub 로그인 창이 뜨면 로그인 (최초 1회만)
```

5. GitHub Pages 켜기
   - 저장소 → Settings → Pages
   - Source: `Deploy from a branch`
   - Branch: `main`, 폴더 `/ (root)` → Save

6. 1~2분 뒤 접속: `https://GitHub아이디.github.io/praise-shop/`
   - 폰/태블릿 크롬에서 열고 메뉴(⋮) → "홈 화면에 추가"

## 수정한 뒤 다시 올릴 때 (매번 이 세 줄)

```powershell
git add .
git commit -m "뭘 바꿨는지 메모"
git push
```

1~2분 뒤 웹 주소에 자동 반영.

## 용어 미니 사전

| 용어 | 뜻 |
|---|---|
| 커밋(commit) | 저장점. 게임 세이브 파일 같은 것 |
| add | 이번 저장점에 담을 파일 고르기 (장바구니) |
| push | 내 컴퓨터의 커밋을 GitHub로 올리기 |
| remote / origin | 클라우드 쪽 저장소 주소 / 그 주소의 별명 |
| main | 기본 작업 줄기(브랜치) 이름 |
| Pages | GitHub이 저장소 파일을 웹사이트로 서비스해주는 기능 |
