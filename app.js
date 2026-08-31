// ===== NAVIGATION =====
const screenHistory = [];

function showScreen(id) {
  const current = document.querySelector('.screen.active');
  if (current && current.id !== id) {
    screenHistory.push(current.id);
  }
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');

  // Initialize specific screens
  if (id === 'screen-initial-assessment') {
    setTimeout(() => buildProtoDeptList(), 0);
  }
  if (id === 'screen-rounding') {
    setTimeout(() => renderRounding(), 0);
  }
  if (id === 'screen-home') {
    setTimeout(() => renderHomeFavorites(), 0);
  }
  if (id === 'screen-favorites') {
    setTimeout(() => renderFavManage(), 0);
  }
  if (id === 'screen-foley-monitoring') {
    setTimeout(() => {
      initFoleyMonitoring();
      // 이전에 선택된 교대가 있으면 복원
      if (foleyCurrentShift) foleySelectShift(foleyCurrentShift);
    }, 0);
  }
  if (id === 'screen-qm-checklist') {
    setTimeout(() => initQMChecklist(), 0);
  }
  if (id === 'screen-discharge') {
    setTimeout(() => initDischarge(), 0);
  }
  if (id === 'screen-drugcalc') {
    setTimeout(() => dc_goView('cat'), 0);
  }
  if (id === 'screen-antibiotic-ast') {
    setTimeout(() => { if (typeof ast_renderCards === 'function') ast_renderCards(); }, 0);
  }
  // 북마크 버튼 상태 갱신
  setTimeout(() => updateAllBookmarkBtns(), 0);
}

function goBack() {
  // 기본 화면 네비게이션
  if (screenHistory.length > 0) {
    const prev = screenHistory.pop();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(prev);
    if (target) target.classList.add('active');
  } else {
    showScreen('screen-home');
  }
}

// ===== DETAIL TABS =====
function showDetailTab(tab) {
  document.querySelectorAll('.detail-content').forEach(c => c.style.display = 'none');
  document.querySelectorAll('.dtab').forEach(t => t.classList.remove('active'));
  const content = document.getElementById('detail-' + tab);
  if (content) content.style.display = 'block';
  const tabs = document.querySelectorAll('.dtab');
  const map = { info: 0, drug: 1, lab: 2, memo: 3 };
  if (tabs[map[tab]]) tabs[map[tab]].classList.add('active');
}

// ===== VENTILATOR TABS =====
function switchVentTab(tab) {
  ['mode','alarm','weaning'].forEach(t => {
    const el = document.getElementById('vent-' + t);
    if (el) el.style.display = 'none';
  });
  document.querySelectorAll('.vent-tab').forEach(t => t.classList.remove('active'));
  const content = document.getElementById('vent-' + tab);
  if (content) content.style.display = 'block';
  const map = { mode: 0, alarm: 1, weaning: 2 };
  const tabs = document.querySelectorAll('.vent-tab');
  if (tabs[map[tab]]) tabs[map[tab]].classList.add('active');
}

// ===== DRUG CALCULATOR =====
let currentConc = 4; // mg per 250mL → μg/mL = mg*4
let currentDrug = 'norepi';

