// Keep track of the active chart instance
let currentChart = null;

/**
 * 1. Data Pipeline: Fetches and parses the CSV based on dropdown selections
 */
async function fetchSetData(user, week, workout, set) {
    // Matches your specific folder structure: /data/john/week1/bench/set1/TotalAcceleration.csv
    const fileUrl = `./data/${user}/${week}/${workout}/${set}/TotalAcceleration.csv`; 

    try {
        console.log(`Attempting to fetch: ${fileUrl}`);
        const response = await fetch(fileUrl);
        
        if (!response.ok) {
            throw new Error(`File not found: ${fileUrl}`);
        }
        
        const rawText = await response.text();
        
        // Parse CSV text into a JSON array
        const parsedData = Papa.parse(rawText, { 
            header: true, 
            dynamicTyping: true, 
            skipEmptyLines: true 
        }).data;

        return parsedData;

    } catch (error) {
        console.error("Data Fetch Error:", error);
        return null; // Return null if file doesn't exist yet
    }
}

/**
 * 2. Visualization: Renders the data using Chart.js
 */
function renderWorkoutGraph(sensorData, chartTitle) {
    const ctx = document.getElementById('workoutChart').getContext('2d');

    // Destroy the old chart before rendering a new one to prevent glitching
    if (currentChart) {
        currentChart.destroy();
    }

    // Extract columns for the graph axes. 
    // IMPORTANT: Verify that 'time' and 'gForce' exactly match the column headers in your CSV.
    const timeLabels = sensorData.map(row => row.time); 
    const forceData = sensorData.map(row => row.gForce); 

    // Build the new chart
    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timeLabels, // X-Axis
            datasets: [{
                label: 'Total Acceleration (G-Force)',
                data: forceData,    // Y-Axis
                borderColor: 'rgba(54, 162, 235, 1)', 
                backgroundColor: 'rgba(54, 162, 235, 0.1)',
                borderWidth: 2,
                pointRadius: 0, // Hides individual data points for a smooth line
                tension: 0.2, // Adds a slight curve to the line
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: chartTitle,
                    font: { size: 16 }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Time (Seconds)' } },
                y: { title: { display: true, text: 'Acceleration (G-Force)' } }
            }
        }
    });
}

/**
 * 3. Controller: Ties the UI to the Data and Chart functions
 */
async function updateDashboard() {
    // Get current values from the dropdowns
    const user = document.getElementById('userSelect').value;
    const week = document.getElementById('weekSelect').value;
    const workout = document.getElementById('workoutSelect').value;
    const set = document.getElementById('setSelect').value;

    // Hide error message initially
    const errorDisplay = document.getElementById('errorDisplay');
    errorDisplay.style.display = 'none';

    // Fetch the data
    const data = await fetchSetData(user, week, workout, set);

    if (data && data.length > 0) {
        // Format a nice title (e.g., "John - Week 1: Bench Press (Set 1)")
        const title = `${user.toUpperCase()} - ${week.toUpperCase()}: ${workout.toUpperCase()} (${set.toUpperCase()})`;
        
        // Draw the graph
        renderWorkoutGraph(data, title);
    } else {
        // Show error if data is missing or path is wrong
        errorDisplay.style.display = 'block';
        if (currentChart) currentChart.destroy();
    }
}

// 4. Initialization: Set up the event listener and load the first graph on page load
document.getElementById('loadDataBtn').addEventListener('click', updateDashboard);

// Load the default selected data immediately when the page opens
window.onload = updateDashboard;