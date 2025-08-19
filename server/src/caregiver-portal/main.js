document.addEventListener('DOMContentLoaded', () => {
    const samplesTbody = document.getElementById('samples-tbody');
    const retrainBtn = document.getElementById('retrain-btn');
    const retrainStatus = document.getElementById('retrain-status');
    const synonymsContainer = document.getElementById('synonyms-container');
    const addSynonymBtn = document.getElementById('add-synonym-btn');
    const saveSynonymsBtn = document.getElementById('save-synonyms-btn');
    const synonymsStatus = document.getElementById('synonyms-status');

    const API_HEADERS = {
        'Content-Type': 'application/json',
        // This should be replaced with a real token in a real app
        'Authorization': `Bearer demo-token`
    };

    // --- DGS Samples Logic ---
    async function fetchSamples() {
        try {
            const response = await fetch('/api/caregiver-portal/dgs-samples', { headers: API_HEADERS });
            if (!response.ok) throw new Error('Failed to fetch samples');
            const samples = await response.json();
            renderSamples(samples);
        } catch (error) {
            console.error('Error fetching samples:', error);
            if (samplesTbody) samplesTbody.innerHTML = '<tr><td colspan="6">Error loading samples.</td></tr>';
        }
    }

    function renderSamples(samples) {
        if (!samplesTbody) return;
        samplesTbody.innerHTML = '';
        if (samples.length === 0) {
            samplesTbody.innerHTML = '<tr><td colspan="6">No samples found.</td></tr>';
            return;
        }
        samples.forEach(sample => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${sample.id}</td>
                <td>${sample.profileId || 'global'}</td>
                <td>${sample.label}</td>
                <td>${new Date(sample.ts).toLocaleString()}</td>
                <td>${Array.isArray(sample.landmarks) && Array.isArray(sample.landmarks[0]) && Array.isArray(sample.landmarks[0][0]) ? sample.landmarks.length : 1}</td>
                <td><button class="delete-btn" data-id="${sample.id}">Delete</button></td>
            `;
            samplesTbody.appendChild(row);
        });
    }

    samplesTbody?.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('delete-btn')) {
            const id = target.dataset.id;
            if (id && confirm(`Are you sure you want to delete sample ${id}?`)) {
                try {
                    const response = await fetch(`/api/caregiver-portal/dgs-samples/${id}`, { method: 'DELETE', headers: API_HEADERS });
                    if (!response.ok) throw new Error('Failed to delete sample');
                    fetchSamples(); // Refresh list
                } catch (error) {
                    console.error('Error deleting sample:', error);
                    alert('Failed to delete sample.');
                }
            }
        }
    });

    retrainBtn?.addEventListener('click', async () => {
        if (!retrainStatus) return;
        if (confirm('Are you sure you want to start a new MLP training job? This can take a few minutes.')) {
            retrainStatus.textContent = 'Starting training...';
            try {
                const response = await fetch('/api/caregiver-portal/retrain', { method: 'POST', headers: API_HEADERS });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Failed to start training');
                }
                const { jobId } = await response.json();
                retrainStatus.textContent = `Training job ${jobId} started. Check server logs for progress.`;
            } catch (error) {
                console.error('Error starting training:', error);
                retrainStatus.textContent = `Error: ${error.message}`;
            }
        }
    });

    // --- Synonyms Logic ---
    async function fetchSynonyms() {
        try {
            const response = await fetch('/api/caregiver-portal/label-map', { headers: API_HEADERS });
            if (!response.ok) throw new Error('Failed to fetch synonyms');
            const data = await response.json();
            renderSynonyms(data.synonyms || {});
        } catch (error) {
            console.error('Error fetching synonyms:', error);
            if (synonymsContainer) synonymsContainer.innerHTML = '<p>Error loading synonyms.</p>';
        }
    }

    function renderSynonyms(synonyms) {
        if (!synonymsContainer) return;
        synonymsContainer.innerHTML = '';
        for (const key in synonyms) {
            createSynonymRow(key, synonyms[key]);
        }
    }

    function createSynonymRow(key = '', value = '') {
        if (!synonymsContainer) return;
        const row = document.createElement('div');
        row.className = 'synonym-row';
        row.innerHTML = `
            <input type="text" class="synonym-key" value="${key}" placeholder="Raw Recognizer Label">
            <span>→</span>
            <input type="text" class="synonym-value" value="${value}" placeholder="App Gesture ID">
            <button class="delete-synonym-btn">&#x2716;</button>
        `;
        synonymsContainer.appendChild(row);
    }

    addSynonymBtn?.addEventListener('click', () => createSynonymRow());

    synonymsContainer?.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('delete-synonym-btn')) {
            target.parentElement?.remove();
        }
    });

    saveSynonymsBtn?.addEventListener('click', async () => {
        if (!synonymsContainer || !synonymsStatus) return;
        const synonyms = {};
        const rows = synonymsContainer.querySelectorAll('.synonym-row');
        let valid = true;
        rows.forEach(row => {
            const keyInput = row.querySelector('.synonym-key') as HTMLInputElement;
            const valueInput = row.querySelector('.synonym-value') as HTMLInputElement;
            const key = keyInput.value.trim();
            const value = valueInput.value.trim();
            if (key && value) {
                synonyms[key] = value;
            } else if (key || value) {
                valid = false; // Mark as invalid if one is filled but not the other
            }
        });

        if (!valid) {
            alert('Both fields are required for each synonym row.');
            return;
        }

        synonymsStatus.textContent = 'Saving...';
        try {
            const response = await fetch('/api/caregiver-portal/label-map', {
                method: 'POST',
                headers: API_HEADERS,
                body: JSON.stringify({ synonyms }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to save');
            }
            synonymsStatus.textContent = 'Saved successfully!';
        } catch (error) {
            console.error('Error saving synonyms:', error);
            synonymsStatus.textContent = `Error: ${error.message}`;
        }
    });

    // Initial data fetch
    fetchSamples();
    fetchSynonyms();
});