function selectDrug(drug, btn) {
  currentDrug = drug;
  document.querySelectorAll('.drug-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  calcRate();
}

function selectConc(mg, btn) {
  currentConc = mg;
  document.querySelectorAll('.conc-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  calcRate();
}

function adjustDose(delta) {
  const input = document.getElementById('dose-val');
  if (!input) return;
  let val = parseFloat(input.value) || 0;
  val = Math.max(0, Math.round((val + delta) * 100) / 100);
  input.value = val;
  calcRate();
}

function calcRate() {
  const dose = parseFloat(document.getElementById('dose-val')?.value) || 0;
  const weight = parseFloat(document.getElementById('weight-val')?.value) || 0;
  const concUgPerMl = (currentConc * 1000) / 250; // μg/mL
  const ratePerHr = (dose * weight * 60) / concUgPerMl;
  const rateRounded = Math.round(ratePerHr * 10) / 10;
  const daily = Math.round(rateRounded * 24);

  const rateEl = document.getElementById('rate-result');
  const dailyEl = document.getElementById('daily-result');
  const formulaEl = document.getElementById('formula-detail');

  if (rateEl) rateEl.textContent = rateRounded.toFixed(1);
  if (dailyEl) dailyEl.textContent = `= ${daily} mL / 24hr`;
  if (formulaEl) {
    formulaEl.textContent = `${dose} × ${weight} × 60 ÷ ${concUgPerMl} = ${rateRounded.toFixed(1)}`;
  }
}

// ===== DRUG CALCULATOR - NEW SYSTEM =====
let currentView = 'categories';
let selectedCategory = null;
let currentDrugKey = null;
let drugCalcState = { dose: 0, weight: 70, conc: null };

const DRUG_CATEGORIES = {
  'sedation': { label: '진정제', icon: '💤', drugs: ['dexmed', 'midazolam', 'propofol', 'etomidate', 'ketamine'] },
  'analgesia': { label: '진통제', icon: '💉', drugs: ['remifentanil', 'sufentanil', 'fentanyl', 'morphine', 'tramadol'] },
  'vasopressor': { label: '혈관활성', icon: '🔴', drugs: ['norepi', 'dopamine', 'epinephrine', 'phenylephrine', 'vasopressin'] },
  'cardiac': { label: '심장약', icon: '❤️', drugs: ['dobutamine', 'milrinone', 'nitroglycerin', 'nitroprusside'] },
  'antihypertensive': { label: '항고혈압', icon: '⬇️', drugs: ['labetalol', 'hydralazine', 'esmolol', 'nicardipine', 'magnesium'] },
  'nmb': { label: '신경근차단제', icon: '🔗', drugs: ['succinylcholine', 'rocuronium', 'vecuronium', 'cisatracurium', 'atracurium'] }
};

const DRUG_LIBRARY = {
  'dexmed': { name: 'Dexmedetomidine', kor: '덱스메데토미딘', category: 'sedation', concentrations: [{ label: '500μg/50mL', value: '500/50' }], doseUnit: 'mcg/kg/hr', doseRange: '0.2-0.7', defaultDose: 0.5, warningMsg: '저혈압 주의', notes: 'Central line 권장' },
  'midazolam': { name: 'Midazolam', kor: '미다졸람', category: 'sedation', concentrations: [{ label: '5mg/10mL', value: '5/10' }, { label: '10mg/10mL', value: '10/10' }], doseUnit: 'mg/kg/hr', doseRange: '0.03-0.1', defaultDose: 0.05, warningMsg: '', notes: '' },
  'propofol': { name: 'Propofol', kor: '프로포폴', category: 'sedation', concentrations: [{ label: '10mg/mL', value: '10/1' }, { label: '20mg/mL', value: '20/1' }], doseUnit: 'mcg/kg/min', doseRange: '25-75', defaultDose: 50, warningMsg: '저혈압 주의', notes: 'Central line 권장' },
  'etomidate': { name: 'Etomidate', kor: '에토미데이트', category: 'sedation', concentrations: [{ label: '2mg/mL', value: '2/1' }], doseUnit: 'mg/kg/hr', doseRange: '0.2-0.5', defaultDose: 0.3, warningMsg: '부신 억제', notes: '' },
  'ketamine': { name: 'Ketamine', kor: '케타민', category: 'sedation', concentrations: [{ label: '50mg/mL', value: '50/1' }], doseUnit: 'mg/kg/hr', doseRange: '0.5-2', defaultDose: 1, warningMsg: '고혈압/빈맥 주의', notes: '' },
  'remifentanil': { name: 'Remifentanil', kor: '레미펜타닐', category: 'analgesia', concentrations: [{ label: '250μg/50mL', value: '250/50' }, { label: '500μg/50mL', value: '500/50' }], doseUnit: 'mcg/kg/min', doseRange: '0.5-2', defaultDose: 1, warningMsg: '급속 중단 금지', notes: '초단시간 작용' },
  'sufentanil': { name: 'Sufentanil', kor: '수펜타닐', category: 'analgesia', concentrations: [{ label: '250μg/50mL', value: '250/50' }], doseUnit: 'mcg/kg/hr', doseRange: '0.5-1.5', defaultDose: 1, warningMsg: '', notes: '' },
  'fentanyl': { name: 'Fentanyl', kor: '펜타닐', category: 'analgesia', concentrations: [{ label: '250μg/50mL', value: '250/50' }, { label: '500μg/50mL', value: '500/50' }], doseUnit: 'mcg/kg/hr', doseRange: '1-3', defaultDose: 2, warningMsg: '', notes: '' },
  'morphine': { name: 'Morphine', kor: '모르핀', category: 'analgesia', concentrations: [{ label: '10mg/mL', value: '10/1' }], doseUnit: 'mg/kg/hr', doseRange: '1-4', defaultDose: 2, warningMsg: '저혈압 주의', notes: '히스타민 방출' },
  'tramadol': { name: 'Tramadol', kor: '트라마돌', category: 'analgesia', concentrations: [{ label: '100mg/2mL', value: '100/2' }], doseUnit: 'mg/kg/hr', doseRange: '1-4', defaultDose: 2, warningMsg: '경련 주의', notes: '' },
  'norepi': { name: 'Norepinephrine', kor: '노르에피네프린', category: 'vasopressor', concentrations: [{ label: '4mg/250mL', value: '4/250' }, { label: '8mg/250mL', value: '8/250' }, { label: '16mg/250mL', value: '16/250' }], doseUnit: 'mcg/kg/min', doseRange: '0.5-2', defaultDose: 0.5, warningMsg: '고농도 주의', notes: 'Central line 필수' },
  'dopamine': { name: 'Dopamine', kor: '도파민', category: 'vasopressor', concentrations: [{ label: '800mg/500mL', value: '800/500' }], doseUnit: 'mcg/kg/min', doseRange: '2-20', defaultDose: 10, warningMsg: '', notes: 'Peripheral 투여 가능 (저용량)' },
  'epinephrine': { name: 'Epinephrine', kor: '에피네프린', category: 'vasopressor', concentrations: [{ label: '1mg/10mL', value: '1/10' }], doseUnit: 'mcg/kg/min', doseRange: '0.5-2', defaultDose: 0.5, warningMsg: '고농도 주의', notes: 'Central line 필수' },
  'phenylephrine': { name: 'Phenylephrine', kor: '페닐에프린', category: 'vasopressor', concentrations: [{ label: '250μg/10mL', value: '250/10' }], doseUnit: 'mcg/kg/min', doseRange: '0.5-2', defaultDose: 1, warningMsg: '', notes: '순수 알파 작용제' },
  'vasopressin': { name: 'Vasopressin', kor: '바소프레신', category: 'vasopressor', concentrations: [{ label: '20unit/mL', value: '20/1' }], doseUnit: 'unit/kg/hr', doseRange: '0.03-0.1', defaultDose: 0.04, warningMsg: '', notes: 'Peripheral 투여 가능' },
  'dobutamine': { name: 'Dobutamine', kor: '도부타민', category: 'cardiac', concentrations: [{ label: '250mg/250mL', value: '250/250' }], doseUnit: 'mcg/kg/min', doseRange: '2-10', defaultDose: 5, warningMsg: '빈맥 주의', notes: '양성 변력제' },
  'milrinone': { name: 'Milrinone', kor: '밀리논', category: 'cardiac', concentrations: [{ label: '1mg/mL', value: '1/1' }], doseUnit: 'mcg/kg/min', doseRange: '0.25-0.75', defaultDose: 0.5, warningMsg: '저혈압 주의', notes: 'PDE3 억제제' },
  'nitroglycerin': { name: 'Nitroglycerin', kor: '질산글리세린', category: 'cardiac', concentrations: [{ label: '25mg/250mL', value: '25/250' }, { label: '50mg/250mL', value: '50/250' }], doseUnit: 'mcg/kg/min', doseRange: '0.3-3', defaultDose: 1, warningMsg: '저혈압 주의', notes: '빛에 민감' },
  'nitroprusside': { name: 'Nitroprusside', kor: '아질산염화나트륨', category: 'cardiac', concentrations: [{ label: '50mg/250mL', value: '50/250' }], doseUnit: 'mcg/kg/min', doseRange: '0.3-3', defaultDose: 1, warningMsg: '시안화물 중독 주의 (장시간)', notes: '빛에 민감' },
  'labetalol': { name: 'Labetalol', kor: '라베탈올', category: 'antihypertensive', concentrations: [{ label: '5mg/mL', value: '5/1' }], doseUnit: 'mg/min', doseRange: '0.5-2', defaultDose: 1, warningMsg: '', notes: '알파/베타 차단제' },
  'hydralazine': { name: 'Hydralazine', kor: '하이드랄라진', category: 'antihypertensive', concentrations: [{ label: '20mg/mL', value: '20/1' }], doseUnit: 'mg', doseRange: '10-50', defaultDose: 20, warningMsg: '반복 투여 시 간격 30분', notes: 'Bolus 투여' },
  'esmolol': { name: 'Esmolol', kor: '에스몰올', category: 'antihypertensive', concentrations: [{ label: '250mg/25mL', value: '250/25' }], doseUnit: 'mcg/kg/min', doseRange: '50-200', defaultDose: 100, warningMsg: '저혈압 주의', notes: '초단시간 베타차단제' },
  'nicardipine': { name: 'Nicardipine', kor: '니카르디핀', category: 'antihypertensive', concentrations: [{ label: '20mg/200mL', value: '20/200' }], doseUnit: 'mg/hr', doseRange: '2.5-15', defaultDose: 5, warningMsg: '저혈압 주의', notes: '칼슘채널 차단제' },
  'magnesium': { name: 'Magnesium', kor: '마그네슘', category: 'antihypertensive', concentrations: [{ label: '50%', value: '50/1' }], doseUnit: 'g/hr', doseRange: '1-2', defaultDose: 1, warningMsg: '혈중 Mg 모니터링', notes: '저혈압 가능' },
  'succinylcholine': { name: 'Succinylcholine', kor: '석신일콜린', category: 'nmb', concentrations: [{ label: '50mg/mL', value: '50/1' }], doseUnit: 'mg', doseRange: '1-1.5', defaultDose: 1.2, warningMsg: '초기 운동', notes: 'Bolus 투여, 단시간' },
  'rocuronium': { name: 'Rocuronium', kor: '로쿠로늄', category: 'nmb', concentrations: [{ label: '10mg/mL', value: '10/1' }], doseUnit: 'mg', doseRange: '0.6-1.2', defaultDose: 0.9, warningMsg: '', notes: 'Bolus 투여' },
  'vecuronium': { name: 'Vecuronium', kor: '베쿠로늄', category: 'nmb', concentrations: [{ label: '10mg/mL', value: '10/1' }], doseUnit: 'mg', doseRange: '0.08-0.1', defaultDose: 0.09, warningMsg: '', notes: 'Bolus 투여' },
  'cisatracurium': { name: 'Cisatracurium', kor: '시사트라쿠륨', category: 'nmb', concentrations: [{ label: '10mg/mL', value: '10/1' }], doseUnit: 'mcg/kg/min', doseRange: '0.1-0.2', defaultDose: 0.15, warningMsg: '', notes: '장기 주입 가능' },
  'atracurium': { name: 'Atracurium', kor: '아트라쿠륨', category: 'nmb', concentrations: [{ label: '10mg/mL', value: '10/1' }], doseUnit: 'mg', doseRange: '0.4-0.5', defaultDose: 0.45, warningMsg: '히스타민 방출', notes: 'Bolus 투여' }
};

function showDrugCategories() {
  currentView = 'categories';
  selectedCategory = null;
  let html = '<div class="drug-menu">';
  Object.keys(DRUG_CATEGORIES).forEach(catKey => {
    const cat = DRUG_CATEGORIES[catKey];
    const count = cat.drugs.length;
    html += `<div class="drug-category-card" onclick="showDrugCategory('${catKey}')">
      <div class="drug-cat-icon">${cat.icon}</div>
      <div class="drug-cat-name">${cat.label}</div>
      <div class="drug-cat-count">${count}종</div>
    </div>`;
  });
  html += '</div>';
  document.getElementById('drug-view').innerHTML = html;
  updateDrugHeader('카테고리 선택');
}

function showDrugCategory(catKey) {
  currentView = 'drugs';
  selectedCategory = catKey;
  const cat = DRUG_CATEGORIES[catKey];
  let html = '<div class="drug-list">';
  cat.drugs.forEach(drugKey => {
    const drug = DRUG_LIBRARY[drugKey];
    html += `<div class="drug-list-item" onclick="openDrugCalc('${drugKey}')">
      <div class="drug-list-name">${drug.kor}<br><span class="drug-list-eng">${drug.name}</span></div>
      <span class="chevron">›</span>
    </div>`;
  });
  html += '</div>';
  document.getElementById('drug-view').innerHTML = html;
  updateDrugHeader(DRUG_CATEGORIES[catKey].label);
}

function openDrugCalc(drugKey) {
  currentView = 'calculator';
  currentDrugKey = drugKey;
  const drug = DRUG_LIBRARY[drugKey];
  drugCalcState = { dose: 0, weight: 0, conc: drug.concentrations[0].value };
  renderDrugCalculator();
  updateDrugHeader(drug.kor);
}

function updateDrugHeader(title) {
  document.querySelector('.sub-title').textContent = title;
}

function renderDrugCalculator() {
  const drug = DRUG_LIBRARY[currentDrugKey];
  let html = '<div class="drug-calc-card">' +
    `<div class="drug-name-box">
      <div class="drug-name-en">${drug.name}</div>
      <div class="drug-name-range">범위: ${drug.doseRange} ${drug.doseUnit}</div>
    </div>
    <div class="calc-section">
      <div class="calc-label">농도 선택</div>
      <div class="conc-options">`;
  drug.concentrations.forEach((conc, idx) => {
    const isActive = idx === 0 ? 'active' : '';
    html += `<button class="conc-btn ${isActive}" onclick="selectDrugConc('${conc.value}', this)">${conc.label}</button>`;
  });
  html += `</div></div>
    <div class="calc-section">
      <div class="calc-label">현재 용량</div>
      <div class="dose-input-row">
        <button class="dose-adj" onclick="adjustDrugDose(-0.01)">−</button>
        <div class="dose-display">
          <input type="number" id="dose-val" value="" step="0.01" min="0" class="dose-input" oninput="calcDrugRate()">
        </div>
        <button class="dose-adj" onclick="adjustDrugDose(0.01)">+</button>
        <span class="dose-unit">${drug.doseUnit}</span>
      </div>
    </div>
    <div class="calc-section">
      <div class="calc-label">환자 체중</div>
      <div class="weight-input-row">
        <input type="number" id="weight-val" value="" oninput="calcDrugRate()" class="weight-input">
        <span class="dose-unit">kg</span>
      </div>
    </div>
    <div class="calc-result">
      <div class="result-label">투여 속도</div>
      <div class="result-value" id="rate-result">—</div>
      <div class="result-unit" id="rate-unit">mL/hr</div>
      <div class="result-daily" id="daily-result"></div>
    </div>
    <div class="calc-formula">
      <div class="formula-text">계산 공식</div>
      <div class="formula-detail" id="formula-detail">—</div>
    </div>`;
  if (drug.warningMsg) {
    html += `<div class="warning-box"><span class="warning-icon">⚠️</span> ${drug.warningMsg}</div>`;
  }
  if (drug.notes) {
    html += `<div class="info-box"><span class="info-icon">ℹ️</span> ${drug.notes}</div>`;
  }
  html += '<button class="btn-primary" style="width:100%; margin-top:12px;">계산 기록 저장</button>' +
    '<button class="btn-outline" style="width:100%; margin-top:8px;">⭐ 즐겨찾기에 추가</button></div>';
  document.getElementById('drug-view').innerHTML = html;
  calcDrugRate();
}

function selectDrugConc(concValue, btn) {
  drugCalcState.conc = concValue;
  document.querySelectorAll('.conc-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  calcDrugRate();
}

function adjustDrugDose(delta) {
  const input = document.getElementById('dose-val');
  let val = parseFloat(input.value) || 0;
  val = Math.max(0, Math.round((val + delta) * 100) / 100);
  input.value = val;
  calcDrugRate();
}

function calcDrugRate() {
  const dose = parseFloat(document.getElementById('dose-val')?.value) || 0;
  const weight = parseFloat(document.getElementById('weight-val')?.value) || 0;
  const drug = DRUG_LIBRARY[currentDrugKey];
  if (!dose || !weight || !drugCalcState.conc) {
    document.getElementById('rate-result').textContent = '—';
    document.getElementById('formula-detail').textContent = '—';
    return;
  }
  const [concNum, concDenom] = drugCalcState.conc.split('/').map(Number);
  const concUgPerMl = (concNum * 1000) / concDenom;
  let rate, formula;
  if (drug.doseUnit === 'mcg/kg/min') {
    rate = (dose * weight * 60) / concUgPerMl;
    formula = `${dose} × ${weight} × 60 ÷ ${concUgPerMl.toFixed(1)} = ${rate.toFixed(1)}`;
  } else if (drug.doseUnit === 'mg/kg/hr' || drug.doseUnit === 'mcg/kg/hr') {
    rate = (dose * weight) / (concUgPerMl / 1000);
    formula = `${dose} × ${weight} ÷ ${(concUgPerMl/1000).toFixed(3)} = ${rate.toFixed(1)}`;
  } else if (drug.doseUnit === 'mg/min' || drug.doseUnit === 'mg') {
    rate = (dose * 60) / concNum;
    formula = `${dose} × 60 ÷ ${concNum} = ${rate.toFixed(1)}`;
  } else if (drug.doseUnit === 'mg/hr') {
    rate = dose / (concNum / concDenom);
    formula = `${dose} ÷ (${concNum}/${concDenom}) = ${rate.toFixed(1)}`;
  } else if (drug.doseUnit === 'unit/kg/hr') {
    rate = (dose * weight) / (concNum / concDenom);
    formula = `${dose} × ${weight} ÷ (${concNum}/${concDenom}) = ${rate.toFixed(1)}`;
  } else if (drug.doseUnit === 'g/hr') {
    rate = dose / (concNum / 100);
    formula = `${dose} ÷ (${concNum}/100) = ${rate.toFixed(1)}`;
  }
  const rateRounded = Math.round((rate || 0) * 10) / 10;
  const daily = rateRounded * 24;
  document.getElementById('rate-result').textContent = rateRounded.toFixed(1);
  document.getElementById('daily-result').textContent = `= ${daily.toFixed(0)} mL / 24hr`;
  document.getElementById('formula-detail').textContent = formula || '—';
}

// ===== CODE BLUE TIMER =====
let timerSeconds = 0;
let timerRunning = false;

function startTimer() {
  const btn = document.querySelector('.timer-btn');
  const display = document.getElementById('timer-display');

  if (!timerRunning) {
    timerRunning = true;
    timerSeconds = 0;
    display.style.display = 'block';
    btn.textContent = '⏹ 타이머 정지';
    btn.style.background = '#c27803';
    timerInterval = setInterval(() => {
      timerSeconds++;
      const m = Math.floor(timerSeconds / 60).toString().padStart(2, '0');
      const s = (timerSeconds % 60).toString().padStart(2, '0');
      display.textContent = `${m}:${s}`;
    }, 1000);
  } else {
    clearInterval(timerInterval);
    timerRunning = false;
    btn.textContent = '⏱ 타이머 재시작';
    btn.style.background = 'var(--red)';
  }
}

// ===== ABGA INTERPRETER =====
function interpretABGA() {
  const pH = parseFloat(document.getElementById('ph')?.value);
  const paco2 = parseFloat(document.getElementById('paco2')?.value);
  const hco3 = parseFloat(document.getElementById('hco3')?.value);
  const pao2 = parseFloat(document.getElementById('pao2')?.value);
  const fio2 = parseFloat(document.getElementById('fio2')?.value);
  const resultEl = document.getElementById('abga-result');
  if (!resultEl) return;

  let disorder = '';
  let tagClass = '';
  let details = [];

  if (pH < 7.35) {
    if (paco2 > 45) {
      disorder = '호흡성 산증';
      tagClass = 'red-tag';
      details.push('pH↓, PaCO₂↑ → 호흡성 산증');
      if (hco3 > 26) details.push('대사성 보상 진행 중');
      else details.push('보상 없음 (급성)');
    } else if (hco3 < 22) {
      disorder = '대사성 산증';
      tagClass = 'red-tag';
      details.push('pH↓, HCO₃⁻↓ → 대사성 산증');
      if (paco2 < 35) details.push('호흡성 보상 진행 중');
    }
  } else if (pH > 7.45) {
    if (paco2 < 35) {
      disorder = '호흡성 알칼리증';
      tagClass = 'blue-tag';
      details.push('pH↑, PaCO₂↓ → 호흡성 알칼리증');
    } else if (hco3 > 26) {
      disorder = '대사성 알칼리증';
      tagClass = 'blue-tag';
      details.push('pH↑, HCO₃⁻↑ → 대사성 알칼리증');
    }
  } else {
    disorder = '정상 범위';
    tagClass = 'green-tag';
    details.push('pH, PaCO₂, HCO₃⁻ 모두 정상 범위');
  }

  // P/F ratio
  if (pao2 && fio2) {
    const pf = Math.round(pao2 / fio2);
    let oxStatus = '';
    if (pf >= 300) oxStatus = '정상';
    else if (pf >= 200) oxStatus = '경증 저산소증 (ARDS mild)';
    else if (pf >= 100) oxStatus = '중등도 저산소증 (ARDS moderate)';
    else oxStatus = '중증 저산소증 (ARDS severe)';
    details.push(`P/F ratio: ${pf} → ${oxStatus}`);
  }

  resultEl.innerHTML = `
    <div class="result-tag ${tagClass}">${disorder}</div>
    ${details.map(d => `<div class="result-detail">${d}</div>`).join('')}
  `;
  resultEl.style.background = tagClass === 'red-tag' ? 'var(--red-light)' :
    tagClass === 'blue-tag' ? 'var(--primary-light)' : 'var(--green-light)';
}

// ===== CHECKLIST PROGRESS =====
function updateProgress() {
  const allChecks = document.querySelectorAll('#screen-checklist input[type=checkbox]');
  const checked = document.querySelectorAll('#screen-checklist input[type=checkbox]:checked');
  const total = allChecks.length;
  const done = checked.length;
  const pct = total > 0 ? (done / total) * 100 : 0;
  const fill = document.querySelector('#screen-checklist .progress-fill');
  const label = document.querySelector('#screen-checklist .progress-label');
  if (fill) fill.style.width = pct + '%';
  if (label) label.textContent = `${done} / ${total}`;
}

// ===== SURGICAL PROTOCOL DATA =====
const SICU_DB = {
  GS: { label: '일반외과', icon: '🔪', ops: [
    { key: 'GAS',  name: '위 질환 수술',       sub: '위절제술 (전절제 / 아전절제)' },
    { key: 'CRC',  name: '대장 및 직장 수술',  sub: '대장절제술 / 직장절제술 / 장루' },
    { key: 'HEPA', name: '간 질환 수술',       sub: '간절제술 (부분·엽·반간절제)' },
    { key: 'PANC', name: '유문부 보존 췌십이지장 절제술',     sub: '췌십이지장절제술 / 췌장절제술' },
  ]},
  NS: { label: '신경외과', icon: '🧠', ops: [
    { key: 'CRANI', name: 'Craniotomy',   sub: '개두술' },
    { key: 'VPS',   name: 'VP Shunt',    sub: '뇌실-복강 단락술' },
    { key: 'EVD',   name: 'EVD Insertion', sub: '뇌실 외 배액술' },
  ]},
  CS: { label: '흉부외과', icon: '🫀', ops: [
    { key: 'CABG',  name: 'CABG',      sub: '관상동맥우회술' },
    { key: 'LOB',   name: 'Lobectomy', sub: '폐엽절제술' },
    { key: 'VALVE', name: '판막 수술', sub: '판막치환술 / 판막성형술' },
  ]},
  OS: { label: '정형외과', icon: '🦴', ops: [
    { key: 'TKR', name: 'TKR', sub: '인공슬관절 치환술' },
    { key: 'THR', name: 'THR', sub: '인공고관절 치환술' },
  ]},
  OB: { label: '산부인과', icon: '🤰', ops: [
    { key: 'CSEC', name: 'C-section', sub: '제왕절개' },
    { key: 'TAH',  name: 'TAH',       sub: '전자궁절제술' },
  ]},
};

const SICU_PROTO = {
  GAS: {
    dept: '일반외과', title: '위 질환 수술 (위절제술)',
    focus: '문합부 누출·출혈, 덤핑 증후군, 위 기능 회복 모니터',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '활력징후 및 기본 사정', items: [
        { t: 'V/S·SpO₂·체온 이송 직후 즉시 측정 → q15min → 이후 q1h', d: '수축기 BP <90, 맥박 >120, 체온 >38.0°C 기준 즉시 보고' },
        { t: '의식 수준 사정 (GCS)', d: '마취 회복 여부 확인 → 각성 지연 시 즉시 보고' },
        { t: '통증 사정', d: 'PCA 사용 중이면 간호일지에 기록' },
        { t: '체온 유지 확인 → 목표 36.5°C', d: '저체온 보온 담요 적용, 수술 후 떨림 유의' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-blue', title: '복부 및 상처 사정', items: [
        { t: '복부 드레싱 삼출 성상·색·양 확인 및 기록', d: '혈성·담즙색 삼출 증가 시 즉시 보고' },
        { t: '장음 청진 4사분면', d: '수술 후 24~48h 장음 소실 정상 → 48h 이후 미회복 시 보고' },
        { t: '복부 압통·강직·복부 팽만 여부 사정', d: '문합부 누출 시 복막 자극 증상(복통 심화·발열·빈맥) 조기 발현' },
        { t: '오심·구토 사정 → 항구토제 처방 확인', d: '구토 시 흡인 예방 체위(반좌위) 유지' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-green', title: '배액관 및 라인 관리', items: [
        { t: 'JP drain 위치·고정·배액 성상 확인', d: '초기 혈성 → 장액혈성 정상 / 장내용물 양상·담즙색 즉시 보고' },
        { t: 'L-tube(비위관) 개통성·고정·배액량 시간별 기록', d: '배액량이 bloody하게 많으면 즉시 보고' },
        { t: 'C-line 또는 말초 정맥 라인 확인', d: 'TPN 처방 확인 → 경구 섭취 불가 기간 지속 투여' },
        { t: 'Foley catheter 소변량 q1h 측정', d: '목표 ≥0.5mL/kg/h → 감소 시 수액 처치 등 주치의 연락' },
      ]},
      { id: 's5', icon: '!', cls: 'sec-red', title: '주의사항 (Critical Points)', critical: true, items: [
        { t: 'L-tube 절대 임의 제거·클램프 금지', d: '위-공장 문합부 감압 역할 → 반드시 의사 확인 후 조절' },
        { t: '경구 섭취 의사 처방 전 절대 금식(NPO) 유지', d: '문합부 누출 위험 → 처방 반드시 확인 후 식이 시작' },
      ]},
    ],
  },
  CRC: {
    dept: '일반외과', title: '대장 및 직장 수술 (대장·직장절제술)',
    focus: '문합부 누출, 장루(stoma) 관리, DVT 예방, 장 기능 회복',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '활력징후 및 기본 사정', items: [
        { t: 'V/S·SpO₂·체온 이송 직후 즉시 측정 → q15min → 이후 q1h', d: '수축기 BP <90, 맥박 >120, 체온 >38.0°C 기준 즉시 보고' },
        { t: '의식 수준 사정 (GCS)', d: '마취 회복 여부 확인 → 각성 지연 시 즉시 보고' },
        { t: '통증 사정', d: 'PCA 사용 중이면 간호일지에 기록' },
        { t: '체온 유지 확인 → 목표 36.5°C', d: '저체온 보온 담요 적용, 수술 후 떨림 유의' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-blue', title: '복부 및 상처 사정', items: [
        { t: '복부 드레싱·장음·압통·피막 사정', d: '장 기능 회복 기준: 장음 청취 + 가스 배출 + 배변' },
        { t: '수술 부위 압통·복부 강직 여부 확인', d: '복막 자극 증상 발생 시 즉시 보고 (문합 누출 의심)' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-green', title: '배액관 및 라인 관리', items: [
        { t: '복강 배액관 성상·색 시간별 확인', d: '장내용물 양상(변색·냄새) = 즉시 문합 누출 의심 보고' },
        { t: 'Foley catheter 소변량 q1h 측정', d: '목표 ≥0.5mL/kg/h → 감소 시 주치의 연락' },
        { t: 'C-line 또는 말초 정맥 라인 확인', d: 'TPN 처방 확인 → 경구 섭취 불가 기간 지속 투여' },
      ]},
      { id: 's4', icon: '4', cls: 'sec-purple', title: '장루(Stoma) 초기 간호', items: [
        { t: 'Stoma 색깔·크기·점막 상태 q2~4h 관찰', d: '정상: 선홍~분홍색, 촉촉함 / 창백·암갈색·함몰 → 즉시 보고' },
        { t: 'Stoma bag 부착·피부 보호판 상태 확인', d: '누출 시 피부 손상 즉시 예방 → 즉시 교환' },
        { t: '장루 배액 성상 및 양 확인', d: '초기 혈성 점액 → 장액 → 정상 대변 순 회복 경과' },
      ]},
      { id: 's6', icon: '!', cls: 'sec-red', title: '주의사항 (Critical Points)', critical: true, items: [
        { t: 'Stoma 색깔 변화(창백·암갈색)는 즉각 보고', d: '혈류 장애 → 수술적 처치 필요한 응급 상황' },
      ]},
    ],
  },
  HEPA: {
    dept: '일반외과', title: '간 질환 수술 (간절제술)',
    focus: '간부전(PHLF), 수술 후 출혈, 담즙 누출, 저혈당',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '활력징후 및 기본 사정', items: [
        { t: 'V/S·SpO₂·체온 이송 직후 즉시 측정 → q15min → 이후 q1h', d: '수축기 BP <90, 맥박 >120, 체온 >38.0°C 기준 즉시 보고' },
        { t: '의식 수준 사정 (GCS)', d: '마취 회복 여부 확인 → 각성 지연 시 즉시 보고' },
        { t: '통증 사정', d: 'PCA 사용 중이면 간호일지에 기록' },
        { t: '체온 유지 확인 → 목표 36.5°C', d: '저체온 보온 담요 적용, 수술 후 떨림 유의' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-green', title: '배액관 및 출혈 모니터', items: [
        { t: '복강 배액관 성상·색 시간별 기록', d: '혈성 배액 >100mL/h 또는 지속 증가 → 즉시 보고' },
        { t: '담즙 배액관 (T-tube 또는 JP) 색·양 확인', d: '담즙 색 정상: 황금색 / 혈성·피막 → 즉시 보고' },
        { t: 'PT/INR·aPTT·혈소판 수치 확인', d: '간 절제 후 응고 인자 합성 저하 → 출혈 위험 증가' },
        { t: 'Foley 소변량 q1h', d: '목표 ≥0.5mL/kg/h → 감소 시 즉시 보고 (간부전 조기 징후)' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-amber', title: '간기능 모니터링', items: [
        { t: '황달(Jaundice) 여부 → 공막·피부 색깔 관찰', d: '간절제 후 일시적 빌리루빈 상승 가능 → 수치 추세 모니터' },
        { t: '복수 발생 여부 → 복부 둘레 측정, 하지 부종 평가', d: '수일 내 급격한 복부 팽만 시 보고' },
        { t: 'LFT(AST·ALT·ALP·총빌리루빈) 추세 확인', d: '수술 후 일시적 상승 후 감소 정상 → 지속 상승 시 주의' },
      ]},
      { id: 's5', icon: '!', cls: 'sec-red', title: '주의사항 (Critical Points)', critical: true, items: [
        { t: '진통제 간독성 약물 주의 → NSAIDs·고용량 아세트아미노펜 금기', d: '간절제 후 잔여 간 기능 감소 → 처방 용량 반드시 확인' },
        { t: '저혈당 (<70mg/dL) 즉시 보고 및 포도당 투여', d: '간의 당 합성 기능 저하 → 수술 후 저혈당 빈번' },
      ]},
    ],
  },
  PANC: {
    dept: '일반외과', title: '유문부 보존 췌십이지장 절제술',
    focus: '췌장루(POPF), 지연성 위 배출(DGE), 출혈(PPH), 담즙 누출, 혈당 관리',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '활력징후 및 기본 사정', items: [
        { t: 'V/S·SpO₂·체온 이송 직후 즉시 측정 → q15min → 이후 q1h', d: '수축기 BP <90, 맥박 >120, 체온 >38.0°C 기준 즉시 보고' },
        { t: '의식 수준 사정 (GCS)', d: '마취 회복 여부 확인 → 각성 지연 시 즉시 보고' },
        { t: '통증 사정', d: 'PCA 사용 중이면 간호일지에 기록' },
        { t: '체온 유지 확인 → 목표 36.5°C', d: '저체온 보온 담요 적용, 수술 후 떨림 유의' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-blue', title: '복부 사정 및 배액관', items: [
        { t: '복부 드레싱·삼출·압통 사정', d: '수술 부위 압통 심화·복부 강직 시 즉시 보고' },
        { t: '복강 배액관 #1·#2 성상·색 시간별 확인', d: '췌장 문합부·담관 문합부 주위 각각 위치 확인 → 성상 변화 즉시 보고' },
        { t: 'L-tube 배액량·성상 및 개통성 확인', d: 'DGE 시 배액 과다 + 오심 지속 → 처방 없이 clamp 금지' },
        { t: 'Foley 소변량 q1h', d: '목표 ≥0.5mL/kg/h → 감소 시 즉시 보고' },
        { t: 'C-line 또는 말초 정맥 라인 확인', d: 'TPN 처방 확인 → 경구 섭취 불가 기간 지속 투여' },
      ]},
      { id: 's4', icon: '4', cls: 'sec-amber', title: '혈당 관리', items: [
        { t: '혈당 q2~4h 모니터 → 목표 혈당 140~180mg/dL', d: '췌장 기능 손상 → 고혈당 빈번 → 인슐린 처방 확인' },
        { t: '저혈당 (<70mg/dL) 즉시 보고', d: '인슐린 투여 중 식이 중단 시 특히 주의' },
        { t: '인슐린 처방 확인 → Sliding scale 또는 IV infusion', d: '수술 전 당뇨 기왕력 확인 → 수술 후 필요량 변화 주의' },
      ]},
      { id: 's5', icon: '!', cls: 'sec-red', title: '주의사항 (Critical Points)', critical: true, items: [
        { t: '배액관 성상 변화(혈성·담즙색·피막) 즉시 보고', d: '배액 성상 변화는 중증 합병증의 첫 징후일 수 있음' },
        { t: '혈당 250mg/dL 이상 지속 시 즉시 보고', d: '인슐린 sliding scale 또는 IV insulin 처방 확인' },
        { t: 'POPF 확인 위한 POD 3일 배액 amylase 검사 처방 누락 확인', d: '검사 미시행 시 주치의 확인 요청' },
      ]},
    ],
  },
  CRANI: {
    dept: '신경외과', title: 'Craniotomy (개두술)',
    focus: '뇌강내압 상승, 신경학적 상태, 뇌부종, 경련 조기 감지',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '신경계 집중 사정', items: [
        { t: 'GCS 측정 → 의식 증감 기준치 설정', d: '이후 q1h 모니터 → 2점 이상 감소 시 즉시 보고' },
        { t: '동공 크기·모양·대광반사 양측 비교', d: '산대·무반응·부등동공 → 즉시 보고 (뇌탈출 징후)' },
        { t: '사지 이동·감각 대칭 여부 확인', d: '편측 마비 새로 발생 또는 악화 시 즉시 보고' },
        { t: '두통·구토·잠재 부종 여부 → ICP 상승 징후', d: 'Cushing reflex: 서맥+고혈압+불규칙 호흡 = 응급' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-blue', title: '활력징후 및 혈압 관리', items: [
        { t: 'V/S q1h → 혈압 목표 범위 처방 확인', d: '대부분 수축기 BP <140mmHg 또는 MAP 60~90 목표' },
        { t: '체온 모니터 → 발열 즉시 해열', d: '발열은 뇌대사 증가 → 신경손상 악화 → Normothermia 필수' },
        { t: 'SpO₂ ≥95% 유지 → 저산소 즉시 예방', d: '뇌탈출 위험 → 산소 공급 처방 즉시 확인' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-green', title: '배액관 및 수술 부위', items: [
        { t: 'EVD (뇌실 외 배액관) 레벨·배액량·성상 확인', d: '기준 레벨 의사 처방 확인 → 임의 변경 금지' },
        { t: 'EVD 배액: 맑은 뇌척수액 정상, 혈성·피막 보고', d: '혈성 증가 = 뇌실 내 출혈 진행' },
        { t: '뇌각 수술 부위 드레싱 확인', d: '삼출물·뇌척수액 누출(맑은 액체) 여부 확인' },
        { t: 'ICP monitor 확인 (if used)', d: 'ICP >20mmHg 지속 시 즉시 보고' },
      ]},
      { id: 's4', icon: '4', cls: 'sec-amber', title: '약물 및 합병증', items: [
        { t: '항경련제 투여 시간·용량 확인', d: 'Levetiracetam 등 처방 확인 → 누락 금지' },
        { t: '일혈삼투압 처방 확인 및 투여', d: 'Mannitol 또는 3% NaCl → 투여 속도·용량 처방 준수' },
        { t: '혈당 q4~6h → 스테로이드 투여 시', d: '스테로이드성 고혈당 빈번 → sliding scale 확인' },
        { t: '경련 발생 여부 모니터 (미세 경련 포함)', d: '눈 떨림, 팔다리 단순 떨림 포함 관찰 기록' },
      ]},
      { id: 's5', icon: '!', cls: 'sec-red', title: '주의사항', critical: true, items: [
        { t: 'EVD 라인 임의 클램프·레벨 조절 금지', d: 'ICP 급격 변화 위험 발생' },
        { t: '머리 침상 30° 유지 기본 자세', d: 'ICP 감소 및 정맥 배액 이증 → 처방 변경 시 유지' },
        { t: 'GCS 2점 이상 급격 감소 = 증가 징후 (골든 타임)', d: '' },
        { t: '흡인·체위 변경 시 ICP 스파이크 주의', d: '처치 전 ICP 또는 신경계 반응 확인' },
      ]},
    ],
  },
  VPS: {
    dept: '신경외과', title: 'VP Shunt (뇌실-복강 단락술)',
    focus: '과다 배액·과소 배액, 감염(뇌막염), 복강 합병증',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '신경계 사정', items: [
        { t: 'GCS 기준치 설정 및 q1~2h 추적 관찰', d: '수두증 증상 개선 여부 → 의식 수준 변화 모니터' },
        { t: '두통·구토·시야 이상 사정', d: '과소 배액 시 ICP 상승 지속 → 즉시 징후 보고' },
        { t: '과다한 두통 → 과다 배액 의심', d: '체위 변경 시 두통 심화: 기립성 두통 = 과다 배액' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-amber', title: 'Shunt 및 복강 관찰', items: [
        { t: 'shunt 경로(두개·경부·복부) 피부 발적·부종 확인', d: 'shunt 감염 초기 징후' },
        { t: '복부 피막·장음·압통 사정', d: '복강 내 CSF 집적(pseudocyst) 또는 감염 징후' },
        { t: 'shunt 밸브 위치 확인 → 임의 압박 금지', d: '밸브 임의 조절 또는 기능 변화 위험' },
      ]},
      { id: 's3', icon: '!', cls: 'sec-red', title: '주의사항', critical: true, items: [
        { t: '고열+두통+경부 강직 = 뇌막염 응급 → 즉각 보고', d: '항생제 투여 전 CSF 검사 처방 확인' },
        { t: 'shunt 기능 확인을 영상검사로만 → 임의 눌러보기 금지', d: '' },
        { t: '복부 자극 증상 없는 발열 시 복강 내 합병증 고위험', d: '복강 사정 더욱 철저히' },
      ]},
    ],
  },
  EVD: {
    dept: '신경외과', title: 'EVD Insertion (뇌실 외 배액술)',
    focus: 'EVD 레벨 관리, 과다/과소 배액, 감염(뇌막염), ICP 모니터링',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '신경계 집중 사정', items: [
        { t: 'GCS 측정 → 의식 증감 기준치 설정', d: '이후 q1h 모니터 → 2점 이상 감소 시 즉시 보고' },
        { t: '동공 크기·모양·대광반사 양측 비교 q1~2h', d: '산대·무반응·부등동공 → 즉시 보고 (뇌탈출 징후)' },
        { t: '사지 이동·감각 대칭 여부 확인', d: '편측 마비 새로 발생 또는 악화 시 즉시 보고' },
        { t: '두통·구토 여부 사정 → ICP 상승 징후', d: 'Cushing reflex: 서맥+고혈압+불규칙 호흡 = 응급' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-green', title: 'EVD 관리 (핵심)', items: [
        { t: 'EVD 기준 레벨(zeroing point) 확인 → 이개(EAC) 기준', d: '처방된 레벨(cm H₂O) 반드시 확인 → 체위 변경 시마다 재조절' },
        { t: 'CSF 배액 성상 확인 → 색깔·피막도·혈성 여부', d: '정상: 맑고 무색 / 혈성 증가·피막 시 즉시 보고' },
        { t: 'CSF 배액량 시간별 기록', d: '과다 배액(>20mL/h 또는 처방 초과) 또는 배액 없음 즉시 보고' },
        { t: 'EVD 라인 개통성 확인 → 파형(waveform) 확인', d: 'ICP monitor 연결 시 파형 없음 = 막힘 또는 허탈 의심' },
        { t: '삽입 부위 드레싱 확인 → 발적·삼출·고정 상태', d: '드레싱 습윤 시 무균적으로 즉시 교환' },
        { t: 'EVD 라인 전체 연결부 확인 → 연결 이완·공기 유입 여부', d: '연결부 느슨함 = 감염 및 배액 오류 위험' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-blue', title: '활력징후 및 ICP 모니터', items: [
        { t: 'V/S q1h → 혈압 목표 범위 처방 확인', d: 'ICP 상승 시 CPP = MAP − ICP → CPP 목표 60~70 mmHg 유지' },
        { t: 'ICP 상승 기록 및 추세 모니터', d: 'ICP >20mmHg 5분 이상 지속 시 즉시 보고' },
        { t: '체온 모니터 → 발열 즉시 해열', d: '발열은 ICP 상승 유발 → Normothermia 목표 36.5°C' },
        { t: 'SpO₂ ≥95% 유지', d: '저산소 = 뇌혈관 확장 → ICP 상승 유발' },
      ]},
      { id: 's4', icon: '4', cls: 'sec-amber', title: '합병증 모니터', items: [
        { t: '감염 징후: 고열+두통+경부 강직+CSF 피막', d: 'EVD 관련 뇌막염 → 즉각 보고, CSF 검사 처방 확인' },
        { t: '출혈: 삽입 부위 혈성 삼출 증가 또는 CSF 혈성 급격 증가', d: '뇌강내 출혈 가능 → CT 처방 의사 연락' },
        { t: 'EVD 이탈·허탈 여부 확인', d: '라인 길이 표시 후 이탈 여부 매 사정 시 확인' },
        { t: '경련 발생 여부 모니터', d: '항경련제 처방 확인 → 미세 경련(눈 떨림·팔다리 단순 떨림) 포함' },
      ]},
      { id: 's5', icon: '!', cls: 'sec-red', title: '주의사항 (Critical Points)', critical: true, items: [
        { t: 'EVD 레벨 임의 변경 절대 금지', d: '체위 변경(침대 높이·HOB 각도) 시마다 처방 레벨 재확인 후 조절' },
        { t: '머리 침상 HOB 30° 유지 기본 자세', d: '처방 변경 시 까지 유지 → ICP 감소 및 정맥 배액 이증' },
        { t: 'EVD 클램프 처방 없이 임의 조절 금지', d: '갑작스런 ICP 변화 또는 과다 배액 유발 위험' },
        { t: 'EVD 관련 처치 시 무균적 철저히 준수', d: 'EVD 유치 기간이 길수록 감염 위험 증가 → 불필요한 조작 최소화' },
        { t: 'GCS 2점 이상 급격 감소 또는 동공 변화 = 즉각 호출', d: '골든 타임 → 지체 없이 보고' },
      ]},
    ],
  },
  CABG: {
    dept: '흉부외과', title: 'CABG (관상동맥우회술)',
    focus: '심박출량 저하, 수술 후 부정맥, 흉골 절개 합병증, 이식 혈관 기능',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '심장 및 활력징후 사정', items: [
        { t: '심전도 지속 모니터 → 리듬 변화 실시간 확인', d: '수술 후 AFib 발생률 30~40% → 즉시 보고' },
        { t: 'V/S q1h → 활력·맥박·MAP 목표 범위 확인', d: 'MAP 65~75 mmHg 유지 기본 목표' },
        { t: '심박출량 징후 확인 (PA catheter 삽입, if used)', d: 'CO, CI, SVR, PCWP 주치의 목표값 확인' },
        { t: '저심박출 증후군 징후: 저활력+빈맥+소변 감소+말초 냉각', d: '즉각 보고 → 강심제 처방 확인' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-green', title: '흉관 및 수술 부위', items: [
        { t: '흉관 배액 성상·색 시간별 기록', d: '>200mL/h 혈성 배액 지속 시 즉시 보고 → 재수술 가능성' },
        { t: '흉관 공기 누출(air leak) 여부 확인', d: '수중 챔버 기포 여부 관찰' },
        { t: '흉골 절개 부위 이상 소리·드레싱 확인', d: '뼈 갈리는 소리, 분리 또는 즉시 보고 (흉골 부이완)' },
        { t: '하지 이식혈관 채취 부위 부종·삼출·혈류 확인', d: 'LIMA/SVG 채취 부위 말초 혈류 정상 여부' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-blue', title: '호흡 및 기계환기', items: [
        { t: '인공호흡기 설정·V/S 동기화 확인', d: 'FiO₂, PEEP, tidal volume 처방 확인' },
        { t: '발관(extubation) 기준 사정', d: '의식 명료·자발호흡·통증 조절·흉관 배액 안정 후' },
        { t: '호흡음 양측 청진 → 활력·무기폐 여부', d: '발관 후 심호흡 이동 격려' },
      ]},
      { id: 's4', icon: '!', cls: 'sec-red', title: '주의사항', critical: true, items: [
        { t: '심낭 압전 (Tamponade) 즉각 보고 → Beck triad: 저활력+경정맥 팽창+심음 감소', d: '응급 처치' },
        { t: '흉골 압박·강화 기침 운동 → 베개 안고 기침법 교육', d: '흉골 부이완 예방' },
        { t: '새로운 ST 변화 즉각 보고 → 12-lead ECG 즉시 시행', d: '이식 혈관 허혈 = 재경색' },
        { t: '항응고제 처방 정확히 투여 시간 확인', d: 'Aspirin 재개 시기, Warfarin 처방 여부 확인' },
      ]},
    ],
  },
  LOB: {
    dept: '흉부외과', title: 'Lobectomy (폐엽절제술)',
    focus: '공기 누출, 무기폐, 기관지 문합부 합병증, 호흡 기능 유지',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '활력징후 및 기본 사정', items: [
        { t: 'V/S·SpO₂·체온 이송 직후 즉시 측정 → q15min → 이후 q1h', d: '수축기 BP <90, 맥박 >120, 체온 >38.0°C 기준 즉시 보고' },
        { t: '의식 수준 사정 (GCS)', d: '마취 회복 여부 확인 → 각성 지연 시 즉시 보고' },
        { t: '통증 사정', d: 'PCA 사용 중이면 간호일지에 기록' },
        { t: '체온 유지 확인 → 목표 36.5°C', d: '저체온 보온 담요 적용, 수술 후 떨림 유의' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-green', title: '흉관 관리', items: [
        { t: '흉관 배액 성상·색 시간별 기록', d: '혈성 >150mL/h 지속 시 보고' },
        { t: '공기 누출(air leak) 집중 모니터', d: '수중 챔버 기포 → 흡기/호기 중 여부, 정기록' },
        { t: '흉관 꺾임·눌림·혈변 막힘 확인', d: '배액 감소 + 호흡 상태 저하 시 의심' },
      ]},
      { id: 's4', icon: '!', cls: 'sec-red', title: '주의사항', critical: true, items: [
        { t: '흉관 클램프 임의 사용 금지', d: '의사 처방 없이 흉관 클램프 → 긴장성 기흉 위험' },
        { t: '분비물 배출 적극 지지 → 흡인, 체위 변경, 기침 격려', d: '무기폐 예방 핵심' },
      ]},
    ],
  },
  VALVE: {
    dept: '흉부외과', title: '판막 수술 (판막치환술 / 판막성형술)',
    focus: '심박출량 저하, 부정맥, 심낭 압전, 인공판막 기능, 항응고 관리',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '활력징후 및 기본 사정', items: [
        { t: 'V/S·SpO₂·체온 이송 직후 즉시 측정 → q15min → 이후 q1h', d: '수축기 BP <90, 맥박 >120, 체온 >38.0°C 기준 즉시 보고' },
        { t: '의식 수준 사정 (GCS)', d: '마취 회복 여부 확인 → 각성 지연 시 즉시 보고' },
        { t: '통증 사정', d: 'PCA 사용 중이면 간호일지에 기록' },
        { t: '체온 유지 확인 → 목표 36.5°C', d: '저체온 보온 담요 적용, 수술 후 떨림 유의' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-blue', title: '심장 및 혈역학 사정', items: [
        { t: '심전도 지속 모니터 → 리듬·파형 변화 실시간 확인', d: '수술 후 AFib 발생률 높음 → 새로운 부정맥 즉시 보고' },
        { t: 'MAP 목표 범위 처방 확인 → MAP 65~75 mmHg 유지 기본', d: '혈압 과도 상승 시 봉합 부위 출혈 위험 증가' },
        { t: '저심박출 증후군 징후 모니터', d: '저혈압 + 빈맥 + 소변 감소 + 말초 냉각 → 즉시 보고' },
        { t: '임시 페이싱 와이어 확인 (if used)', d: '감지·포착 여부·임계값 처방 확인 → 임의 조작 금지' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-green', title: '흉관 및 수술 부위', items: [
        { t: '흉관 배액 성상·색 시간별 기록', d: '>200mL/h 혈성 배액 지속 시 즉시 보고 → 재수술 가능성' },
        { t: '흉관 공기 누출(air leak) 여부 확인', d: '수중 챔버 기포 여부 관찰' },
        { t: '흉골 절개 부위 드레싱·이상 소리 확인', d: '뼈 갈리는 소리·흉골 분리 의심 시 즉시 보고' },
        { t: 'Foley 소변량 q1h', d: '목표 ≥0.5mL/kg/h → 감소 시 즉시 보고' },
      ]},
      { id: 's5', icon: '!', cls: 'sec-red', title: '주의사항 (Critical Points)', critical: true, items: [
        { t: '심낭 압전(Tamponade) 즉각 보고 → Beck triad: 저혈압 + 경정맥 팽창 + 심음 감소', d: '응급 처치 준비' },
        { t: '기계판막 환자 항응고제 누락 금지', d: '판막 혈전 → 색전증·판막 기능 장애 초래' },
        { t: '새로운 신경학적 이상 (편측 마비·언어 장애) 즉시 보고', d: '체외순환 후 색전증 또는 뇌졸중 가능' },
      ]},
    ],
  },
  TKR: {
    dept: '정형외과', title: 'TKR (인공슬관절 치환술)',
    focus: 'DVT/PE, 혈관·신경 손상, 출혈, 슬관절 기능 회복',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '활력징후 및 기본 사정', items: [
        { t: 'V/S·SpO₂·체온 이송 직후 즉시 측정 → q15min → 이후 q1h', d: '수축기 BP <90, 맥박 >120, 체온 >38.0°C 기준 즉시 보고' },
        { t: '의식 수준 사정 (GCS)', d: '마취 회복 여부 확인 → 각성 지연 시 즉시 보고' },
        { t: '통증 사정', d: 'PCA 사용 중이면 간호일지에 기록' },
        { t: '체온 유지 확인 → 목표 36.5°C', d: '저체온 보온 담요 적용, 수술 후 떨림 유의' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-blue', title: '수술 부위 혈관·신경 사정 (5P)', items: [
        { t: 'Pain → 운동 시 수술 부위 이상 통증 여부', d: '진통제로 조절되지 않는 극심한 통증 = 구획증후군 의심' },
        { t: 'Pallor → 수술 측 피부색·창백 여부', d: '' },
        { t: 'Pulselessness → 족배동맥·슬와동맥 촉진', d: '수술 전과 비교 → 맥박 소실 즉시 보고' },
        { t: 'Paresthesia → 저림·감각 이상 여부', d: '비골신경 손상 → 발등 감각 저하·족하수 확인' },
        { t: 'Paralysis → 발가락·발목 굴곡·신전 가능 여부', d: '새로운 마비 발생 즉시 보고' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-green', title: '배액관 및 출혈', items: [
        { t: 'Hemovac/JP drain 배액량·성상 시간별 기록', d: '혈성 배액 >200mL/h 지속 시 즉시 보고' },
        { t: 'Hb 추세 확인', d: '수혈 기준 처방 확인 → TKR 출혈 500~1000mL 가능' },
      ]},
      { id: 's4', icon: '4', cls: 'sec-amber', title: 'DVT/PE 예방', items: [
        { t: 'SCD (순차적 압박 기구) 수술 측 제외 적용', d: '반대측 적용 → 처방 확인' },
        { t: '하지 부종·종아리 압통·피부 온도 차이 모니터', d: 'DVT 징후 → 즉시 보고' },
        { t: '갑작스런 흉통·호흡곤란·SpO₂ 저하 = PE 의심', d: '즉각 보고 → 응급 CT-PA 시행' },
      ]},
    ],
  },
  THR: {
    dept: '정형외과', title: 'THR (인공고관절 치환술)',
    focus: '탈구 예방, DVT/PE, 혈관·신경 손상, 출혈',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '활력징후 및 기본 사정', items: [
        { t: 'V/S·SpO₂·체온 이송 직후 즉시 측정 → q15min → 이후 q1h', d: '수축기 BP <90, 맥박 >120, 체온 >38.0°C 기준 즉시 보고' },
        { t: '의식 수준 사정 (GCS)', d: '마취 회복 여부 확인 → 각성 지연 시 즉시 보고' },
        { t: '통증 사정', d: 'PCA 사용 중이면 간호일지에 기록' },
        { t: '체온 유지 확인 → 목표 36.5°C', d: '저체온 보온 담요 적용, 수술 후 떨림 유의' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-blue', title: '수술 부위 혈관·신경 사정 (5P)', items: [
        { t: 'Pain → 운동 시 수술 부위 이상 통증 여부', d: '진통제로 조절되지 않는 극심한 통증 = 구획증후군 의심' },
        { t: 'Pallor → 수술 측 피부색·창백 여부', d: '' },
        { t: 'Pulselessness → 대퇴동맥·족배동맥 촉진', d: '수술 전과 비교 → 맥박 소실 즉시 보고' },
        { t: 'Paresthesia → 저림·감각 이상 여부', d: '좌골신경 손상 → 하지 감각 저하·족하수 확인' },
        { t: 'Paralysis → 발가락·발목 굴곡·신전 가능 여부', d: '새로운 마비 발생 즉시 보고' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-green', title: '배액관 및 출혈', items: [
        { t: 'Hemovac/JP drain 배액량·성상 시간별 기록', d: '혈성 배액 >200mL/h 지속 시 즉시 보고' },
        { t: 'Hb 추세 확인', d: '수혈 기준 처방 확인 → THR 출혈 500~1500mL 가능' },
      ]},
      { id: 's4', icon: '4', cls: 'sec-amber', title: 'DVT/PE 예방', items: [
        { t: 'SCD (순차적 압박 기구) 수술 측 제외 적용', d: '반대측 적용 → 처방 확인' },
        { t: '하지 부종·종아리 압통·피부 온도 차이 모니터', d: 'DVT 징후 → 즉시 보고' },
        { t: '갑작스런 흉통·호흡곤란·SpO₂ 저하 = PE 의심', d: '즉각 보고 → 응급 CT-PA 시행' },
      ]},
      { id: 's5', icon: '!', cls: 'sec-red', title: '주의사항 — 탈구 예방', critical: true, items: [
        { t: '고관절 탈구 예방 체위: 굴곡 <90°, 내전·내회전 금지', d: '다리 사이 베개 삽입 유지' },
        { t: '탈구 징후: 갑작스런 극심한 통증 + 하지 단축·외회전', d: '즉각 보고 → 도수 정복 또는 재수술 가능' },
      ]},
    ],
  },
  CSEC: {
    dept: '산부인과', title: 'C-section (제왕절개)',
    focus: '수술 후 출혈(PPH), 자궁 수축, 혈전, 산후 회복',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '활력징후 및 기본 사정', items: [
        { t: 'V/S·SpO₂·체온 이송 직후 즉시 측정 → q15min → 이후 q1h', d: '수축기 BP <90, 맥박 >120, 체온 >38.0°C 기준 즉시 보고' },
        { t: '의식 수준 사정 (GCS)', d: '마취 회복 여부 확인 → 각성 지연 시 즉시 보고' },
        { t: '통증 사정', d: 'PCA 사용 중이면 간호일지에 기록' },
        { t: '체온 유지 확인 → 목표 36.5°C', d: '저체온 보온 담요 적용, 수술 후 떨림 유의' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-blue', title: '산부인과 특이 사정', items: [
        { t: '자궁저부 위치·경도 확인 (q30분~1h)', d: '부드럽고 이완된 자궁 = 이완성 출혈 위험 → 자궁 마사지' },
        { t: '수술 부위 드레싱 확인(sand bag+복대)', d: '삼출물·혈성 증가·내합 이개 여부' },
        { t: 'Foley 소변량 확인', d: '수술 후 최소 12~24h 유지 → 소변 색·정기록' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-purple', title: '산모 케어', items: [
        { t: '정서적 지지 → 수술 분만 스트레스 주의', d: 'Edinburgh Postnatal Depression Scale 사용 시 시행' },
      ]},
      { id: 's5', icon: '!', cls: 'sec-red', title: '주의사항', critical: true, items: [
        { t: '자궁 이완 → 즉각 자궁저부 마사지 + 보고 + Oxytocin 처방 확인', d: 'PPH는 산모 사망 주요 원인' },
        { t: '하지 감각 미회복 중 낙상 예방 교육 → Side rail 올리기, 보호자 상주', d: '' },
      ]},
    ],
  },
  TAH: {
    dept: '산부인과', title: 'TAH (전자궁절제술)',
    focus: '방광·요관 손상, 출혈, 수술 후 배뇨 기능, 정서적 지지',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '활력징후 및 기본 사정', items: [
        { t: 'V/S·SpO₂·체온 이송 직후 즉시 측정 → q15min → 이후 q1h', d: '수축기 BP <90, 맥박 >120, 체온 >38.0°C 기준 즉시 보고' },
        { t: '의식 수준 사정 (GCS)', d: '마취 회복 여부 확인 → 각성 지연 시 즉시 보고' },
        { t: '통증 사정', d: 'PCA 사용 중이면 간호일지에 기록' },
        { t: '체온 유지 확인 → 목표 36.5°C', d: '저체온 보온 담요 적용, 수술 후 떨림 유의' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-blue', title: '복부 및 비뇨기계 사정', items: [
        { t: '복부 피막·압통·장음 사정', d: '장유착 또는 출혈 가능 → 복막 자극 징후 확인' },
        { t: 'Foley 소변 양상·색·면밀한 관찰', d: '혈뇨 → 방광·요관 손상 의심 → 즉각 보고' },
        { t: '소변량 q1h → 목표 ≥0.5mL/kg/h', d: '요관 결찰 시 하당 발생 → 의심 시 즉각 보고' },
        { t: '수술 부위 드레싱 및 질 분비물·출혈 확인', d: '' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-green', title: '배액관', items: [
        { t: '복강 배액관 성상·색 기록', d: '삼흑 과다 또는 피막(감염) 시 보고' },
        { t: '질 거즈 패킹 제거 시기 처방 확인', d: '대부분 24~48h 후 제거 → 임의 제거 금지' },
      ]},
      { id: 's5', icon: '!', cls: 'sec-red', title: '주의사항', critical: true, items: [
        { t: '혈뇨 발생 즉시 보고 → 방광·요관 손상 가능 (TAH 비뇨기계 인접 수술)', d: '' },
        { t: 'Foley 제거 후 배뇨 여부 모니터 → 6시간 내 배뇨 없으면 보고', d: '신경 손상 시 이완 방광 가능' },
      ]},
    ],
  },
};

