// API helper
const api = {
  async get(endpoint) {
    const res = await fetch(`/api${endpoint}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },
  async post(endpoint, data) {
    const res = await fetch(`/api${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },
};

// State
let state = {
  status: null,
  verdicts: [],
  config: null,
  costs: null,
};

// DOM Elements
const elements = {
  statusBadge: document.getElementById('status-badge'),
  mainScore: document.getElementById('main-score'),
  targetScore: document.getElementById('target-score'),
  architectAvg: document.getElementById('architect-avg'),
  criticAvg: document.getElementById('critic-avg'),
  pragmatistAvg: document.getElementById('pragmatist-avg'),
  filesAnalyzed: document.getElementById('files-analyzed'),
  filesPassing: document.getElementById('files-passing'),
  filesFailing: document.getElementById('files-failing'),
  todayCost: document.getElementById('today-cost'),
  priorityList: document.getElementById('priority-list'),
  verdictsList: document.getElementById('verdicts-list'),
  settingsForm: document.getElementById('settings-form'),
  baseUrl: document.getElementById('base-url'),
  model: document.getElementById('model'),
  apiKey: document.getElementById('api-key'),
  targetScoreInput: document.getElementById('target-score-input'),
  architectWeight: document.getElementById('architect-weight'),
  criticWeight: document.getElementById('critic-weight'),
  pragmatistWeight: document.getElementById('pragmatist-weight'),
  architectWeightVal: document.getElementById('architect-weight-val'),
  criticWeightVal: document.getElementById('critic-weight-val'),
  pragmatistWeightVal: document.getElementById('pragmatist-weight-val'),
  refreshBtn: document.getElementById('refresh-btn'),
};

// Score color helper
function getScoreClass(score) {
  if (score >= 85) return 'high';
  if (score >= 70) return 'medium';
  return 'low';
}

function getScoreColor(score) {
  if (score >= 85) return '#3fb950';
  if (score >= 70) return '#d29922';
  return '#f85149';
}

// Update UI
function updateStatus(status) {
  state.status = status;

  // Status badge
  if (status.targetMet) {
    elements.statusBadge.textContent = 'Approved';
    elements.statusBadge.className = 'status-badge passing';
  } else if (status.overall >= 70) {
    elements.statusBadge.textContent = 'Needs Work';
    elements.statusBadge.className = 'status-badge warning';
  } else {
    elements.statusBadge.textContent = 'Failing';
    elements.statusBadge.className = 'status-badge failing';
  }

  // Main score
  elements.mainScore.textContent = Math.round(status.overall) + '%';
  elements.mainScore.style.color = getScoreColor(status.overall);
  elements.targetScore.textContent = status.target;

  // Stats
  elements.filesAnalyzed.textContent = status.filesAnalyzed;
  elements.filesPassing.textContent = status.filesAboveTarget;
  elements.filesFailing.textContent = status.filesBelowTarget;

  // Priority fixes
  if (status.criticalFiles && status.criticalFiles.length > 0) {
    elements.priorityList.innerHTML = status.criticalFiles
      .map(
        (f) => `
      <div class="priority-item">
        <div class="score ${getScoreClass(f.score)}">${f.score}%</div>
        <div class="details">
          <div class="file-path">${f.path}</div>
          <div class="issue">${f.topIssue}</div>
        </div>
      </div>
    `
      )
      .join('');
  } else {
    elements.priorityList.innerHTML = '<div class="empty-state">All files passing!</div>';
  }
}

function updateVerdicts(verdicts) {
  state.verdicts = verdicts;

  if (verdicts.length === 0) {
    elements.verdictsList.innerHTML = '<div class="empty-state">No files analyzed yet</div>';
    return;
  }

  // Calculate agent averages
  const avgArchitect = Math.round(
    verdicts.reduce((sum, v) => sum + v.scores.architect, 0) / verdicts.length
  );
  const avgCritic = Math.round(
    verdicts.reduce((sum, v) => sum + v.scores.critic, 0) / verdicts.length
  );
  const avgPragmatist = Math.round(
    verdicts.reduce((sum, v) => sum + v.scores.pragmatist, 0) / verdicts.length
  );

  elements.architectAvg.textContent = avgArchitect + '%';
  elements.architectAvg.style.color = getScoreColor(avgArchitect);
  elements.criticAvg.textContent = avgCritic + '%';
  elements.criticAvg.style.color = getScoreColor(avgCritic);
  elements.pragmatistAvg.textContent = avgPragmatist + '%';
  elements.pragmatistAvg.style.color = getScoreColor(avgPragmatist);

  elements.verdictsList.innerHTML = verdicts
    .map(
      (v) => `
    <div class="verdict-item">
      <div class="final-score" style="color: ${getScoreColor(v.scores.final)}">${v.scores.final}%</div>
      <div class="file-path" title="${v.file}">${v.file}</div>
      <div class="agent-score">
        <span>Architect</span>
        ${v.scores.architect}%
      </div>
      <div class="agent-score">
        <span>Critic</span>
        ${v.scores.critic}%
      </div>
      <div class="agent-score">
        <span>Pragmatist</span>
        ${v.scores.pragmatist}%
      </div>
      <div class="verdict-status ${getScoreClass(v.scores.final)}">
        ${v.scores.final >= 95 ? 'Pass' : 'Fix'}
      </div>
    </div>
  `
    )
    .join('');
}

function updateConfig(config) {
  state.config = config;

  elements.baseUrl.value = config.api.baseUrl || '';
  elements.model.value = config.api.model || 'claude-sonnet-4-20250514';
  elements.targetScoreInput.value = config.analysis.targetScore || 95;

  if (config.weights) {
    elements.architectWeight.value = config.weights.architect;
    elements.criticWeight.value = config.weights.critic;
    elements.pragmatistWeight.value = config.weights.pragmatist;
    elements.architectWeightVal.textContent = config.weights.architect.toFixed(1);
    elements.criticWeightVal.textContent = config.weights.critic.toFixed(1);
    elements.pragmatistWeightVal.textContent = config.weights.pragmatist.toFixed(1);
  }
}

function updateCosts(costs) {
  state.costs = costs;
  elements.todayCost.textContent = `$${costs.today.cost.toFixed(2)}`;
}

// Weight slider handlers
elements.architectWeight.addEventListener('input', (e) => {
  elements.architectWeightVal.textContent = parseFloat(e.target.value).toFixed(1);
});
elements.criticWeight.addEventListener('input', (e) => {
  elements.criticWeightVal.textContent = parseFloat(e.target.value).toFixed(1);
});
elements.pragmatistWeight.addEventListener('input', (e) => {
  elements.pragmatistWeightVal.textContent = parseFloat(e.target.value).toFixed(1);
});

// Settings form handler
elements.settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const data = {
    baseUrl: elements.baseUrl.value || undefined,
    model: elements.model.value || undefined,
    apiKey: elements.apiKey.value || undefined,
    targetScore: parseInt(elements.targetScoreInput.value) || undefined,
    weights: {
      architect: parseFloat(elements.architectWeight.value),
      critic: parseFloat(elements.criticWeight.value),
      pragmatist: parseFloat(elements.pragmatistWeight.value),
    },
  };

  try {
    const result = await api.post('/config', data);
    alert('Settings saved successfully!');
    elements.apiKey.value = ''; // Clear API key field
    await refresh();
  } catch (error) {
    alert('Failed to save settings: ' + error.message);
  }
});

// Refresh handler
elements.refreshBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  await refresh();
});

// Fetch all data
async function refresh() {
  try {
    const [status, verdicts, config, costs] = await Promise.all([
      api.get('/status'),
      api.get('/verdicts'),
      api.get('/config'),
      api.get('/costs'),
    ]);

    updateStatus(status);
    updateVerdicts(verdicts);
    updateConfig(config);
    updateCosts(costs);
  } catch (error) {
    console.error('Failed to refresh:', error);
    elements.statusBadge.textContent = 'Error';
    elements.statusBadge.className = 'status-badge failing';
  }
}

// Auto-refresh every 10 seconds
setInterval(refresh, 10000);

// Initial load
refresh();
