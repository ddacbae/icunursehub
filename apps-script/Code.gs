// ════════════════════════════════════════════════════════════════════════
// ICU Nurse Hub – Google Apps Script
//   · 체크 값을 0 / 1 로 저장 (해당없음은 빈칸)
//   · QM체크리스트 열 밀림(인계메모 위치) 자동 교정
//   · 월간 보고서 시트 + PDF 자동 생성
// ════════════════════════════════════════════════════════════════════════

// ── 설정 ────────────────────────────────────────────────────────────────
const REPORT_PREFIX = '월간보고서_';        // 보고서 시트 이름 앞머리
const PDF_FOLDER    = 'ICU 월간보고서';     // PDF 가 저장될 구글 드라이브 폴더
const TZ            = 'Asia/Seoul';

// app.js 를 고쳐서 QM 전송 순서를 바로잡았다면 아래를 false 로 바꾸세요.
// (앱과 GAS 양쪽에서 고치면 오히려 다시 밀립니다)
const QM_FIX_ORDER = true;

// 준수율 색상 기준 (%)
const GOOD_PCT = 95;   // 이상: 초록 / 우수
const WARN_PCT = 90;   // 이상: 노랑 / 주의,  미만: 빨강 / 개선 필요


const HEADERS = {
  '퀵라운딩': [
    '저장일시', '날짜', '근무', '침상번호',
    '교대전근무자', '교대후근무자',
    '완료항목', '전체항목', '달성률', '카테고리요약',
    'A-EKG리듬확인', 'A-알람설정',
    'B-산소흡입량', 'B-Vent및Highflow세팅', 'B-CRRT등세팅값',
    'C-중심정맥관위치드레싱', 'C-IV카테터상태',
    'D-의약라벨일치', 'D-약물희석라인', 'D-처방용량속도',
    'E-상처확인', 'E-배액관위치드레싱', 'E-배액관압력', 'E-배액량양상'
  ],
  '책임간호사라운딩': [
    '저장일시', '날짜', '근무', '침상번호',
    'Vent여부', '완료항목', '전체항목', '달성률',
    '중심정맥관-삽입부위확인', '중심정맥관-blood흔적',
    'IV-삽입부위확인', '간호일지-기록작성',
    '수혈-경로확인', '기록모니터링-비대면인계'
  ],
  'QM체크리스트': [
    '저장일시', '날짜', '근무', '근무자', '책임간호사', '침상번호',
    '완료항목', '전체항목', '달성률',
    'VAP-환경소독',
    'UTI-Foley lock확인', 'UTI-소변백위치', 'UTI-소변배양검사',
    'UTI-Foley삽입시2인모니터링', 'UTI-기저귀확인',
    '안전-수액개봉24시간', '안전-수액라벨확인', '안전-QR코드삭제', '안전-환자팔찌확인',
    '욕창-침상목욕자세변경', '욕창-의료기기예방드레싱', '욕창-젤패드적용',
    '환경-투약준비대차팅테이블', '환경-침대청소', '환경-상두대IV폴대',
    '환경-InfusionPump', '환경-N근무환경소독',
    '업무-의사간보고참여', '업무-백업라운딩', '업무-간호업무지원',
    '기록-리마인더업데이트', '인계메모'
  ],
  '유치도뇨관': [
    '저장일시', '시행일', '근무', '확인자', '침상번호',
    '도뇨관보유', '무른변환자',
    '1차확인', '2차확인', '3차확인'
  ],
};

// 시트별 열 위치 (0부터 셈)
//   dateCol  : 날짜 열
//   shiftCol : 근무 열
//   binCols  : 0/1 로 바꿀 열
//   itemCols : 준수율 계산에 쓸 점검 항목 열
const SHEET_CFG = {
  '퀵라운딩':         { dateCol: 1, shiftCol: 2, binCols: range_(10, 23),            itemCols: range_(10, 23) },
  '책임간호사라운딩': { dateCol: 1, shiftCol: 2, binCols: [4].concat(range_(8, 13)), itemCols: range_(8, 13)  },
  'QM체크리스트':     { dateCol: 1, shiftCol: 2, binCols: range_(9, 30),             itemCols: range_(9, 30)  },
  '유치도뇨관':       { dateCol: 1, shiftCol: 2, binCols: range_(5, 9),              itemCols: range_(7, 9)   },
};