let protoCheckStates = {};
let protoSectionOpen = {};

function buildProtoDeptList() {
  const el = document.getElementById('proto-dept-list');
  if (!el) return;
  let html = '<div class="dept-select-grid">';
  Object.keys(SICU_DB).forEach(dk => {
    const dept = SICU_DB[dk];
    const count = dept.ops.length;
    html += `<div class="dept-select-card" onclick="loadDeptOps('${dk}')">
      <div class="dept-select-icon">${dept.icon}</div>
      <div class="dept-select-label">${dept.label}</div>
      <div class="dept-select-count">${count}개 수술</div>
    </div>`;
  });
  html += '</div>';
  el.innerHTML = html;
}

function loadDeptOps(deptKey) {
  const dept = SICU_DB[deptKey];
  if (!dept) return;
  document.getElementById('dept-ops-title').textContent = `${dept.icon} ${dept.label}`;
  const el = document.getElementById('dept-ops-list');
  let html = '<div class="proto-op-list">';
  dept.ops.forEach(op => {
    html += `<div class="proto-op-item" onclick="loadProtoDetail('${op.key}')">
      <div class="proto-op-info">
        <div class="proto-op-name">${op.name}</div>
        <div class="proto-op-sub">${op.sub}</div>
      </div>
      <span class="chevron">›</span>
    </div>`;
  });
  html += '</div>';
  el.innerHTML = html;
  showScreen('screen-dept-ops');
}

