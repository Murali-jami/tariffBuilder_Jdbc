// ---------- STATE ----------
function getState() {
    const defaultState = { s2: [], s3: [], s4: [] };
    const stored = sessionStorage.getItem('state');
    return stored ? JSON.parse(stored) : defaultState;
}

function saveState(state) {
    sessionStorage.setItem('state', JSON.stringify(state));
}

// ---------- INIT ----------
function initStep4() {
    const state = getState();

    if (!state.s4) state.s4 = [];

    // Always re-render from state (handles both fresh load and bfcache restore)
    document.getElementById('dropArea').innerHTML = '';
    state.s4.forEach(item => renderCard(item));

    // Restore pills into in-memory array
    selectedSvcs = [];
    const saved = JSON.parse(sessionStorage.getItem('selectedSvcs_s4') || '[]');

    saved.forEach(svc => {
        const pill = document.querySelector(`.svc-pill[data-svc="${svc}"]`);
        if (pill) pill.classList.add('active');
        selectedSvcs.push(svc);
    });

    if (saved.length) refreshSidebar();
}

window.addEventListener('DOMContentLoaded', initStep4);

// FIX: bfcache restores don't re-fire DOMContentLoaded — re-sync DOM from state on pageshow
window.addEventListener('pageshow', (e) => {
    if (e.persisted) initStep4();
});

// ---------- SERVICE TYPE ----------
let selectedSvcs = [];

function toggleSvc(service, el) {

    if (selectedSvcs.includes(service)) {
        selectedSvcs = selectedSvcs.filter(s => s !== service);
        el.classList.remove('active');
    } else {
        selectedSvcs.push(service);
        el.classList.add('active');
    }

    sessionStorage.setItem('selectedSvcs_s4', JSON.stringify(selectedSvcs));

    if (selectedSvcs.length === 0) {
        clearCenter();
    }

    refreshSidebar();
}

function clearCenter() {

    const state = getState();
    state.s4 = [];
    saveState(state);

    document.getElementById('dropArea').innerHTML = '';
}

function validateCenterPlans() {

    const state = getState();

    if (!state.s4 || state.s4.length === 0) return;

    const svcMap = {
        '201': 'VOICE',
        '202': 'VOICE',
        '203': 'SMS',
        '204': 'DATA',
        '205': 'DATA'
    };

    const validItems = state.s4.filter(item => {
        const svc = svcMap[String(item.id)];
        return selectedSvcs.includes(svc);
    });

    state.s4 = validItems;
    saveState(state);

    const container = document.getElementById('dropArea');
    container.innerHTML = '';
    state.s4.forEach(item => renderCard(item));
}

// ---------- SIDEBAR ----------
function refreshSidebar() {

    const list = document.getElementById('comp-list');
    const svcMap = { VOICE: '1', SMS: '2', DATA: '3' };
    const types = selectedSvcs.map(s => svcMap[s]).sort().join(",");

    if (!types) {
        list.innerHTML = '';
        return;
    }

    list.innerHTML = '<p class="sidebar-text">Loading...</p>';

    fetch(`/builder/step4/filter?types=${types}`)
        .then(res => res.json())
        .then(data => {

            // Always clear search regardless of result
            const searchInput = document.getElementById('librarySearchInput');
            if (searchInput) {
                searchInput.value = '';
                searchInput.dispatchEvent(new Event('input'));
            }

            if (!data || !data.length) {

                list.innerHTML = '<p class="sidebar-text">No Plans</p>';
                return;
            }

            list.innerHTML = data.map(plan => `
			 
			                <div class="draggable-item"

			                    data-network-id="${plan.networkId}"
			                    data-package-id="${plan.servicePackageId}"
			                    onclick="addToCenter('${plan.servicePackageId}','${plan.servicePackageName}','${plan.networkId}')">
			                    ${plan.servicePackageName}
							
							</div>

			            `).join('');
        })
        .catch(err => {
            console.error(err);
            list.innerHTML = '<p class="sidebar-text">Error loading data</p>';
        });
}

// ---------- ADD ----------
function addToCenter(id, name) {

    const state = getState();
    if (!state.s4) state.s4 = [];

    // Cross-check: block if already in DATP (s3)
    const s3Items = state.s3 || [];
    if (s3Items.find(item => String(item.id) === String(id))) {
        alert(`"${name}" is already selected in Default ATPs (DATP).`);
        return;
    }

    // Self-duplicate check
    if (state.s4.find(i => String(i.id) === String(id))) return;

    const item = {
        id: String(id),
        name: name,
        validity: "M",
        rentalPeriod: "",
        renewal: "No",
        midnightExpiry: "No",
        rental: "",
        maxCount: "",
        freeCycles: "0",
		priority:""
    };

    state.s4.push(item);
    saveState(state);

    renderCard(item);
}