function range_(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

// 같은 값이 들어오면 새 줄을 만들지 않고 기존 줄을 덮어쓸 시트와 그 기준 열
//   유치도뇨관: 시행일(1) + 근무(2) + 침상번호(4)
//   → 한 근무 안에서 09:30 / 11:30 / 14:30 을 나눠 저장해도 침상당 한 줄로 유지됨
const UPSERT_KEYS = {
  '유치도뇨관': [1, 2, 4],
};


// ════════════════════════════════════════════════════════════════════════
// 1. 값 정규화   ✓ / — → 1 / 0,  N/A → 빈칸
// ════════════════════════════════════════════════════════════════════════
const ONE_SET  = ['1', '✓', '✔', 'o', '○', '●', 'y', 'yes', 'true', 't', 'check', '체크', '완료'];
const ZERO_SET = ['0', '—', '–', '-', 'x', '×', 'n', 'no', 'false', 'f', '', '미체크'];
const NA_SET   = ['n/a', 'na', 'n.a.', '해당없음', '해당사항없음', '비해당'];

/**
 * 체크 값을 1 / 0 / '' (해당없음) 으로 바꿉니다.
 * 알 수 없는 값은 통계를 왜곡하지 않도록 '' (집계 제외) 로 둡니다.
 */
function toBinary_(v) {
  if (v === true)  return 1;
  if (v === false) return 0;
  if (typeof v === 'number') return v ? 1 : 0;

  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (NA_SET.indexOf(s)   !== -1) return '';
  if (ONE_SET.indexOf(s)  !== -1) return 1;
  if (ZERO_SET.indexOf(s) !== -1) return 0;
  return '';
}

/** 한 행에서 지정된 열들만 0/1 로 정규화 */
function normalizeRow_(row, binCols) {
  binCols.forEach(function (c) {
    if (c < row.length) row[c] = toBinary_(row[c]);
  });
  return row;
}

/**
 * QM체크리스트 열 밀림 교정.
 * 앱은 [ …달성률, 인계메모, 체크22개 ] 순서로 보내는데
 * 헤더는  [ …달성률, 체크22개, 인계메모 ] 이므로 10번째 값을 맨 뒤로 옮깁니다.
 */
function fixQmOrder_(row) {
  if (!QM_FIX_ORDER) return row;
  if (row.length !== HEADERS['QM체크리스트'].length) return row;  // 길이가 다르면 손대지 않음
  const memo = row.splice(9, 1)[0];
  row.push(memo);
  return row;
}


// ════════════════════════════════════════════════════════════════════════
// 2. 시트 준비
// ════════════════════════════════════════════════════════════════════════
function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  const headers = HEADERS[name] || ['저장일시', '데이터'];

  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  } else {
    const lastCol = sheet.getLastColumn();
    const existing = lastCol > 0
      ? sheet.getRange(1, 1, 1, lastCol).getValues()[0]
      : [];
    const filled = existing.filter(function (v) { return v !== '' && v !== null; }).length;
    if (filled !== headers.length) {
      if (lastCol > 0) sheet.getRange(1, 1, 1, lastCol).clearContent();
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }

  sheet.getRange(1, 1, 1, headers.length)
       .setBackground('#2563eb').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  try { sheet.autoResizeColumns(1, headers.length); } catch (_) {}

  return sheet;
}

/** 헤더 강제 재설정 (메뉴에서 실행) */
function fixHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach(function (name) {
    const headers = HEADERS[name];
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    const lastCol = Math.max(sheet.getLastColumn(), headers.length);
    sheet.getRange(1, 1, 1, lastCol).clearContent();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
         .setBackground('#2563eb').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
    try { sheet.autoResizeColumns(1, headers.length); } catch (_) {}
  });
  ss.toast('✅ 모든 시트 헤더 업데이트 완료');
}