function loadProtoDetail(key) {
  const p = SICU_PROTO[key];
  if (!p) return;
  if (!protoCheckStates[key]) protoCheckStates[key] = {};
  p.sections.forEach(sec => {
    if (protoSectionOpen[key + sec.id] === undefined) protoSectionOpen[key + sec.id] = true;
  });
  document.getElementById('proto-detail-title').textContent = p.title.split('(')[0].trim();
  renderProtoDetail(key);
  showScreen('screen-proto-detail');
}

function renderProtoDetail(key) {
  const p = SICU_PROTO[key];
  let total = 0, checked = 0;
  p.sections.forEach(sec => { total += sec.items.length; });
  Object.values(protoCheckStates[key]).forEach(v => { if (v) checked++; });
  const pct = total > 0 ? Math.round(checked / total * 100) : 0;

  let html = `<div class="proto-header-card">
    <div class="proto-breadcrumb">${p.dept}</div>
    <div class="proto-full-title">${p.title}</div>
    <div class="proto-disclaimer">본 자료는 참고 사항으로 환자의 임상 상태에 따라 추가적 처치가 필요할 수 있습니다.</div>
  </div>
  <div class="proto-progress-wrap">
    <div class="proto-progress-bar"><div class="proto-progress-fill" id="proto-prog-fill" style="width:${pct}%"></div></div>
    <span class="proto-progress-text" id="proto-prog-text">${checked} / ${total} 항목</span>
    <span class="proto-progress-pct" id="proto-prog-pct">${pct}%</span>
    <button class="proto-reset-btn" onclick="resetProtoChecks('${key}')">초기화</button>
  </div>`;

  p.sections.forEach(sec => {
    let secChecked = 0;
    sec.items.forEach((_, idx) => { if (protoCheckStates[key][`${sec.id}-${idx}`]) secChecked++; });
    const isOpen = protoSectionOpen[key + sec.id];
    const isCrit = sec.critical;
    html += `<div class="proto-sec-card${isCrit ? ' proto-sec-critical' : ''}">
      <div class="proto-sec-head" onclick="toggleProtoSec('${key}','${sec.id}')">
        <div class="proto-sec-badge ${sec.cls}">${sec.icon}</div>
        <div class="proto-sec-title">${sec.title}</div>
        <span class="proto-sec-prog">${secChecked}/${sec.items.length}</span>
        <span class="proto-chev${isOpen ? ' open' : ''}" id="pchev-${sec.id}">▼</span>
      </div>
      <div class="proto-sec-body${isOpen ? '' : ' collapsed'}" id="psecbody-${sec.id}">`;
    sec.items.forEach((item, idx) => {
      const ckid = `${sec.id}-${idx}`;
      const isDone = protoCheckStates[key][ckid];
      html += `<div class="proto-check-item${isDone ? ' done' : ''}" id="pci-${ckid}">
        <input type="checkbox"${isDone ? ' checked' : ''} onchange="toggleProtoCheck('${key}','${ckid}')">
        <div>
          <div class="proto-check-main">${item.t}</div>
          ${item.d ? `<div class="proto-check-detail">${item.d}</div>` : ''}
        </div>
      </div>`;
    });
    html += `</div></div>`;
  });

  document.getElementById('proto-detail-content').innerHTML = html;
}

