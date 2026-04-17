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
  if (id === 'screen-drugcalc') {
    setTimeout(() => dc_goView('cat'), 0);
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
    { key: 'BILI', name: '담도계 질환 수술',   sub: '담낭절제술 / 담도 재건술' },
    { key: 'PANC', name: '췌장 질환 수술',     sub: '췌십이지장절제술 / 췌장절제술' },
  ]},
  NS: { label: '신경외과', icon: '🧠', ops: [
    { key: 'CRANI', name: 'Craniotomy',   sub: '개두술' },
    { key: 'VPS',   name: 'VP Shunt',    sub: '뇌실-복강 단락술' },
    { key: 'EVD',   name: 'EVD Insertion', sub: '뇌실 외 배액술' },
  ]},
  CS: { label: '흉부외과', icon: '🫀', ops: [
    { key: 'CABG', name: 'CABG',      sub: '관상동맥우회술' },
    { key: 'LOB',  name: 'Lobectomy', sub: '폐엽절제술' },
  ]},
  OS: { label: '정형외과', icon: '🦴', ops: [
    { key: 'TKR',  name: 'TKR / THR', sub: '인공슬관절/고관절 치환술' },
    { key: 'ORIF', name: 'ORIF',      sub: '골절 내고정술' },
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
        { t: 'V/S·SpO₂·체온 이송 직후 즉시 측정 → 이후 q1h', d: '수축기 BP <90, 맥박 >120, 체온 >38.5°C 기준 즉시 보고' },
        { t: '의식 수준 사정 (AVPU 또는 GCS)', d: '마취 회복 여부 확인 → 각성 지연 시 즉시 보고' },
        { t: '통증 사정 (NRS / CPOT)', d: 'PCA 사용 중이면 설정값·사용 횟수 확인' },
        { t: '체온 유지 확인 → 목표 36.5°C 이상', d: '저체온 보온 담요 적용, 수술 후 떨림 유의' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-blue', title: '복부 및 상처 사정', items: [
        { t: '복부 드레싱 삼출 성상·색·양 확인 및 기록', d: '혈성·담즙색 삼출 증가 시 즉시 보고' },
        { t: '장음 청진 4사분면', d: '수술 후 24~48h 장음 소실 정상 → 48h 이후 미회복 시 보고' },
        { t: '복부 압통·강직·복부 팽만 여부 사정', d: '문합부 누출 시 복막 자극 증상(복통 심화·발열·빈맥) 조기 발현' },
        { t: '오심·구토 사정 → 항구토제 처방 확인', d: '구토 시 흡인 예방 체위(반좌위) 유지' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-green', title: '배액관 및 라인 관리', items: [
        { t: 'JP drain 위치·고정·배액 성상 확인', d: '초기 혈성 → 장액혈성 정상 / 장내용물 양상·담즙색 즉시 보고' },
        { t: 'L-tube(비위관) 개통성·고정·배액량 시간별 기록', d: '배액 >200mL/h 또는 갑자기 없어진 경우 즉시 보고 / 커피찌꺼기 양상 = 출혈 의심' },
        { t: 'CV line 또는 말초 정맥 라인 확인', d: 'TPN 처방 확인 → 경구 섭취 불가 기간 지속 투여' },
        { t: 'Foley catheter 소변량 q1h 측정', d: '목표 ≥0.5mL/kg/h → 감소 시 수액 처치 등 주치의 연락' },
      ]},
      { id: 's4', icon: '4', cls: 'sec-amber', title: '합병증 모니터링', items: [
        { t: '문합부 누출 징후 모니터 (고위험: 수술 후 3~7일)', d: '발열 >38°C + 복통 심화 + 배액 변화 + 빈맥 → 즉시 보고' },
        { t: '위장관 출혈 징후: 활력징후 저하 + 배액 혈성 증가 + Hgb 감소', d: 'CBC 추세 확인 → 수혈 처방 여부 주치의 연락' },
        { t: '덤핑 증후군 징후 사정 (식이 재개 후)', d: '식후 30분 내: 빈맥·발한·어지러움·복통 (조기 덤핑) / 식후 1~3h: 저혈당 증상 (후기 덤핑)' },
        { t: '폐합병증 (무기폐·폐렴) 모니터', d: '호흡음 청진, 심호흡·기침 격려, SpO₂ 지속 모니터' },
        { t: '위마비(Gastric stasis): L-tube 배액 지속 과다 + 오심 지속', d: '위 운동 촉진제 처방 확인' },
      ]},
      { id: 's5', icon: '!', cls: 'sec-red', title: '주의사항 (Critical Points)', critical: true, items: [
        { t: 'L-tube 절대 임의 제거·클램프 금지', d: '위-공장 문합부 감압 역할 → 반드시 의사 확인 후 조절' },
        { t: '경구 섭취 의사 처방 전 절대 금식(NPO) 유지', d: '문합부 누출 위험 → 처방 반드시 확인 후 식이 시작' },
        { t: '출혈 응급 기준: 수축기 BP <90 + 맥박 >120/분 + 배액 혈성 증가', d: '즉각 주치의 호출 및 응급 처치 준비' },
        { t: '위 전절제 환자: 비타민 B12 결핍 장기 모니터 교육', d: '내인성 인자(Intrinsic factor) 소실 → 정기적 근육주사 B12 보충 필요' },
        { t: '전신 마취 후 기도 분비물 관리 → 흡인 주의', d: 'SpO₂ <94% 또는 호흡수 증가 시 즉시 보고' },
      ]},
    ],
  },
  CRC: {
    dept: '일반외과', title: '대장 및 직장 수술 (대장·직장절제술)',
    focus: '문합부 누출, 장루(stoma) 관리, DVT 예방, 장 기능 회복',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '활력징후 및 기본 사정', items: [
        { t: 'V/S·SpO₂ 이송 직후 즉시 측정 → 이후 q1h', d: '수축기 BP <90, 맥박 >120, 체온 >38.5°C 기준 즉시 보고' },
        { t: '통증 사정 (NRS)', d: '경막외 마취(Epidural) 중이면 하지 감각·운동 상태 함께 확인' },
        { t: '체온 모니터 → 발열은 감염 또는 문합 누출 조기 징후', d: '수술 후 48h 내 발열은 무기폐 확인 먼저 시행' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-blue', title: '복부 및 상처 사정', items: [
        { t: '복부 드레싱·장음·압통·피막 사정', d: '장 기능 회복 기준: 장음 청취 + 가스 배출 + 배변' },
        { t: '문합 부위 압통·복부 강직 여부 확인', d: '복막 자극 증상 발생 시 즉시 보고 (문합 누출 의심)' },
        { t: '직장 수술 시 회음부 상처 확인 (APR)', d: '삼출물 성상·색·양 기록 → 혈성 삼출 증가 즉시 보고' },
        { t: '항문 분비물 확인 (Hartmann 술)', d: '직장 잔단 점액 분비 지속 가능 → 기록 유지' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-green', title: '배액관 및 라인 관리', items: [
        { t: '복강 배액관 성상·색 시간별 확인', d: '장내용물 양상(변색·냄새) = 즉시 문합 누출 의심 보고' },
        { t: 'Foley catheter 소변량 q1h 측정', d: '목표 ≥0.5mL/kg/h → 감소 시 주치의 연락' },
        { t: 'IV 라인·수액·항생제 처방 확인', d: 'TPN 처방 여부 확인 → 경장영양 시작 시기 의사 확인' },
      ]},
      { id: 's4', icon: '4', cls: 'sec-purple', title: '장루(Stoma) 초기 간호', items: [
        { t: 'Stoma 색깔·크기·점막 상태 q2~4h 관찰', d: '정상: 선홍~분홍색, 촉촉함 / 창백·암갈색·함몰 → 즉시 보고' },
        { t: 'Stoma bag 부착·피부 보호판 상태 확인', d: '누출 시 피부 손상 즉시 예방 → 즉시 교환' },
        { t: '장루 배액 성상 및 양 기록', d: '초기 혈성 점액 → 장액 → 정상 대변 순 회복 경과' },
        { t: '장루 교육 시작 시기 계획 확인', d: '의식 명료·활력징후 안정 후 환자 및 보호자 교육 시작' },
      ]},
      { id: 's5', icon: '5', cls: 'sec-amber', title: '합병증 모니터링', items: [
        { t: '문합부 누출 (고위험: 수술 후 3~7일)', d: '발열 >38°C + 복통 심화 + 배액 변화 + 빈맥 + CRP 상승 → 즉시 보고' },
        { t: 'Stoma 합병증: 함몰·괴사·과도 부종·탈출', d: 'Stoma necrosis or retraction → 응급 외과 처치 필요' },
        { t: 'DVT 예방 → 대장·직장 수술 고위험군', d: 'LMWH 처방 확인, 탄력 스타킹·SCD 착용, 조기 이상 격려' },
        { t: '폐합병증 → 심호흡·기침 격려, 조기 이상', d: '무기폐·폐렴 예방 → 인센티브 스파이로미터 사용' },
      ]},
      { id: 's6', icon: '!', cls: 'sec-red', title: '주의사항 (Critical Points)', critical: true, items: [
        { t: 'Stoma 색깔 변화(창백·암갈색)는 즉각 보고', d: '혈류 장애 → 수술적 처치 필요한 응급 상황' },
        { t: '문합 누출 고위험 기간(수술 후 3~7일) 집중 모니터', d: '발열 + 복통 + 배액 변화 동시 발생 시 즉시 보고' },
        { t: 'DVT·PE 예방 → 하지 발적·부종·종아리 통증 호소 시 보고', d: '항응고제 처방 누락 없이 투여 확인' },
        { t: '직장 수술(LAR) 시 배뇨 기능 확인', d: '자율신경 손상 → 요저류 가능 → Foley 제거 후 배뇨 여부 확인' },
      ]},
    ],
  },
  HEPA: {
    dept: '일반외과', title: '간 질환 수술 (간절제술)',
    focus: '간부전(PHLF), 수술 후 출혈, 담즙 누출, 저혈당',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '활력징후 및 기본 사정', items: [
        { t: 'V/S·SpO₂ q1h 모니터', d: '간문맥 혈류 재개 후 혈압 불안정 가능 → 처방 MAP 목표 확인' },
        { t: '의식 수준 사정 (GCS)', d: '간성 뇌증 조기 징후: 지남력 저하·불안·수면 패턴 변화' },
        { t: '통증 사정 (NRS)', d: 'NSAIDs 간독성 주의 → 아편유사제 또는 아세트아미노펜 저용량 처방 확인' },
        { t: '복부 피막·압통·팽만 사정', d: '수술 후 복강 내 출혈 및 담즙 누출 조기 감지' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-green', title: '배액관 및 출혈 모니터', items: [
        { t: '복강 배액관 성상·색 시간별 기록', d: '혈성 배액 >100mL/h 또는 지속 증가 → 즉시 보고' },
        { t: '담즙 배액관 (T-tube 또는 JP) 색·양 확인', d: '담즙 색 정상: 황금색 / 혈성·피막 → 즉시 보고' },
        { t: 'PT/INR·aPTT·혈소판 수치 확인', d: '간 절제 후 응고 인자 합성 저하 → 출혈 위험 증가' },
        { t: '수혈 처방 및 혈액제제 가용성 확인', d: 'FFP·혈소판·Cryoprecipitate 수혈 기준 의사 확인' },
        { t: 'Foley 소변량 q1h', d: '목표 ≥0.5mL/kg/h → 감소 시 즉시 보고 (간부전 조기 징후)' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-amber', title: '간기능 모니터링', items: [
        { t: '황달(Jaundice) 여부 → 공막·피부 색깔 관찰', d: '간절제 후 일시적 빌리루빈 상승 가능 → 수치 추세 모니터' },
        { t: '복수 발생 여부 → 복부 둘레 측정, 하지 부종 평가', d: '수일 내 급격한 복부 팽만 시 보고' },
        { t: '혈당 모니터 q4~6h', d: '간의 포도당신생합성 저하 → 저혈당 위험 → 혈당 <70mg/dL 즉시 보고' },
        { t: '간성 뇌증 징후: 지남력·행동 변화·손 떨림·수면 이상', d: '암모니아(NH3) 수치 추세 확인' },
        { t: 'LFT(AST·ALT·ALP·총빌리루빈) 추세 확인', d: '수술 후 일시적 상승 후 감소 정상 → 지속 상승 시 주의' },
      ]},
      { id: 's4', icon: '4', cls: 'sec-amber', title: '합병증 모니터링', items: [
        { t: '담즙 누출 (고위험: 수술 후 3~5일)', d: '발열 + 우상복부 통증 + 배액 담즙색 → 즉시 보고' },
        { t: '간절제 후 간부전 (PHLF): 빌리루빈 ↑ + PT 연장 + 뇌증 동반', d: '3가지 동시 발현 시 응급 → 즉각 보고' },
        { t: '복강 내 출혈: 활력징후 저하 + 배액 혈성 증가 + Hgb 감소', d: '즉각 주치의 호출 및 응급 처치 준비' },
        { t: '횡격막 자극 → 우측 어깨 통증 호소 가능', d: '담즙 누출 또는 출혈로 인한 횡격막 자극 징후' },
      ]},
      { id: 's5', icon: '!', cls: 'sec-red', title: '주의사항 (Critical Points)', critical: true, items: [
        { t: '진통제 간독성 약물 주의 → NSAIDs·고용량 아세트아미노펜 금기', d: '간절제 후 잔여 간 기능 감소 → 처방 용량 반드시 확인' },
        { t: 'PT 연장 시 모든 근육주사(IM) 금기', d: '출혈 위험 → 주치의 사전 확인 필수' },
        { t: '저혈당 (<70mg/dL) 즉시 보고 및 포도당 투여', d: '간의 당 합성 기능 저하 → 수술 후 저혈당 빈번' },
        { t: 'PHLF 조기 징후 3가지: 빌리루빈 ↑ + PT 연장 + 뇌증', d: '동시 발현 시 즉각 보고 → 치명적 합병증' },
      ]},
    ],
  },
  BILI: {
    dept: '일반외과', title: '담도계 질환 수술 (담낭·담도 수술)',
    focus: '담즙 누출, T-tube 관리, 담관염, 황달 해소 여부',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '활력징후 및 기본 사정', items: [
        { t: 'V/S·SpO₂·체온 이송 직후 즉시 측정 → 이후 q1h', d: '수축기 BP <90, 체온 >38.5°C 기준 즉시 보고' },
        { t: '의식 수준 및 통증 사정 (NRS)', d: 'PCA 처방 확인 → 우상복부 통증 강도 평가' },
        { t: '황달(Jaundice) 변화 여부 → 공막·피부·소변 색 관찰', d: '수술 전 황달 있던 환자: 술 후 빌리루빈 추세 모니터' },
        { t: '체온 모니터 → 담관염 재발 징후', d: '고열 + 우상복부 통증 + 황달(Charcot triad) → 즉시 보고' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-blue', title: '복부 및 상처 사정', items: [
        { t: '복부 드레싱·삼출·압통 사정', d: '우상복부 압통 지속 또는 심화 시 즉시 보고' },
        { t: '복부 팽만·장음 청진', d: '담낭 절제 후 장음 회복 일반적으로 빠름 → 24h 내 회복 기대' },
        { t: '오심·구토 사정 → 항구토제 처방 확인', d: '복강경 수술 후 CO₂ 잔류로 어깨 통증 가능 (정상 경과)' },
        { t: '피부 가려움증(소양증) 여부 확인', d: '담즙 정체에 의한 소양증 → 수술 후 황달 해소와 함께 호전' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-green', title: 'T-tube 및 배액관 관리', items: [
        { t: 'T-tube 위치·고정·개통성 확인', d: '담도 감압 역할 → 임의 clamp·제거 절대 금지' },
        { t: 'T-tube 배액 색·양·성상 시간별 기록', d: '정상: 황금~녹갈색 200~500mL/일 / 혈성·피막 증가 즉시 보고' },
        { t: 'T-tube 삽입 부위 드레싱 확인', d: '담즙 누출로 인한 피부 손상 예방 → 삼출 시 즉시 교환' },
        { t: 'JP drain (복강 배액관) 성상·색 확인', d: '담즙색 배액 증가 → 담즙 누출 의심 → 즉시 보고' },
        { t: 'Foley catheter 소변량 q1h', d: '목표 ≥0.5mL/kg/h → 소변 색깔(농차 노란색 = 탈수 또는 담즙)도 확인' },
      ]},
      { id: 's4', icon: '4', cls: 'sec-amber', title: '합병증 모니터링', items: [
        { t: '담즙 누출 (고위험: 수술 후 1~5일)', d: '발열 + 우상복부 통증 + 복강 배액 담즙색 증가 → 즉시 보고' },
        { t: '담관 협착/폐쇄 징후: 황달 재발·담즙 배액 감소', d: 'T-tube 배액 급감 또는 없어진 경우 즉시 보고' },
        { t: '담관염 재발: 고열 + 우상복부 통증 + 황달 (Charcot triad)', d: '항생제 처방 확인 → 즉각 보고' },
        { t: '출혈 징후: 활력징후 저하 + 배액 혈성 증가', d: 'Hgb 추세 확인 → 출혈 기준 즉시 보고' },
        { t: 'LFT·빌리루빈·ALP·GGT 추세 확인', d: '수술 후 점진적 감소 정상 → 증가 시 즉시 보고' },
      ]},
      { id: 's5', icon: '!', cls: 'sec-red', title: '주의사항 (Critical Points)', critical: true, items: [
        { t: 'T-tube 절대 임의 clamp·제거 금지', d: '담도 내압 상승 → 담즙 누출 또는 문합 파열 위험' },
        { t: 'T-tube 배액량 급감 시 즉각 보고', d: '관 막힘·꺾임·이탈 확인 → 처치 전 반드시 의사 확인' },
        { t: 'Charcot triad (고열+황달+우상복부 통증) = 담관염 응급', d: '즉각 보고 및 항생제 처방·혈액배양 준비' },
        { t: '담즙은 피부에 직접 접촉 시 자극성 피부염 유발', d: '배액관 주변 피부 보호 → 장벽크림 적용 고려' },
      ]},
    ],
  },
  PANC: {
    dept: '일반외과', title: '췌장 질환 수술 (췌장절제술)',
    focus: '췌장루(POPF), 지연성 위 배출(DGE), 출혈(PPH), 담즙 누출, 혈당 관리',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '활력징후 및 기본 사정', items: [
        { t: 'V/S q1h → 활력·맥박 추세 주의 깊게 관찰', d: '혈관 인접 대형 수술 → 출혈 조기 발견 최우선' },
        { t: '통증 사정 (NRS) 및 PCA 관리', d: '췌장 수술 후 통증 강도 높음 → 충분한 진통 보장' },
        { t: '혈당 q2~4h 모니터 (수술 후 48h 이내)', d: '췌장 기능 손실 → 고혈당 빈번 → 인슐린 처방 확인' },
        { t: '체온 모니터 → 발열은 POPF·담즙 누출·감염 조기 징후', d: '38.5°C 이상 지속 시 즉시 보고' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-blue', title: '복부 사정 및 배액관', items: [
        { t: '복강 배액관 #1·#2 성상·색 시간별 기록', d: '췌장 주위 + 담관 주위 각각 위치 확인 → 성상 변화 즉시 보고' },
        { t: '배액액 amylase 검사 처방 확인 (POD 3일)', d: '수술 후 3일째 amylase ≥3배 정상 상한치 → POPF 진단 기준' },
        { t: '담즙 배액관 색·양 확인 (있는 경우)', d: '담즙 정상: 황금색 200~300mL/일 / 혈성·피막 즉시 보고' },
        { t: 'L-tube 배액량·성상 및 개통성 확인', d: 'DGE 시 배액 과다 + 오심 지속 → 처방 없이 clamp 금지' },
        { t: 'Foley 소변량 q1h', d: '목표 ≥0.5mL/kg/h → 감소 시 즉시 보고' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-amber', title: '합병증 집중 모니터링', items: [
        { t: 'POPF (췌장루) 징후: 발열 + 복통 + 배액 amylase 상승', d: '수술 후 3~7일 고위험 → 치명적 합병증 → 즉시 보고' },
        { t: 'DGE (지연성 위 배출): L-tube 배액 과다 + 오심 + 식이 불내성', d: 'POD 3일 이후 위 기능 미회복 → 경장영양 계획 변경 필요' },
        { t: '수술 후 출혈 (PPH): 활력징후 저하 + 배액 혈성 급증', d: '초기(POD 0~24h) 또는 지연 출혈(POD 5~7일) 모두 주의' },
        { t: '담즙 누출: 담즙색 배액 + 발열 + 복통', d: '수술 후 1~5일 발생 가능 → 즉시 보고' },
        { t: '황달 여부 → 공막·피부 관찰', d: '담관 문합 협착 또는 담즙 누출 징후' },
      ]},
      { id: 's4', icon: '4', cls: 'sec-amber', title: '혈당 및 내분비 기능 관리', items: [
        { t: '혈당 q2~4h 모니터 → 목표 혈당 140~180mg/dL', d: '고혈당 >250mg/dL 지속 시 즉시 보고 → IV insulin 처방 확인' },
        { t: '저혈당 (<70mg/dL) 예방 → 인슐린 투여 시 주의', d: '총 췌장절제술: 내·외분비 기능 전 소실 → 혈당 변동 폭 큼' },
        { t: '인슐린 처방 확인 → Sliding scale 또는 IV infusion', d: '수술 전 당뇨 기왕력 확인 → 필요량 변화 주의' },
      ]},
      { id: 's5', icon: '!', cls: 'sec-red', title: '주의사항 (Critical Points)', critical: true, items: [
        { t: '췌장 수술 합병증 발생률 40~60% → 초기 24~72h 집중 관찰 필수', d: '다른 복부 수술 대비 월등히 높은 위험도 → 이상 소견 신속 보고' },
        { t: '배액관 성상 변화(혈성·담즙색·피막) 즉시 보고', d: '배액 성상 변화는 중증 합병증의 첫 징후일 수 있음' },
        { t: '혈당 250mg/dL 이상 지속 시 즉시 보고', d: '인슐린 sliding scale 또는 IV insulin 처방 확인' },
        { t: '경장영양 시작 시기 의사 확인 필수 → DGE 여부에 따라 결정', d: 'DGE 있는 경우 공장루 영양(jejunostomy feeding) 고려' },
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
      { id: 's1', icon: '1', cls: 'sec-blue', title: '호흡 집중 사정', items: [
        { t: '호흡수·SpO₂·호흡 양상 q1h 모니터', d: 'SpO₂ <92% 또는 호흡수 >30/분 즉시 보고' },
        { t: '호흡음 청진 → 양측 비교', d: '수술 측 호흡음 감소 정상 vs 반대측 무기폐 가별' },
        { t: '기계환기 중 → 설정값 확인', d: 'Protective ventilation: Vt 6mL/kg, PEEP 5~8 기본' },
        { t: '흉부 X-ray 결과 확인', d: '기흉·혈흉·종격동 편위 여부' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-green', title: '흉관 관리', items: [
        { t: '흉관 배액 성상·색 시간별 기록', d: '혈성 >150mL/h 지속 시 보고' },
        { t: '공기 누출(air leak) 집중 모니터', d: '수중 챔버 기포 → 흡기/호기 중 여부, 정기록' },
        { t: '흉관 꺾임·눌림·혈변 막힘 확인', d: '배액 감소 + 호흡 상태 저하 시 의심' },
        { t: '흉관 제거 기준 의사 확인', d: 'air leak 없음 + 배액 <100mL/일이 일반적 기준' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-amber', title: '합병증 모니터', items: [
        { t: '무기폐 예방 → 심호흡·incentive spirometer 2시간마다 격려', d: '' },
        { t: '기관지 문합부 누출: 갑작스런 피하기종·호흡 악화', d: '경부·흉부 이학적으로 피하기종 감지' },
        { t: '심방세동 모니터 → 흉부 수술 후 빈번', d: '부정맥 발생 시 즉시 보고, 항부정맥 여부 확인' },
      ]},
      { id: 's4', icon: '!', cls: 'sec-red', title: '주의사항', critical: true, items: [
        { t: '흉관 클램프 임의 사용 금지', d: '의사 처방 없이 흉관 클램프 → 긴장성 기흉 위험' },
        { t: '체위: 수술 측 하방 또는 반좌위 유지 기본 → 처방 확인', d: '건강한 측(non-op side) 하방 금지' },
        { t: '분비물 배출 적극 지지 → 흡인, 체위 변경, 기침 격려', d: '무기폐 예방 핵심' },
      ]},
    ],
  },
  TKR: {
    dept: '정형외과', title: 'TKR / THR (인공슬관절/고관절 치환술)',
    focus: '혈관·신경 손상, 구획증후군, DVT/PE, 탈구(THR)',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '활력징후 및 통증', items: [
        { t: 'V/S 및 통증 사정 (NRS) q2~4h', d: '척추마취 후 저혈압 가능 → 기립성 저혈압 모니터' },
        { t: '경막외 카테터 중이면 하지 감각·이동 확인', d: '과도한 이동 차단 = 용량 조절 필요, 보고' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-blue', title: '수술 부위 혈관·신경 사정 (5P)', items: [
        { t: 'Pain → 이동 시 수술 부위 이상 통증 여부', d: '' },
        { t: 'Pallor → 수술 측 피부색·창백 여부', d: '' },
        { t: 'Pulselessness → 족배동맥·슬와동맥·대퇴동맥 맥박 이학적', d: 'TKR: 족배동맥 / THR: 대퇴동맥' },
        { t: 'Paresthesia → 저림·감각 이상 여부', d: '비골신경(TKR) 또는 좌골신경(THR) 손상 가별' },
        { t: 'Paralysis → 발가락·발목 이동 가능 여부', d: '새로 마비 발생 즉시 보고' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-green', title: '배액관 및 출혈', items: [
        { t: 'Hemovac/JP drain 배액량·성상 기록', d: '과다 출혈: >200mL/h 혈성 배액 지속 시 보고' },
        { t: '드레싱 삼출물 → 시간 표시 후 확장 여부 모니터', d: '솜·붕대 착용 시 드레싱 상태 더욱 주의' },
        { t: 'Hgb 추세 확인', d: '수혈 기준 처방 확인 → TKA/THA 출혈은 500~1500mL 가능' },
      ]},
      { id: 's4', icon: '4', cls: 'sec-amber', title: 'DVT/PE 예방', items: [
        { t: 'SCD (순차적 압박 기구) 수술 측 제외 적용', d: '수술 다음날 부터 반대측 적용 가능 여부 확인' },
        { t: 'LMWH 처방 확인 및 첫 투여 시간 확인', d: '보통 수술 후 12~24h 시작' },
        { t: '하지 부종·종아리 압통·피부 온도 차이 모니터', d: 'DVT 징후 → 도플러 이상 처방 의사 연락' },
        { t: '갑작스런 흉통·호흡곤란·SpO₂ 저하 = PE 의심', d: '즉각 보고 → 응급 CT-PA 시행' },
      ]},
      { id: 's5', icon: '!', cls: 'sec-red', title: '주의사항 — THR 탈구 예방', critical: true, items: [
        { t: '고관절 탈구 예방 체위: 굴곡 <90°, 내전·내회전 금지', d: '베개 다리 사이 삽입' },
        { t: '변기·의자 낮은 곳으로 사용 → 수술 측 내전 주의', d: '' },
        { t: '구획증후군 6P 모니터: Pain·Pressure·Paralysis·Paresthesia·Pallor·Pulselessness', d: '' },
      ]},
    ],
  },
  ORIF: {
    dept: '정형외과', title: 'ORIF (골절 내고정술)',
    focus: '구획증후군, 신경·혈관 손상, 감염, 지방색전 증후군',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '활력징후 및 기본 사정', items: [
        { t: 'V/S 및 통증 사정', d: '이상하게 심한 통증 = 구획증후군 가장 조기 징후' },
        { t: '골절 부위 수술 측 신경·혈관 5P 사정', d: '정상 회복 여부 또는 수술 전 대비 악화 여부 비교' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-amber', title: '구획증후군 집중 모니터', items: [
        { t: '수술 후 첫 24~48h 구획 압박 고위험 구간', d: '특히 전완부·하퇴 골절 후 위험도 높음' },
        { t: '솜·붕대 조임 여부 → 손가락/발가락 상태 확인', d: '2초 내 혈류 회복 확인' },
        { t: '부위 부종 지속 여부 허벌 모니터 → 매 사정 시 기록', d: '' },
        { t: '통증 조절 불충분 + 부종 증가 = 즉각 보고', d: '구획 압력 측정 처방 의사 연락' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-green', title: '수술 부위 및 라인', items: [
        { t: '드레싱 삼출물 성상·색 기록', d: '혈성 삼출 과다 시 Hgb 확인 및 보고' },
        { t: '인공 삽입 장치 후 삽입 부위 감염 징후', d: '발적·삼출·이개 여부 기록' },
      ]},
      { id: 's4', icon: '!', cls: 'sec-red', title: '주의사항', critical: true, items: [
        { t: '지방색전 증후군 징후: 호흡곤란+점상출혈+의식저하', d: '대퇴골·골반 골절 후 12~72h 고위험 → 즉각 보고' },
        { t: '심한 통증 시 구획증후군 가별 먼저 → 진통제로 통증이 가려지면 진단 지연 위험', d: '' },
        { t: '감염 징후: 발열+수술 부위 이개+삼출 탁해짐 → 즉시 보고', d: '임플란트 감염 = 추가 수술 필요 가능' },
      ]},
    ],
  },
  CSEC: {
    dept: '산부인과', title: 'C-section (제왕절개)',
    focus: '수술 후 출혈(PPH), 자궁 수축, 혈전, 산후 회복',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '활력징후 및 기본 사정', items: [
        { t: 'V/S q15~30분 × 2시간 → 수술 후 q1h', d: '출혈에 의한 혈압 저하·빈맥 조기 감지' },
        { t: '의식 수준 및 통증 사정', d: '척추마취 후 적절 가려짐·오심 → 항히스타민 처방 확인' },
        { t: '하지 감각·이동 회복 모니터', d: '척추마취 회복 → 하지 감각 이전 회복 전 낙상 주의' },
      ]},
      { id: 's2', icon: '2', cls: 'sec-blue', title: '산부인과 특이 사정', items: [
        { t: '자궁저부 위치·경도 확인 (q30분~1h)', d: '부드럽고 이완된 자궁 = 이완성 출혈 위험 → 자궁 마사지' },
        { t: '오로 성상·색 확인 → 패드 무게 또는 감소', d: '저하 또는 오로 직접 시 즉각 보고 → PPH 기준: 500mL↑' },
        { t: '수술 부위 드레싱 확인', d: '삼출물·혈성 증가·내합 이개 여부' },
        { t: 'Foley 소변량 확인', d: '수술 후 최소 12~24h 유지 → 소변 색·정기록' },
      ]},
      { id: 's3', icon: '3', cls: 'sec-amber', title: '합병증 모니터', items: [
        { t: '수술 후 과다 출혈(PPH) 집중 모니터', d: 'Oxytocin 처방 확인 → 자궁 수축 약물 효과 평가' },
        { t: '혈전 증상 예방 → 산모는 고위험군', d: 'LMWH·압박스타킹 처방 확인 → 조기 보행 격려' },
        { t: '혈압 모니터 → 임신성 고혈압 수술 후 72h까지 지속 가능', d: '항고혈압제 처방 확인' },
      ]},
      { id: 's4', icon: '4', cls: 'sec-purple', title: '산모 케어', items: [
        { t: '수유 계획 확인 → 모유 수유 지지', d: '수술 후 조기 수유 격려 → 장시간 전 분비 → 자궁 수축 도움' },
        { t: '산후 통증 조절 → 수유 중 약물 안전성 확인', d: '모유 수유 중 NSAIDs 단기 사용 일반적으로 안전' },
        { t: '정서적 지지 → 수술 분만 스트레스 주의', d: 'Edinburgh Postnatal Depression Scale 사용 시 시행' },
      ]},
      { id: 's5', icon: '!', cls: 'sec-red', title: '주의사항', critical: true, items: [
        { t: '자궁 이완 → 즉각 자궁저부 마사지 + 보고 + Oxytocin 처방 확인', d: 'PPH는 산모 사망 주요 원인' },
        { t: '오로 또는 출혈 기준: 패드 수술 전 채워 1시간 이내 → 즉각 보고', d: '' },
        { t: '하지 감각 미회복 중 낙상 예방 교육 → Side rail 올리기, 보호자 상주', d: '' },
      ]},
    ],
  },
  TAH: {
    dept: '산부인과', title: 'TAH (전자궁절제술)',
    focus: '방광·요관 손상, 출혈, 수술 후 배뇨 기능, 정서적 지지',
    sections: [
      { id: 's1', icon: '1', cls: 'sec-blue', title: '활력징후 및 기본 사정', items: [
        { t: 'V/S q1h 모니터', d: '' },
        { t: '통증 사정 → PCA 설정 확인', d: '자궁절제 후 통증 중등도 → 충분한 진통 보장' },
        { t: '하지 부종·종아리 압통 → DVT 모니터', d: '부인과 수술 후 DVT 고위험군' },
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
      { id: 's4', icon: '4', cls: 'sec-purple', title: '정서적 지지', items: [
        { t: '자궁 상실에 대한 심리적 반응 사정', d: '슬픔·상실감·우울 반응 → 경청 및 공감 제공' },
        { t: '폐경 증상 교육 (난소도 제거 시에 한함)', d: '수면 장조·안면 홍조·기분 변화 → 호르몬 치료 처방 확인' },
        { t: '성생활 재개 시기 교육 → 대부분 6~8주 후, 의사 확인', d: '' },
      ]},
      { id: 's5', icon: '!', cls: 'sec-red', title: '주의사항', critical: true, items: [
        { t: '혈뇨 발생 즉시 보고 → 방광·요관 손상 가능 (TAH 비뇨기계 인접 수술)', d: '' },
        { t: 'DVT/PE 예방 → LMWH·SCD 처방 확인, 조기 보행 격려', d: '' },
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
    <div class="proto-focus-box">
      <span class="proto-focus-label">핵심</span>
      <span class="proto-focus-text">${p.focus}</span>
    </div>
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
  { screen: 'screen-codeblue',   icon: '🚨', label: 'Code Blue' },
  { screen: 'screen-ventilator', icon: '🫁', label: 'Ventilator 가이드' },
  { screen: 'screen-drugcalc',   icon: '🧮', label: '약물 계산기' },
  { screen: 'screen-abga',       icon: '🩸', label: 'ABGA 해석기' },
  { screen: 'screen-handover',   icon: '📋', label: 'SBAR 인계' },
  { screen: 'screen-protocol',   icon: '🚨', label: '프로토콜' },
  { screen: 'screen-drug-detail',icon: '💊', label: 'Norepinephrine' },
  { screen: 'screen-checklist',  icon: '✅', label: '체크리스트' },
  { screen: 'screen-initial-assessment', icon: '📋', label: '초기 사정 메뉴얼' },
  { screen: 'screen-disease-summary',    icon: '🏥', label: '질환별 핵심 요약' },
  { screen: 'screen-equipment',  icon: '🖥️', label: '장비 가이드' },
  { screen: 'screen-drugguide',  icon: '💊', label: '약물 가이드' },
  { screen: 'screen-sicu-quick-rounding', icon: '🩺', label: 'SICU 퀵라운딩' },
  { screen: 'screen-cn-rounding',         icon: '📋', label: 'CN 라운딩 시트' },
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
  document.querySelectorAll('[id^="bm-"]').forEach(btn => {
    const screenId = btn.id.replace('bm-', '');
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

function initFoleyMonitoring() {
  const dateEl = document.getElementById('foleySheetDate');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
}

function foleyOnDateChange() {
  // 날짜 바뀌면 현재 선택된 교대 데이터 다시 로드
  if (foleyCurrentShift) {
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
  foleyBuildShiftSection(shift);
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

  const timeRows = shift.times.map((time, ti) => {
    const cells = Array.from({length: FOLEY_BEDS}, (_, i) =>
      `<td style="border:1px solid #ddd; text-align:center; padding:4px 2px; background:#f9f9f9;" data-time-cell data-bed="${i+1}">
        <input type="checkbox" data-row="time${ti}" data-bed="${i+1}"
          style="width:16px; height:16px; accent-color:${shift.color}; cursor:pointer; opacity:0.3;"
          disabled
          onchange="foleyAutoSave()">
      </td>`
    ).join('');
    return `<tr>
      <td style="border:1px solid #ddd; padding:5px 8px; font-size:12px; font-weight:600; background:#f5f5f5; white-space:nowrap; text-align:center;">${time}</td>
      ${cells}
    </tr>`;
  }).join('');

  container.innerHTML = `
    <!-- 교대 헤더 -->
    <div style="display:flex; align-items:center; padding:8px 14px; background:${shift.color}; border-radius:10px 10px 0 0; margin-bottom:0;">
      <span style="font-size:22px; font-weight:900; color:#fff; margin-right:10px;">${shift.label}</span>
      <span style="font-size:12px; color:rgba(255,255,255,0.92); font-weight:600;">${shift.name}</span>
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
      <button onclick="foleySave()"
        style="flex:2; padding:12px; background:${shift.color}; color:#fff; border:none; border-radius:10px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit;">
        💾 저장
      </button>
    </div>
  `;
}

function foleyCheckBedActivation(bed) {
  const presentCb = document.querySelector(`input[data-row="present"][data-bed="${bed}"]`);
  const looseCb   = document.querySelector(`input[data-row="loose"][data-bed="${bed}"]`);
  const active = presentCb?.checked && looseCb?.checked;
  document.querySelectorAll(`input[data-row^="time"][data-bed="${bed}"]`).forEach(cb => {
    cb.disabled = !active;
    cb.style.opacity = active ? '1' : '0.3';
    cb.style.cursor  = active ? 'pointer' : 'not-allowed';
    if (!active) cb.checked = false;
    const td = cb.closest('td');
    if (td) td.style.background = active ? '' : '#f9f9f9';
  });
}

function foleyAutoSave() {
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

  // 3단계: time 체크박스 복원 (활성화된 침상만 실제로 반영됨)
  document.querySelectorAll('#foley-sections input[type=checkbox]').forEach(cb => {
    if (cb.dataset.row && cb.dataset.row.startsWith('time')) {
      const id = `${cb.dataset.row}_${cb.dataset.bed}`;
      if (data.checks[id] !== undefined && !cb.disabled) cb.checked = data.checks[id];
    }
  });
}

function foleyRestoreConfirmer() {
  if (!foleyCurrentShift) return;
  const key = foleyGetStorageKey(foleyCurrentShift);
  const raw = localStorage.getItem(key);
  if (!raw) return;
  const data = JSON.parse(raw);
  const el = document.getElementById('foley-confirmer');
  if (el && data.confirmer) el.value = data.confirmer;
}

function foleySave() {
  const confirmer = document.getElementById('foley-confirmer')?.value.trim();
  if (!confirmer) {
    alert('확인자 이름을 입력해주세요.');
    document.getElementById('foley-confirmer')?.focus();
    return;
  }
  foleyAutoSave();
  const shift = FOLEY_SHIFTS.find(s => s.key === foleyCurrentShift);
  const date = foleyGetDateKey();
  const allCbs = document.querySelectorAll('#foley-sections input[type=checkbox]');
  const total = allCbs.length;
  let checked = 0;
  allCbs.forEach(cb => { if (cb.checked) checked++; });
  alert(`✅ 저장 완료\n\n📅 날짜: ${date}\n근무: ${shift.label} (${shift.name})\n👤 확인자: ${confirmer}\n📊 체크: ${checked}/${total}`);
}

function foleyResetShift() {
  if (!confirm('현재 교대 체크를 모두 초기화할까요?')) return;
  document.querySelectorAll('#foley-sections input[type=checkbox]').forEach(cb => cb.checked = false);
  if (foleyCurrentShift) localStorage.removeItem(foleyGetStorageKey(foleyCurrentShift));
}

function foleyPrint() {
  if (!foleyCurrentShift) { alert('근무를 먼저 선택하세요.'); return; }
  const date = foleyGetDateKey();
  const confirmer = document.getElementById('foley-confirmer')?.value || '';
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
  <span>시행일: ${date} | 근무: ${shift.label} | 확인자: ${confirmer}</span>
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
        const checks = Object.values(data.checks || {});
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
  qmCurrentBed = bed;
  qmShowChecklistPanel(bed);
  qmClearChecklist();
  qmLoadBedData(bed);
  qmUpdateProgress();
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

function qmToggle(item) {
  const cb = item.querySelector('input[type=checkbox]');
  if (!cb) return;
  cb.checked = !cb.checked;
  item.classList.toggle('qm-checked', cb.checked);
  qmUpdateProgress();
  qmAutoSave();
}

function qmUpdateProgress() {
  const all = document.querySelectorAll('#qm-panel-checklist input[type=checkbox]');
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
  qmUpdateProgress();
}

function qmSaveData() {
  if (!qmCurrentBed) return;
  qmAutoSave();
  const date = qmGetDateKey();
  const shift = document.getElementById('qm-shift')?.value || '';
  const worker = document.getElementById('qm-worker')?.value || '미입력';
  const charge = document.getElementById('qm-charge-nurse')?.value || '미입력';

  const all = document.querySelectorAll('#qm-panel-checklist input[type=checkbox]');
  const total = all.length;
  let checked = 0;
  all.forEach(cb => { if (cb.checked) checked++; });
  const pct = Math.round(checked / total * 100);

  alert(`✅ 저장 완료\n\n📅 ${date}  근무: ${shift}\n🛏 ${qmCurrentBed}번 침상\n👤 ${worker}  책임: ${charge}\n📊 ${checked}/${total} (${pct}%)`);
  qmShowBedPanel();
}

// ===== SICU 업무메뉴얼 =====
function toggleSicuChapter(id) {
  const card = document.getElementById(id);
  if (!card) return;
  card.classList.toggle('open');
}