// ════════════════════════════════════════════════════════════════════════
// 3. 앱에서 오는 데이터 수신
// ════════════════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    const payload   = JSON.parse(e.postData.contents);
    const sheetName = payload.sheetName || '퀵라운딩';
    const ss        = SpreadsheetApp.getActiveSpreadsheet();
    const sheet     = getOrCreateSheet(ss, sheetName);
    const cfg       = SHEET_CFG[sheetName];

    const prepared = (payload.rows || []).map(function (row) {
      // 앱이 탭 문자로 묶어 보낸 세부 항목을 개별 열로 펼침
      let expanded = row.reduce(function (acc, v) {
        if (typeof v === 'string' && v.indexOf('\t') !== -1) return acc.concat(v.split('\t'));
        acc.push(v);
        return acc;
      }, []);

      if (sheetName === 'QM체크리스트') expanded = fixQmOrder_(expanded);
      if (cfg) expanded = normalizeRow_(expanded, cfg.binCols);
      return expanded;
    });

    const rows = prepared;
    if (UPSERT_KEYS[sheetName]) {
      upsertRows_(sheet, sheetName, prepared);
    } else {
      prepared.forEach(function (r) { sheet.appendRow(r); });
    }

    try { sheet.autoResizeColumns(1, sheet.getLastColumn()); } catch (_) {}

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', inserted: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput('✅ ICU Nurse Hub API 정상 작동 중')
    .setMimeType(ContentService.MimeType.TEXT);
}


/**
 * 기준 열이 같은 행이 이미 있으면 덮어쓰고, 없으면 새로 추가합니다.
 * 시트를 한 번만 읽어 색인을 만들므로 여러 행을 한꺼번에 보내도 빠릅니다.
 */
function upsertRows_(sheet, sheetName, rows) {
  const keys  = UPSERT_KEYS[sheetName];
  const width = HEADERS[sheetName].length;
  const last  = sheet.getLastRow();
  const index = {};

  if (last >= 2) {
    const nCols  = Math.max(sheet.getLastColumn(), width);
    const values = sheet.getRange(2, 1, last - 1, nCols).getValues();
    values.forEach(function (v, i) {
      index[rowSignature_(v, keys)] = i + 2;   // 뒤쪽 행이 우선 (최신 기록)
    });
  }

  const toAppend = [];
  rows.forEach(function (row) {
    const at = index[rowSignature_(row, keys)];
    if (at) sheet.getRange(at, 1, 1, row.length).setValues([row]);
    else    toAppend.push(row);
  });

  if (toAppend.length) {
    const w = Math.max(width, Math.max.apply(null, toAppend.map(function (r) { return r.length; })));
    const padded = toAppend.map(function (r) {
      const out = r.slice();
      while (out.length < w) out.push('');
      return out;
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, padded.length, w).setValues(padded);
  }
}

function rowSignature_(row, keys) {
  return keys.map(function (c) { return keyText_(row[c]); }).join('|');
}

/** 날짜가 문자열/날짜값 어느 쪽으로 저장돼 있어도 같은 키로 비교되게 함 */
function keyText_(v) {
  const s = String(v == null ? '' : v).trim();
  if (s.length >= 8) {
    const d = parseDate_(v);
    if (d) return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
  }
  return s;
}


// ════════════════════════════════════════════════════════════════════════
// 4. 기존 데이터 일괄 변환 (한 번만 실행)
// ════════════════════════════════════════════════════════════════════════
function convertLegacyToBinary() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  const qmDone = props.getProperty('QM_REORDER_DONE') === 'yes';

  const msg = '기존에 쌓인 ✓ / — 데이터를 0 / 1 로 바꿉니다.\n\n'
    + '· 실행 전 시트마다 백업 사본을 자동으로 만듭니다.\n'
    + (qmDone
        ? '· QM체크리스트 열 밀림 교정은 이미 완료되어 건너뜁니다.\n'
        : '· QM체크리스트의 밀린 열(인계메모)도 이번에 함께 바로잡습니다.\n'
          + '  이 교정은 딱 한 번만 실행되어야 하며 이후 자동으로 잠깁니다.\n')
    + '\n진행할까요?';

  if (ui.alert('기존 데이터 변환', msg, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  const stamp = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd_HHmm');
  const report = [];

  Object.keys(SHEET_CFG).forEach(function (name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) { report.push(name + ': 데이터 없음'); return; }

    // 되돌릴 수 있도록 먼저 백업
    sheet.copyTo(ss).setName((name + '_백업_' + stamp).slice(0, 100));

    const cfg     = SHEET_CFG[name];
    const headers = HEADERS[name];
    const nRows   = sheet.getLastRow() - 1;
    const nCols   = Math.max(sheet.getLastColumn(), headers.length);
    const rng     = sheet.getRange(2, 1, nRows, nCols);
    const values  = rng.getValues();

    let reordered = 0;
    values.forEach(function (row) {
      // 기존 QM 행은 전부 밀린 상태이므로 한 번만 되돌림
      if (name === 'QM체크리스트' && !qmDone && QM_FIX_ORDER) {
        const memo = row.splice(9, 1)[0];
        row.push(memo);
        reordered++;
      }
      normalizeRow_(row, cfg.binCols);
    });

    rng.setValues(values);
    report.push(name + ': ' + nRows + '행 변환'
      + (reordered ? ' / ' + reordered + '행 열 교정' : ''));
  });

  props.setProperty('QM_REORDER_DONE', 'yes');

  // 근무자 / 책임간호사 / 침상번호 열 교정 (백업은 위 반복문에서 이미 떠 둠)
  const idFix = fixQmIdentityColumns_(ss, false);
  if (idFix.fixed) report.push('QM체크리스트: ' + idFix.fixed + '행 근무자/침상번호 열 교정');

  ui.alert('변환 완료', report.join('\n') + '\n\n백업 시트: *_백업_' + stamp, ui.ButtonSet.OK);
}


/** 메뉴에서 단독 실행 – QM 근무자/책임간호사/침상번호 열만 바로잡음 */
function fixQmIdentityColumns() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const r = fixQmIdentityColumns_(ss, true);

  if (r.scanned === 0) { ui.alert('QM체크리스트에 데이터가 없습니다.'); return; }
  ui.alert('QM 근무자/침상번호 열 교정',
    r.scanned + '행 확인\n'
    + r.fixed + '행 교정\n'
    + r.skipped + '행은 이미 정상\n'
    + (r.fixed ? '\n백업 시트를 함께 만들었습니다.' : ''),
    ui.ButtonSet.OK);
}