function toggleProtoSec(key, secId) {
  protoSectionOpen[key + secId] = !protoSectionOpen[key + secId];
  const body = document.getElementById('psecbody-' + secId);
  const chev = document.getElementById('pchev-' + secId);
  if (body) body.classList.toggle('collapsed', !protoSectionOpen[key + secId]);
  if (chev) chev.classList.toggle('open', protoSectionOpen[key + secId]);
}

function toggleProtoCheck(key, ckid) {
  const el = document.querySelector(`#pci-${ckid} input[type=checkbox]`);
  protoCheckStates[key][ckid] = el.checked;
  const ci = document.getElementById('pci-' + ckid);
  if (ci) ci.classList.toggle('done', el.checked);
  updateProtoProgress(key);
}

function updateProtoProgress(key) {
  const p = SICU_PROTO[key];
  let total = 0, checked = 0;
  p.sections.forEach(sec => { total += sec.items.length; });
  Object.values(protoCheckStates[key]).forEach(v => { if (v) checked++; });
  const pct = total > 0 ? Math.round(checked / total * 100) : 0;
  const fill = document.getElementById('proto-prog-fill');
  const txt = document.getElementById('proto-prog-text');
  const pctEl = document.getElementById('proto-prog-pct');
  if (fill) fill.style.width = pct + '%';
  if (txt) txt.textContent = `${checked} / ${total} 항목`;
  if (pctEl) pctEl.textContent = pct + '%';

  p.sections.forEach(sec => {
    let secChecked = 0;
    sec.items.forEach((_, idx) => { if (protoCheckStates[key][`${sec.id}-${idx}`]) secChecked++; });
    const head = document.getElementById('psecbody-' + sec.id);
    if (head) {
      const progEl = head.previousElementSibling?.querySelector('.proto-sec-prog');
      if (progEl) progEl.textContent = `${secChecked}/${sec.items.length}`;
    }
  });

  if (total > 0 && checked === total) {
    const overlay = document.getElementById('proto-complete-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      const okBtn = document.getElementById('proto-complete-ok');
      const handler = () => {
        overlay.style.display = 'none';
        okBtn.removeEventListener('click', handler);
        resetProtoChecks(key);
      };
      okBtn.addEventListener('click', handler);
    }
  }
}

function resetProtoChecks(key) {
  protoCheckStates[key] = {};
  document.querySelectorAll('#proto-detail-content input[type=checkbox]').forEach(el => { el.checked = false; });
  document.querySelectorAll('#proto-detail-content .proto-check-item').forEach(el => { el.classList.remove('done'); });
  updateProtoProgress(key);
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  calcRate();
  interpretABGA();
  buildProtoDeptList();

  // Tab pill click
  document.querySelectorAll('.tab-pill').forEach(pill => {
    pill.addEventListener('click', function() {
      this.closest('.tab-row').querySelectorAll('.tab-pill').forEach(p => p.classList.remove('active'));
      this.classList.add('active');
    });
  });

  // Filter chip click
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', function() {
      this.closest('.filter-row').querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
    });
  });

  // Adult/Child tab
  document.querySelectorAll('.ac-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      this.closest('.adult-child-tab').querySelectorAll('.ac-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
    });
  });

  // ABGA tabs
  document.querySelectorAll('.abga-tab').forEach((tab, i) => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.abga-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
    });
  });

  // Memo tabs
  document.querySelectorAll('.memo-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.memo-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
    });
  });

  // View toggle
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
    });
  });
});

// ===== 즐겨찾기 =====
// 즐겨찾기 가능한 화면 목록
const BOOKMARKABLE = [
  { screen: 'screen-initial-assessment',  icon: '📋', label: '초기사정 메뉴얼' },
  { screen: 'screen-antibiotic-ast',      icon: '💉', label: '항생제 AST 가이드' },
  { screen: 'screen-sicu-manual',         icon: '📖', label: '외과계중환자실 업무 메뉴얼' },
  { screen: 'screen-disease-summary',     icon: '🏥', label: '질환별 핵심 요약' },
  { screen: 'screen-equipment',           icon: '🖥️', label: '장비 가이드' },
  { screen: 'screen-drugguide',           icon: '💊', label: '약물 가이드' },
  { screen: 'screen-protocol',            icon: '🚨', label: '응급 프로토콜' },
  { screen: 'screen-drugcalc',            icon: '🧮', label: '계산기' },
  { screen: 'screen-sicu-quick-rounding', icon: '🩺', label: '퀵라운딩' },
  { screen: 'screen-cn-rounding',         icon: '📋', label: '책임간호사 라운딩' },
  { screen: 'screen-qm-checklist',        icon: '✅', label: 'QM 업무체크리스트' },
  { screen: 'screen-foley-monitoring',    icon: '🔍', label: '유치도뇨관 유지관리 모니터링' },
];

function loadFavorites() {
  try { return JSON.parse(localStorage.getItem('icu_favorites') || '[]'); }
  catch(e) { return []; }
}
function saveFavorites(list) {
  localStorage.setItem('icu_favorites', JSON.stringify(list));
}

function toggleBookmark(screenId, label, icon) {
  let favs = loadFavorites();
  const idx = favs.findIndex(f => f.screen === screenId);
  if (idx >= 0) {
    favs.splice(idx, 1);
  } else {
    favs.push({ screen: screenId, label, icon });
  }
  saveFavorites(favs);
  updateAllBookmarkBtns();
  renderHomeFavorites();

  // 관리 화면이 열려 있으면 재렌더
  const active = document.querySelector('.screen.active');
  if (active && active.id === 'screen-favorites') renderFavManage();

  // 토스트 피드백
  const msg = idx >= 0 ? '즐겨찾기에서 제거됐습니다' : '즐겨찾기에 추가됐습니다';
  showToast(msg);
}

function isBookmarked(screenId) {
  return loadFavorites().some(f => f.screen === screenId);
}

function updateAllBookmarkBtns() {
  // 각 화면 헤더의 ⭐ 버튼
  document.querySelectorAll('[id^="bm-"]').forEach(btn => {
    const screenId = btn.id.replace('bm-', '');
    btn.textContent = isBookmarked(screenId) ? '★' : '⭐';
    btn.classList.toggle('bm-active', isBookmarked(screenId));
  });
  // 교육자료 카드의 ⭐ 버튼 (id 중복을 피하려고 data 속성 사용)
  document.querySelectorAll('[data-bm-screen]').forEach(btn => {
    const screenId = btn.dataset.bmScreen;
    btn.textContent = isBookmarked(screenId) ? '★' : '⭐';
    btn.classList.toggle('bm-active', isBookmarked(screenId));
  });
}

function renderHomeFavorites() {
  const el = document.getElementById('home-fav-list');
  if (!el) return;
  const favs = loadFavorites();
  if (favs.length === 0) {
    el.innerHTML = '<div class="home-fav-empty">즐겨찾기한 항목이 없습니다.<br>각 화면의 ⭐ 버튼으로 추가하세요.</div>';
    return;
  }
  const show = favs.slice(0, 5);
  el.innerHTML = show.map(f =>
    `<div class="home-fav-item" onclick="showScreen('${f.screen}')">
      <span class="home-fav-icon">${f.icon}</span>
      <span class="home-fav-label">${f.label}</span>
      <span class="home-fav-arrow">›</span>
    </div>`
  ).join('');
  if (favs.length > 5) {
    el.innerHTML += `<div class="home-fav-more" onclick="showScreen('screen-favorites')">+${favs.length - 5}개 더 보기</div>`;
  }
}

