# 안드로이드 APK 배포 (TWA)

이 앱은 **TWA(Trusted Web Activity)** 방식으로 안드로이드 앱을 만듭니다.
앱은 껍데기이고 화면은 GitHub Pages에서 받아오므로, **코드를 고쳐 push 하면
APK를 다시 만들지 않아도 모든 기기에 반영**됩니다.

APK를 다시 만들어야 하는 경우는 앱 이름 / 아이콘 / 패키지 ID / 권한 /
가리키는 주소가 바뀔 때뿐입니다.

---

## 1. PWABuilder 로 APK 만들기

<https://www.pwabuilder.com> 접속 → 주소 입력

```
https://ddacbae.github.io/icunursehub/
```

**Package For Stores → Android** 선택.

| 항목 | 값 |
|---|---|
| Package ID | `io.github.ddacbae.icunursehub` |
| App name | ICU Nurse Hub |
| Launcher name | ICU Hub |
| Display mode | Standalone |
| Signing key | **Create new** (최초 1회) |

### ⚠️ 서명 키는 반드시 백업

다운로드한 zip 안의 키 파일(`signing.keystore`)과 비밀번호를 잃어버리면
**업데이트 배포가 영구히 불가능**합니다. 새 키로 만든 APK는 기존 앱을
덮어쓸 수 없어 사용자가 앱을 지우고 다시 설치해야 합니다.

zip 결과물:

| 파일 | 용도 |
|---|---|
| `app-release-signed.apk` | 직접 배포(사이드로드)용 |
| `app-release-bundle.aab` | Play 스토어 업로드용 |
| `assetlinks.json` | 아래 2번에서 사용 |
| `signing.keystore` | **백업 필수** |

---

## 2. 주소창 없애기 (Digital Asset Links)

이 단계를 건너뛰면 앱은 동작하지만 **화면 위에 주소창이 계속 보입니다.**

`assetlinks.json` 은 반드시 **도메인 루트**에 있어야 합니다.

```
필요한 위치 : https://ddacbae.github.io/.well-known/assetlinks.json
이 저장소    : https://ddacbae.github.io/icunursehub/   ← 하위 경로라 인정 안 됨
```

따라서 **`ddacbae.github.io` 라는 이름의 저장소를 새로 만들어** 아래 구조로 넣습니다.

```
ddacbae.github.io/
├── .nojekyll                    ← 필수. 없으면 Pages 가 .well-known 을 무시함
└── .well-known/
    └── assetlinks.json          ← PWABuilder zip 안의 파일
```

`.nojekyll` 이 없으면 Jekyll 이 점(`.`)으로 시작하는 폴더를 빌드에서 제외해
404 가 납니다. 가장 자주 놓치는 부분입니다.

### 확인 방법

브라우저에서 아래 주소를 열어 JSON 이 보이면 성공입니다.

```
https://ddacbae.github.io/.well-known/assetlinks.json
```

반영에 몇 분 걸릴 수 있고, 앱을 지웠다 다시 설치해야 적용되는 경우가 있습니다.

---

## 3. 배포

| 방법 | 장점 | 단점 |
|---|---|---|
| APK 직접 전달 (메일·메신저·QR) | 즉시 가능, 비용 0 | 기기마다 '출처를 알 수 없는 앱' 허용 필요 |
| Play 스토어 비공개 테스트 | 설치 간편, 자동 업데이트 | 개발자 등록비 $25, 심사 필요 |

병원 내부 배포는 보통 APK 직접 전달로 시작합니다.

---

## 4. 앱 내용 업데이트할 때

1. 코드 수정
2. **`sw.js` 의 `CACHE_NAME` 버전 숫자 올리기** (`icu-hub-v9` → `v10`)
3. `git push`

기기에서 앱을 열면 새 서비스워커가 설치되며 한 번 자동 새로고침됩니다.
APK 재배포는 필요 없습니다.

---

## 아이콘

| 파일 | 크기 | 용도 |
|---|---|---|
| `icon-192.png` | 192×192 | 런처 아이콘 (any) |
| `icon-512.png` | 512×512 | 스토어 등록 · 스플래시 (any) |
| `icon-maskable-512.png` | 512×512 | 안드로이드 적응형 아이콘 (maskable) |
| `icon.png` | 180×180 | 원본 (보관용) |

> 512 아이콘들은 180×180 원본을 확대해 만든 것이라 스토어 등록 이미지에서
> 다소 부드럽게 보일 수 있습니다. 고해상도 원본이 생기면 같은 파일명으로
> 교체하기만 하면 됩니다.

---

# 아이폰 배포 (홈 화면에 추가)

아이폰은 별도 파일 배포 없이 **주소만 알려주면** 됩니다.

```
https://ddacbae.github.io/icunursehub/
```

## 설치 방법 (사용자 안내용)

1. **Safari** 로 위 주소 접속
2. 하단 **공유 버튼**(⬆️) 탭
3. **홈 화면에 추가** 선택
4. 이름 확인 후 **추가**

홈 화면 아이콘으로 실행하면 주소창 없이 전체화면으로 뜹니다.

## 주의

- 반드시 **Safari** 로 열어야 합니다. 크롬·네이버앱 등에서는 '홈 화면에 추가'가
  없거나 전체화면으로 실행되지 않습니다.
- 안드로이드 APK 와 달리 **설치 파일이 없습니다.** 주소가 곧 배포본입니다.
- 업데이트는 안드로이드와 동일하게 `git push` 만 하면 반영됩니다.

## 아이콘

iOS 는 `apple-touch-icon` 의 투명 영역을 **검정으로 렌더링**합니다.
그래서 홈 화면용은 투명이 없는 별도 파일을 씁니다.

| 파일 | 크기 | 용도 |
|---|---|---|
| `apple-touch-icon.png` | 180×180 | iOS 홈 화면 (불투명, 모서리는 iOS 가 둥글림) |