/**
 * 예전 앱은 [침상번호, 근무자, 책임간호사] 순서로 보냈지만
 * 헤더는 [근무자, 책임간호사, 침상번호] 순서입니다.
 *
 * '12번' 형태의 침상번호가 어느 칸에 들어 있는지로 판별하므로
 * 여러 번 실행해도 이미 정상인 행은 건드리지 않습니다.
 */
function fixQmIdentityColumns_(ss, backup) {
  const name = 'QM체크리스트';
  const out = { scanned: 0, fixed: 0, skipped: 0 };

  const sheet = ss.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return out;

  const headers = HEADERS[name];
  const nRows = sheet.getLastRow() - 1;
  const nCols = Math.max(sheet.getLastColumn(), headers.length);
  const rng    = sheet.getRange(2, 1, nRows, nCols);
  const values = rng.getValues();

  const isBed = v => /^\s*\d+\s*번\s*$/.test(String(v == null ? '' : v));
  const needsFix = r => isBed(r[3]) && !isBed(r[5]);

  out.scanned = nRows;
  if (!values.some(needsFix)) { out.skipped = nRows; return out; }

  if (backup) {
    sheet.copyTo(ss).setName(
      (name + '_백업_' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd_HHmm')).slice(0, 100));
  }

  values.forEach(r => {
    if (!needsFix(r)) { out.skipped++; return; }
    const bed = r[3], worker = r[4], charge = r[5];
    r[3] = worker;   // 근무자
    r[4] = charge;   // 책임간호사
    r[5] = bed;      // 침상번호
    out.fixed++;
  });

  rng.setValues(values);
  return out;
}


// ════════════════════════════════════════════════════════════════════════
// 5. 월간 보고서
// ════════════════════════════════════════════════════════════════════════
function reportThisMonth() {
  const now = new Date();
  buildMonthlyReport(now.getFullYear(), now.getMonth() + 1, true);
}

function reportLastMonth() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  buildMonthlyReport(d.getFullYear(), d.getMonth() + 1, true);
}

function reportPrompt() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('월간 보고서', '보고서를 만들 달을 입력하세요 (예: 2026-08)', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const m = String(res.getResponseText()).trim().match(/^(\d{4})\D+(\d{1,2})$/);
  if (!m) { ui.alert('형식이 올바르지 않습니다. 예: 2026-08'); return; }
  buildMonthlyReport(Number(m[1]), Number(m[2]), true);
}

/** 매월 1일 트리거가 부르는 함수 – 전월 보고서를 조용히 생성 */
function monthlyReportAuto() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  buildMonthlyReport(d.getFullYear(), d.getMonth() + 1, false);
}


/**
 * 한 달치 보고서 시트를 만들고 PDF 로 저장합니다.
 * @param {number}  y         연도
 * @param {number}  m         월 (1~12)
 * @param {boolean} showAlert 완료 안내창 표시 여부
 */