function renderFavManage() {
  const el = document.getElementById('fav-manage-list');
  if (!el) return;
  const favs = loadFavorites();

  let html = '<div class="fav-manage-group">';
  BOOKMARKABLE.forEach(b => {
    const added = favs.some(f => f.screen === b.screen);
    if (added) {
      html += `<div class="fav-manage-item fav-item-added">
        <span class="fav-manage-icon">${b.icon}</span>
        <div class="fav-manage-text">
          <span class="fav-manage-label">${b.label}</span>
          <span class="fav-added-badge">✓ 추가됨</span>
        </div>
        <button class="fav-remove-btn" onclick="toggleBookmark('${b.screen}','${b.label}','${b.icon}')">제거</button>
      </div>`;
    } else {
      html += `<div class="fav-manage-item">
        <span class="fav-manage-icon fav-icon-dim">${b.icon}</span>
        <div class="fav-manage-text">
          <span class="fav-manage-label">${b.label}</span>
        </div>
        <button class="fav-add-btn" onclick="toggleBookmark('${b.screen}','${b.label}','${b.icon}')">+ 추가</button>
      </div>`;
    }
  });
  html += '</div>';

  el.innerHTML = html;
}

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('toast-show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('toast-show'), 2000);
}

// 앱 로드 시 즐겨찾기 렌더
document.addEventListener('DOMContentLoaded', () => {
  renderHomeFavorites();
  updateAllBookmarkBtns();
  initFoleyMonitoring();
});

// ===== 유치도뇨관 유지관리 모니터링 =====
const FOLEY_SHIFTS = [
  { key: 'day',   label: 'D', name: '데이 근무 (07:00 ~ 15:00)',   color: '#1565C0', times: ['09:30', '11:30', '14:30'] },
  { key: 'eve',   label: 'E', name: '이브닝 근무 (15:00 ~ 23:00)', color: '#2E7D32', times: ['18:30', '20:30', '22:30'] },
  { key: 'night', label: 'N', name: '나이트 근무 (23:00 ~ 07:00)', color: '#4A148C', times: ['01:30', '03:30', '06:30'] },
];
const FOLEY_BEDS = 18;
const FOLEY_STORAGE_KEY = 'foley_v2';
let foleyCurrentShift = null;
let foleyTimeIdx = 0;          // 지금 체크 중인 시간대 (0=1차, 1=2차, 2=3차)

function initFoleyMonitoring() {
  const dateEl = document.getElementById('foleySheetDate');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
}

function foleyOnDateChange() {
  saveBtnReset('foley-saveBtn');
  // 날짜 바뀌면 현재 선택된 교대 데이터 다시 로드
  if (foleyCurrentShift) {
    document.querySelectorAll('#foley-sections input[type=checkbox]').forEach(cb => cb.checked = false);
    foleyLoadShiftData(foleyCurrentShift);
    foleyRestoreConfirmer();
  }
}

function foleyGetDateKey() {
  const d = document.getElementById('foleySheetDate');
  return d ? d.value : new Date().toISOString().split('T')[0];
}

function foleyGetStorageKey(shiftKey) {
  return `${FOLEY_STORAGE_KEY}_${foleyGetDateKey()}_${shiftKey}`;
}

// 교대 선택 → 버튼 강조 + 테이블 렌더
function foleySelectShift(shiftKey) {
  saveBtnReset('foley-saveBtn');
  foleyCurrentShift = shiftKey;
  const shift = FOLEY_SHIFTS.find(s => s.key === shiftKey);

  // 버튼 강조
  ['day','eve','night'].forEach(k => {
    const btn = document.getElementById(`foley-btn-${k}`);
    if (!btn) return;
    const s = FOLEY_SHIFTS.find(x => x.key === k);
    if (k === shiftKey) {
      btn.style.background = s.color;
      btn.querySelectorAll('div').forEach(d => d.style.color = '#fff');
    } else {
      btn.style.background = '#fff';
      btn.querySelectorAll('div').forEach((d, i) => {
        d.style.color = i < 2 ? s.color : '#888';
      });
    }
  });

  // 섹션 렌더
  foleyTimeIdx = 0;                 // 근무를 바꾸면 1차 시간부터
  foleyBuildShiftSection(shift);
  foleyApplyTimeSelection();
  foleyLoadShiftData(shiftKey);
  foleyRestoreConfirmer();
}

function foleyBuildShiftSection(shift) {
  const container = document.getElementById('foley-sections');
  if (!container) return;

  // 테이블 행 구성 (침상 1~18)
  const bedHeaders = Array.from({length: FOLEY_BEDS}, (_, i) =>
    `<th style="border:1px solid #ddd; padding:5px 3px; min-width:32px; font-size:12px; background:#e8f4fd;">${i+1}</th>`
  ).join('');

  const presentRow = Array.from({length: FOLEY_BEDS}, (_, i) =>
    `<td style="border:1px solid #ddd; text-align:center; padding:4px 2px;">
      <input type="checkbox" data-row="present" data-bed="${i+1}"
        style="width:16px; height:16px; accent-color:${shift.color}; cursor:pointer;"
        onchange="foleyCheckBedActivation(${i+1}); foleyAutoSave()">
    </td>`
  ).join('');

  const looseStoolRow = Array.from({length: FOLEY_BEDS}, (_, i) =>
    `<td style="border:1px solid #ddd; text-align:center; padding:4px 2px;">
      <input type="checkbox" data-row="loose" data-bed="${i+1}"
        style="width:16px; height:16px; accent-color:#e57373; cursor:pointer;"
        onchange="foleyCheckBedActivation(${i+1}); foleyAutoSave()">
    </td>`
  ).join('');

  // 시간대 선택 버튼 (선택한 시간만 체크 가능, 나머지는 읽기 전용)
  const timeBar = shift.times.map((time, ti) =>
    `<button id="foley-timebtn-${ti}" onclick="foleySelectTime(${ti})"
      style="flex:1; padding:10px 0; border:2px solid ${shift.color}; border-radius:10px;
             background:#fff; color:${shift.color}; font-size:15px; font-weight:800;
             cursor:pointer; font-family:inherit; transition:all 0.15s;">
      ${time}
    </button>`
  ).join('');

  const timeRows = shift.times.map((time, ti) => {
    const cells = Array.from({length: FOLEY_BEDS}, (_, i) =>
      `<td style="border:1px solid #ddd; text-align:center; padding:4px 2px; background:#f9f9f9;" data-time-cell data-bed="${i+1}">
        <input type="checkbox" data-row="time${ti}" data-bed="${i+1}"
          style="width:16px; height:16px; accent-color:${shift.color}; cursor:pointer; opacity:0.3;"
          disabled
          onchange="foleyAutoSave()">
      </td>`
    ).join('');
    return `<tr data-time-row="${ti}">
      <td style="border:1px solid #ddd; padding:5px 8px; font-size:12px; font-weight:600; background:#f5f5f5; white-space:nowrap; text-align:center; cursor:pointer;"
          onclick="foleySelectTime(${ti})">${time}</td>
      ${cells}
    </tr>`;
  }).join('');

  container.innerHTML = `
    <!-- 교대 헤더 -->
    <div style="display:flex; align-items:center; padding:8px 14px; background:${shift.color}; border-radius:10px 10px 0 0; margin-bottom:0;">
      <span style="font-size:22px; font-weight:900; color:#fff; margin-right:10px;">${shift.label}</span>
      <span style="font-size:12px; color:rgba(255,255,255,0.92); font-weight:600;">${shift.name}</span>
    </div>

    <!-- 확인 시간 선택 -->
    <div style="padding:10px 12px; background:#fff; border:1.5px solid ${shift.color}; border-top:none;">
      <div style="font-size:12px; color:#555; font-weight:700; margin-bottom:6px;">⏰ 지금 확인하는 시간을 선택하세요</div>
      <div style="display:flex; gap:8px;">${timeBar}</div>
      <div style="font-size:11px; color:#888; margin-top:6px;">선택한 시간만 체크할 수 있고, 나머지 시간은 확인용으로 표시됩니다.</div>
    </div>

    <!-- 테이블 (가로 스크롤) -->
    <div style="overflow-x:auto; -webkit-overflow-scrolling:touch; border:1.5px solid ${shift.color}; border-top:none; border-radius:0 0 10px 10px; margin-bottom:14px;">
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr>
            <th style="border:1px solid #ddd; padding:6px 8px; background:#f0f0f0; min-width:70px; font-size:11px; white-space:nowrap;">항목 / 침상</th>
            ${bedHeaders}
          </tr>
        </thead>
        <tbody>
          <!-- 도뇨관 보유 현황 -->
          <tr style="background:#fff9c4;">
            <td style="border:1px solid #ddd; padding:5px 8px; font-size:11px; font-weight:700; text-align:center; white-space:nowrap;">도뇨관<br>보유 ✓</td>
            ${presentRow}
          </tr>
          <!-- 무른변 보는 환자 -->
          <tr style="background:#fce4ec;">
            <td style="border:1px solid #ddd; padding:5px 8px; font-size:11px; font-weight:700; text-align:center; white-space:nowrap; color:#c62828;">무른변<br>환자 ✓</td>
            ${looseStoolRow}
          </tr>
          <!-- 시간별 확인 라벨 (도뇨관 보유 + 무른변 둘 다 체크 시 활성) -->
          <tr style="background:#e8f5e9;">
            <td colspan="${FOLEY_BEDS + 1}" style="border:1px solid #ddd; padding:4px 10px; font-size:11px; font-weight:600; color:#2E7D32;">
              ⏰ 시간별 확인 (삽입부위/고정 · 소변량/색깔 · 역류방지) — 도뇨관 보유 + 무른변 환자 모두 체크 시 활성화
            </td>
          </tr>
          ${timeRows}
        </tbody>
      </table>
    </div>

    <!-- 저장 / 초기화 버튼 -->
    <div style="display:flex; gap:10px;">
      <button onclick="foleyResetShift()"
        style="flex:1; padding:12px; background:#f0f0f0; color:#333; border:none; border-radius:10px; font-size:14px; font-weight:600; cursor:pointer; font-family:inherit;">
        🔄 초기화
      </button>
      <button id="foley-saveBtn" onclick="foleySave()"
        style="flex:2; padding:12px; background:${shift.color}; color:#fff; border:none; border-radius:10px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit;">
        💾 저장
      </button>
    </div>
  `;
}

// ── 확인 시간 선택 ────────────────────────────────
/** 지금 체크할 시간대를 고름 (선택한 행만 편집 가능) */
function foleySelectTime(ti) {
  foleyTimeIdx = ti;
  foleyApplyTimeSelection();
  for (let b = 1; b <= FOLEY_BEDS; b++) foleyCheckBedActivation(b);
}

/** 시간 버튼과 표의 행 강조를 현재 선택에 맞춤 */
function foleyApplyTimeSelection() {
  const shift = FOLEY_SHIFTS.find(s => s.key === foleyCurrentShift);
  if (!shift) return;

  shift.times.forEach((_, ti) => {
    const btn = document.getElementById(`foley-timebtn-${ti}`);
    if (btn) {
      const on = ti === foleyTimeIdx;
      btn.style.background = on ? shift.color : '#fff';
      btn.style.color      = on ? '#fff' : shift.color;
    }
    const tr = document.querySelector(`#foley-sections tr[data-time-row="${ti}"]`);
    if (tr) tr.style.background = ti === foleyTimeIdx ? '#e8f5e9' : '';
  });
}

function foleyCheckBedActivation(bed) {
  const presentCb = document.querySelector(`input[data-row="present"][data-bed="${bed}"]`);
  const looseCb   = document.querySelector(`input[data-row="loose"][data-bed="${bed}"]`);
  const active = presentCb?.checked && looseCb?.checked;

  document.querySelectorAll(`input[data-row^="time"][data-bed="${bed}"]`).forEach(cb => {
    const ti = Number(String(cb.dataset.row).replace('time', ''));
    // 도뇨관 보유 + 무른변 환자 이면서, 지금 선택한 시간대일 때만 체크 가능
    const editable = active && ti === foleyTimeIdx;

    cb.disabled = !editable;
    cb.style.cursor  = editable ? 'pointer' : 'not-allowed';
    // 선택 안 한 시간대는 값은 그대로 두고 읽기 전용으로만 표시
    cb.style.opacity = editable ? '1' : (active ? '0.6' : '0.3');
    if (!active) cb.checked = false;   // 해당 침상 자체가 대상이 아니면 초기화

    const td = cb.closest('td');
    if (td) td.style.background = editable ? '' : '#f9f9f9';
  });
}

function foleyAutoSave() {
  saveBtnReset('foley-saveBtn');   // 체크를 바꾸면 다시 저장할 수 있게
  if (!foleyCurrentShift) return;
  const key = foleyGetStorageKey(foleyCurrentShift);
  const data = { confirmer: document.getElementById('foley-confirmer')?.value || '', checks: {} };
  document.querySelectorAll('#foley-sections input[type=checkbox]').forEach(cb => {
    data.checks[`${cb.dataset.row}_${cb.dataset.bed}`] = cb.checked;
  });
  localStorage.setItem(key, JSON.stringify(data));
}

function foleyLoadShiftData(shiftKey) {
  const key = foleyGetStorageKey(shiftKey);
  const raw = localStorage.getItem(key);
  if (!raw) return;
  const data = JSON.parse(raw);
  if (!data.checks) return;

  // 1단계: present·loose 먼저 복원
  document.querySelectorAll('#foley-sections input[type=checkbox]').forEach(cb => {
    if (cb.dataset.row === 'present' || cb.dataset.row === 'loose') {
      const id = `${cb.dataset.row}_${cb.dataset.bed}`;
      if (data.checks[id] !== undefined) cb.checked = data.checks[id];
    }
  });

  // 2단계: 활성화 여부 판별 (time 체크박스 enable/disable)
  for (let b = 1; b <= FOLEY_BEDS; b++) foleyCheckBedActivation(b);

  // 3단계: time 체크박스 복원
  //   disabled 여부와 무관하게 복원해야 선택하지 않은 시간대의 기록도 보입니다
  document.querySelectorAll('#foley-sections input[type=checkbox]').forEach(cb => {
    if (cb.dataset.row && cb.dataset.row.startsWith('time')) {
      const id = `${cb.dataset.row}_${cb.dataset.bed}`;
      const bedActive = document.querySelector(`input[data-row="present"][data-bed="${cb.dataset.bed}"]`)?.checked
                     && document.querySelector(`input[data-row="loose"][data-bed="${cb.dataset.bed}"]`)?.checked;
      if (data.checks[id] !== undefined && bedActive) cb.checked = data.checks[id];
    }
  });
}

/** 저장해 둔 확인자 이름을 입력란에 되살림 */
function foleyRestoreConfirmer() {
  if (!foleyCurrentShift) return;
  const raw = localStorage.getItem(foleyGetStorageKey(foleyCurrentShift));
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    const el = document.getElementById('foley-confirmer');
    if (el && data.confirmer) el.value = data.confirmer;
  } catch (e) {}
}

