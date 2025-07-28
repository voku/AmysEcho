document.addEventListener('DOMContentLoaded', () => {
    const correctionsList = document.getElementById('corrections-list');
    const usageRatesList = document.getElementById('usage-rates-list');
    const trainingTrendsList = document.getElementById('training-trends-list');

    const fetchAndDisplayData = async () => {
        try {
            // Fetch Profiles
            const profilesResponse = await fetch('/api/analytics/profiles');
            const profiles = await profilesResponse.json();
            const profileId = profiles.length > 0 ? profiles[0].id : ''; // Use first profile for now

            // Fetch Corrections
            const correctionsResponse = await fetch(`/api/analytics/corrections?profileId=${profileId}`);
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
            const usageRatesResponse = await fetch(`/api/analytics/usage-rates?profileId=${profileId}`);
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
            const trainingTrendsResponse = await fetch(`/api/analytics/training-trends?profileId=${profileId}`);
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

        } catch (error) {
            console.error('Error fetching analytics data:', error);
            correctionsList.textContent = 'Error loading data.';
            usageRatesList.textContent = 'Error loading data.';
            trainingTrendsList.textContent = 'Error loading data.';
        }
    };

    fetchAndDisplayData();
});