function buildMonthlyReport(y, m, showAlert) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const label = y + '-' + ('0' + m).slice(-2);
  const names = Object.keys(SHEET_CFG);
  const W     = 7;   // 표 너비(열 수)

  // ── 데이터 집계 ──
  const stats = {};
  names.forEach(function (n) { stats[n] = collectMonth_(ss, n, y, m); });

  const totalRows = names.reduce(function (s, n) { return s + stats[n].rowCount; }, 0);
  if (totalRows === 0) {
    const none = label + ' 에 해당하는 데이터가 없습니다.';
    if (showAlert) SpreadsheetApp.getUi().alert(none); else Logger.log(none);
    return null;
  }

  // ── 보고서 시트 준비 ──
  const sheetName = REPORT_PREFIX + label;
  const old = ss.getSheetByName(sheetName);
  if (old) ss.deleteSheet(old);
  const sh = ss.insertSheet(sheetName, ss.getNumSheets());
  sh.setHiddenGridlines(true);

  let r = 1;

  // ── 제목 ──
  sh.getRange(r, 1, 1, W).merge()
    .setValue('ICU Nurse Hub   월간 점검 보고서')
    .setFontSize(18).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#1e40af')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(r, 42);
  r++;

  const lastDay = new Date(y, m, 0).getDate();
  sh.getRange(r, 1, 1, W).merge()
    .setValue('대상 기간: ' + y + '년 ' + m + '월  ('
      + label + '-01 ~ ' + label + '-' + ('0' + lastDay).slice(-2) + ')'
      + '      |      생성일시: ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'))
    .setFontSize(10).setFontColor('#475569')
    .setBackground('#e2e8f0').setHorizontalAlignment('center');
  r += 2;

  // ── 1. 종합 요약 ──
  r = writeSectionTitle_(sh, r, W, '1.  종합 요약');
  r = writeTableHeader_(sh, r, ['구분', '점검 건수', '점검 항목 수', '준수', '미준수', '준수율', '평가']);

  const sumStart = r;
  names.forEach(function (n) {
    const st = stats[n];
    const pct = st.total ? st.ok / st.total * 100 : null;
    sh.getRange(r, 1, 1, W).setValues([[
      n, st.rowCount, st.total, st.ok, st.total - st.ok, '', evalText_(pct)
    ]]);
    stylePctCell_(sh.getRange(r, 6), pct);
    r++;
  });

  const gTotal = names.reduce(function (s, n) { return s + stats[n].total; }, 0);
  const gOk    = names.reduce(function (s, n) { return s + stats[n].ok; }, 0);
  const gPct   = gTotal ? gOk / gTotal * 100 : null;
  sh.getRange(r, 1, 1, W).setValues([[
    '전체', totalRows, gTotal, gOk, gTotal - gOk, '', evalText_(gPct)
  ]]).setFontWeight('bold').setBackground('#f1f5f9');
  stylePctCell_(sh.getRange(r, 6), gPct);

  sh.getRange(sumStart, 1, r - sumStart + 1, W)
    .setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);
  r += 3;

  // ── 2. 항목별 준수율 ──
  r = writeSectionTitle_(sh, r, W, '2.  항목별 준수율');
  names.forEach(function (n) {
    const st = stats[n];
    if (st.rowCount === 0) return;

    sh.getRange(r, 1, 1, W).merge()
      .setValue('▪ ' + n + '   (점검 ' + st.rowCount + '건)')
      .setFontWeight('bold').setFontColor('#1e3a8a').setBackground('#dbeafe');
    r++;

    r = writeTableHeader_(sh, r, ['점검 항목', '점검', '준수', '미준수', '해당없음', '준수율', '평가']);
    const start = r;
    st.items.forEach(function (it) {
      const pct = it.total ? it.ok / it.total * 100 : null;
      sh.getRange(r, 1, 1, W).setValues([[
        it.name, it.total, it.ok, it.total - it.ok, it.na, '', evalText_(pct)
      ]]);
      stylePctCell_(sh.getRange(r, 6), pct);
      r++;
    });
    sh.getRange(start - 1, 1, r - start + 1, W)
      .setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);
    r += 2;
  });

  // ── 3. 일자별 추이 ──
  r = writeSectionTitle_(sh, r, W, '3.  일자별 준수율 추이');
  const trendCols = ['날짜'].concat(names).concat(['전체']);
  const headRow = r;
  r = writeTableHeader_(sh, headRow, trendCols);

  const trendRows = [];
  for (let d = 1; d <= lastDay; d++) {
    const key = label + '-' + ('0' + d).slice(-2);
    let dayTotal = 0, dayOk = 0;
    const cells = [key];
    names.forEach(function (n) {
      const rec = stats[n].daily[key];
      if (rec && rec.total) {
        cells.push(rec.ok / rec.total * 100);
        dayTotal += rec.total;
        dayOk    += rec.ok;
      } else {
        cells.push('');
      }
    });
    cells.push(dayTotal ? dayOk / dayTotal * 100 : '');
    if (dayTotal) trendRows.push(cells);   // 점검 기록이 없는 날은 생략
  }

  if (trendRows.length) {
    const nCol = trendCols.length;
    sh.getRange(r, 1, trendRows.length, nCol).setValues(trendRows);
    sh.getRange(r, 2, trendRows.length, nCol - 1).setNumberFormat('0.0"%"');
    sh.getRange(headRow, 1, trendRows.length + 1, nCol)
      .setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);

    const chart = sh.newChart().asLineChart()
      .addRange(sh.getRange(headRow, 1, trendRows.length + 1, 1))
      .addRange(sh.getRange(headRow, nCol, trendRows.length + 1, 1))
      .setNumHeaders(1)
      .setOption('title', label + '  일자별 전체 준수율 (%)')
      .setOption('legend', { position: 'none' })
      .setOption('height', 300)
      .setOption('width', 640)
      .setOption('pointSize', 4)
      .setOption('colors', ['#1e40af'])
      .setPosition(headRow, nCol + 2, 0, 0)
      .build();
    sh.insertChart(chart);
    r += trendRows.length;
  } else {
    sh.getRange(r, 1).setValue('데이터 없음');
    r++;
  }

  // ── 마무리 서식 ──
  sh.setColumnWidth(1, 260);
  for (let c = 2; c <= W; c++) sh.setColumnWidth(c, 96);
  sh.getRange(1, 1, sh.getLastRow(), W).setVerticalAlignment('middle');
  sh.setFrozenRows(2);

  // ── PDF 저장 ──
  let pdfOk = false;
  try {
    exportSheetAsPdf_(ss, sh, 'ICU월간보고서_' + label);
    pdfOk = true;
  } catch (err) {
    Logger.log('PDF 생성 실패: ' + err.message);
  }

  ss.setActiveSheet(sh);

  if (showAlert) {
    const ui = SpreadsheetApp.getUi();
    ui.alert('보고서 생성 완료',
      label + ' 보고서를 만들었습니다.\n\n'
      + '· 시트: ' + sheetName + '\n'
      + '· 점검 건수: ' + totalRows + '건\n'
      + '· 전체 준수율: ' + (gPct === null ? '-' : gPct.toFixed(1) + '%') + '\n'
      + (pdfOk
          ? '· PDF: 드라이브 「' + PDF_FOLDER + '」 폴더에 저장됨'
          : '· PDF 생성에 실패했습니다 (시트는 정상 생성)'),
      ui.ButtonSet.OK);
  }
  return sh;
}