function foleySave() {
  if (!foleyCurrentShift) { alert('근무를 먼저 선택하세요.'); return; }
  const confirmer = document.getElementById('foley-confirmer')?.value.trim() || '';
  if (!confirmer) {
    alert('확인자 이름을 입력해주세요.');
    document.getElementById('foley-confirmer')?.focus();
    return;
  }
  foleyAutoSave();
  const shift   = FOLEY_SHIFTS.find(s => s.key === foleyCurrentShift);
  const date    = foleyGetDateKey();
  const savedAt = new Date().toLocaleString('ko-KR');
  const rows    = [];

  for (let bed = 1; bed <= FOLEY_BEDS; bed++) {
    const present    = document.querySelector(`input[data-row="present"][data-bed="${bed}"]`)?.checked || false;
    const loose      = document.querySelector(`input[data-row="loose"][data-bed="${bed}"]`)?.checked   || false;
    const timeChecks = shift.times.map((t, ti) =>
      document.querySelector(`input[data-row="time${ti}"][data-bed="${bed}"]`)?.checked || false
    );

    // 아무것도 체크 안 된 침상은 전송 생략
    if (!present && !loose && timeChecks.every(c => !c)) continue;

    // 같은 시행일+근무+침상 행은 GAS 가 찾아서 덮어쓰므로 몇 번을 저장해도 한 줄
    // (확인자는 갱신 기준이 아니므로 마지막으로 저장한 사람 이름이 남음)
    rows.push([
      savedAt, date, shift.label, confirmer, bed + '번',
      present ? '✓' : '',
      loose   ? '✓' : '',
      ...timeChecks.map(c => c ? '✓' : ''),
    ]);
  }

  if (rows.length === 0) { alert('저장할 데이터가 없습니다.'); return; }

  alert(`✅ 저장 완료\n\n📅 날짜: ${date}\n근무: ${shift.label} (${shift.name})\n⏰ 확인 시간: ${shift.times[foleyTimeIdx]}\n👤 확인자: ${confirmer}\n✔ 저장: ${rows.length}개 침상\n\n같은 근무에서 다음 시간대를 체크한 뒤 다시 저장하면\n기존 기록에 이어서 갱신됩니다.`);

  saveBtnBusy('foley-saveBtn');
  saveBtnAfter(fetch(SQR_SHEET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ sheetName: '유치도뇨관', rows }),
  }), ok => {
    saveBtnDone('foley-saveBtn', ok === true ? '✅ 저장 완료' : '✅ 저장 완료 (전송 확인 필요)');
  });
}

function foleyResetShift() {
  if (!confirm('현재 교대 체크를 모두 초기화할까요?')) return;
  document.querySelectorAll('#foley-sections input[type=checkbox]').forEach(cb => cb.checked = false);
  if (foleyCurrentShift) localStorage.removeItem(foleyGetStorageKey(foleyCurrentShift));
  saveBtnReset('foley-saveBtn');
}

