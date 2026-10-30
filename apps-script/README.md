# 종목 스크리너

시가총액 1조원 이상 거래 가능 보통주 중 PER과 PBR이 모두 양수인 기업을 대상으로 코스피·코스닥 각각 PER×PBR 낮은 순 TOP 5와 ROE 높은 순 TOP 5를 독립적으로 산출합니다. 고ROE는 ROE 양수만 포함하며 동률은 시가총액 내림차순, 종목코드 순입니다. 멀티플은 선별 지표이며 저평가나 우량기업을 보장하지 않습니다.

시장 목록 2회와 VIX 1회를 한꺼번에 조회하며 결과는 Google Sheets에 저장하고 화면이 열린 동안 10분마다 갱신합니다. 흑자전환 및 일봉 조회는 수행하지 않습니다. 기존 시트 기록은 보존합니다. 시장 PER·PBR은 공식 지수값이 아닌 보통주 합산 참고치입니다.

S&P 500 참고 멀티플은 2026-10-29 종가 기준 Multpl 추정치 PER 26.33 × PBR 6.12 = 161.14로 고정 표시합니다. PBR 장부가치 기준은 2025-09입니다. https://www.multpl.com/s-p-500-pe-ratio / https://www.multpl.com/s-p-500-price-to-book

Apps Script 설치 시 Code.gs의 SPREADSHEET_ID를 설정하고 setup을 실행합니다. HTML을 수정한 경우 build-html.mjs로 page_를 생성합니다. 테스트는 `node --test apps-script/gas.test.mjs`로 실행합니다.