/** 한 시트에서 지정한 달의 데이터를 집계 */
function collectMonth_(ss, sheetName, y, m) {
  const cfg     = SHEET_CFG[sheetName];
  const headers = HEADERS[sheetName];

  const items = cfg.itemCols.map(function (c) {
    return { name: headers[c] || ('열' + (c + 1)), col: c, total: 0, ok: 0, na: 0 };
  });
  const result = { rowCount: 0, total: 0, ok: 0, items: items, daily: {} };

  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return result;

  const nCols  = Math.max(sheet.getLastColumn(), headers.length);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, nCols).getValues();

  values.forEach(function (row) {
    const d = parseDate_(row[cfg.dateCol]);
    if (!d || d.getFullYear() !== y || d.getMonth() + 1 !== m) return;

    result.rowCount++;
    const key = Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
    if (!result.daily[key]) result.daily[key] = { total: 0, ok: 0 };

    items.forEach(function (it) {
      const b = toBinary_(row[it.col]);
      if (b === '') { it.na++; return; }
      it.total++;
      result.total++;
      result.daily[key].total++;
      if (b === 1) {
        it.ok++;
        result.ok++;
        result.daily[key].ok++;
      }
    });
  });

  return result;
}


// ── 보고서 서식 도우미 ─────────────────────────────────────────────────
function writeSectionTitle_(sh, r, w, title) {
  sh.getRange(r, 1, 1, w).merge()
    .setValue(title)
    .setFontSize(13).setFontWeight('bold').setFontColor('#0f172a')
    .setBackground('#f8fafc')
    .setBorder(false, false, true, false, false, false, '#1e40af', SpreadsheetApp.BorderStyle.SOLID_THICK);
  sh.setRowHeight(r, 28);
  return r + 2;
}