// ---------- RENDER ----------
function renderCard(item) {

    const container = document.getElementById('dropArea');

    if (document.getElementById(`card-s4-${item.id}`)) return;

    const card = document.createElement('div');
    card.className = "service-card";
    card.id = `card-s4-${item.id}`;

    card.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
        <b>${item.name}</b>
        <span onclick="removeItem('${item.id}')" style="color:red;cursor:pointer;">✕</span>
    </div>
 
    <div class="card-grid">
        <div class="card-field">
            <label>VALIDITY</label>
            <select onchange="handleValidityChange('${item.id}', this.value)">
                <option value="M"  ${item.validity === 'M' ? 'selected' : ''}>Monthly</option>
                <option value="D"  ${item.validity === 'D' ? 'selected' : ''}>Daily</option>
                <option value="W"  ${item.validity === 'W' ? 'selected' : ''}>Weekly</option>
                <option value="Y"  ${item.validity === 'Y' ? 'selected' : ''}>Yearly</option>
                <option value="F"  ${item.validity === 'F' ? 'selected' : ''}>Fixed</option>
                <option value="U"  ${item.validity === 'U' ? 'selected' : ''}>Unlimited</option>
                <option value="O"  ${item.validity === 'O' ? 'selected' : ''}>Others</option>
            </select>
        </div>
        <div class="card-field" id="rental-period-${item.id}" style="display:${item.validity === 'O' ? 'block' : 'none'};">
            <label>NO. OF DAYS</label>
            <input type="number" min="1"
                value="${item.rentalPeriod || ''}"
                placeholder="Enter days"
                oninput="updateField('${item.id}', 'rentalPeriod', this.value)">
        </div>
 
        <div class="card-field">
            <label>MIDNIGHT EXPIRY</label>
            <select onchange="updateField('${item.id}','midnightExpiry',this.value)">
                <option ${item.midnightExpiry === 'No' ? 'selected' : ''}>No</option>
                <option ${item.midnightExpiry === 'Yes' ? 'selected' : ''}>Yes</option>
            </select>
        </div>
 
        <div class="card-field">
            <label>AUTO RENEWAL</label>
            <select onchange="handleRenewalChange('${item.id}',this.value)">
                <option ${item.renewal === 'No' ? 'selected' : ''}>No</option>
                <option ${item.renewal === 'Yes' ? 'selected' : ''}>Yes</option>
            </select>
        </div>
 
        <div id="renewal-${item.id}" style="display:${item.renewal === 'Yes' ? 'contents' : 'none'};">
            <div class="card-field">
                <label>RENTAL</label>
                <input type="number"
                       value="${item.rental || ''}"
                       oninput="updateField('${item.id}','rental',this.value)">
            </div>
 
            <div class="card-field">
                <label>MAX COUNT</label>
                <input type="number"
                       value="${item.maxCount || ''}"
                       oninput="updateField('${item.id}','maxCount',this.value)">
            </div>
 
            <div class="card-field">
                <label>FREE CYCLES</label>
                <input type="number"
                       value="${item.freeCycles || 0}"
                       oninput="updateField('${item.id}','freeCycles',this.value)">
            </div>
        </div>
		<div class="card-field">
		     <label>PRIORITY</label>
		     <input type="number"
		          value="${item.priority || ''}"
		          oninput="updateField('${item.id}', 'priority', this.value)">
		</div>
    </div>
    `;

    container.appendChild(card);
}

function updateField(id, key, value) {
 
    console.log(id, key, value);
 
    const state = getState();
    const item = state.s4.find(i => String(i.id) === String(id));
 
    if (!item) return;
 
    if (key === "priority" && value !== "") {
        const existsInDATP = (state.s3 || []).some(i =>
            String(i.priority || "").trim() === String(value).trim()
        );
 
        if (existsInDATP) {
            alert(`Priority ${value} already selected in DATP.`);
            item.priority = "";
            saveState(state);
 
            const input = document.querySelector(
                `#card-s4-${id} input[oninput*="priority"]`
            );
            if (input) input.value = "";
 
            return;
        }
    }
 
    item[key] = value;
    saveState(state);
}

// ---------- UPDATE ----------
function updateField(id, key, value) {

    const state = getState();
    const item = state.s4.find(i => String(i.id) === String(id));

    if (item) {
        item[key] = value;
        saveState(state);
    }
}

// ---------- VALIDITY ----------
function handleValidityChange(id, value) {

    updateField(id, 'validity', value);

    const daysField = document.getElementById(`rental-period-${id}`);
    if (daysField) daysField.style.display = value === 'O' ? 'block' : 'none';

    // Clear rentalPeriod when switching away from Others
    if (value !== 'O') updateField(id, 'rentalPeriod', '');
}

// ---------- RENEWAL ----------
function handleRenewalChange(id, value) {

    updateField(id, "renewal", value);

    const section = document.getElementById(`renewal-${id}`);
    section.style.display = value === 'Yes' ? 'contents' : 'none';
}

// ---------- REMOVE ----------
function removeItem(id) {

    const state = getState();

    state.s4 = state.s4.filter(i => String(i.id) !== String(id));
    saveState(state);

    document.getElementById(`card-s4-${id}`)?.remove();
}