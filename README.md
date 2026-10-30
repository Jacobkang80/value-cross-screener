# 종목 스크리너

HTML을 열면 서버가 코스피·코스닥 재무 목록과 Cboe VIX를 조회합니다. 저PBR·저PER·고ROE 탭마다 **각 시장 상위 10개를 먼저 선정한 뒤**, 그 후보만 최근 100개 일봉을 조회합니다. 전체 종목 일봉은 조회하지 않습니다.

## 실행과 검증

```sh
npm test
npm run build
npm run validate
npm run dev
```

Node.js 24.22 이상에서 검증했습니다. 외부 패키지 설치는 필요하지 않습니다. 라이브 수집 CLI는 `node src/collect.mjs pbr` (`per`, `roe` 가능)이며 결과는 `.cache/latest-pbr.json`에 저장합니다. 공개 API가 연결된 네트워크가 필요합니다. 정적 HTML을 파일로 직접 여는 방식은 서버 API를 제공하지 않으므로, 배포된 웹 주소 또는 로컬 서버에서 여세요. 소스 HTML은 `src/index.template.html`, 브라우저 코드는 `src/app.js`, 수집 코드는 `src/server.mjs`입니다. 빌드는 HTML·CSS·JS를 내장한 단일 `worker/index.js`와 Sites 배포 산출물을 생성합니다.

## 후보 선정

- 시장별 전체 재무 목록을 1회씩 조회합니다. 네이버 ST 보통주 분류에서 숫자 6자리 끝자리 0인 종목을 선택하고 스팩·거래정지는 제외합니다. 공급자 분류·코드 규칙으로 다른 주식종류가 제외될 수 있습니다.
- PBR·PER·ROE가 모두 양수인 종목만 정렬합니다. 탭별 주 정렬은 PBR 오름차순 / PER 오름차순 / ROE 내림차순입니다. 동률은 PBR, PER 오름차순, ROE 내림차순, 코드 오름차순입니다.
- 각 시장 상위 10개만 일봉을 조회합니다. 11위 이하를 돌파 여부에 따라 대체 선발하지 않습니다. 탭 전환 시 필요한 후보만 추가 조회하며 겹치는 종목 일봉은 재사용합니다.
- 최신 완료 거래일 SMA5 > SMA80, 전일 SMA5 ≤ SMA80인 종목만 표시합니다. 최소 81개 유효 일봉이 필요합니다.
- 후보 전체를 확인해 돌파 종목이 없으면 `없음`입니다. 오류·일봉 부족이 남으면 `데이터 확인 불가`, 일부 돌파가 확인되면 미확인 수와 함께 잠정 결과입니다.
- 기준일은 코스피 지수 일별 기록에서 확인합니다. 한국시간 16:30 전에는 당일을 제외합니다. 주말·휴장일에는 실제 제공된 마지막 완료 거래일을 사용합니다.

## 지표와 데이터 시점

- 재무 목록: https://stock.naver.com/api/domestic/market/stock/default
- 완료 거래일: https://m.stock.naver.com/api/index/KOSPI/price
- 후보 일봉: https://fchart.stock.naver.com/sise.nhn
- VIX 미국 종가: https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv
- KRX 공식 지수 PER·PBR: `MDCSTAT00701` 원문 조회를 시도합니다. 현재 이 환경에서는 `400 LOGOUT` 응답으로 조회되지 않았습니다. 공식 수치는 `확인 불가`로 표시합니다. 정상 제공될 경우 공식 지수명과 양수 PER·PBR을 검증해 표시합니다.
- 별도 접기 영역의 수집 보통주 합산 참고값은 KRX 공식 지수와 다릅니다. PER = Σ시총 / Σ(시총/PER), PBR도 같은 방식이며 지표별 양수 표본을 각각 사용합니다. 멀티플은 PER × PBR입니다.
- ROE는 네이버 제공값이며 PBR/PER 추정값으로 대체하지 않습니다. 목록 API에 정확한 결산기간이 없어 별도 표시합니다. 재무 참조가격은 일봉 종가와 시점이 다를 수 있습니다. 일봉 수정주가는 공급자 기준이며 기업행위별 독립 검증은 미완료입니다.

## 캐시와 자동 갱신

페이지 로드·정렬 탭 전환·새로고침 시 `/api/screen?metric=pbr`을 호출합니다. 재무 목록·결과 캐시는 최대 10분, 완료 일봉은 코드·거래일별 최대 24시간, VIX는 30분입니다. 동시 요청은 합쳐 처리하고 일봉 요청 동시성은 6개입니다. 결과에는 실제 데이터 수집 시각과 기준일을 보관합니다. 오류 결과를 정상 빈 결과로 캐시하지 않습니다. 공식 KRX 실패는 다른 데이터 수집을 막지 않습니다.

## 저장과 아카이빙

- 소스 코드: https://github.com/Jacobkang80/value-cross-screener
- 공개 소스에는 개인 Google Sheets 주소, Sites 프로젝트 ID, 인증정보, 원자료 캐시를 포함하지 않습니다.
- 필요하면 `connections.example.json`을 `connections.json`으로 복사하여 본인의 Sheets 주소를 입력하고 다시 빌드하세요. 연결 설정은 Git에서 제외됩니다.
- 현재 웹 조회 결과의 Google Sheets 자동 기록은 아직 연결되지 않았습니다. `SCREENER_SHEET_ID` 환경변수를 설정하고 `node src/sheets-payload.mjs pbr`을 실행하면 로컬 최신 수집 결과에서 저장용 행을 만들지만, 실제 원격 저장은 하지 않습니다.
- Sites에 배포할 때는 인증된 배포 환경에서 발급받은 프로젝트 ID로 로컬 `.openai/hosting.json`을 설정하세요. ID가 없으면 예제 설정으로 로컬 빌드와 검증만 수행할 수 있습니다.
- 자동 수집 예약은 생성하지 않았으며 페이지를 열 때 조회합니다. 공개 GitHub 저장소에 코드를 보관하는 작업과 사이트 배포는 별개입니다.

## 검증

`npm test`는 상위 10개 선발 후 일봉 조회, 최신 상향 돌파, 캐시 재사용, 부분 실패, 거래일 판정, 데이터 부족 처리를 검사합니다. `npm run validate`는 생성된 Worker가 유효한 ESM인지 검사합니다. 테스트는 공개 공급자의 향후 가용성이나 투자 수익을 보장하지 않습니다.
