# 지금 할 일: 게임 코드 반영

Cloudflare 계정과 Pages 프로젝트는 이미 준비되었습니다. 새로 만들지 마세요.

1. 이 프로젝트의 소스를 **Aboutpis/skullking** 저장소 루트에 반영합니다. ZIP 자체를 올리면 작동하지 않습니다.
2. `.github/workflows/deploy.yml`도 함께 교체합니다. 기존 Secrets 두 개를 그대로 사용하며, 정적 게임만 `dist`에서 배포합니다.
3. GitHub Actions → **Deploy Pages**가 초록색 성공인지 확인합니다.
4. https://aboutpis-skullking.pages.dev 를 열고 **AI와 연습하기 → AI 3명 → 항해 시작**을 누릅니다.

처음에는 온라인 방이 연결되지 않는 것이 정상입니다. Workers·Durable Objects는 별도 배포가 필요하며, 현재 Pages 전용 토큰으로 서버를 배포하지 않습니다. 이 ZIP 안의 서버 소스는 다음 단계를 위한 준비입니다.

AI 연습은 기기 내부에서 실행합니다. 앱과 그림은 Pages가 직접 제공하므로 게임 서버를 호출하지 않습니다. 현재 카드 그림은 규칙 확인용 심벌이며 최종 원화 적용 전입니다.

추가 과금 금지, 무료 한도 초과 시 서비스 제한 허용. 기존 시계탑 저장소와 Firebase 프로젝트는 수정하지 않습니다.
