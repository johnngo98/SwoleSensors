// SwoleSensors Dashboard

let currentChart = null;

// Cache: keyed by "Person-Week" → parsed row array
const dataCache = {};

// Known roster — populates the first two dropdowns immediately on load.
const PEOPLE = ['Jesse', 'John', 'Tyrus'];
const WEEKS  = ['1', '2'];

// Builds the URL to the per-person-per-week CSV
function buildCsvUrl(person, week) {
    return `./data/data_combined/SwoleSensor_Full_Week${week}Split${person}.csv`;
}

window.onload = function () {
    fillSelect('userSelect', PEOPLE, v => v);
    fillSelect('weekSelect', WEEKS,  v => `Week ${v}`);

    document.getElementById('userSelect').addEventListener('change', onPersonOrWeekChange);
    document.getElementById('weekSelect').addEventListener('change', onPersonOrWeekChange);
    document.getElementById('workoutSelect').addEventListener('change', onLiftOrSetChange);
    document.getElementById('setSelect').addEventListener('change', onLiftOrSetChange);
    document.getElementById('loadDataBtn').addEventListener('click', onLiftOrSetChange);

    onPersonOrWeekChange();
};

async function onPersonOrWeekChange() {
    const person   = document.getElementById('userSelect').value;
    const week     = document.getElementById('weekSelect').value;
    const cacheKey = `${person}-${week}`;

    const btn          = document.getElementById('loadDataBtn');
    const errorDisplay = document.getElementById('errorDisplay');
    const errorText    = document.getElementById('errorText');
    errorDisplay.style.display = 'none';

    // Already cached
    if (dataCache[cacheKey]) {
        populateLiftAndSetDropdowns(dataCache[cacheKey]);
        onLiftOrSetChange();
        return;
    }

    const originalBtnHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Loading…';
    btn.disabled = true;
    setDropdownsLoading(true);

    const url = buildCsvUrl(person, week);

    try {
        console.log(`Fetching ${url}…`);
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} — file not found at ${url}`);
        }

        const rawText = await response.text();

        // Guard against Git LFS pointer files
        if (rawText.length < 500 || !rawText.includes('Person')) {
            throw new Error(
                `The file at ${url} appears to be a Git LFS pointer (${rawText.length} bytes), ` +
                `not actual CSV data. Remove LFS tracking and re-commit the CSV files.`
            );
        }

        const parsed = Papa.parse(rawText, {
            header: true,
            dynamicTyping: false,
            skipEmptyLines: true
        }).data;

        if (parsed.length === 0) {
            throw new Error(`Parsed 0 rows from ${url}.`);
        }

        dataCache[cacheKey] = parsed;
        console.log(`Cached ${parsed.length} rows for ${cacheKey}`);

        populateLiftAndSetDropdowns(parsed);

        btn.innerHTML = originalBtnHTML;
        btn.disabled = false;
        setDropdownsLoading(false);

        onLiftOrSetChange();

    } catch (err) {
        console.error('Data load error:', err);
        btn.innerHTML = originalBtnHTML;
        btn.disabled = false;
        setDropdownsLoading(false);

        errorDisplay.style.display = 'flex';
        errorText.textContent = err.message;

        if (currentChart) { currentChart.destroy(); currentChart = null; }
    }
}

function onLiftOrSetChange() {
    const person = document.getElementById('userSelect').value;
    const week   = document.getElementById('weekSelect').value;
    const lift   = document.getElementById('workoutSelect').value;
    const set    = document.getElementById('setSelect').value;

    const errorDisplay = document.getElementById('errorDisplay');
    const errorText    = document.getElementById('errorText');
    errorDisplay.style.display = 'none';

    const cacheKey = `${person}-${week}`;
    const rows = dataCache[cacheKey];

    if (!rows) {
        errorDisplay.style.display = 'flex';
        errorText.textContent = 'Data not loaded. Select a user and week first.';
        return;
    }

    const chartData = filterAndProcess(rows, lift, set);

    if (chartData && chartData.length > 0) {
        const liftEl = document.getElementById('workoutSelect');
        const title = `${person} — Week ${week}: ` +
                      `${liftEl.options[liftEl.selectedIndex].text} (Set ${set})`;
        renderWorkoutGraph(chartData, title);
    } else {
        errorDisplay.style.display = 'flex';
        errorText.textContent =
            `No telemetry rows for ${person} → Week ${week} → ${lift} → Set ${set}.`;
        if (currentChart) { currentChart.destroy(); currentChart = null; }
    }
}

// Dropdown helpers

const LIFT_LABELS = {
    'Bench':    'Bench Press',
    'Squat':    'Squat',
    'Deadlift': 'Deadlift',
    'OHP':      'Overhead Press'
};

function populateLiftAndSetDropdowns(rows) {
    const lifts = new Set();
    const sets  = new Set();

    rows.forEach(r => {
        if (r.Lift) lifts.add(String(r.Lift).trim());
        if (r.Set)  sets.add(String(r.Set).trim());
    });

    fillSelect('workoutSelect', [...lifts].sort(), v => LIFT_LABELS[v] || v);
    fillSelect('setSelect',     [...sets].sort((a, b) => +a - +b), v => `Set ${v}`);
}

function fillSelect(id, values, labelFn) {
    const el   = document.getElementById(id);
    const prev = el.value;
    el.innerHTML = '';

    values.forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
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
            el.disabled = true;
        } else {
            el.disabled = false;
        }
    });
}

// Data processing
function filterAndProcess(rows, lift, set) {
    const filtered = rows.filter(row => {
        if (!row.Lift || !row.Set || !row.time) return false;
        return String(row.Lift).trim() === lift &&
               String(row.Set).trim()  === set;
    });

    if (filtered.length === 0) return null;

    // Sort chronologically using parseFloat
    filtered.sort((a, b) => {
        return parseFloat(a.time) - parseFloat(b.time);
    });

    const startTime = parseFloat(filtered[0].time);

    return filtered.map(row => {
        const elapsed = (parseFloat(row.time) - startTime) / 1e9; // ns → s

        const gFx = parseFloat(row.gFx) || 0;
        const gFy = parseFloat(row.gFy) || 0;
        const gFz = parseFloat(row.gFz) || 0;

        return {
            time: elapsed.toFixed(2),
            gForce: Math.sqrt(gFx * gFx + gFy * gFy + gFz * gFz)
        };
    });
}

//Chart Rendering
function renderWorkoutGraph(sensorData, chartTitle) {
    const ctx = document.getElementById('workoutChart').getContext('2d');
    if (currentChart) currentChart.destroy();

    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sensorData.map(r => r.time),
            datasets: [{
                label: 'Total Acceleration (G-Force)',
                data: sensorData.map(r => r.gForce),
                borderColor: '#00f2fe',
                backgroundColor: 'rgba(0, 242, 254, 0.1)',
                borderWidth: 3,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#4facfe',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: chartTitle,
                    color: '#ffffff',
                    font: { size: 18, family: "'Outfit', sans-serif", weight: '600' },
                    padding: { bottom: 20 }
                },
                legend: {
                    labels: { color: '#8b92a5', font: { family: "'Outfit', sans-serif" } }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Time (Seconds)', color: '#8b92a5' },
                    ticks: { color: '#8b92a5', maxTicksLimit: 15 },
                    grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false }
                },
                y: {
                    title: { display: true, text: 'Acceleration (G-Force)', color: '#8b92a5' },
                    beginAtZero: true,
                    ticks: { color: '#8b92a5' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false }
                }
            }
        }
    });
}
