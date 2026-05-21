# 가게 재고 AI

아이폰에서 쓰기 쉬운 가게 재고/주문 리스트 앱입니다. Cloudflare Pages + Pages Functions + D1 데이터베이스로 배포할 수 있습니다.

## 기능

- 품목별 수량 `+ / -` 조정
- 문자 단톡용 주문 리스트 자동 생성
- 오늘 기록 저장 및 학습
- 최근 기록, 요일 패턴, 추세 기반 재고 예측
- AI 예측 수량 적용
- 품목 추가
- 음료수 섹션 포함
- Cloudflare D1 데이터베이스 저장
- DB 연결 전에는 로컬 브라우저 저장소로 임시 사용

## 구조

```text
public/                 프론트엔드
functions/api/           Cloudflare Pages Functions 백엔드
migrations/              D1 데이터베이스 스키마
wrangler.toml            Cloudflare 설정
```

## 로컬에서 열기

`index.html`을 브라우저로 열면 로컬 모드로 작동합니다. 이 모드는 Cloudflare DB 없이도 버튼 테스트가 가능합니다.

## Cloudflare 배포 순서

1. GitHub에 이 프로젝트를 올립니다.
2. Cloudflare Dashboard에서 Workers & Pages로 이동합니다.
3. Pages 프로젝트를 만들고 GitHub 저장소를 연결합니다.
4. Build command는 비워둡니다.
5. Build output directory는 `public`으로 설정합니다.
6. D1 데이터베이스를 만들고 Pages Functions binding을 추가합니다.
   - Binding name: `DB`
   - Database: 생성한 D1 database
7. `migrations/0001_initial.sql` 내용을 D1 콘솔에서 실행하거나 Wrangler로 적용합니다.
8. 다시 배포합니다.

## Wrangler 사용

```bash
npm install
npm run db:create
npm run db:migrate:remote
```

`wrangler d1 create` 후 출력되는 `database_id`를 `wrangler.toml`의 `database_id`에 넣어야 합니다.

## 예측 방식

처음에는 기록이 적어서 단순 예측으로 시작합니다. 매일 `오늘 저장/학습`을 누르면 날짜별 기록이 쌓이고, 예측은 다음 요소를 섞어서 계산합니다.

- 최근 5회 평균
- 같은 요일의 과거 평균
- 마지막 기록
- 최근 추세

실제 주문 전에 사람이 수량을 확인하고 수정한 뒤 다시 저장하면 점점 가게 패턴에 맞춰집니다.

## 참고

- Cloudflare Pages Functions D1 bindings: https://developers.cloudflare.com/pages/functions/bindings/
- Cloudflare Pages Wrangler configuration: https://developers.cloudflare.com/pages/functions/wrangler-configuration/
