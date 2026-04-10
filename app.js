// Keep track of the active chart instance
let currentChart = null;
// Cache to hold the 42MB consolidated dataset
let globalWorkoutData = []; 

// Data Pipeline
// Fetches the CSV only ONCE when the page loads
async function loadFullDataset() {
    const fileUrl = `./data/data_combined/SwoleSensor_Week2_Full.csv`; 

    try {
        console.log(`Downloading full dataset: ${fileUrl}...`);
        
        // Show loading state
        const btn = document.getElementById('loadDataBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = 'Loading Dataset...';
        btn.disabled = true;

        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`File not found: ${fileUrl}`);
        
        const rawText = await response.text();
        
        // dynamicTyping set to false or else Javascript will corrupt the 19-digit nanosecond timestamps
        const parsedData = Papa.parse(rawText, { 
            header: true, 
            dynamicTyping: false, 
            skipEmptyLines: true 
        }).data;

        globalWorkoutData = parsedData;
        console.log(`Success! Loaded ${globalWorkoutData.length} rows into memory.`);
        
        // Restore button and draw the first graph
        btn.innerHTML = originalText;
        btn.disabled = false;
        updateDashboard();

    } catch (error) {
        console.error("Data Fetch Error:", error);
        document.getElementById('errorDisplay').style.display = 'flex';
        document.getElementById('errorDisplay').innerHTML = `<span>Error: Could not load ${fileUrl}</span>`;
    }
}

// Filters the global data based on dropdowns
function getFilteredData(user, week, workout, set) {
    if (globalWorkoutData.length === 0) return null;

    // Format dropdown values to match CSV exactly and securely
    const targetPerson = user.toLowerCase().trim();
    const targetWeek = week.replace('week', '').trim();
    let targetLift = workout.toLowerCase().trim();
    if (targetLift === 'overhead') targetLift = 'ohp';
    const targetSet = set.replace('set', '').trim();

    // Wrap row values in String().trim() in case there are stray spaces in the CSV
    const filteredRows = globalWorkoutData.filter(row => {
        if (!row.Person || !row.Week || !row.Lift || !row.Set || !row.time) return false;
        
        return String(row.Person).toLowerCase().trim() === targetPerson &&
               String(row.Week).trim() === targetWeek &&
               String(row.Lift).toLowerCase().trim() === targetLift &&
               String(row.Set).trim() === targetSet;
    });

    if (filteredRows.length === 0) return null;

    // Sort chronologically
    filteredRows.sort((a, b) => {
        // Extract just the integer part of the time safely
        const timeA = BigInt(String(a.time).split('.')[0].trim());
        const timeB = BigInt(String(b.time).split('.')[0].trim());
        return timeA < timeB ? -1 : (timeA > timeB ? 1 : 0);
    });

    // 3. Process time safely
    const startTime = BigInt(String(filteredRows[0].time).split('.')[0].trim());

    return filteredRows.map(row => {
        const currentTime = BigInt(String(row.time).split('.')[0].trim());
        const elapsedSeconds = Number(currentTime - startTime) / 1e9; // convert ns to s
        
        // Calculate Total G-Force magnitude safely
        const gFx = parseFloat(row.gFx) || 0;
        const gFy = parseFloat(row.gFy) || 0;
        const gFz = parseFloat(row.gFz) || 0;
        const magnitude = Math.sqrt((gFx * gFx) + (gFy * gFy) + (gFz * gFz));
        
        return {
            time: elapsedSeconds.toFixed(2),
            gForce: magnitude
        };
    });
}

// Chart Rendering
function renderWorkoutGraph(sensorData, chartTitle) {
    const ctx = document.getElementById('workoutChart').getContext('2d');

    if (currentChart) {
        currentChart.destroy();
    }

    const timeLabels = sensorData.map(row => row.time); 
    const forceData = sensorData.map(row => row.gForce);

    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timeLabels, 
            datasets: [{
                label: 'Total Acceleration (G-Force)',
                data: forceData,    
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

// Dashboard Controller
function updateDashboard() {
    const user = document.getElementById('userSelect').value;
    const week = document.getElementById('weekSelect').value;
    const workout = document.getElementById('workoutSelect').value;
    const set = document.getElementById('setSelect').value;

    const errorDisplay = document.getElementById('errorDisplay');
    errorDisplay.style.display = 'none';

    // Fetch data instantly from local memory instead of a new HTTP request
    const data = getFilteredData(user, week, workout, set);

    if (data && data.length > 0) {
        const title = `${user.toUpperCase()} - ${week.toUpperCase()}: ${workout.toUpperCase()} (${set.toUpperCase()})`;
        renderWorkoutGraph(data, title);
    } else {
        errorDisplay.style.display = 'flex';
        if (currentChart) currentChart.destroy();
    }
}

// Event listeners
document.getElementById('loadDataBtn').addEventListener('click', updateDashboard);

// Trigger the massive file download the moment the web page opens
window.onload = loadFullDataset;