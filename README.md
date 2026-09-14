> 2026-09-14 최신 변경: **초기 확정 주문 0건**으로 시작합니다. 거점과 차량만 초기화하고 고객의 확정 예약을 순차적으로 누적합니다. 임의의 지역별 36건 배경 주문 생성 및 지도 표시는 제거했습니다. 기존 테스트 저장값은 별도 키에 보존되고 새 모형에는 불러오지 않습니다. 아래 36건 관련 설명은 이전 구현 기록입니다. 근거: [Yang 등 저자 원고 §5.1](https://repository.essex.ac.uk/11542/1/jointdemandmanagementfinalplainr1.pdf), [Computational Approaches §2](https://arxiv.org/pdf/2010.00385)의 빈 배송 계획 초기화. 첫 주문의 좁은/넓은 구간 비용이 같아도 정상이며 절감량을 임의로 만들지 않습니다.

> 최신 변경: 고정 4개 슬롯을 **가장 빠른 2시간 구간 / 22시까지 시간을 맡기는 넓은 구간**으로 교체했습니다. 교통은 통상 고정입니다. 확정된 넓은 구간 주문은 다음 주문이 들어올 때 재배치됩니다. 계산실과 주문 화면은 동일 브라우저의 누적 예약을 공유합니다. 상세 제약은 docs/taito-model.md 상단을 참고하세요.

# 도쿄 다이토구 동적 배송 선택 — 초기 구현

2026-09-14: 실제 OSM 도로·건물 위치와 고정 거점(元浅草営業所)을 사용하는 계산 모형을 연결했습니다. 아래의 기존 안내 중 해시 기반 거리·고정 추천 관련 설명은 이전 버전에 해당합니다.

- 연구자 계산실: `http://localhost:8000/routing-lab.html`
- 참가자 주문 화면: `http://localhost:8000/?research=1`
- 생성된 파일럿 실험 UUID: `0f9b065f-c4b4-4cd9-aeab-a7f2b4383913` (배포 후 `?experiment=0f9b065f-c4b4-4cd9-aeab-a7f2b4383913`)
- 실행: 이 폴더에서 `python3 -m http.server 8000`
- 조건: `?pid=P001&condition=control`, `green_label`, `default_green_combined`. 기본값은 `default_green_combined`입니다.

배송 위치, 화물 무게·부피, 건물·엘리베이터, 수령 방식·가능 시간을 바꾸면 경로 삽입을 재계산합니다. 가장 빠른 가능 시간대와 추가 주행 CO₂·기사 작업시간이 함께 변합니다. 추천 조건을 만족하는 대안이 없으면 추천을 표시하지 않습니다. 계산실에서 예약을 추가하면 다음 주문은 갱신된 경로와 용량으로 계산합니다.

**실제 자료와 가정:** 도로와 거점·건물 위치는 실제 자료입니다. 기존 주문 36건, 차량 3대, 교통속도·연비·서비스시간은 연구 가정이며 실시간 운영 자료가 아닙니다. CO₂는 추가 주행 배출량, 기사 부담은 시간 지표입니다. 전 과정 환경영향이나 실측 피로를 의미하지 않습니다.

자세한 계산식·출처·제약은 [모형 설명](docs/taito-model.md), 검증은 `node --test tests/delivery-engine.test.js`를 참고하세요. 원자료와 재생성 스크립트는 `data/`, `scripts/`에 있습니다.

로컬 주소에서는 설문과 예약을 외부로 보내지 않습니다. `?experiment=<UUID>`가 포함된 배포 링크에서만 공유 예약 API를 사용합니다. 서버 연결에는 `migrations/004_shared_routing.sql`과 Netlify 환경변수 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`가 필요합니다. 원격 DB 적용과 Netlify 배포는 아직 실행하지 않았습니다.

---

# Nudge Website prototype

> 2026-08-26: 日本のEC配送選択研究用に改修しました。現在の実行エントリーは `index.html` + `japan-app.js` + `japan-checkout.css` です。旧韓国語プロトタイプのロジックは `app.js` に保存していますが、現在は読み込まれません。

연구용 모의 배송 선택 및 사후 앙케이트 프로토타입입니다. 실제 개인정보, 주문 또는 결제정보는 처리하지 않습니다.

## 실행

VS Code에서 `Nudge_Website` 폴더를 연 뒤 터미널에서 다음 명령을 실행합니다.

```bash
python3 -m http.server 8000
```

브라우저에서 아래 주소를 엽니다.

```text
http://localhost:8000
```

참가자 ID와 조건을 전달하려면 다음 형식을 사용합니다.

```text
http://localhost:8000/?pid=P1042&condition=dynamic_information
```

## 온라인 응답 자동 수집 설정

1. [Supabase](https://supabase.com/)에서 프로젝트를 생성합니다.
2. Dashboard의 **SQL Editor**에서 `supabase-schema.sql` 전체를 실행합니다.
3. **Connect** 또는 **Settings > API Keys**에서 Project URL과 Publishable key(`sb_publishable_...`)를 확인합니다.
4. `config.js`에 두 값을 입력합니다.

```js
window.NUDGE_STUDY_CONFIG = {
  supabaseUrl: "https://프로젝트ID.supabase.co",
  supabasePublishableKey: "sb_publishable_...",
};
```

`sb_secret_...` 또는 `service_role` 키는 절대 웹 코드에 넣지 마세요. 현재 RLS 정책은 공개 참가자에게 INSERT만 허용하며 SELECT는 허용하지 않습니다.

설정 후 폴더를 Netlify에 다시 배포하면 앙케이트 제출 즉시 `study_submissions` 테이블에 저장됩니다. 연구자는 Supabase Dashboard의 **Table Editor > study_submissions**에서 응답을 확인하고 CSV로 내보낼 수 있습니다.

## 로컬 저장과 장애 대비

온라인 저장과 별도로 브라우저 `localStorage`에도 데이터를 보존합니다. 전송 실패 시 완료 화면에 오류가 표시되며 JSON 또는 CSV를 내려받을 수 있습니다.

동적 CO₂와 배송자 부담 계산은 `app.js`의 `calculateOptions()`에 프로토타입 수식으로 분리되어 있습니다. 선행연구 기반 계산식 또는 Python API가 확정되면 이 함수의 입출력 구조를 유지한 채 교체할 수 있습니다.

## 주소 검색 설정

- 도로명 주소 검색은 카카오 우편번호 서비스를 사용합니다.
- 팝업 차단과 선택 결과 전달 문제를 방지하기 위해 주소 검색 화면을 홈페이지 내부에 표시합니다.
- 별도의 카카오 지도 키는 필요하지 않으며 지도와 좌표는 저장하지 않습니다.
- `config.js`의 `depotName`은 화면에 표시할 임시 배송 출발 거점 이름입니다.

현재 `prototype-address-v3`의 거리·CO₂·배송자 부담 값은 주소 문자열을 이용해 재현 가능한 모의값을 생성합니다. 실제 지도 좌표, 도로망 최적경로, 다중 주문 묶음배송 및 차량경로 문제 계산은 아직 구현하지 않았습니다.

실제 도로명 주소는 개인정보가 될 수 있으므로 실제 참가자 연구 전에 동의문, 보유기간, 접근권한, 비식별화 방식 및 연구윤리 심의 내용을 확정해야 합니다. 상세주소에는 동·호수나 공동현관 비밀번호를 입력받지 않는 것을 원칙으로 합니다.

## 코드 수정 후 홈페이지에 반영하는 방법

코드를 수정해도 홈페이지를 처음부터 다시 만들 필요는 없습니다. 수정사항을 로컬에서 확인한 뒤 기존 Netlify 프로젝트에 다시 배포하면 같은 홈페이지 주소에 새 버전이 반영됩니다.

### 1. 수정 전 확인

- `Nudge_Website` 폴더의 원본을 보관하거나 Git으로 변경 이력을 관리합니다.
- Supabase의 `study_submissions` 테이블에서 기존 연구 데이터를 CSV로 백업합니다.
- 실제 연구 진행 중이라면 수정 내용이 실험조건과 응답 해석에 영향을 주는지 먼저 확인합니다.
- `config.js`에는 Publishable key만 사용하며, Secret 또는 `service_role` 키를 넣지 않습니다.

### 2. VS Code에서 코드 수정

주요 파일의 역할은 다음과 같습니다.

| 파일 | 수정 대상 |
|---|---|
| `index.html` | 화면 구성, 설문 문구, 선택지 |
| `styles.css` | 전체 디자인과 반응형 화면 |
| `online-submission.css` | 온라인 제출 상태 디자인 |
| `app.js` | 화면 이동, 계산식, Nudge, 데이터 저장·전송 |
| `config.js` | Supabase Project URL과 Publishable key |
| `supabase-schema.sql` | 데이터베이스 테이블과 보안 정책 |

### 3. 설문 버전 변경

설문 문항, 선택지, 실험조건, 가격, 배송 슬롯, Nudge 또는 계산식을 변경했다면 `app.js` 상단의 설문 버전을 올립니다.

```js
const SURVEY_VERSION = "1.1";
```

단순한 오탈자 수정이나 화면 색상 변경처럼 데이터의 의미가 달라지지 않는 수정은 기존 버전을 유지할 수 있습니다. 버전을 변경했다면 `supabase-schema.sql` 정책의 다음 값도 같은 버전으로 수정해야 합니다.

```sql
and survey_version = '1.1'
```

그 후 Supabase SQL Editor에서 변경된 정책 SQL을 다시 실행합니다. 기존 응답은 삭제하지 않습니다.

### 4. 로컬에서 수정사항 확인

VS Code 터미널에서 다음 명령을 실행합니다.

```bash
cd Nudge_Website
python3 -m http.server 8000
```

브라우저에서 테스트 참가자 ID를 사용하여 접속합니다.

```text
http://localhost:8000/?pid=TEST001&condition=dynamic_information
```

최소한 다음 항목을 처음부터 끝까지 확인합니다.

- 배송정보 입력 및 필수 문항 검증
- 이용 가능한 배송 옵션 생성
- CO₂와 배송자 부담 계산값 표시
- Nudge 문구와 조건 배정
- 배송 옵션 선택 및 주문 확인
- 사후 앙케이트 제출
- 완료 화면의 온라인 전송 성공 메시지
- Supabase `study_submissions` 테이블에 테스트 행 생성
- JSON 및 CSV 다운로드
- 모바일 화면과 데스크톱 화면

같은 브라우저에서 다시 테스트할 때는 완료 화면의 **테스트 데이터 초기화 후 다시 시작** 버튼을 사용하거나 브라우저의 사이트 데이터를 삭제합니다. 실제 참가자 ID와 테스트 ID를 혼용하지 않습니다.

### 5. Netlify Drop으로 수동 재배포

1. [Netlify](https://app.netlify.com/)에 로그인합니다.
2. 기존에 만든 Nudge Website 프로젝트를 선택합니다.
3. **Deploys** 또는 **Production deploys** 화면으로 이동합니다.
4. 수정된 `Nudge_Website` 폴더 전체를 배포 영역에 다시 끌어다 놓습니다.
5. 배포가 완료될 때까지 기다립니다.
6. 기존 공개 주소에 접속하여 새 버전이 반영됐는지 확인합니다.

기존 프로젝트 안에서 재배포해야 같은 홈페이지 주소가 유지됩니다. 새로운 Netlify 프로젝트를 만들면 새로운 주소가 생성됩니다.

브라우저에 이전 파일이 남아 있으면 강력 새로고침을 하거나 시크릿 창에서 확인합니다.

```text
macOS: Command + Shift + R
Windows: Ctrl + Shift + R
```

### 6. Git 저장소와 Netlify를 연결한 경우

Git 저장소가 Netlify에 연결되어 있다면 폴더를 직접 올리지 않고 변경사항을 원격 저장소에 push합니다.

```bash
git add Nudge_Website
git commit -m "Update survey and delivery experiment"
git push
```

Netlify가 push를 감지하여 자동으로 배포합니다. Netlify의 Deploys 화면에서 배포 성공 여부를 확인한 뒤 공개 주소를 다시 테스트합니다.

### 7. 수정 후 데이터 확인

Supabase Dashboard의 **Table Editor > study_submissions**에서 다음 항목을 확인합니다.

- `participant_id`와 `session_id`
- `survey_version`
- `assigned_condition`
- `delivery_information`
- `option_exposures`
- `selected_option`
- `survey_responses`
- `event_log`
- `received_at`

새 버전의 테스트 데이터가 정상적으로 저장된 것을 확인한 후 실제 참가자에게 링크를 전달합니다. 테스트 행은 실제 연구 데이터와 구분하여 관리합니다.

### 8. 데이터베이스 수정이 필요한 경우

다음 수정은 일반적으로 홈페이지 재배포만으로 반영됩니다.

- 문구, 색상 및 화면 배치
- 기존 JSON 내부에 저장되는 설문 문항 추가
- 배송 슬롯, 가격, Nudge 및 계산식 변경

다음 수정은 Supabase SQL 변경도 필요할 수 있습니다.

- `study_submissions`의 최상위 열 추가 또는 삭제
- 열의 자료형 변경
- RLS 접근 권한 변경
- 새로운 테이블 추가

데이터베이스를 변경하기 전에는 기존 데이터를 CSV로 백업하고, `drop table`, `delete`, `truncate`처럼 데이터를 삭제할 수 있는 SQL은 목적과 영향을 확인하지 않고 실행하지 않습니다.

## 배포 전 최종 체크리스트

- [ ] 설문 및 실험 버전을 확인했다.
- [ ] 전체 실험 흐름을 로컬에서 완료했다.
- [ ] 실제 개인정보를 요구하는 문항이 없는지 확인했다.
- [ ] Supabase에 테스트 응답이 저장됐다.
- [ ] 참가자가 다른 응답을 조회할 수 없도록 RLS가 유지된다.
- [ ] 모바일과 데스크톱에서 화면을 확인했다.
- [ ] 기존 Netlify 프로젝트에 재배포했다.
- [ ] 공개 주소에서 마지막으로 제출 테스트를 완료했다.
- [ ] 실제 연구 전에 테스트 데이터를 구분하거나 정리했다.
