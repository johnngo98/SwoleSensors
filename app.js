// SwoleSensors Dashboard With Upload Button Woohoo

let currentChart = null;
let currentSetsPerLift = {};

const dataCache      = {};
const unlockedEntries = new Set();

const PEOPLE = ['Jesse', 'John', 'Tyrus'];
const WEEKS  = ['1', '2'];

// Uploaded Data Check
const LOCKED_ENTRIES = [
    {
        filenameMatch : 'UploadExample_John_BenchWeek2',
        person        : 'John',
        week          : '2',
        lift          : 'bench',
        set           : '1',
        message       : 'Your Bench for Week 2 Set 1 had a lower peak velocity compared to last week — consider decreasing the weight to prevent fatigue. Your later reps for Bench Set 1 in Week 2 maintained a consistent velocity throughout the set.'
    },
    {
        filenameMatch : 'UploadExample2_Tyrus_OHPWeek2_Set3',
        person        : 'Tyrus',
        week          : '2',
        lift          : 'Overhead Press',
        set           : '3',
        message       : 'Congrats! You had a better set than your previous set! Consider maintaining or increasing weight to improve stimulus.'
    }
];

// Measurements from dataset
const MEASUREMENTS = [
    { value: 'vertical_accel',        label: 'Vertical Acceleration' },
    { value: 'vertical_accel_medium', label: 'Vertical Acceleration (Medium Smoothing)' },
    { value: 'vertical_accel_light',  label: 'Vertical Acceleration (Light Smoothing)' },
    { value: 'velocity_y',            label: 'Vertical Velocity' }
];

const Y_AXIS_LABELS = {
    'vertical_accel'        : 'Acceleration (m/s²)',
    'vertical_accel_medium' : 'Acceleration (m/s²)',
    'vertical_accel_light'  : 'Acceleration (m/s²)',
    'velocity_y'            : 'Velocity (m/s)'
};

function buildCsvUrl(person, week) {
    return `./data/${person}_week${week}.csv`;
}

// Schema formatting for consistency Tyrus vs Jesse and John Formatting (Different labels from the applications)
function detectSchema(rows) {
    if (!rows || rows.length === 0) return 'jesse_john';
    return Object.keys(rows[0]).includes('ay') ? 'tyrus' : 'jesse_john';
}

function getMeasurementField(schema, measurement) {
    const maps = {
        tyrus: {
            vertical_accel        : 'ay',
            vertical_accel_medium : 'ay_smooth_medium',
            vertical_accel_light  : 'ay_smooth_light',
            velocity_y            : 'velocity_y'
        },
        jesse_john: {
            vertical_accel        : 'y_Accelerometer',
            vertical_accel_medium : 'y_Accelerometer_smooth_medium',
            vertical_accel_light  : 'y_Accelerometer_smooth_light',
            velocity_y            : 'velocity_y'
        }
    };
    return maps[schema]?.[measurement] ?? 'velocity_y';
}

function getTimeField(schema) {
    return schema === 'tyrus' ? 'time' : 'seconds_elapsed_Accelerometer';
}

// Hide dataset
function isRowLocked(person, week, liftVal, setVal) {
    return LOCKED_ENTRIES.some(entry =>
        entry.person === person &&
        entry.week   === week   &&
        entry.lift   === String(liftVal).trim() &&
        entry.set    === String(setVal ).trim() &&
        !unlockedEntries.has(entry.filenameMatch)
    );
}

// Load
window.onload = function () {
    fillSelect('userSelect',        PEOPLE,                  v => v);
    fillSelect('weekSelect',        WEEKS,                   v => `Week ${v}`);
    fillSelect('measurementSelect', MEASUREMENTS.map(m => m.value),
               v => MEASUREMENTS.find(m => m.value === v)?.label || v);

    // Hide feedback when user manually switches person or week
    document.getElementById('userSelect')       .addEventListener('change', () => { hideInsight(); onPersonOrWeekChange(); });
    document.getElementById('weekSelect')       .addEventListener('change', () => { hideInsight(); onPersonOrWeekChange(); });
    document.getElementById('workoutSelect')    .addEventListener('change', onWorkoutChange);
    document.getElementById('setSelect')        .addEventListener('change', onLiftOrSetChange);
    document.getElementById('measurementSelect').addEventListener('change', onLiftOrSetChange);
    document.getElementById('loadDataBtn')      .addEventListener('click',  onLiftOrSetChange);
    document.getElementById('uploadInput')      .addEventListener('change', onFileUpload);

    onPersonOrWeekChange();
};