function writeTableHeader_(sh, r, cols) {
  sh.getRange(r, 1, 1, cols.length).setValues([cols])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#334155')
    .setHorizontalAlignment('center');
  return r + 1;
}

function stylePctCell_(cell, pct) {
  if (pct === null || pct === undefined || pct === '') { cell.setValue('-'); return; }
  cell.setValue(pct).setNumberFormat('0.0"%"').setHorizontalAlignment('center');
  if (pct >= GOOD_PCT)      cell.setBackground('#dcfce7').setFontColor('#166534');
  else if (pct >= WARN_PCT) cell.setBackground('#fef9c3').setFontColor('#854d0e');
  else                      cell.setBackground('#fee2e2').setFontColor('#991b1b').setFontWeight('bold');
}

function evalText_(pct) {
  if (pct === null || pct === undefined || pct === '') return '-';
  if (pct >= GOOD_PCT) return '우수';
  if (pct >= WARN_PCT) return '주의';
  return '개선 필요';
}

function parseDate_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return v;
  const s = String(v == null ? '' : v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}


// ── PDF 내보내기 ───────────────────────────────────────────────────────
function exportSheetAsPdf_(ss, sheet, fileName) {
  const url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export'
    + '?format=pdf&gid=' + sheet.getSheetId()
    + '&portrait=true&fitw=true&scale=4'
    + '&sheetnames=false&printtitle=false&pagenumbers=true'
    + '&gridlines=false&fzr=false'
    + '&top_margin=0.4&bottom_margin=0.4&left_margin=0.4&right_margin=0.4';

  const blob = UrlFetchApp
    .fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } })
    .getBlob().setName(fileName + '.pdf');

  const folder = getOrCreateFolder_(PDF_FOLDER);
  const dup = folder.getFilesByName(fileName + '.pdf');
  while (dup.hasNext()) dup.next().setTrashed(true);   // 같은 달 파일은 새 것으로 교체

  return folder.createFile(blob);
}

function getOrCreateFolder_(name) {
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}


// ════════════════════════════════════════════════════════════════════════
// 6. 메뉴 & 자동 실행 트리거
// ════════════════════════════════════════════════════════════════════════
function onOpen() {
  SpreadsheetApp.getUi().createMenu('📋 ICU 보고서')
    .addItem('이번 달 보고서 만들기', 'reportThisMonth')
    .addItem('지난 달 보고서 만들기', 'reportLastMonth')
    .addItem('날짜 지정해서 만들기',  'reportPrompt')
    .addSeparator()
    .addItem('매월 자동 생성 켜기', 'installMonthlyTrigger')
    .addItem('매월 자동 생성 끄기', 'removeMonthlyTrigger')
    .addSeparator()
    .addItem('기존 ✓/— 데이터를 0/1 로 변환', 'convertLegacyToBinary')
    .addItem('QM 근무자/침상번호 열 교정', 'fixQmIdentityColumns')
    .addItem('시트 헤더 재설정', 'fixHeaders')
    .addToUi();
}

function installMonthlyTrigger() {
  removeMonthlyTrigger_();
  ScriptApp.newTrigger('monthlyReportAuto')
    .timeBased().onMonthDay(1).atHour(2).create();
  SpreadsheetApp.getUi().alert('✅ 매월 1일 새벽 2시에 전월 보고서가 자동 생성됩니다.');
}

function removeMonthlyTrigger() {
  const n = removeMonthlyTrigger_();
  SpreadsheetApp.getUi().alert(n ? '⏹ 자동 생성을 껐습니다.' : '설정된 자동 생성이 없습니다.');
}

function removeMonthlyTrigger_() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'monthlyReportAuto') {
      ScriptApp.deleteTrigger(t);
      n++;
    }
  });
  return n;
}
