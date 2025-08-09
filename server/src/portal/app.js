document.addEventListener('DOMContentLoaded', () => {
    const correctionsList = document.getElementById('corrections-list');
    const usageRatesList = document.getElementById('usage-rates-list');
    const trainingTrendsList = document.getElementById('training-trends-list');
    const corrRateEl = document.getElementById('summary-correction-rate');
    const uncertEl = document.getElementById('summary-uncertainty-ratio');
    const latencyEl = document.getElementById('summary-median-latency');
    const topMisList = document.getElementById('summary-top-mis');

    // Retrieve or prompt for API token for authenticated API calls
    let apiToken = localStorage.getItem('apiToken');
    if (!apiToken) {
        apiToken = window.prompt('Enter API token for portal access');
        if (apiToken) localStorage.setItem('apiToken', apiToken);
    }
    const authHeaders = apiToken ? { 'Authorization': `Bearer ${apiToken}` } : {};

    const fetchAndDisplayData = async () => {
        try {
            // Fetch Profiles
            const profilesResponse = await fetch('/api/analytics/profiles', { headers: authHeaders });
            const profiles = await profilesResponse.json();
            const profileId = profiles.length > 0 ? profiles[0].id : ''; // Use first profile for now

            // Fetch Corrections
            const correctionsResponse = await fetch(`/api/analytics/corrections?profileId=${profileId}` , { headers: authHeaders });
            const corrections = await correctionsResponse.json();
            correctionsList.innerHTML = '';
            if (corrections.length > 0) {
                corrections.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = `Correction: ${item.predictedGesture} -> ${item.actualGesture} (Confidence: ${item.confidence})`;
                    correctionsList.appendChild(li);
                });
            } else {
                correctionsList.textContent = 'No corrections data available.';
            }

            // Fetch Usage Rates
            const usageRatesResponse = await fetch(`/api/analytics/usage-rates?profileId=${profileId}`, { headers: authHeaders });
            const usageRates = await usageRatesResponse.json();
            usageRatesList.innerHTML = '';
            if (usageRates.length > 0) {
                usageRates.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = `Symbol: ${item.symbolId}, Usage: ${item.usageCount}`;
                    usageRatesList.appendChild(li);
                });
            } else {
                usageRatesList.textContent = 'No usage rates data available.';
            }

            // Fetch Training Trends
            const trainingTrendsResponse = await fetch(`/api/analytics/training-trends?profileId=${profileId}`, { headers: authHeaders });
            const trainingTrends = await trainingTrendsResponse.json();
            trainingTrendsList.innerHTML = '';
            if (trainingTrends.length > 0) {
                trainingTrends.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = `Gesture: ${item.gestureDefinitionId}, Success Rate (7d): ${item.successRate7d}, Trend: ${item.improvementTrend}`;
                    trainingTrendsList.appendChild(li);
                });
            } else {
                trainingTrendsList.textContent = 'No training trends data available.';
            }

            // Fetch summary metrics
            const summaryResponse = await fetch('/api/analytics/summary', { headers: authHeaders });
            const summary = await summaryResponse.json();
            corrRateEl.textContent = `${Math.round(summary.correctionRate * 100)}%`;
            uncertEl.textContent = `${Math.round(summary.uncertaintyRatio * 100)}%`;
            latencyEl.textContent = summary.medianLatencyMs != null ? `${summary.medianLatencyMs} ms` : 'N/A';
            topMisList.innerHTML = '';
            if (summary.topMisclassifications && summary.topMisclassifications.length > 0) {
                summary.topMisclassifications.forEach(item => {
                    const li = document.createElement('li');
                    li.textContent = `${item.predicted} → ${item.actual} (${item.count})`;
                    topMisList.appendChild(li);
                });
            } else {
                const li = document.createElement('li');
                li.textContent = 'No misclassifications recorded.';
                topMisList.appendChild(li);
            }

        } catch (error) {
            console.error('Error fetching analytics data:', error);
            correctionsList.textContent = 'Error loading data.';
            usageRatesList.textContent = 'Error loading data.';
            trainingTrendsList.textContent = 'Error loading data.';
            corrRateEl.textContent = '-';
            uncertEl.textContent = '-';
            latencyEl.textContent = '-';
        }
    };

    fetchAndDisplayData();
});