// Person and Week Selections
async function onPersonOrWeekChange() {
    const person   = document.getElementById('userSelect').value;
    const week     = document.getElementById('weekSelect').value;
    const cacheKey = `${person}-${week}`;

    hideError();

    if (dataCache[cacheKey]) {
        populateLiftAndSetDropdowns(dataCache[cacheKey], person, week);
        onLiftOrSetChange();
        return;
    }

    const btn             = document.getElementById('loadDataBtn');
    const originalBtnHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Loading…';
    btn.disabled  = true;
    setDropdownsLoading(true);

    try {
        const url      = buildCsvUrl(person, week);
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} — file not found at ${url}`);
        }

        const rawText = await response.text();

        if (rawText.length < 200 || (!rawText.includes('lift') && !rawText.includes('Lift'))) {
            throw new Error(`File at ${url} appears empty or is not a valid CSV.`);
        }

        const parsed = Papa.parse(rawText, {
            header        : true,
            dynamicTyping : false,
            skipEmptyLines: true
        }).data;

        if (parsed.length === 0) throw new Error(`Parsed 0 rows from ${url}.`);

        dataCache[cacheKey] = parsed;
        console.log(`Cached ${parsed.length} rows for ${cacheKey}`);

        populateLiftAndSetDropdowns(parsed, person, week);
        onLiftOrSetChange();

    } catch (err) {
        console.error('Data load error:', err);
        showError(err.message);
        if (currentChart) { currentChart.destroy(); currentChart = null; }
    } finally {
        btn.innerHTML = originalBtnHTML;
        btn.disabled  = false;
        setDropdownsLoading(false);
    }
}

// Lift Filter
function onWorkoutChange() {
    updateSetDropdown();
    onLiftOrSetChange();
}

// // Lift + Set + Measurement FIlter
function onLiftOrSetChange() {
    const person      = document.getElementById('userSelect').value;
    const week        = document.getElementById('weekSelect').value;
    const lift        = document.getElementById('workoutSelect').value;
    const set         = document.getElementById('setSelect').value;
    const measurement = document.getElementById('measurementSelect').value;

    hideError();

    const cacheKey = `${person}-${week}`;
    const rows     = dataCache[cacheKey];

    if (!rows) {
        showError('Data not loaded. Select a user and week first.');
        return;
    }

    const schema    = detectSchema(rows);
    const chartData = filterAndProcess(rows, lift, set, measurement, schema, person, week);

    if (chartData && chartData.length > 0) {
        const liftEl  = document.getElementById('workoutSelect');
        const measEl  = document.getElementById('measurementSelect');
        const liftLbl = liftEl.options[liftEl.selectedIndex]?.text || lift;
        const measLbl = measEl.options[measEl.selectedIndex]?.text || measurement;
        const title   = `${person} — Week ${week}: ${liftLbl} (Set ${set}) | ${measLbl}`;
        renderWorkoutGraph(chartData, title, measurement);
    } else {
        showError(`No data for ${person} → Week ${week} → ${lift} → Set ${set}.`);
        if (currentChart) { currentChart.destroy(); currentChart = null; }
    }
}

// Uploading show the data
async function onFileUpload(e) {
    const file = e.target.files[0];
    e.target.value = ''; // reset so same file can be re-uploaded
    if (!file) return;

    const filename = file.name.replace(/\.csv$/i, '');
    const entry    = LOCKED_ENTRIES.find(en => en.filenameMatch === filename);

    if (!entry) {
        showError(`Unrecognized file: "${file.name}". Please upload a valid SwoleSensors session file.`);
        return;
    }

    // Data get's shown
    unlockedEntries.add(entry.filenameMatch);

    // Go and show that new uploaded data
    document.getElementById('userSelect').value = entry.person;
    document.getElementById('weekSelect').value = entry.week;

    // Load it
    await onPersonOrWeekChange();

    // Select the new uploaded data
    const workoutEl = document.getElementById('workoutSelect');
    const setEl     = document.getElementById('setSelect');

    for (let i = 0; i < workoutEl.options.length; i++) {
        if (workoutEl.options[i].value === entry.lift) {
            workoutEl.selectedIndex = i;
            break;
        }
    }
    updateSetDropdown(); // refresh sets for the selected lift

    for (let i = 0; i < setEl.options.length; i++) {
        if (setEl.options[i].value === entry.set) {
            setEl.selectedIndex = i;
            break;
        }
    }

    onLiftOrSetChange();

    // Feedback system — shown last so nothing overwrites it
    showInsight(entry.message);
}

//Dropdown
const LIFT_LABELS = {
    'Bench'         : 'Bench Press',
    'bench'         : 'Bench Press',
    'Squat'         : 'Squat',
    'squat'         : 'Squat',
    'Deadlift'      : 'Deadlift',
    'Deadlift1'     : 'Deadlift 1',
    'Deadlift2'     : 'Deadlift 2',
    'Overhead'      : 'Overhead Press',
    'overhead'      : 'Overhead Press',
    'Overhead Press': 'Overhead Press',
    'OHP'           : 'Overhead Press'
};

function populateLiftAndSetDropdowns(rows, person, week) {
    const lifts      = new Set();
    const setsPerLift = {};

    rows.forEach(r => {
        const liftVal = String(r.lift || '').trim();
        const setVal  = String(r.set  || '').trim();
        if (!liftVal || !setVal) return;
        if (isRowLocked(person, week, liftVal, setVal)) return;
        lifts.add(liftVal);
        if (!setsPerLift[liftVal]) setsPerLift[liftVal] = new Set();
        setsPerLift[liftVal].add(setVal);
    });

    currentSetsPerLift = setsPerLift;

    const prevLift = document.getElementById('workoutSelect').value;
    const liftArr  = [...lifts].sort();
    fillSelect('workoutSelect', liftArr, v => LIFT_LABELS[v] || v);

    if (liftArr.includes(prevLift)) {
        document.getElementById('workoutSelect').value = prevLift;
    }

    updateSetDropdown();
}

function updateSetDropdown() {
    const selectedLift = document.getElementById('workoutSelect').value;
    const sets         = currentSetsPerLift[selectedLift] || new Set();
    const prevSet      = document.getElementById('setSelect').value;
    const setArr       = [...sets].sort((a, b) => +a - +b);

    fillSelect('setSelect', setArr, v => `Set ${v}`);

    if (setArr.includes(prevSet)) {
        document.getElementById('setSelect').value = prevSet;
    }
}

function fillSelect(id, values, labelFn) {
    const el   = document.getElementById(id);
    const prev = el.value;
    el.innerHTML = '';

    values.forEach(val => {
        const opt       = document.createElement('option');
        opt.value       = val;
        opt.textContent = labelFn(val);
        el.appendChild(opt);
    });

    if (values.includes(prev)) el.value = prev;
}

function setDropdownsLoading(loading) {
    ['workoutSelect', 'setSelect'].forEach(id => {
        const el = document.getElementById(id);
        if (loading) {
            el.innerHTML = '<option value="">Loading…</option>';
            el.disabled  = true;
        } else {
            el.disabled = false;
        }
    });
}

// Data processing  for time and measurement
function filterAndProcess(rows, lift, set, measurement, schema, person, week) {
    const timeField  = getTimeField(schema);
    const measField  = getMeasurementField(schema, measurement);

    const filtered = rows.filter(row => {
        const rowLift = String(row.lift || '').trim();
        const rowSet  = String(row.set  || '').trim();
        if (!rowLift || !rowSet || !row[timeField]) return false;
        if (isRowLocked(person, week, rowLift, rowSet)) return false;
        return rowLift === lift && rowSet === set;
    });

    if (filtered.length === 0) return null;

    filtered.sort((a, b) => parseFloat(a[timeField]) - parseFloat(b[timeField]));

    const startTime = parseFloat(filtered[0][timeField]);

    return filtered.map(row => ({
        time  : (parseFloat(row[timeField]) - startTime).toFixed(3),
        value : parseFloat(row[measField]) || 0
    }));
}

//  Chart
function renderWorkoutGraph(sensorData, chartTitle, measurement) {
    const ctx = document.getElementById('workoutChart').getContext('2d');
    if (currentChart) currentChart.destroy();

    const yLabel = Y_AXIS_LABELS[measurement] || 'Value';

    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels  : sensorData.map(r => r.time),
            datasets: [{
                label          : MEASUREMENTS.find(m => m.value === measurement)?.label || measurement,
                data           : sensorData.map(r => r.value),
                borderColor    : '#00f2fe',
                backgroundColor: 'rgba(0, 242, 254, 0.1)',
                borderWidth    : 2,
                pointRadius    : 0,
                pointHoverRadius         : 6,
                pointHoverBackgroundColor: '#4facfe',
                tension: 0.35,
                fill   : true
            }]
        },
        options: {
            responsive         : true,
            maintainAspectRatio: false,
            animation          : { duration: 400 },
            plugins: {
                title: {
                    display : true,
                    text    : chartTitle,
                    color   : '#ffffff',
                    font    : { size: 16, family: "'Outfit', sans-serif", weight: '600' },
                    padding : { bottom: 20 }
                },
                legend: {
                    labels: { color: '#8b92a5', font: { family: "'Outfit', sans-serif" } }
                }
            },
            scales: {
                x: {
                    title : { display: true, text: 'Time (seconds)', color: '#8b92a5' },
                    ticks : { color: '#8b92a5', maxTicksLimit: 15 },
                    grid  : { color: 'rgba(255,255,255,0.05)', drawBorder: false }
                },
                y: {
                    title      : { display: true, text: yLabel, color: '#8b92a5' },
                    ticks      : { color: '#8b92a5' },
                    grid       : { color: 'rgba(255,255,255,0.05)', drawBorder: false }
                }
            }
        }
    });
}

//  UI error messages + Feedback UI
function showError(msg) {
    const el   = document.getElementById('errorDisplay');
    const text = document.getElementById('errorText');
    text.textContent  = msg;
    el.style.display  = 'flex';
}
function hideError() {
    document.getElementById('errorDisplay').style.display = 'none';
}

function showInsight(msg) {
    const el   = document.getElementById('insightDisplay');
    const text = document.getElementById('insightText');
    text.textContent = msg;
    el.style.display = 'flex';
}
function hideInsight() {
    document.getElementById('insightDisplay').style.display = 'none';
}