function foleyPrint() {
  if (!foleyCurrentShift) { alert('근무를 먼저 선택하세요.'); return; }
  const date = foleyGetDateKey();
  const shift = FOLEY_SHIFTS.find(s => s.key === foleyCurrentShift);
  const sectionsHtml = document.getElementById('foley-sections').innerHTML;
  const w = window.open('', '_blank', 'width=1200,height=800');
  w.document.write(`<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<title>SICU 유치도뇨관 유지/관리 모니터링</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Malgun Gothic','Noto Sans KR',sans-serif; font-size:11px; padding:10px; }
table { border-collapse:collapse; }
th, td { border:1px solid #ccc; padding:3px 4px; text-align:center; }
input[type=checkbox] { width:13px; height:13px; }
button { display:none; }
</style></head><body>
<div style="display:flex; justify-content:space-between; margin-bottom:6px;">
  <b style="font-size:14px;">SICU 유치도뇨관 유지/관리 모니터링</b>
  <span>시행일: ${date} | 근무: ${shift.label} | 확인자: ${document.getElementById('foley-confirmer')?.value || ''}</span>
</div>
${sectionsHtml}
</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

// ===== 퀵라운딩 =====
const ROUNDING_SECTIONS = [
  { id: 'A', label: 'A. 기도/호흡', color: 'sec-blue', items: [
    { key: 'airway',  label: '기도 유지 (ETT/Trach/자연기도)' },
    { key: 'vent',    label: 'Ventilator 설정 · 알람 확인' },
    { key: 'spo2',    label: 'SpO₂ · 호흡수 모니터' },
    { key: 'suction', label: '분비물 사정 · 흡인 여부' },
  ]},
  { id: 'B', label: 'B. 순환', color: 'sec-green', items: [
    { key: 'bp',      label: 'BP · HR · 리듬 모니터' },
    { key: 'vaso',    label: '승압제/심장약 투여 속도 확인' },
    { key: 'cvp',     label: 'CVP · 말초 순환 사정' },
    { key: 'line',    label: 'Central/A-line 부위 확인' },
  ]},
  { id: 'C', label: 'C. 신경/의식', color: 'sec-purple', items: [
    { key: 'gcs',     label: 'GCS / AVPU 의식 평가' },
    { key: 'pupil',   label: '동공 크기·반응 확인' },
    { key: 'pain',    label: '통증 사정 (NRS/CPOT)' },
    { key: 'sedation',label: '진정 깊이 (RASS) 확인' },
  ]},
  { id: 'D', label: 'D. 수액/배액', color: 'sec-amber', items: [
    { key: 'uo',      label: '소변량 (목표 ≥0.5mL/kg/h)' },
    { key: 'drain',   label: '배액관 성상·양 기록' },
    { key: 'io',      label: 'I/O 밸런스 확인' },
    { key: 'lab',     label: 'Lab 결과 확인 · 이상치 보고' },
  ]},
  { id: 'E', label: 'E. 피부/기타', color: 'sec-orange', items: [
    { key: 'skin',    label: '욕창 고위험 부위 피부 사정' },
    { key: 'tube',    label: 'Foley · NGT · 기타 튜브 확인' },
    { key: 'family',  label: '보호자 문의·교육 사항' },
    { key: 'plan',    label: '금일 치료 계획 확인 (의사 오더)' },
  ]},
];

let roundingPatients = [
  { id: 1, bed: 'Bed 1', name: '김OO', checks: {} },
  { id: 2, bed: 'Bed 3', name: '이OO', checks: {} },
];
let roundingActivePatient = 0;

function renderRounding() {
  renderRoundingTabs();
  renderRoundingCard();
}

function renderRoundingTabs() {
  const row = document.getElementById('rounding-tab-row');
  if (!row) return;
  row.innerHTML = roundingPatients.map((p, i) => {
    const total = ROUNDING_SECTIONS.reduce((s, sec) => s + sec.items.length, 0);
    const done = Object.values(p.checks).filter(Boolean).length;
    const active = i === roundingActivePatient ? 'rounding-tab-active' : '';
    return `<div class="rounding-tab ${active}" onclick="switchRoundingPatient(${i})">
      <div class="rt-bed">${p.bed}</div>
      <div class="rt-name">${p.name}</div>
      <div class="rt-prog">${done}/${total}</div>
    </div>`;
  }).join('');
}

function renderRoundingCard() {
  const area = document.getElementById('rounding-card-area');
  if (!area) return;
  const p = roundingPatients[roundingActivePatient];
  const total = ROUNDING_SECTIONS.reduce((s, sec) => s + sec.items.length, 0);
  const done = Object.values(p.checks).filter(Boolean).length;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;

  let html = `<div class="rounding-progress-wrap">
    <div class="rounding-progress-bar"><div class="rounding-progress-fill" style="width:${pct}%"></div></div>
    <span class="rounding-progress-text">${done} / ${total} 항목 완료 (${pct}%)</span>
  </div>`;

  ROUNDING_SECTIONS.forEach(sec => {
    const secDone = sec.items.every(it => p.checks[it.key]);
    html += `<div class="rounding-section">
      <div class="rounding-sec-title ${sec.color}${secDone ? ' sec-done' : ''}">${sec.label}${secDone ? ' ✓' : ''}</div>`;
    sec.items.forEach(it => {
      const checked = !!p.checks[it.key];
      html += `<label class="rounding-item${checked ? ' item-checked' : ''}">
        <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleRoundingCheck(${p.id},'${it.key}',this.checked)">
        <span>${it.label}</span>
      </label>`;
    });
    html += `</div>`;
  });

  html += `<div class="rounding-actions">
    <button class="btn-secondary" onclick="resetRoundingChecks(${p.id})">초기화</button>
    <button class="btn-primary" onclick="completeRounding(${p.id})">라운딩 완료</button>
  </div>`;

  area.innerHTML = html;
}

function switchRoundingPatient(idx) {
  roundingActivePatient = idx;
  renderRounding();
}

function toggleRoundingCheck(patientId, key, val) {
  const p = roundingPatients.find(x => x.id === patientId);
  if (!p) return;
  p.checks[key] = val;
  renderRoundingTabs();
  // 진행률만 재렌더 (체크박스 focus 유지를 위해 전체 재렌더 대신 진행률 업데이트)
  const total = ROUNDING_SECTIONS.reduce((s, sec) => s + sec.items.length, 0);
  const done = Object.values(p.checks).filter(Boolean).length;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  const fill = document.querySelector('.rounding-progress-fill');
  const text = document.querySelector('.rounding-progress-text');
  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = `${done} / ${total} 항목 완료 (${pct}%)`;
  // 섹션 타이틀 완료 표시 업데이트
  ROUNDING_SECTIONS.forEach(sec => {
    const secDone = sec.items.every(it => p.checks[it.key]);
    const titleEl = document.querySelector(`.${sec.color}`);
    if (titleEl) {
      titleEl.textContent = sec.label + (secDone ? ' ✓' : '');
      titleEl.classList.toggle('sec-done', secDone);
    }
  });
}

function resetRoundingChecks(patientId) {
  const p = roundingPatients.find(x => x.id === patientId);
  if (!p) return;
  p.checks = {};
  renderRounding();
}

function completeRounding(patientId) {
  const p = roundingPatients.find(x => x.id === patientId);
  if (!p) return;
  const total = ROUNDING_SECTIONS.reduce((s, sec) => s + sec.items.length, 0);
  const done = Object.values(p.checks).filter(Boolean).length;
  alert(`${p.bed} ${p.name} 라운딩 완료\n확인 항목: ${done}/${total}`);
}

function addRoundingPatient() {
  const bed = prompt('베드 번호 (예: Bed 5)');
  if (!bed) return;
  const name = prompt('환자 이름 (예: 박OO)');
  if (!name) return;
  const newId = roundingPatients.length > 0 ? Math.max(...roundingPatients.map(p => p.id)) + 1 : 1;
  roundingPatients.push({ id: newId, bed: bed.trim(), name: name.trim(), checks: {} });
  roundingActivePatient = roundingPatients.length - 1;
  renderRounding();
}

// ===== QM 업무체크리스트 =====
const QM_STORAGE_KEY = 'qm_v2';
const QM_BEDS = 18;
let qmCurrentBed = null;

function initQMChecklist() {
  const dateEl = document.getElementById('qm-work-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];
  qmCurrentBed = null;
  qmShowBedPanel();
  qmRenderBedGrid();
}

function qmGetDateKey() {
  return document.getElementById('qm-work-date')?.value || new Date().toISOString().split('T')[0];
}

function qmGetStorageKey(bed) {
  const shift = document.getElementById('qm-shift')?.value || 'D';
  return `${QM_STORAGE_KEY}_${qmGetDateKey()}_${shift}_bed${bed}`;
}

// ── 침상 그리드 렌더 ──────────────────────────────
function qmRenderBedGrid() {
  const grid = document.getElementById('qm-bed-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const shift = document.getElementById('qm-shift')?.value || 'D';
  const date = qmGetDateKey();

  for (let b = 1; b <= QM_BEDS; b++) {
    const bedNum = b;
    const key = `${QM_STORAGE_KEY}_${date}_${shift}_bed${bedNum}`;
    let status = 'empty';
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const data = JSON.parse(raw);
        // N 근무가 아니면 N 전용 항목은 완료 판정에서 제외
        const skip = shift === 'N' ? [] : qmNightOnlyIndexes();
        const checks = Object.entries(data.checks || {})
          .filter(([k]) => skip.indexOf(Number(k)) === -1)
          .map(([, v]) => v);
        const total = checks.length;
        const checkedCount = checks.filter(Boolean).length;
        if (total > 0 && checkedCount === total) status = 'done';
        else if (checkedCount > 0) status = 'partial';
      }
    } catch(e) {}

    const bg     = status === 'done' ? '#d1fae5' : status === 'partial' ? '#fef9c3' : '#fff';
    const border = status === 'done' ? '#38a169' : status === 'partial' ? '#ca8a04' : '#cbd5e1';
    const color  = status === 'done' ? '#065f46' : status === 'partial' ? '#92400e' : '#374151';
    const icon   = status === 'done' ? '✅' : status === 'partial' ? '⚡' : '&nbsp;';

    const btn = document.createElement('button');
    btn.setAttribute('onclick', `qmSelectBed(${bedNum})`);
    btn.style.cssText = `padding:12px 0; border:2px solid ${border}; border-radius:10px; background:${bg}; cursor:pointer; font-family:inherit; width:100%;`;
    btn.innerHTML = `<div style="font-size:17px;font-weight:800;color:${color};">${bedNum}</div><div style="font-size:12px;line-height:1.2;">${icon}</div>`;
    grid.appendChild(btn);
  }
}

// ── 침상 선택 → 체크리스트 패널 ──────────────────
function qmSelectBed(bed) {
  saveBtnReset('qm-saveBtn');
  saveBtnReset('qm-save-btn');
  qmCurrentBed = bed;
  qmShowChecklistPanel(bed);
  qmClearChecklist();
  qmLoadBedData(bed);
  qmApplyShiftLock();   // 근무에 따라 N 전용 항목 잠금 (내부에서 진행률도 갱신)
}

function qmShowBedPanel() {
  document.getElementById('qm-panel-beds').style.display = 'block';
  document.getElementById('qm-panel-checklist').style.display = 'none';
  document.getElementById('qm-header-title').textContent = 'QM 업무체크리스트';
  document.getElementById('qm-save-btn').style.display = 'none';
  document.getElementById('qm-back-btn').onclick = () => showScreen('screen-icu-rounding');
  qmRenderBedGrid();
}

function qmShowChecklistPanel(bed) {
  document.getElementById('qm-panel-beds').style.display = 'none';
  document.getElementById('qm-panel-checklist').style.display = 'block';
  document.getElementById('qm-header-title').textContent = `QM 체크 — ${bed}번 침상`;
  document.getElementById('qm-save-btn').style.display = 'inline';
  document.getElementById('qm-back-btn').onclick = qmBackToBeds;
  document.getElementById('qm-panel-checklist').scrollTop = 0;
  const sc = document.querySelector('#screen-qm-checklist .scroll-content');
  if (sc) sc.scrollTop = 0;
}

function qmBackToBeds() {
  qmAutoSave();
  qmShowBedPanel();
}

function qmHandleBack() {
  // back-btn의 onclick이 동적으로 변경됨 — 실제 실행은 onclick에서 처리
}

// ── 체크리스트 데이터 ─────────────────────────────
function qmClearChecklist() {
  document.querySelectorAll('#qm-panel-checklist input[type=checkbox]').forEach(cb => {
    cb.checked = false;
    cb.closest('.qm-check-item')?.classList.remove('qm-checked');
  });
  const notes = document.getElementById('qm-handover-notes');
  if (notes) notes.value = '';
}

function qmAutoSave() {
  saveBtnReset('qm-saveBtn');      // 체크를 바꾸면 다시 저장할 수 있게
  saveBtnReset('qm-save-btn');
  if (!qmCurrentBed) return;
  const key = qmGetStorageKey(qmCurrentBed);
  const checks = {};
  document.querySelectorAll('#qm-panel-checklist input[type=checkbox]').forEach((cb, i) => {
    checks[i] = cb.checked;
  });
  const notes = document.getElementById('qm-handover-notes')?.value || '';
  localStorage.setItem(key, JSON.stringify({ checks, notes }));
}

function qmLoadBedData(bed) {
  const key = qmGetStorageKey(bed);
  const raw = localStorage.getItem(key);
  if (!raw) return;
  const data = JSON.parse(raw);
  document.querySelectorAll('#qm-panel-checklist input[type=checkbox]').forEach((cb, i) => {
    if (data.checks && data.checks[i] !== undefined) {
      cb.checked = data.checks[i];
      if (cb.checked) cb.closest('.qm-check-item')?.classList.add('qm-checked');
    }
  });
  const notes = document.getElementById('qm-handover-notes');
  if (notes && data.notes) notes.value = data.notes;
}

// ── 근무별 항목 잠금 ──────────────────────────────
/** 현재 선택된 근무가 N(Night) 인지 */
function qmIsNight() {
  return (document.getElementById('qm-shift')?.value || 'D') === 'N';
}

/** N 근무 전용 항목을 근무에 따라 잠그거나 풀어줌 */
function qmApplyShiftLock() {
  const night = qmIsNight();
  document.querySelectorAll('#qm-panel-checklist .qm-night-only').forEach(item => {
    item.classList.toggle('qm-locked', !night);
    const cb = item.querySelector('input[type=checkbox]');
    if (!cb) return;
    cb.disabled = !night;
    if (!night && cb.checked) {          // N 이 아닌 근무로 바꾸면 체크를 해제
      cb.checked = false;
      item.classList.remove('qm-checked');
    }
  });
  qmUpdateProgress();
  qmAutoSave();
}

/** 현재 근무에서 실제로 체크할 수 있는 항목만 추림 */
function qmActiveCheckboxes() {
  const night = qmIsNight();
  return [...document.querySelectorAll('#qm-panel-checklist input[type=checkbox]')]
    .filter(cb => night || !cb.closest('.qm-night-only'));
}

/** N 전용 항목이 전체 체크박스 중 몇 번째인지 (저장 데이터가 순번으로 되어 있어 필요) */
function qmNightOnlyIndexes() {
  const out = [];
  document.querySelectorAll('#qm-panel-checklist input[type=checkbox]')
    .forEach((cb, i) => { if (cb.closest('.qm-night-only')) out.push(i); });
  return out;
}

/** 근무 선택이 바뀌었을 때 – 해당 근무의 저장분을 다시 불러오고 잠금을 적용 */
function qmOnShiftChange() {
  const panel = document.getElementById('qm-panel-checklist');
  const open = qmCurrentBed && panel && panel.style.display !== 'none';
  if (open) {
    qmClearChecklist();
    qmLoadBedData(qmCurrentBed);   // 근무가 바뀌면 저장 위치도 바뀜
  }
  qmApplyShiftLock();
  qmRenderBedGrid();               // 침상별 완료 표시도 근무 기준으로 갱신
}

function qmToggle(item) {
  if (item.classList.contains('qm-locked')) return;   // 잠긴 항목은 무시
  const cb = item.querySelector('input[type=checkbox]');
  if (!cb) return;
  cb.checked = !cb.checked;
  item.classList.toggle('qm-checked', cb.checked);
  qmUpdateProgress();
  qmAutoSave();
}

function qmUpdateProgress() {
  const all = qmActiveCheckboxes();
  const total = all.length;
  let checked = 0;
  all.forEach(cb => { if (cb.checked) checked++; });
  const pct = total > 0 ? Math.round(checked / total * 100) : 0;

  const fill = document.getElementById('qm-prog-fill');
  const text = document.getElementById('qm-prog-text');
  const pctEl = document.getElementById('qm-prog-pct');
  if (!fill) return;

  fill.style.width = pct + '%';
  fill.style.background = pct >= 100 ? '#38a169' : pct >= 50 ? '#1a56db' : '#e53e3e';
  if (text) text.textContent = checked + ' / ' + total;
  if (pctEl) pctEl.textContent = pct + '%';
}

function qmResetBed() {
  if (!confirm(`${qmCurrentBed}번 침상 체크를 초기화할까요?`)) return;
  qmClearChecklist();
  if (qmCurrentBed) localStorage.removeItem(qmGetStorageKey(qmCurrentBed));
  saveBtnReset('qm-saveBtn');
  saveBtnReset('qm-save-btn');
  qmUpdateProgress();
}

function qmSaveData() {
  if (!qmCurrentBed) return;
  qmAutoSave();
  const date   = qmGetDateKey();
  const shift  = document.getElementById('qm-shift')?.value || '';
  const worker = document.getElementById('qm-worker')?.value || '미입력';
  const notes  = document.getElementById('qm-handover-notes')?.value || '';

  // 시트 열 수를 유지하려면 모든 체크박스를 훑되,
  // 이번 근무에 해당 없는 항목(N 근무 전용)은 'N/A' 로 보내 준수율에서 빠지게 함
  const night = qmIsNight();
  const all = document.querySelectorAll('#qm-panel-checklist input[type=checkbox]');
  let total = 0, checked = 0;
  const cbStates = [];
  all.forEach(cb => {
    if (!night && cb.closest('.qm-night-only')) { cbStates.push('N/A'); return; }
    total++;
    if (cb.checked) checked++;
    cbStates.push(cb.checked ? '✓' : '—');
  });
  const pct = total > 0 ? Math.round(checked / total * 100) : 0;

  // 저장 즉시 버튼을 잠금 (전송 응답을 기다리지 않음 – 이 화면은 곧 침상 목록으로 바뀜)
  saveBtnDone('qm-saveBtn');
  saveBtnDone('qm-save-btn', '✅');
  alert(`✅ 저장 완료\n\n📅 ${date}  근무: ${shift}\n🛏 ${qmCurrentBed}번 침상\n👤 ${worker}\n📊 ${checked}/${total} (${pct}%)`);

  // Google Sheets 전송
  // 열 순서는 시트 헤더와 동일해야 함
  // 저장일시 / 날짜 / 근무 / 근무자 / 책임간호사 / 침상번호 / 완료 / 전체 / 달성률 / 인계메모 / 체크22개
  // ※ 인계메모는 GAS 가 맨 뒤로 옮겨줍니다 (fixQmOrder_)
  const row = [
    new Date().toLocaleString('ko-KR'), date, shift,
    worker, '', qmCurrentBed + '번',
    checked, total, pct + '%',
    notes,
    cbStates.join('\t'),
  ];
  fetch(SQR_SHEET_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ sheetName: 'QM체크리스트', rows: [row] }),
  }).catch(() => {});

  setTimeout(qmShowBedPanel, 600);   // '저장 완료'를 잠깐 보여준 뒤 침상 목록으로
}

// ===== SICU 업무메뉴얼 =====
function toggleSicuChapter(id) {
  const card = document.getElementById(id);
  if (!card) return;
  card.classList.toggle('open');
}

// ===== 퇴원 도우미 (사망 퇴원 / 전원·퇴원 체크리스트) =====
// 출처: 보라매병원 「전원, 퇴원, 사망 체크리스트」 (26.06)

const DC_LISTS = {
  death: {
    label: '사망 퇴원',
    sections: [
      {
        title: '담당간호사 할일', icon: '🕊', color: '#4a5568',
        items: [
          '사망 전 보호자 도착 가능한 시간 확인',
          '보호자 임종면회 조정',
          '사망 선언 — 선언한 시간과 일치하여 메모와 간호기록 남기기',
          '사망 선언시간 EKG Strip 출력 → 심전도 결과 라벨 부착 후 스캔 내리기',
          '정규약 조제유보 또는 D/C 오더 받기',
          '사용한 마약, 투석액, 냉장약 포함 비품약 전부 오더 받기',
          "환자약(고위험약 / 냉장약 / 약칸 / 반납약칸) '사망 환자 반납' 리스트 작성 & 반납",
          '마약 반납',
          '처치수가 (심사마감 전 완료)',
          '식이 금식 발행',
          '환자분류 (입퇴실 관리 항목 → 사망환자 간호 클릭)',
          '퇴원 간호 기록지 (사망 클릭)',
          'POLST 서류 작성 완료 확인 · 연명의료실에 서류 내려갔는지 확인 (주말 제외)',
          '각종 line · tube 제거 및 사후처치 (IV route, A-line, Foley, L-tube 제거 / C-line·도관은 인턴 통해 제거 후 필요시 Suture)',
          '현위치 이동 (사망 클릭)',
          '아파치',
        ],
      },
      {
        title: '필수 오더', icon: '💊', color: '#c53030',
        items: [
          '퇴원 지시 오더 (퇴원지시 · 정상퇴원 · 사망)',
          '사망 진단서',
        ],
      },
      {
        title: '사망 진단서 확인사항', icon: '📄', color: '#2b6cb0',
        items: [
          '사망 일시: 24시간제로 작성',
          '주소: 주민등록등본상 주소와 일치',
          '사망장소 주소: 보라매병원 (서울특별시 동작구 보라매로5길 20)',
          '사망원인: 반드시 한글로 작성',
          '사망의 종류: 외인사 또는 기타·불상의 경우 경찰에 신고 필요',
        ],
      },
      {
        title: '보호자 확인사항', icon: '👨‍👩‍👧', color: '#805ad5',
        items: [
          'HIS상 주소와 주민등록증 주소지 일치 여부 확인 (불일치 시 원무과 / 야간·주말은 응급원무에 변경 요청)',
          '이용할 장례식장 확인 — 보라매병원 장례식장 이용 원하는 경우 자리 있는지 장례식장에 확인',
          '사망 진단서 필요 부수 확인 (원본 1부, 사본 n부)',
          '심사 완료 후 원무과 수납 안내',
          '면회 재조정 및 환자 짐·귀중품 전달 (틀니 / 보청기 / Bone flap / 자가약 / 지갑 / 핸드폰)',
        ],
      },
    ],
  },
  transfer: {
    label: '전원 / 퇴원',
    sections: [
      {
        title: '전날 — 보호자 안내사항', icon: '📞', color: '#805ad5',
        items: [
          '환자 및 보호자 신분증, 가족관계증명서 지참',
          '환자 이송 2시간 전에 보호자 내원 안내',
          '예상 이송시간 앰뷸런스 예약',
          '필요한 서류 (진단서 / 소견서 / 영상자료 / 투석일지) 조사',
          '전원병원 환의 (퇴원인 경우 개인옷) 가져오도록 안내',
        ],
      },
      {
        title: '전날까지 할일', icon: '📆', color: '#2b6cb0',
        items: [
          '전원 날짜·시간 확정 (예: 6/23 3P)',
          '구급차 또는 이송차량 도착 시간 확정 (예: 6/23 2P30)',
          '이송 시 의료진 동반 필요 여부 주치의 확인',
          '퇴원약 오더 확인 (주사 시행처 [집으로])',
          '진단서 · 소견서: 의사에게 작성 요청',
          '영상자료: DVD · CD copy 오더 받기 [Image DVD/CD Copy]',
          '투석일지: 인공신실에 전화해 수령',
          '도관 삽입일 기록 — Foley(최근 삽입일) / Levin tube(최근 삽입일) / C-line·PICC ins(최근 삽입일) / T-can change(최근 변경일)',
          '홈벤트 유지하며 퇴원 시 홈벤트 회사 연락하기',
        ],
      },
      {
        title: '당일 — N 근무', icon: '🌙', color: '#4a5568',
        items: [
          '약 (마약 / 냉장 / 고위험약 / 반납약칸 / 약 수납장) 모두 확인 후 반납 내리기',
          '사용한 마약, 투석액, 냉장약 포함 비품약 전부 오더 받기',
          '퇴원 당일 정규약 조제유보',
          '퇴실 예정 시간 확인 후 퇴식끼니 발행',
        ],
      },
      {
        title: '당일 — D 근무', icon: '☀️', color: '#dd6b20',
        items: [
          '퇴원약 수령',
          '처치수가 (심사마감 전 완료)',
          '환자분류 / 아파치',
          '필요시 의무기록 복사 창구 안내',
          '퇴원간호기록지 출력하여 교육하기 (투약사항, 외래일정 및 검사, 주의사항 등)',
          '심사 완료 후 보호자 수납 안내 (퇴원간호기록지 지참)',
          '귀중품 인계 (틀니 / 보청기 / Bone flap / 치아 / 지갑 / 핸드폰 / 자가약)',
        ],
      },
      {
        title: '외래검사 예약', icon: '🏥', color: '#38a169',
        items: [
          '외래 예약 [재진예약] → [예약 날짜 클릭]',
          'CT / MRI 검사 예약 [검사예약관리] → 오더에 있는 검사 날짜로 클릭 (빈 슬롯이 없으면 검사실에 전화해서 예약)',
        ],
      },
    ],
  },
};

let dcCurrentType = 'death';

// ── 화면 진입 / 탭 ────────────────────────────────
function initDischarge() {
  dcSelectTab(dcCurrentType);
}

function dcSelectTab(type) {
  if (!DC_LISTS[type]) return;
  dcCurrentType = type;

  document.getElementById('dc-tab-death')?.classList.toggle('active', type === 'death');
  document.getElementById('dc-tab-transfer')?.classList.toggle('active', type === 'transfer');

  dcRenderList(type);
  dcUpdateProgress();

  const sc = document.querySelector('#screen-discharge .scroll-content');
  if (sc) sc.scrollTop = 0;
}

// ── 렌더 ────────────────────────────────────────
function dcRenderList(type) {
  const wrap = document.getElementById('dc-list');
  if (!wrap) return;
  wrap.innerHTML = DC_LISTS[type].sections.map((sec, si) => `
    <div class="qm-category">
      <div class="qm-cat-header" style="background:${sec.color};">${sec.icon} ${sec.title}</div>
      ${sec.items.map((text, ii) => `
        <div class="qm-check-item" onclick="dcToggle(this)">
          <input type="checkbox" class="qm-cb" data-dc-key="${si}-${ii}" onclick="event.stopPropagation()" onchange="dcOnCbChange(this)">
          <span class="qm-check-text">${text}</span>
        </div>`).join('')}
    </div>`).join('');
}

// ── 체크 동작 ────────────────────────────────────
function dcToggle(item) {
  const cb = item.querySelector('input[type=checkbox]');
  if (!cb) return;
  cb.checked = !cb.checked;
  dcOnCbChange(cb);
}

function dcOnCbChange(cb) {
  cb.closest('.qm-check-item')?.classList.toggle('qm-checked', cb.checked);
  const done = dcUpdateProgress();
  // 마지막 항목까지 체크된 순간에만 완료 안내
  if (done && cb.checked) setTimeout(() => alert('✅ 모든 업무가 완료되었습니다.'), 100);
}

// 전체 완료 여부를 반환
function dcUpdateProgress() {
  const all = document.querySelectorAll('#dc-list input[type=checkbox]');
  const total = all.length;
  let checked = 0;
  all.forEach(cb => { if (cb.checked) checked++; });
  const pct = total > 0 ? Math.round(checked / total * 100) : 0;

  const fill = document.getElementById('dc-prog-fill');
  if (fill) {
    fill.style.width = pct + '%';
    fill.style.background = pct >= 100 ? '#38a169' : pct >= 50 ? '#1a56db' : '#e53e3e';
  }
  const text  = document.getElementById('dc-prog-text');
  const pctEl = document.getElementById('dc-prog-pct');
  if (text)  text.textContent  = checked + ' / ' + total;
  if (pctEl) pctEl.textContent = pct + '%';

  return total > 0 && checked === total;
}
