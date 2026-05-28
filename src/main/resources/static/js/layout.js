window.addEventListener("pageshow", () => {
    window.isInternalNavigation = false;
});

let _currentClonePayload = null;

window.isInternalNavigation = false;

if (USERNAME) {
    sessionStorage.setItem('username', USERNAME);
}

function saveDraftOnExit() {
    if (window.isInternalNavigation) return;

    const isBuilderPage = window.location.pathname.startsWith('/builder/step');
    if (!isBuilderPage) return;

    const state = JSON.parse(sessionStorage.getItem('state') || '{}');
    const configName = sessionStorage.getItem('configName');
    const pkgType = sessionStorage.getItem('pkgType');

    const hasData = pkgType || configName ||
        state?.s2?.length || state?.s3?.length || state?.s4?.length;

    if (!hasData) return;

    const now = new Date();
    const savedOn = now.toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
    const savedTime = now.toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit'
    });

    const username = sessionStorage.getItem('username') || 'guest';

    const payload = JSON.stringify({
        name: configName || 'Untitled Draft',
        pkgType,
        pkgSubType: sessionStorage.getItem('pkgSubType'),
        savedOn,
        savedTime,
        username,
        selectedSvcs_s2: sessionStorage.getItem('selectedSvcs_s2'),
        selectedSvcs_s3: sessionStorage.getItem('selectedSvcs_s3'),
        selectedSvcs_s4: sessionStorage.getItem('selectedSvcs_s4'),
        state
    });

    navigator.sendBeacon('/draft/save', new Blob([payload], { type: 'application/json' }));
}

window.addEventListener("beforeunload", saveDraftOnExit);

function openDrafts() {
    const overlay = document.getElementById('draftOverlay');

    // Step 1: make it display:block but panel still off-screen (no 'active' yet)
    overlay.style.display = 'block';

    // Step 2: double rAF so browser paints the display:block frame first,
    // then adds 'active' — this lets the CSS transition actually animate
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });
    });

    loadDrafts('draftOverlayList');
}

function closeDrafts() {
    const overlay = document.getElementById('draftOverlay');
    overlay.classList.remove('active');

    // Hide after slide-out transition completes
    overlay.addEventListener('transitionend', function handler() {
        if (!overlay.classList.contains('active')) {
            overlay.style.display = 'none';
        }
        overlay.removeEventListener('transitionend', handler);
    });
}

document.addEventListener('click', function (e) {
    if (e.target.id === 'draftOverlay') {
        closeDrafts();
    }
});

function loadDrafts(targetId = 'comp-list') {

    const container = document.getElementById(targetId);
    container.innerHTML = '<p class="sidebar-text">Loading...</p>';

    fetch('/draft/list')
        .then(res => res.json())
        .then(drafts => {

            if (!drafts.length) {
                container.innerHTML = `
                    <div class="drafts-empty">
                        <span class="material-icons">edit_note</span>
                        <p class="drafts-empty-title">No drafts yet</p>
                        <p class="drafts-empty-sub">
                            Your in-progress packages will appear here
                        </p>
                    </div>
                `;
                return;
            }

            window.ALL_DRAFTS = drafts;

            container.innerHTML = drafts.map((d, i) => `
                <div class="draft-item" style="--i:${i}">
                    <div class="draft-info" onclick="loadDraft(${i})">
                        <span class="material-icons draft-icon">description</span>
                        <div class="draft-text">
                            <span class="draft-name">${d.name || 'Untitled'}</span>
                            <span class="draft-meta">${d.savedOn} · ${d.savedTime}</span>
                        </div>
                    </div>
                    <span class="material-icons draft-delete"
                          onclick="deleteDraft(${i}, event)">delete_outline</span>
                </div>
            `).join('');
        })
        .catch(() => {
            container.innerHTML = '<p class="sidebar-text">Error loading drafts</p>';
        });
}

function loadDraft(index) {

    const draft = window.ALL_DRAFTS[index];

    sessionStorage.setItem('state', JSON.stringify(draft.state || {}));
    sessionStorage.setItem('configName', draft.name || '');
    sessionStorage.setItem('pkgType', draft.pkgType || '');
    sessionStorage.setItem('pkgSubType', draft.pkgSubType || '');

    sessionStorage.setItem('selectedSvcs_s2', draft.selectedSvcs_s2 || '[]');
    sessionStorage.setItem('selectedSvcs_s3', draft.selectedSvcs_s3 || '[]');
    sessionStorage.setItem('selectedSvcs_s4', draft.selectedSvcs_s4 || '[]');

    sessionStorage.setItem('loadedFromDraft', 'true');

    window.isInternalNavigation = true;

    window.location.href = '/builder/step1';
}
async function deleteDraft(index, e) {
    e.stopPropagation();
    const draft = window.ALL_DRAFTS[index];
    if (!confirm(`Delete draft "${draft.name}"?`)) return;

    await fetch('/draft/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, _delete: true })
    });

    // Remove from in-memory array and re-render without a network round-trip
    window.ALL_DRAFTS.splice(index, 1);

    // Determine which container is currently active
    const overlayOpen = document.getElementById('draftOverlay')?.classList.contains('active');
    const targetId = overlayOpen ? 'draftOverlayList' : 'comp-list';

    if (!window.ALL_DRAFTS.length) {
        document.getElementById(targetId).innerHTML = `
            <div class="drafts-empty">
                <span class="material-icons">edit_note</span>
                <p class="drafts-empty-title">No drafts yet</p>
                <p class="drafts-empty-sub">Your in-progress packages will appear here</p>
            </div>
        `;
        return;
    }

    // Re-render with corrected indices
    document.getElementById(targetId).innerHTML = window.ALL_DRAFTS.map((d, i) => `
        <div class="draft-item" style="--i:${i}">
            <div class="draft-info" onclick="loadDraft(${i})">
                <span class="material-icons draft-icon">description</span>
                <div class="draft-text">
                    <span class="draft-name">${d.name || 'Untitled'}</span>
                    <span class="draft-meta">${d.savedOn} · ${d.savedTime}</span>
                </div>
            </div>
            <span class="material-icons draft-delete"
                  onclick="deleteDraft(${i}, event)">delete_outline</span>
        </div>
    `).join('');
}

function manualSaveDraft() {
    const state = JSON.parse(sessionStorage.getItem('state') || '{}');

    const configName = sessionStorage.getItem('configName');

    const pkgType = sessionStorage.getItem('pkgType');
    const hasData = pkgType || configName ||

        state?.s2?.length || state?.s3?.length || state?.s4?.length;

    if (!hasData) {
        alert("Nothing to save as draft");
        return;
    }
    if (!configName) {
        alert("Please enter config Name to save");
        return;
    }
    const now = new Date();

    const savedOn = now.toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric'
    });

    const savedTime = now.toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit'
    });
    const payload = {

        name: configName,

        pkgType,

        pkgSubType: sessionStorage.getItem('pkgSubType'),

        savedOn,

        savedTime,

        selectedSvcs_s2: sessionStorage.getItem('selectedSvcs_s2'),

        selectedSvcs_s3: sessionStorage.getItem('selectedSvcs_s3'),

        selectedSvcs_s4: sessionStorage.getItem('selectedSvcs_s4'),

        state

    };
    fetch('/draft/save', {

        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)

    })
        .then(() => {
            alert('Draft saved — ' + configName);
        })

        .catch(() => {
            alert('Failed to save draft — ' + configName);
        });
}

function applyPrivilege() {

    const builderNode = document.getElementById('mn-builder');
    const approverNode = document.getElementById('mn-approver');
    const cloneNode = document.getElementById('mn-clone');

    const hasBuilder = PRIVILEGE_IDS.includes("P26125");
    const hasApprover = PRIVILEGE_IDS.includes("P26126");
    const hasClone = PRIVILEGE_IDS.includes("P26127");

    // Hide nodes individually
    if (!hasBuilder && builderNode) {
        builderNode.style.display = "none";
    }

    if (!hasApprover && approverNode) {
        approverNode.style.display = "none";
    }

    // if (!hasClone && cloneNode) {
    //     cloneNode.style.display = "none";
    // }
}

/*async function checkDraftsOnLogin() {
    const isBuilderPage = window.location.pathname.startsWith('/builder/step');
    if (!isBuilderPage) return;
    if (!window.location.pathname.includes('step1')) return;

    const state = JSON.parse(sessionStorage.getItem('state') || '{}');
    const pkgType = sessionStorage.getItem('pkgType');
    if (pkgType || state?.s2?.length) return;

    try {
        const res = await fetch('/draft/list');
        const drafts = await res.json();

        if (!drafts.length) return;

        // OPEN DRAFT PANEL
        openDrafts();

    } catch (err) {
        console.error('Draft check failed', err);
    }
}*/

// ── Apply privilege on load ──
window.addEventListener('DOMContentLoaded', () => {

    applyPrivilege();
    restoreActiveModule();
    restoreConfigName();

    // mark all step navigation as internal so draft save is skipped
    document.querySelectorAll('.step-node, .main-node').forEach(link => {
        link.addEventListener('click', () => {
            window.isInternalNavigation = true;
        });
    });
});

// ── Restore active module based on current URL ──
function restoreActiveModule() {

    const hasBuilder = PRIVILEGE_IDS.includes("P26125");
    const hasApprover = PRIVILEGE_IDS.includes("P26126");

    const path = window.location.pathname;

    // If already in admin
    if (path.startsWith('/builder/admin')) {
        setModuleUI('approver');
        return;
    }

    // If already in builder
    if (path.startsWith('/builder/step')) {
        setModuleUI('builder');
        return;
    }

    // FIRST LOAD DECISION
    if (!hasBuilder && hasApprover) {
        window.isInternalNavigation = true;
        window.location.href = "/builder/admin";
    } else if (hasBuilder) {
        window.isInternalNavigation = true;
        window.location.href = "/builder/step1";
    }
}

// ── Activate module (called from main-rail anchor click) ──
function activateModule(module, el) {

    const hasBuilder = PRIVILEGE_IDS.includes("P26125");
    const hasApprover = PRIVILEGE_IDS.includes("P26126");
    const hasClone = PRIVILEGE_IDS.includes("P26127");

    if (module === 'builder' && !hasBuilder) return false;
    if (module === 'approver' && !hasApprover) return false;
    if (module === 'clone' && !hasClone) return false;

    // RESTORE LIBRARY when switching back
    if (module === 'builder') {
        const container = document.getElementById('comp-list');

        if (window._libraryCache !== undefined) {
            container.innerHTML = window._libraryCache;
        } else if (typeof refreshSidebar === 'function') {
            refreshSidebar();
        }
    }

    setModuleUI(module);
    return true;
}

function setModuleUI(module) {

    const stepRail = document.getElementById('stepRail');
    const sidebar = document.getElementById('sidebar');
    const builderNode = document.getElementById('mn-builder');
    const approverNode = document.getElementById('mn-approver');
    const configInput = document.getElementById('configName');

    // ── Active node highlight ──
    const cloneNode = document.getElementById('mn-clone');
    if (builderNode) builderNode.classList.toggle('active', module === 'builder');
    if (approverNode) approverNode.classList.toggle('active', module === 'approver');
    if (cloneNode) cloneNode.classList.toggle('active', module === 'clone');

    if (module === 'clone') {
        if (stepRail) stepRail.classList.add('collapsed');
        if (sidebar) sidebar.classList.add('collapsed');
        if (footerActions) footerActions.style.display = 'none';
        if (configInput) configInput.style.display = 'none';
    } else if (module === 'builder') {
        if (stepRail) stepRail.classList.remove('collapsed');
        if (footerActions) footerActions.style.display = 'flex';
        if (configInput) configInput.style.display = 'block';

        // Sidebar visible only on steps 2, 3, 4
        const step = getActiveStep();
        if (sidebar) {
            if (step === 2 || step === 3 || step === 4) {
                sidebar.classList.remove('collapsed');
                // Ensure search bar is present once sidebar is visible
                requestAnimationFrame(() => initLibrarySearch());
            } else {
                sidebar.classList.add('collapsed');
            }
        }

        // Hierarchy button visible only on step 5
        applyHierarchyButtonVisibility(step);

    } else {
        // Approver — collapse step rail + sidebar (they're irrelevant)
        if (stepRail) stepRail.classList.add('collapsed');
        if (sidebar) sidebar.classList.add('collapsed');
        if (footerActions) footerActions.style.display = 'none';
        if (configInput) configInput.style.display = 'none';
    }
}

// Returns the current active step number (1-5) from the URL, or 0 for non-step pages
function getActiveStep() {
    const match = window.location.pathname.match(/step(\d)/);
    return match ? parseInt(match[1], 10) : 0;
}

// Shows/hides the Hierarchy button — only visible on step 5
function applyHierarchyButtonVisibility(step) {
    // The Hierarchy button is the first btn-hierarchy in footerActions
    const hierarchyBtn = document.querySelector('#footerActions .btn-hierarchy');
    if (hierarchyBtn) {
        hierarchyBtn.style.display = (step === 5) ? 'inline-flex' : 'none';
    }
}

// ═══════════════════════════════════════════════════════
//  LIBRARY SEARCH
// ═══════════════════════════════════════════════════════

// Call this once the sidebar is populated (from step JS after loadLibrary/refreshSidebar)
function initLibrarySearch() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // Don't inject twice
    if (document.getElementById('librarySearchInput')) return;

    const searchWrapper = document.createElement('div');
    searchWrapper.id = 'librarySearchWrapper';
    searchWrapper.innerHTML = `
        <div class="library-search-box">
            <span class="material-icons library-search-icon">search</span>
            <input
                id="librarySearchInput"
                class="library-search-input"
                type="text"
                placeholder="Search packages..."
                autocomplete="off"
            />
            <span class="material-icons library-search-clear" id="librarySearchClear"
                  onclick="clearLibrarySearch()" title="Clear">close</span>
        </div>
    `;

    // Insert before the sidebar-content div
    const content = document.getElementById('comp-list');
    if (content && content.parentNode) {
        content.parentNode.insertBefore(searchWrapper, content);
    }

    document.getElementById('librarySearchInput').addEventListener('input', function () {
        filterLibraryItems(this.value.trim());
        const clearBtn = document.getElementById('librarySearchClear');
        if (clearBtn) clearBtn.style.opacity = this.value ? '1' : '0';
    });
}

function clearLibrarySearch() {
    const input = document.getElementById('librarySearchInput');
    if (input) {
        input.value = '';
        input.dispatchEvent(new Event('input'));
        input.focus();
    }
}

function hasTrigramMatch(text, query) {

    if (!query) return true;

    return text
        .toLowerCase()
        .includes(
            query.toLowerCase()
        );
}

function filterLibraryItems(query) {

    const container =

        document.getElementById('comp-list');

    if (!container) return;

    const items =

        container.querySelectorAll(

            '[data-name], .comp-card, .service-card, .library-item, .comp-item, .sidebar-item'

        );

    let visibleCount = 0;


    if (!items.length) {

        const children =

            container.children;

        Array.from(children).forEach(el => {

            const name =

                el.dataset.name ||

                el.textContent ||

                '';

            const match =

                hasTrigramMatch(name, query);

            el.style.display =

                match ? '' : 'none';

            if (match) visibleCount++;

        });

    } else {

        items.forEach(el => {

            const name =

                el.dataset.name ||

                el.querySelector('[data-name]')?.dataset.name ||

                el.querySelector(

                    '.comp-name, .item-name, .service-name, .card-title'

                )?.textContent ||

                el.textContent;

            const match = hasTrigramMatch(name, query);

            el.style.display = match ? '' : 'none';

            if (match) visibleCount++;

        });
    }

    // remove old message if exists
    const oldMsg = document.getElementById('noResultsMsg');

    if (oldMsg) oldMsg.remove();

    // show message if no match
    if (visibleCount === 0 && query) {

        const msg = document.createElement('div');

        msg.id = 'noResultsMsg';

        msg.className = 'no-results';

        msg.innerHTML = 'No Results Found';

        container.appendChild(msg);
    }
}

function getState() {

    const defaultState = {
        s2: [],
        s3: [],
        s4: [],
        price: "",
        publicityCode: "",
        endDate: "",
        isCorporate: false
    };

    const stored = sessionStorage.getItem('state');
    return stored ? JSON.parse(stored) : defaultState;
}

function saveState(state) {
    sessionStorage.setItem('state', JSON.stringify(state));
}

// ── Restore config name across steps ──
function restoreConfigName() {

    const input = document.getElementById('configName');
    if (!input) return;

    const savedName = sessionStorage.getItem('configName') || '';
    input.value = savedName;

    input.addEventListener('input', () => {
        sessionStorage.setItem('configName', input.value);
    });
}

function resetBuilder() {
    const state = JSON.parse(sessionStorage.getItem('state') || '{}');
    const pkgType = sessionStorage.getItem('pkgType');
    const configName = sessionStorage.getItem('configName');

    const isEmpty = !pkgType && !configName &&
        !state.s2?.length && !state.s3?.length && !state.s4?.length;

    if (isEmpty) {
        alert('Nothing to reset — Builder is already empty.');
        return;
    }

    if (!confirm('Reset all selections and start over?')) return;
    clearBuilderSession();
    window.isInternalNavigation = true;
    window.location.href = '/builder/step1';
}

// ═══════════════════════════════════════════════════════
//  STEP ACCESS GUARD
// ═══════════════════════════════════════════════════════
function checkStepAccess(targetStep) {

    const currentPath = window.location.pathname;

    if (currentPath.includes(`step${targetStep}`)) return true;
    if (targetStep === 1) return true;

    const pkgType = sessionStorage.getItem('pkgType');
    const state = JSON.parse(sessionStorage.getItem('state') || '{}');

    if (!pkgType) {
        alert("Please select PREPAID or POSTPAID in Step 1");
        return false;
    }

    const hasStep2Data = state.s2 && Array.isArray(state.s2) && state.s2.length > 0;

    if (targetStep > 2 && !hasStep2Data) {
        alert("Please select a Service Plan in Step 2");
        return false;
    }

    return true;
}

// ═══════════════════════════════════════════════════════
//  USER MENU
// ═══════════════════════════════════════════════════════
function toggleUserMenu() {
    const dropdown = document.getElementById("userDropdown");
    dropdown.classList.toggle("active");
}

document.addEventListener("click", function (e) {
    const menu = document.querySelector(".user-menu");
    if (menu && !menu.contains(e.target)) {
        const dd = document.getElementById("userDropdown");
        if (dd) dd.classList.remove("active");
    }
});

// ═══════════════════════════════════════════════════════
//  SAVE PACKAGE CONFIGURATION
// ═══════════════════════════════════════════════════════
async function saveConfiguration() {

    const configName = document.getElementById("configName").value;

    if (!configName) {
        alert("Enter Configuration Name");
        return;
    }

    const state = JSON.parse(sessionStorage.getItem("state"));

    const isUpdate = sessionStorage.getItem("isUpdate") === "true";

    if (!state?.s2?.length) {
        alert('Service Plan selection in Step 2 is required');
        return;
    }

    if (!state.price) {
        alert("Enter charge amount");
        return;
    }

    if (!state.endDate) {
        alert("Select end date");
        return;
    }

    if (!state.publicityCode) {
        alert("Enter publicity code");
        return;
    }

    const chargeId = configName + "_PR";

    function formatDateToMMDDYYYY(dateStr) {

        if (!dateStr) return "12/31/2030";

        const [year, month, day] =
            dateStr.split("-");

        return `${month}/${day}/${year}`;
    }

    const payload = {

        username: USERNAME,

        isUpdate: isUpdate,

        submittedOn: new Date().toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }),

        packageType: sessionStorage.getItem("pkgType"),

        tariffPackCategory: sessionStorage.getItem("pkgSubType") ||
            "NORMAL",

        tariffPackageDesc: configName,

        charge: state.price,

        endDate: formatDateToMMDDYYYY(state.endDate),

        publicityId: state.publicityCode,

        chargeId: chargeId,

        isCorporateYn: state.isCorporate,

        tariffPlanId: Number(state.s2[0].id),

        tariffPlanName: state.s2[0].name,

        selectedSvcs_s2: sessionStorage.getItem('selectedSvcs_s2') || '[]',

        selectedSvcs_s3: sessionStorage.getItem('selectedSvcs_s3') || '[]',

        selectedSvcs_s4: sessionStorage.getItem('selectedSvcs_s4') || '[]',

        defaultAtps: (state.s3 || []).map(item => ({

            servicePackageId: Number(item.id),

            chargeId: chargeId,

            packageName: item.name,

            validity: item.validity,

            rentalPeriod: item.validity === 'O' ? (item.rentalPeriod || 1) : "",

            midnightExpiry: item.midnightExpiry,

            renewal: item.renewal,

            rental: item.rental || 0,

            maxCount: item.maxCount || 0,

            freeCycles: item.freeCycles || 0
        })),

        allowedAtps: (state.s4 || []).map(item => ({

            servicePackageId: Number(item.id),

            chargeId: chargeId,

            packageName: item.name,

            validity: item.validity,

            rentalPeriod: item.validity === 'O' ? (item.rentalPeriod || 1) : "",

            midnightExpiry: item.midnightExpiry,

            renewal: item.renewal,

            rental: item.rental || 0,

            maxCount: item.maxCount || 0,

            freeCycles: item.freeCycles || 0
        }))
    };

    console.log("REQUEST", payload);

    try {

        const response =
            await fetch("/prepareSaveConfig", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify(payload)
            });

        const result = await response.json();

        if (!response.ok || result.error) {

            alert(result.error || "Validation failed");
            return;
        }

        alert(result.message);

        if (sessionStorage.getItem('loadedFromDraft') === 'true') {
            const draftName = sessionStorage.getItem('configName');
            if (draftName) {
                fetch('/draft/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: draftName, _delete: true })
                });
            }
        }

        clearBuilderSession();

        window.isInternalNavigation = true;

        window.location.href = "/builder/step1";
    } catch (error) {
        console.error(error);
        alert("Server error — please try again");
    }
}

function clearBuilderSession() {
    sessionStorage.removeItem('state');
    sessionStorage.removeItem('selectedSvcs_s2');
    sessionStorage.removeItem('selectedSvcs_s3');
    sessionStorage.removeItem('selectedSvcs_s4');
    sessionStorage.removeItem('configName');
    sessionStorage.removeItem('pkgType');
    sessionStorage.removeItem('pkgSubType');
    sessionStorage.removeItem("isUpdate");
    sessionStorage.removeItem('loadedFromDraft');
    sessionStorage.removeItem('cloneMode');
    sessionStorage.removeItem('cloneTpName');
    sessionStorage.removeItem('cloneNetworkId');
    sessionStorage.removeItem('cloneUsername');
}

// ═══════════════════════════════════════════════════════
//  HIERARCHY MODAL
// ═══════════════════════════════════════════════════════
function viewTree() {
    const state = getState();
    const name = document.getElementById('configName').value || 'Unnamed Package';
    const type = sessionStorage.getItem('pkgType') || '';
    const sub = sessionStorage.getItem('pkgSubType') || 'NORMAL';

    document.getElementById('treeName').textContent = name;
    document.getElementById('treeMeta').textContent = `${type ? type + ' | ' : ''}${sub} | ${state.isCorporate ? 'Corporate' : 'Retail'}`;
    document.getElementById('treeMain').textContent = `📦 Main Service Plan: ${state.s2 && state.s2[0] ? state.s2[0].name : 'None'}`;
    const datpNames = (state.s3 || []).map(item => item.name).join(', ');
    const aatpNames = (state.s4 || []).map(item => item.name).join(', ');

    document.getElementById('treeDatp').innerHTML = `
        <div class="tree-section">
            <div class="tree-section-title">➕ DATP Components</div>
            <div class="tree-tags">
                ${(state.s3 || []).length
            ? state.s3.map(item =>
                `<span class="tree-tag">${item.name}</span>`
            ).join('')
            : '<span class="tree-empty">No DATP Components</span>'
        }
            </div>
        </div>
    `;

    document.getElementById('treeAatp').innerHTML = `
        <div class="tree-section">
            <div class="tree-section-title">🛒 AATP Components</div>
            <div class="tree-tags">
                ${(state.s4 || []).length
            ? state.s4.map(item =>
                `<span class="tree-tag">${item.name}</span>`
            ).join('')
            : '<span class="tree-empty">No AATP Components</span>'
        }
            </div>
        </div>
    `;
    document.getElementById('treeCharge').innerHTML = `<b>Charge: RM ${state.price || '0.00'}</b> | <b>Ends: ${state.endDate || 'Permanent'}</b>`;

    document.getElementById('treeModal').classList.add('open');
}

function closeTree() {
    document.getElementById('treeModal').classList.remove('open');
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeTree();
});

// ═══════════════════════════════════════════════════════
//  LOGOUT
// ═══════════════════════════════════════════════════════
function logout() {
    sessionStorage.clear();
    window.location.href = '/logout';
}

const storedSessionId = sessionStorage.getItem("SESSION_ID");

if (SESSION_ID && storedSessionId !== SESSION_ID) {
    clearBuilderSession(); // safer
    sessionStorage.setItem("SESSION_ID", SESSION_ID);
}

// ═══════════════════════════════════════════════════════
//  ADMIN — TWO-PANE APPROVER UI (with working arrows)
// ═══════════════════════════════════════════════════════

function selectPackage(cardElement) {
    const tpName = cardElement.dataset.tpname;
    const isAlreadySelected = cardElement.classList.contains('selected');

    document.querySelectorAll('.approval-card').forEach(c => c.classList.remove('selected'));

    if (isAlreadySelected) {
        document.getElementById('hierarchy-view').classList.add('hidden');
        document.getElementById('no-selection').classList.remove('hidden');
        return;
    }

    cardElement.classList.add('selected');
    loadHierarchy(tpName);
}

function loadHierarchy(tpName) {

    const VALIDITY_LABELS = {
        'M': 'Monthly', 'O': 'Others', 'D': 'Daily',
        'W': 'Weekly', 'F': 'Fixed', 'U': 'Unlimited', 'Y': 'Yearly'
    };
    function validityLabel(code) {
        if (!code || code === '—') return code || '—';
        return VALIDITY_LABELS[code] || code;
    }

    fetch('/admin/hierarchy/' + tpName)
        .then(res => res.json())
        .then(tp => {
            if (!tp || !tp.data) {
                alert("No hierarchy data found");
                return;
            }

            const data = tp.data || {};

            // Switch views
            document.getElementById('no-selection').classList.add('hidden');
            document.getElementById('no-packages')?.classList.add('hidden');
            const view = document.getElementById('hierarchy-view');
            view.classList.remove('hidden');

            // Header
            document.getElementById('h-name').textContent = data.tariffPackageDesc || tpName;

            const metaHTML = `
			<span class="meta-pill">
			        <span class="pill-label">Billing Type</span>
			        <span class="pill-value">${data.packageType}</span>
			    </span>
			    <span class="meta-pill">
			        <span class="pill-label">Category</span>
			        <span class="pill-value">${data.tariffPackCategory || 'Normal'}</span>
			    </span>
			    <span class="meta-pill">
			        <span class="pill-label">Segment</span>
			        <span class="pill-value">${data.isCorporateYn ? 'Corporate' : 'Retail'}</span>
			    </span>
			`;
            document.getElementById('h-meta').innerHTML = metaHTML;
            document.getElementById('h-meta').innerHTML = metaHTML;

            const submittedBy = data.username || '—';
            const submittedOn = data.submittedOn || '—';
            document.getElementById('h-submeta').innerHTML = `
                <span>Submitted by <strong>${data.username || '—'}</strong></span>
                <span>${data.submittedOn || '—'}</span>
            `;

            // Main Plan
            document.getElementById('h-main-header').textContent =
                `📦 ${data.tariffPlanName || 'None'}`;

            // DATP Components
            const datp = data.defaultAtps || [];
            document.getElementById('h-datp-header').textContent = `🛒 DATP - ${datp.length} COMPONENTS`;
            const datpHtml = datp.map(item => `
                <div class="component-box">
                    <div class="comp-name">${item.packageName}</div>
                    <div class="comp-details">
                        <span class="pill"><strong>Validity:</strong> ${validityLabel(item.validity)}</span>
                        ${item.validity === 'O' && item.validityDays ? `<span class="pill"><strong>Validity Days:</strong> ${item.validityDays}</span>` : ''}
                        <span class="pill"><strong>Midnight Expiry:</strong> ${item.midnightExpiry || '—'}</span>
                        <span class="pill"><strong>Renewal:</strong> ${item.renewal || '—'}</span>
                        <span class="pill"><strong>Rental:</strong> ${item.rental || '0'}</span>
                        <span class="pill"><strong>Max Count:</strong> ${item.maxCount || '0'}</span>
                        <span class="pill"><strong>Free Cycles:</strong> ${item.freeCycles || '0'}</span>
                    </div>
                </div>
            `).join('');

            document.getElementById('h-datp').innerHTML = datpHtml || '<p style="color:#94a3b8; font-size:13px; padding:8px 0;">No DATP components</p>';

            // AATP Components
            const aatp = data.allowedAtps || [];
            document.getElementById('h-aatp-header').textContent = `➕ AATP - ${aatp.length} COMPONENTS`;
            const aatpHtml = aatp.map(item => `
                <div class="component-box">
                    <div class="comp-name">${item.packageName}</div>
                    <div class="comp-details">
                        <span class="pill"><strong>Validity:</strong> ${validityLabel(item.validity)}</span>
                        ${item.validity === 'O' && item.validityDays ? `<span class="pill"><strong>Validity Days:</strong> ${item.validityDays}</span>` : ''}
                        <span class="pill"><strong>Midnight Expiry:</strong> ${item.midnightExpiry || '—'}</span>
                        <span class="pill"><strong>Renewal:</strong> ${item.renewal || '—'}</span>
                        <span class="pill"><strong>Rental:</strong> ${item.rental || '0'}</span>
                        <span class="pill"><strong>Max Count:</strong> ${item.maxCount || '0'}</span>
                        <span class="pill"><strong>Free Cycles:</strong> ${item.freeCycles || '0'}</span>
                    </div>
                </div>
            `).join('');

            document.getElementById('h-aatp').innerHTML = aatpHtml || '<p style="color:#94a3b8; font-size:13px; padding:8px 0;">No AATP components</p>';

            // Footer
            document.getElementById('h-footer-bar').innerHTML = `
                <div><b>Charge:</b> RM ${data.charge}</div>
                <div><b>Ends:</b> ${data.endDate}</div>
            `;
        })
        .catch(err => {
            console.error(err);
            alert("Could not load hierarchy");
        });
}

function approvePackage(tpName, btn) {

    event.stopImmediatePropagation();

    if (!confirm("Approve " + tpName + " ?"))
        return;

    fetch("/approve/" + tpName, {
        method: "POST"
    })
        .then(res => {

            if (!res.ok)
                throw new Error("Approve failed");

            return res.json();
        })
        .then(data => {

            console.log("APPROVED", data);

            alert(tpName + ' approved, ' + "Tariff Package Created with ID : "
                + data.tariffPackageId);

            window.location.href = '/builder/admin';

        })
        .catch(err => {

            console.error(err);

            alert("Error approving tariff");
        });
}

/* REJECT */
function rejectPackage(tpName, btn) {

    event.stopImmediatePropagation();

    if (!confirm("Reject " + tpName + " ?"))
        return;

    fetch("/reject/" + tpName, {
        method: "POST"
    })
        .then(res => {

            if (!res.ok)
                throw new Error("Reject failed");

            return res.json();
        })
        .then(data => {

            console.log("REJECTED", data);

            alert(tpName + ' rejected');

            window.location.href = '/builder/admin';

        })
        .catch(err => {

            console.error(err);

            alert("Error rejecting tariff");
        });
}

function openSaved() {

    const overlay =
        document.getElementById('savedOverlay');

    overlay.style.display = 'block';

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            overlay.classList.add('active');
        });
    });

    loadSaved();
}

function loadSaved() {

    const container =
        document.getElementById('savedOverlayList');

    container.innerHTML =
        '<p class="sidebar-text">Loading...</p>';

    fetch('/saved/list')

        .then(res => res.json())

        .then(data => {

            // convert map → array
            const configs =
                Object.values(data);

            if (!configs.length) {

                container.innerHTML = `
 
                <div class="drafts-empty">
 
                    <span class="material-icons">
                        inventory_2
                    </span>
 
                    <p class="drafts-empty-title">
                        No saved configs
                    </p>
 
                </div>
            `;

                return;
            }

            window.ALL_SAVED =
                configs;

            container.innerHTML =

                configs.map((c, i) => `
 
                    <div class="draft-item saved">
                        <div class="draft-info"
                            onclick="loadSavedPackage(${i})">
                            <span class="material-icons draft-icon">inventory_2</span>
                            <div class="draft-text">
                                <span class="draft-name">${c.tpName}</span>
                                <span class="draft-meta">${c.username} · ${c.data?.submittedOn || ''}</span>
                            </div>
                        </div>

                        <span class="material-icons draft-delete"
                            onclick="deleteSaved('${c.tpName}', event)">
                            delete_outline
                        </span>
                    </div>
            `).join("");
        })

        .catch(() => {

            container.innerHTML =
                '<p>Error loading configs</p>';
        });
}

function loadSavedPackage(index) {

    const config =
        window.ALL_SAVED[index];

    const d =
        config.data;

    /*
       convert saved format → builder state
    */

    const state = {

        s2: [{
            id: d.tariffPlanId,
            name: d.tariffPlanName
        }],

        s3: (d.defaultAtps || []).map(a => ({

            id: a.servicePackageId,
            name: a.packageName,
            validity: a.validity,
            rentalPeriod: a.rentalPeriod || "",
            midnightExpiry: a.midnightExpiry,
            renewal: a.renewal,
            rental: a.rental,
            maxCount: a.maxCount,
            freeCycles: a.freeCycles

        })),

        s4: (d.allowedAtps || d.additionalAtps || []).map(a => ({

            id: a.servicePackageId,
            name: a.packageName,
            validity: a.validity,
            rentalPeriod: a.rentalPeriod || "",
            midnightExpiry: a.midnightExpiry,
            renewal: a.renewal,
            rental: a.rental,
            maxCount: a.maxCount,
            freeCycles: a.freeCycles

        })),

        price: d.charge,

        publicityCode: d.publicityId,

        endDate: (function () {

            if (!d.endDate) return "";

            var p = d.endDate.split("/");

            if (p.length === 3)
                return p[2] + "-" + p[0] + "-" + p[1];

            return d.endDate;
        })(),

        isCorporate: d.isCorporateYn
    };

    /*
       SAME keys as draft loader
    */

    sessionStorage.setItem(
        "state",
        JSON.stringify(state)
    );

    sessionStorage.setItem(
        "configName",
        config.tpName
    );

    sessionStorage.setItem(
        "pkgType",
        d.packageType
    );

    sessionStorage.setItem(
        "pkgSubType",
        d.tariffPackCategory
    );

    /*
       IMPORTANT for sidebar selections
    */

    sessionStorage.setItem(
        "selectedSvcs_s2",
        d.selectedSvcs_s2 || '[]'
    );

    sessionStorage.setItem(
        "selectedSvcs_s3",
        d.selectedSvcs_s3 || '[]'
    );

    sessionStorage.setItem(
        "selectedSvcs_s4",
        d.selectedSvcs_s4 || '[]'
    );

    sessionStorage.setItem("isUpdate", "true");

    window.isInternalNavigation = true;

    window.location.href =
        "/builder/step1";
}

function deleteSaved(tpName, e) {
    e.stopPropagation();

    if (!confirm(`Delete "${tpName}"?`)) return;

    fetch('/saved/delete/' + tpName, {
        method: 'POST'
    })
        .then(() => {
            // remove from UI instantly
            loadSaved(); // reload list
        })
        .catch(() => {
            alert("Delete failed ");
        });
}

function closeSaved() {
    const overlay = document.getElementById('savedOverlay');
    overlay.classList.remove('active');

    // Hide after slide-out transition completes
    overlay.addEventListener('transitionend', function handler() {
        if (!overlay.classList.contains('active')) {
            overlay.style.display = 'none';
        }
        overlay.removeEventListener('transitionend', handler);
    });
}

document.addEventListener('click', function (e) {
    if (e.target.id === 'savedOverlay') {
        closeSaved();
    }
});

function goBack() {
    const step = getActiveStep();

    if (step <= 1) return;

    window.isInternalNavigation = true;
    window.location.href = `/builder/step${step - 1}`;
}

function goNext() {
    const step = getActiveStep();

    if (!checkStepAccess(step + 1)) return;

    if (step >= 5) return;

    window.isInternalNavigation = true;
    window.location.href = `/builder/step${step + 1}`;
}

// ═══════════════════════════════════════════════════════
//  PLAN HOVER TOOLTIP
// ═══════════════════════════════════════════════════════

(function initPlanHoverTooltip() {

    if (window.location.pathname.includes('/builder/step2')) return;
    // ── Create a single shared tooltip element ──
    const tooltip = document.createElement('div');
    tooltip.id = 'planHoverTooltip';
    tooltip.style.cssText = `
        position: fixed;
        z-index: 9999;
        background: #1e293b;
        color: #f1f5f9;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 8px 14px;
        font-size: 10px;
        line-height: 1.5;
        max-width: 280px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35);
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease;
        white-space: pre-wrap;
        word-break: break-word;
    `;
    document.body.appendChild(tooltip);

    // Cache: packageId → response string (avoids duplicate API calls)
    const _tooltipCache = {};
    // Track in-flight requests to avoid duplicates
    const _inFlight = {};

    function showTooltip(text, x, y) {
        tooltip.textContent = text;
        positionTooltip(x, y);
        tooltip.style.opacity = '1';
    }

    function hideTooltip() {
        tooltip.style.opacity = '0';
    }

    function positionTooltip(x, y) {
        const GAP = 12;
        const tw = tooltip.offsetWidth || 280;
        const th = tooltip.offsetHeight || 60;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let left = x + GAP;
        let top = y + GAP;

        if (left + tw > vw - 8) left = x - tw - GAP;
        if (top + th > vh - 8) top = y - th - GAP;

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    }

    // ── Delegate hover on #comp-list plan cards ──
    document.addEventListener('mouseover', function (e) {
        const card = e.target.closest('[data-network-id][data-package-id], [data-networkid][data-packageid]');
        if (!card) return;

        const networkId = card.dataset.networkId || card.dataset.networkid;
        const servicePackageId = card.dataset.packageId || card.dataset.packageid;
        if (!networkId || !servicePackageId) return;

        const cacheKey = networkId + ':' + servicePackageId;

        // If cached, show immediately
        if (_tooltipCache[cacheKey]) {
            showTooltip(_tooltipCache[cacheKey], e.clientX, e.clientY);
            return;
        }

        // Show loading state while fetching
        showTooltip('Loading...', e.clientX, e.clientY);

        // Skip if already fetching
        if (_inFlight[cacheKey]) return;
        _inFlight[cacheKey] = true;

        fetch('/description', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ networkId, servicePackageId })
        })
            .then(res => res.json())   // parse JSON first
            .then(data => {
                console.log("API RESPONSE:", data);
                const description = data.description;  // adjust based on backend

                _tooltipCache[cacheKey] = description || '—';

                showTooltip(_tooltipCache[cacheKey], e.clientX, e.clientY);
            })
            .catch(() => {
                _tooltipCache[cacheKey] = 'Description unavailable';
            })
            .finally(() => {
                delete _inFlight[cacheKey];
            });
    });

    // ── Follow mouse while inside the card ──
    document.addEventListener('mousemove', function (e) {
        if (tooltip.style.opacity === '1') {
            positionTooltip(e.clientX, e.clientY);
        }
    });

    // ── Hide when leaving the card ──
    document.addEventListener('mouseout', function (e) {
        const card = e.target.closest('[data-network-id][data-package-id], [data-networkid][data-packageid]');
        if (!card) return;
        if (!card.contains(e.relatedTarget)) {
            hideTooltip();
        }
    });
    document.addEventListener('mouseover', function (e) {
        if (!e.target.closest('[data-network-id][data-package-id], [data-networkid][data-packageid]')) {
            hideTooltip();
        }
    });

})();

(function initClock() {
    const clockEl = document.getElementById('navClock');
    if (!clockEl) return;

    function tick() {
        clockEl.textContent = new Date().toLocaleString('en-GB', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    }

    tick();
    setInterval(tick, 1000);
})();

/* ═══════════════════════════════════════════════════════════
   CLONE TPS PAGE  —  append to bottom of layout.js
   No overlay, no backdrop — replaces workspace content like admin mode
════════════════════════════════════════════════════════════ */

// ── Mock data (swap fetch() in when API is ready) ─────────
const TP_PLANS_MOCK = [
    {
        id: 'tp-001',
        tag: 'Individual plan',
        price: '449',
        currency: '₹',
        period: '/m+GST',
        data: 'unlimited',
        dataLabel: '4G & 5G DATA',
        calls: 'unlimited',
        callsLabel: 'CALLS',
        otts: [
            { label: '⚡', bg: '#e63946' },
            { label: 'G1', bg: '#4285f4' },
            { label: 'LS', bg: '#6c47ff' },
            { label: 'HP', bg: '#00b37e' },
        ],
        ottExtra: 4,
    },
    {
        id: 'tp-002',
        tag: 'Individual plan',
        price: '549',
        currency: '₹',
        period: '/m+GST',
        data: 'unlimited',
        dataLabel: '4G & 5G DATA',
        calls: 'unlimited',
        callsLabel: 'CALLS',
        otts: [
            { label: '⚡', bg: '#e63946' },
            { label: 'PV', bg: '#00a8e1' },
            { label: 'G1', bg: '#4285f4' },
            { label: 'LS', bg: '#6c47ff' },
        ],
        ottExtra: 5,
    },
    {
        id: 'tp-003',
        tag: '1 regular + 1 free add-on SIMs',
        price: '699',
        currency: '₹',
        period: '/m+GST',
        data: 'unlimited',
        dataLabel: '4G & 5G DATA',
        calls: 'unlimited',
        callsLabel: 'CALLS',
        otts: [
            { label: '⚡', bg: '#e63946' },
            { label: 'PV', bg: '#00a8e1' },
            { label: 'G1', bg: '#4285f4' },
            { label: 'LS', bg: '#6c47ff' },
        ],
        ottExtra: 5,
    },
    {
        id: 'tp-004',
        tag: '1 regular + 2 free add-on SIMs',
        price: '999',
        currency: '₹',
        period: '/m+GST',
        data: 'unlimited',
        dataLabel: '4G & 5G DATA',
        calls: 'unlimited',
        callsLabel: 'CALLS',
        otts: [
            { label: '⚡', bg: '#e63946' },
            { label: 'PV', bg: '#00a8e1' },
            { label: 'G1', bg: '#4285f4' },
            { label: 'TV', bg: '#111111' },
        ],
        ottExtra: 7,
    },
    {
        id: 'tp-005',
        tag: '1 regular + 3 free add-on SIMs',
        price: '1199',
        currency: '₹',
        period: '/m+GST',
        data: 'unlimited',
        dataLabel: '4G & 5G DATA',
        calls: 'unlimited',
        callsLabel: 'CALLS',
        otts: [
            { label: '⚡', bg: '#e63946' },
            { label: 'PV', bg: '#00a8e1' },
            { label: 'G1', bg: '#4285f4' },
            { label: 'TV', bg: '#111111' },
        ],
        ottExtra: 7,
    },
    {
        id: 'tp-006',
        tag: '1 regular + 3 free add-on SIMs',
        price: '1399',
        currency: '₹',
        period: '/m+GST',
        data: 'unlimited',
        dataLabel: '4G & 5G DATA',
        calls: 'unlimited',
        callsLabel: 'CALLS',
        otts: [
            { label: '⚡', bg: '#e63946' },
            { label: 'N', bg: '#e50914' },
            { label: 'PV', bg: '#00a8e1' },
            { label: 'G1', bg: '#4285f4' },
        ],
        ottExtra: 8,
    },
];

// ── Filter state ──────────────────────────────────────────
const _tpFilter = { category: null, validity: null, price: null };

function openFilterModal() {
    document.getElementById('tpFilterModal').classList.add('active');
}

function _filterOverlayClick(e) {
    if (e.target === document.getElementById('tpFilterModal')) {
        document.getElementById('tpFilterModal').classList.remove('active');
    }
}

function _tpfChip(btn, group) {
    // toggle within group (single-select per group)
    const row = document.getElementById('tpf-' + group);
    row.querySelectorAll('.tpf-chip').forEach(c => c.classList.remove('selected'));
    const alreadySelected = _tpFilter[group] === btn.dataset.val;
    if (alreadySelected) {
        _tpFilter[group] = null;
    } else {
        btn.classList.add('selected');
        _tpFilter[group] = btn.dataset.val;
    }
    _tpfUpdateFooter();
}

function _tpfUpdateFooter() {
    const anyActive = _tpFilter.category || _tpFilter.validity || _tpFilter.price;
    const showBtn = document.getElementById('tpfShowBtn');
    showBtn.disabled = !anyActive;

    // update badge on Filter button
    const count = [_tpFilter.category, _tpFilter.validity, _tpFilter.price].filter(Boolean).length;
    const badge = document.getElementById('cloneFilterBadge');
    const filterBtn = document.getElementById('cloneFilterBtn');
    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-flex';
        filterBtn.classList.add('active');
    } else {
        badge.style.display = 'none';
        filterBtn.classList.remove('active');
    }
}

function _tpfClearAll() {
    _tpFilter.category = null;
    _tpFilter.validity = null;
    _tpFilter.price = null;
    document.querySelectorAll('.tpf-chip').forEach(c => c.classList.remove('selected'));
    _tpfUpdateFooter();
    _applyTpSearch(document.getElementById('cloneSearchInput')?.value || '');
    document.getElementById('tpFilterModal').classList.remove('active');
}

function _tpfApply() {
    document.getElementById('tpFilterModal').classList.remove('active');
    _applyTpSearch(document.getElementById('cloneSearchInput')?.value || '');
}

// ── Selection state ───────────────────────────────────────
const _tpSelected = new Set();

// ── Open ──────────────────────────────────────────────────
function openClone() {
    const page = document.getElementById('clonePage');
    const workBody = document.getElementById('leftPane')?.parentElement; // .workspace-body
    const headerPill = document.querySelector('.header-pill-bar');
    const stepRail = document.getElementById('stepRail');
    const sidebar = document.getElementById('sidebar');

    if (!page) return;

    // 1. Hide the normal workspace content (like admin mode does)
    if (workBody) workBody.style.display = 'none';
    if (headerPill) headerPill.style.display = 'none';

    // 2. Collapse step-rail & sidebar (clone page doesn't need them)
    //    setModuleUI handles nav highlight + rail/sidebar state
    setModuleUI('clone');

    // 3. Show the clone page container (flex, then animate in)
    _tpSelected.clear();
    _tpfClearAll();   // reset filters on every open
    page.style.display = 'flex';

    // Clear search input
    const si = document.getElementById('cloneSearchInput');
    if (si) si.value = '';

    // Trigger CSS transition on next paint
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            page.classList.add('visible');
        });
    });

    // 4. Fetch real data from API and render cards
    _loadAndRenderTpCards();
}

// ── Close ─────────────────────────────────────────────────
function closeClonePage() {
    const page = document.getElementById('clonePage');
    const workBody = document.getElementById('leftPane')?.parentElement;
    const headerPill = document.querySelector('.header-pill-bar');
    const stepRail = document.getElementById('stepRail');
    const sidebar = document.getElementById('sidebar');

    if (!page) return;

    // Animate out
    page.classList.remove('visible');

    // After transition ends, restore workspace
    page.addEventListener('transitionend', function _restore(e) {
        if (e.propertyName !== 'opacity') return;
        page.removeEventListener('transitionend', _restore);
        page.style.display = 'none';

        // Restore workspace body + header
        if (workBody) workBody.style.display = '';
        if (headerPill) headerPill.style.display = '';

        // Restore rails + active nav node based on current module/step
        const step = getActiveStep();
        if (step > 0) {
            setModuleUI('builder');
        } else if (window.location.pathname.startsWith('/builder/admin')) {
            setModuleUI('approver');
        }

        _tpSelected.clear();
    }, { once: false }); // we manually remove, so once:false is fine
}

// ── Render cards ──────────────────────────────────────────
// ── OTT name → asset lookup ──
// srcs[] = multiple icons for combo bundles (e.g. Netflix Prime shows both icons).
// Combo entries MUST come before their component keywords so exact match wins.
const _OTT_META = [
    // ── Combo bundles (before individual keywords) ──────────────────────────
    {
        keywords: ['netflix prime'],
        title: 'Netflix + Prime',
        srcs: [
            { src: '/images/ott/Netflix.avif', title: 'Netflix' },
            { src: '/images/ott/Prime.svg', title: 'Prime Video' }
        ],
        src: '/images/ott/Netflix.avif',
        desc: 'Netflix + Prime Video bundle'
    },
    // ── Individual OTT platforms ─────────────────────────────────────────────
    { keywords: ['netflix'], title: 'Netflix', src: '/images/ott/Netflix.avif', desc: 'Award-winning series | Movies | Documentaries' },
    { keywords: ['prime', 'amazon'], title: 'Prime Video', src: '/images/ott/Prime.svg', desc: 'Amazon Originals | Movies | Live Sports' },
    { keywords: ['hotstar', 'jiohotstar', 'disney'], title: 'JioHotstar', src: '/images/ott/Jiohotstar.svg', desc: 'TV Shows | Movies | Originals | Live Sports' },
    { keywords: ['zee5', 'zee'], title: 'ZEE5', src: '/images/ott/Zee5.svg', desc: 'Web Series | Movies | Originals in 18 languages' },
    { keywords: ['sony', 'sonyliv'], title: 'SonyLIV', src: '/images/ott/SonyLiv.svg', desc: 'Popular TV Shows | New Series | Movies' },
    { keywords: ['mxplayer', 'mx player', 'mx'], title: 'MX Player', src: '/images/ott/MX_Player.webp', desc: 'Free Movies | Web Series | Music Videos' },
    { keywords: ['saavn', 'jiosaavn', 'jio saavn'], title: 'JioSaavn', src: '/images/ott/jiosaavn.png', desc: 'Music | Podcasts | Radio | 80M+ Songs' },
    { keywords: ['fancode', 'fan code'], title: 'FanCode', src: '/images/ott/FanCode.svg', desc: 'Live Cricket | Football | Sports Streaming' },
    // ── Social / Internet services ───────────────────────────────────────────
    {
        keywords: ['facebook'],
        title: 'Facebook',
        src: '/images/ott/facebook.png',
        desc: 'Social media | Videos | Marketplace'
    },
    {
        keywords: ['instagram'],
        title: 'Instagram',
        src: '/images/ott/instagram.png',
        desc: 'Reels | Stories | Photos'
    },
    {
        keywords: ['google'],
        title: 'Google',
        src: '/images/ott/google.png',
        desc: 'Search | Maps | YouTube & more'
    },
    {
        keywords: ['twitter', 'x.com'],
        title: 'Twitter / X',
        src: '/images/ott/twitter.png',
        desc: 'News | Trends | Live conversations'
    },
    {
        keywords: ['chatgpt', 'openai', 'chat gpt'],
        title: 'ChatGPT',
        src: '/images/ott/chat-gpt.png',
        desc: 'AI assistant | Chat | Code | Writing'
    },
    {
        keywords: ['youtube'],
        title: 'YouTube',
        src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/YouTube_full-color_icon_%282017%29.svg/240px-YouTube_full-color_icon_%282017%29.svg.png',
        desc: 'Videos | Live | Shorts'
    },
    {
        keywords: ['whatsapp'],
        title: 'WhatsApp',
        src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/240px-WhatsApp.svg.png',
        desc: 'Messaging | Calls | Status'
    },
];
_OTT_META.forEach(m => { if (!m.initial) m.initial = m.title.charAt(0); });

function _ottLookup(name) {
    const lower = (name || '').toLowerCase().trim();
    // 1. Exact keyword match (e.g. "netflix prime" matches the combo entry exactly)
    const exact = _OTT_META.find(m => m.keywords.some(k => k === lower));
    if (exact) return exact;
    // 2. Longest keyword substring match so specific beats general
    const found = _OTT_META
        .filter(m => m.keywords.some(k => lower.includes(k)))
        .sort((a, b) => Math.max(...b.keywords.map(k => k.length)) - Math.max(...a.keywords.map(k => k.length)))[0];
    if (found) return found;
    return { title: name, src: null, srcs: null, desc: name, initial: name.charAt(0).toUpperCase() };
}

// Build OTT icon strip: show `max` icons then '...'
// For combo entries (srcs[]), each sub-icon counts as one slot.
function _buildOttStripHtml(rateGroupNames, max) {
    if (!rateGroupNames || !rateGroupNames.length) return '';
    let html = '';
    let shown = 0;
    for (const name of rateGroupNames) {
        if (shown >= max) break;
        const svc = _ottLookup(name);
        // Combo: render each sub-icon individually
        if (svc.srcs && svc.srcs.length) {
            for (const sub of svc.srcs) {
                if (shown >= max) break;
                html += `<img class="tp-ott-icon-img" src="${sub.src}" alt="${sub.title}" title="${sub.title}"
                         onerror="this.onerror=null;this.style.display='none';">`;
                shown++;
            }
        } else if (svc.src) {
            html += `<img class="tp-ott-icon-img" src="${svc.src}" alt="${svc.title}" title="${svc.title}"
                     onerror="this.onerror=null;this.style.display='none';">`;
            shown++;
        } else {
            html += `<span class="tp-ott-fallback-badge" title="${svc.title}">${svc.initial}</span>`;
            shown++;
        }
    }
    const remaining = rateGroupNames.length - rateGroupNames.slice(0, rateGroupNames.findIndex((_, i) => i >= rateGroupNames.length)).length;
    // Count total logical slots used vs total
    const totalSlots = rateGroupNames.reduce((acc, n) => {
        const s = _ottLookup(n);
        return acc + (s.srcs ? s.srcs.length : 1);
    }, 0);
    if (totalSlots > max) html += `<span class="tp-ott-more">+${totalSlots - max}</span>`;
    return html;
}

async function _loadAndRenderTpCards() {
    const grid = document.getElementById('clonePlanGrid');
    const countBadge = document.getElementById('clonePlanCount');
    if (!grid) return;

    grid.innerHTML = '<p style="padding:24px;color:var(--text-muted,#888)">Loading plans...</p>';

    try {
        const networkId = (typeof NETWORK_ID !== 'undefined' && NETWORK_ID) ? NETWORK_ID : '';
        if (!networkId) {
            grid.innerHTML = '<p style="padding:24px;color:var(--text-muted,#888)">Network ID not found in session.</p>';
            return;
        }

        const res = await fetch('/tariff-package-details?networkId=' + networkId);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const plans = await res.json();

        if (!plans || !plans.length) {
            grid.innerHTML = '<p style="padding:24px;color:var(--text-muted,#888)">No tariff plans found for this network.</p>';
            if (countBadge) countBadge.textContent = '0 plans';
            return;
        }

        _renderTpCards(plans);
    } catch (err) {
        console.error('Failed to load tariff plans:', err);
        grid.innerHTML = '<p style="padding:24px;color:#e63946">Failed to load plans. Please try again.</p>';
    }
}

// ── OTT service master list (cards + modal share this) ────
const _OTT_SERVICES = [
    {
        id: 'netflix',
        title: 'Netflix',
        src: '/images/ott/Netflix.avif',
        // fallback: 'https://play-lh.googleusercontent.com/TBRwjS_qfJCSj1m7zZB93FnpJM5fSpMA_wUlFDLxWAb45T9RmwBvQd5cWR5viJJOhkI=s96',
        bg: '#000000',
        desc: 'Award-winning series | Movies | Documentaries',
    },
    {
        id: 'prime',
        title: 'Prime Video',
        src: '/images/ott/Prime.svg',
        fallback: 'https://play-lh.googleusercontent.com/7GeHvHSS4mPpgXgZbEcBnXPuqstCJSnXxN3HkJ1UXlW_cDiQ6wUnrMPP9UX3Lc5s-A=s96',
        bg: '#00a8e1',
        desc: 'Amazon Originals | Movies | Live Sports',
    },
    {
        id: 'hotstar',
        title: 'JioHotstar',
        src: '/images/ott/Jiohotstar.svg',
        fallback: 'https://play-lh.googleusercontent.com/N8wdJc9fXHWNFSHjFNBmMLBIsHTMVLvQWm0wAAOOVLvPz6jPE0O3hgGiHCBUaGnETQ=s96',
        bg: '#1f80e0',
        desc: 'TV Shows | Movies | Originals | Live Sports',
    },
    {
        id: 'zee5',
        title: 'ZEE5',
        src: '/images/ott/Zee5.svg',
        fallback: 'https://play-lh.googleusercontent.com/K2YZMc-arGqQrPjBT_BBORfTCNMvkVYi6hk1UHm7nzAE3-pjBYMBvZlRmFAZsXKlg7Y=s96',
        bg: '#8b1fa9',
        desc: 'Web Series | Movies | Originals in 18 languages',
    },
    {
        id: 'sonyliv',
        title: 'SonyLIV',
        src: '/images/ott/SonyLiv.svg',
        fallback: 'https://play-lh.googleusercontent.com/5kFbAj5LrFKKb42jDAfZ-rSR7nZ5kZSgd3xyRRn2OJUyFCxXU9V9pCvMWyGKWi2xSGM=s96',
        bg: '#003087',
        desc: 'Popular TV Shows | New Series | Movies',
    },
    {
        id: 'mxplayer',
        title: 'MX Player',
        src: '/images/ott/MX_Player.webp',
        fallback: 'https://play-lh.googleusercontent.com/qJ3jUspGE6OBkBEi1sWTBYggELSMCYLKZpLKB4FbHzQJJZBLWaZ0jL-nefcNfBzGXQ=s96',
        bg: '#ff6c00',
        desc: 'Free Movies | Web Series | Music Videos',
    },
    {
        id: 'jiosaavn',
        title: 'JioSaavn',
        src: '/images/ott/JioSaavn.png',
        fallback: 'https://play-lh.googleusercontent.com/YXF5WxFIGaE89K0K5C8fX2cV7RBBLxhI7HLlWv4rTVe1P0nIlTjy4eHT9iJqOKNitFoC=s96',
        bg: '#1db954',
        desc: 'Music | Podcasts | Radio | 80M+ Songs',
    },
    {
        id: 'fancode',
        title: 'FanCode',
        src: '/images/ott/FanCode.svg',
        fallback: 'https://play-lh.googleusercontent.com/8vFMcbQ9IuRPcJKz6lHt0W_FWu_pY4HUMqz-t7k-E1I4-GHUWbPXrVvjSSvF2EbIoQ=s96',
        bg: '#e63946',
        desc: 'Live Cricket | Football | Sports Streaming',
    },
];

// ── Icons shown in plan cards (first 5 + "+N more" badge) ─
const _OTT_ICONS = _OTT_SERVICES;

// ── All loaded plans (for search filtering) ───────────────
let _allTpPlans = [];

// ── Category display order & icons ───────────────────────
const _CAT_ORDER = ['VOICE', 'SMS', 'DATA', 'VOICE_SMS'];
const _CAT_ICON = {
    VOICE: '📞',
    SMS: '💬',
    DATA: '📶',
    VOICE_SMS: '📱',
};

// ── Group flat plan array by tariffPackageDesc ────────────
// New query returns one row per tariffPackageId with separate dataBenefit /
// smsBenefit / voiceBenefit columns, so grouping is now a simple normalisation
// pass that builds the same {buckets, rateGroupNames, _raw} shape the rest of
// the rendering code expects.
function _groupPlansByDesc(plans) {
    const map = new Map();
    plans.forEach(p => {
        const key = p.tariffPackageDesc || '';
        if (!map.has(key)) {
            // Build ordered buckets from the three flat benefit columns
            const buckets = [];
            if (p.voiceBenefit) buckets.push({ balanceCategory: 'VOICE', bucketUnitValue: p.voiceBenefit });
            if (p.smsBenefit)   buckets.push({ balanceCategory: 'SMS',   bucketUnitValue: p.smsBenefit });
            if (p.dataBenefit)  buckets.push({ balanceCategory: 'DATA',  bucketUnitValue: p.dataBenefit });

            map.set(key, {
                tariffPackageDesc: key,
                tariff_package_id: p.tariff_package_id,
                activationFee: p.activationFee,
                rentalType: p.rentalType,
                rentalPeriod: p.rentalPeriod,
                buckets,
                rateGroupNames: Array.isArray(p.rateGroupNames) ? [...p.rateGroupNames] : [],
                _raw: [p],
            });
        } else {
            // Duplicate desc (shouldn't happen with the new query, but handle safely)
            const group = map.get(key);
            if (Number(p.activationFee) > Number(group.activationFee)) {
                group.activationFee = p.activationFee;
            }
            if (Array.isArray(p.rateGroupNames)) {
                p.rateGroupNames.forEach(function (name) {
                    if (name && !group.rateGroupNames.includes(name)) group.rateGroupNames.push(name);
                });
            }
            group._raw.push(p);
        }
    });

    return Array.from(map.values());
}

function _renderTpCards(plans) {
    _allTpPlans = plans;
    _applyTpSearch('');
}

function _applyTpSearch(query) {
    const grid = document.getElementById('clonePlanGrid');
    const countBadge = document.getElementById('clonePlanCount');
    if (!grid) return;

    const q = query.trim().toLowerCase();

    // 1. Text search filter — include benefit columns in search scope
    let flatFiltered = q
        ? _allTpPlans.filter(p => {
            const fee  = String(p.activationFee ?? '');
            const desc = (p.tariffPackageDesc || '').toLowerCase();
            const data = (p.dataBenefit  || '').toLowerCase();
            const sms  = (p.smsBenefit   || '').toLowerCase();
            const voice= (p.voiceBenefit || '').toLowerCase();
            return fee.includes(q) || desc.includes(q) ||
                   data.includes(q) || sms.includes(q) || voice.includes(q);
        })
        : _allTpPlans;

    // 2. Category filter — check the flat benefit columns from the new query
    if (_tpFilter.category && _tpFilter.category !== 'ALL') {
        const cat = _tpFilter.category.toUpperCase();
        flatFiltered = flatFiltered.filter(p => {
            if (cat === 'DATA')  return !!p.dataBenefit;
            if (cat === 'SMS')   return !!p.smsBenefit;
            if (cat === 'VOICE') return !!p.voiceBenefit;
            return true;
        });
    }

    // 3. Group
    let groups = _groupPlansByDesc(flatFiltered);

    // 4. Price sort
    if (_tpFilter.price === 'asc') {
        groups.sort((a, b) => Number(a.activationFee) - Number(b.activationFee));
    } else if (_tpFilter.price === 'desc') {
        groups.sort((a, b) => Number(b.activationFee) - Number(a.activationFee));
    }

    // (validity filter: API doesn't return validity; stub for future use)

    if (countBadge) countBadge.textContent = groups.length + ' plan' + (groups.length !== 1 ? 's' : '');

    grid.innerHTML = '';

    if (!groups.length) {
        grid.innerHTML = '<p style="padding:24px;color:var(--text-muted,#888)">No plans match your search.</p>';
        return;
    }

    // OTT icons strip — built per-card from group.rateGroupNames
    // (the static strip is computed inside the forEach below)

    groups.forEach((group, i) => {
        const planId = 'tp-grp-' + encodeURIComponent(group.tariffPackageDesc);
        const selected = _tpSelected.has(planId);

        const feeNum = Number(group.activationFee);
        const priceHtml = `
            <span class="tp-price-main">
                <sup>₹</sup>${feeNum.toLocaleString('en-IN')}
            </span>
            <span class="tp-price-period">/m+GST</span>
        `;

        // Build benefit chips: one per non-null bucket (VOICE | SMS | DATA)
        const bucketsHtml = group.buckets.map(b => {
            const icon = _CAT_ICON[b.balanceCategory] || '📦';
            const val  = b.bucketUnitValue || '-';
            const cat  = b.balanceCategory || '';
            const mod  = cat.toLowerCase(); // 'voice' | 'sms' | 'data'
            return `
                <div class="tp-meta-col tp-meta-col--${mod}">
                    <span class="tp-meta-val">${val}</span>
                    <span class="tp-meta-key">${icon} ${cat}</span>
                </div>`;
        }).join('<div class="tp-meta-sep"></div>');

        const card = document.createElement('div');
        card.className = 'tp-plan-card' + (selected ? ' selected' : '');
        card.dataset.planId = planId;
        card.style.setProperty('--card-i', i);

        card.innerHTML = `
            <div class="tp-check-badge"><span class="material-icons">check</span></div>

            <div class="tp-tag">${(group.rentalType || '').toLowerCase() === 'others'
                ? (group.rentalPeriod != null ? group.rentalPeriod + ' Day' + (group.rentalPeriod !== 1 ? 's' : '') : 'Others')
                : (group.rentalType || 'Individual plan')
            }</div>

            <div class="tp-price-only">
                ${priceHtml}
            </div>

            <div class="tp-buckets-row tp-buckets-row--multi">
                ${bucketsHtml}
            </div>

            <div class="tp-ott-strip">${_buildOttStripHtml(group.rateGroupNames, 2)}</div>

            <div class="tp-card-actions">
                <button
                    class="tp-btn-details"
                    onclick='event.stopPropagation();openTpDetails(${JSON.stringify(JSON.stringify(group))})'
                >
                    View Details
                </button>

                <button
                    class="tp-btn-select"
                    onclick="event.stopPropagation();openCloneTree('${encodeURIComponent(group.tariffPackageDesc)}', ${group.tariff_package_id || group._raw[0]?.tariff_package_id || 'null'})"
                >
                    Select
                </button>
            </div>
        `;

        grid.appendChild(card);
    });
}

function _toggleTpSelect(planId) {
    if (_tpSelected.has(planId)) {
        _tpSelected.delete(planId);
    } else {
        _tpSelected.add(planId);
    }

    const card = document.querySelector(`.tp-plan-card[data-plan-id="${planId}"]`);
    if (card) {
        const isSelected = _tpSelected.has(planId);
        card.classList.toggle('selected', isSelected);
        const btn = card.querySelector('.tp-btn-select');
        if (btn) btn.textContent = isSelected ? 'Selected' : 'Select';
    }
}

// ── Clone action stub ─────────────────────────────────────
function handleCloneAction() {
    const ids = Array.from(_tpSelected);
    if (!ids.length) return;
    alert(`Cloning ${ids.length} plan(s).\n(Wire to your POST /api/clone endpoint)`);
}

// ── Clone Tree Modal ──────────────────────────────────────
async function openCloneTree(encodedDesc, tariffPackageId) {
    const tpDesc = decodeURIComponent(encodedDesc);
    const modal = document.getElementById('cloneTreeModal');
    const body = document.getElementById('cloneTreeBody');

    // Store for action buttons
    modal.dataset.tpDesc = tpDesc;
    modal.dataset.tpId = tariffPackageId || '';

    // Store full plan object so Clone button can POST it directly

    // Show modal with loading state
    body.innerHTML = `<div class="ctm-loading">
        <span class="material-icons ctm-spin">refresh</span>
        Loading plan structure…
    </div>`;
    modal.classList.add('active');

    // Fetch
    try {
        const networkId = (typeof NETWORK_ID !== 'undefined' && NETWORK_ID) ? NETWORK_ID : '';
        const res = await fetch(`/details?networkId=${networkId}&tariffPackageId=${tariffPackageId}`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        _currentClonePayload = data;
        _renderCloneTree(body, tpDesc, data);
    } catch (err) {
        console.error('Clone tree fetch error:', err);
        body.innerHTML = `<div class="ctm-error">
            <span class="material-icons">error_outline</span>
            Failed to load plan details. Please try again.
        </div>`;
    }
}

function _renderCloneTree(container, tpDesc, response) {
    // ── Unwrap: response is { tpName, username, networkId, data: {...} }
    const d = response.data || response;

    const tpName = d.tariffPlanName || d.tariffPackageDesc || '—';
    const datpRows = d.defaultAtps || [];
    const aatpRows = d.allowedAtps || [];

    function attrPill(label, value) {
        if (value === null || value === undefined || value === '') return '';
        return `<span class="pd-attr">
                    <span class="pd-attr-label">${label}</span>
                    <span class="pd-attr-value">${value}</span>
                </span>`;
    }

    function componentRow(r, index, type) {
        const name = r.packageName || r.chargeDesc || r.chargeId || type;
        const attrs = [
            attrPill('Validity', (r.validity ? ({ 'M': 'Monthly', 'O': 'Others', 'D': 'Daily', 'W': 'Weekly', 'F': 'Fixed', 'U': 'Unlimited', 'Y': 'Yearly' }[r.validity] || r.validity) : '—')),
            (r.validity === 'O' && r.rentalPeriod) ? attrPill('Validity Days', r.rentalPeriod) : '',
            attrPill('Mid. Expiry', r.midnightExpiry || '—'),
            attrPill('Renewal', r.renewal || '—'),
            attrPill('Rental', r.rental ?? '0'),
            attrPill('Max Count', r.maxCount ?? '0'),
            attrPill('Free Cycles', r.freeCycles ?? '0'),
        ].join('');
        const colorClass = type === 'DATP' ? 'pd-row--datp' : 'pd-row--aatp';
        const badge = type === 'DATP' ? 'pd-badge--datp' : 'pd-badge--aatp';
        return `
        <div class="pd-component-row ${colorClass}">
            <div class="pd-row-top">
                <span class="pd-row-badge ${badge}">${type}</span>
                <span class="pd-row-name">${name}</span>
                <span class="pd-row-index">#${index + 1}</span>
            </div>
            <div class="pd-row-attrs">${attrs || '<span class="pd-no-attrs">No attributes</span>'}</div>
        </div>`;
    }

    const datpHtml = datpRows.length
        ? datpRows.map((r, i) => componentRow(r, i, 'DATP')).join('')
        : '<div class="pd-empty-section">No DATP components</div>';

    const aatpHtml = aatpRows.length
        ? aatpRows.map((r, i) => componentRow(r, i, 'AATP')).join('')
        : '<div class="pd-empty-section">No AATP components</div>';

    container.innerHTML = `
        <div class="pd-sheet">
            <div class="pd-plan-band">
                <div class="pd-plan-band-left">
                    <span class="pd-plan-label">SERVICE PLAN</span>
                    <span class="pd-plan-name">${tpName}</span>
                </div>
                <div class="pd-plan-band-right">
                    <span class="pd-plan-label">PACKAGE</span>
                    <span class="pd-plan-pkg">${tpDesc}</span>
                </div>
            </div>
            <div class="pd-sections">
                <div class="pd-section">
                    <div class="pd-section-header pd-section-header--datp">
                        <span class="material-icons pd-section-icon">add_circle_outline</span>
                        <span class="pd-section-title">Default ATP</span>
                        <span class="pd-section-count">${datpRows.length}</span>
                    </div>
                    <div class="pd-section-body">${datpHtml}</div>
                </div>
                <div class="pd-section">
                    <div class="pd-section-header pd-section-header--aatp">
                        <span class="material-icons pd-section-icon">shopping_cart</span>
                        <span class="pd-section-title">Allowed ATP</span>
                        <span class="pd-section-count">${aatpRows.length}</span>
                    </div>
                    <div class="pd-section-body">${aatpHtml}</div>
                </div>
            </div>
        </div>`;
}

function closeCloneTree() {
    document.getElementById('cloneTreeModal').classList.remove('active');
}

function _cloneTreeOverlayClick(e) {
    if (e.target === document.getElementById('cloneTreeModal')) closeCloneTree();
}

document.addEventListener('click', function (e) {
    if (e.target.id === 'tpDetailsModal') closeTpDetails();
});

// console.log("CLONE PAYLOAD:", JSON.stringify(payload, null, 2));

async function _cloneTreeAction(action) {
    const modal = document.getElementById('cloneTreeModal');
    const tpDesc = modal.dataset.tpDesc;
    const tpId = modal.dataset.tpId;

    if (action === 'clone') {
        const payload = _currentClonePayload;

        console.log("CLONE PAYLOAD:", JSON.stringify(payload, null, 2));

        if (payload == null) {
            alert('Plan data not available. Please close and try again.');
            return;
        }

        // Disable button to prevent double-submit
        const cloneBtn = modal.querySelector('[onclick*="clone"]');
        if (cloneBtn) { cloneBtn.disabled = true; cloneBtn.textContent = 'Cloning…'; }

        try {
            const res = await fetch('/clone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await res.json();

            if (!res.ok || result.error) {
                alert(result.error || 'Clone failed. Please try again.');
                return;
            }

            alert('✅ Cloned successfully!\nNew plan: ' + result.clonedTpName);
            closeCloneTree();

        } catch (err) {
            console.error('Clone error:', err);
            alert('Server error during clone. Please try again.');
        } finally {
            if (cloneBtn) { cloneBtn.disabled = false; cloneBtn.textContent = 'Clone'; }
        }

    } else if (action === 'modify') {
        const payload = _currentClonePayload;
        if (!payload) {
            alert('Plan data not available. Please close and try again.');
            return;
        }

        const d = payload.data || payload;

        // Build builder state from the plan data (same shape as loadSavedPackage)
        const state = {
            s2: [{ id: d.tariffPlanId, name: d.tariffPlanName }],
            s3: (d.defaultAtps || []).map(a => ({
                id: a.servicePackageId,
                name: a.packageName,
                validity: a.validity,
                rentalPeriod: a.rentalPeriod || "",
                midnightExpiry: a.midnightExpiry,
                renewal: a.renewal,
                rental: a.rental,
                maxCount: a.maxCount,
                freeCycles: a.freeCycles
            })),
            s4: (d.allowedAtps || []).map(a => ({
                id: a.servicePackageId,
                name: a.packageName,
                validity: a.validity,
                rentalPeriod: a.rentalPeriod || "",
                midnightExpiry: a.midnightExpiry,
                renewal: a.renewal,
                rental: a.rental,
                maxCount: a.maxCount,
                freeCycles: a.freeCycles
            })),
            price: d.charge || '',
            publicityCode: d.publicityId || '',
            endDate: (function () {
                if (!d.endDate) return '';
                const p = d.endDate.split('/');
                return p.length === 3 ? `${p[2]}-${p[0]}-${p[1]}` : d.endDate;
            })(),
            isCorporate: d.isCorporateYn || false
        };

        // Helper: JSON.stringify array or fallback to '[]'
        const svcsToJson = (val) => {
            if (Array.isArray(val)) return JSON.stringify(val);
            if (typeof val === 'string') return val || '[]';
            return '[]';
        };

        sessionStorage.setItem('state', JSON.stringify(state));
        sessionStorage.setItem('configName', payload.tpName || d.tariffPackageDesc || '');
        sessionStorage.setItem('pkgType', d.packageType || '');
        sessionStorage.setItem('pkgSubType', d.tariffPackCategory || 'NORMAL');
        sessionStorage.setItem('selectedSvcs_s2', svcsToJson(d.selectedSvcs_s2));
        sessionStorage.setItem('selectedSvcs_s3', svcsToJson(d.selectedSvcs_s3));
        sessionStorage.setItem('selectedSvcs_s4', svcsToJson(d.selectedSvcs_s4));

        // Flag: step5 will show "Clone Package" instead of "Save Config"
        sessionStorage.setItem('cloneMode', 'true');
        // Store original tpName and networkId for the clone POST
        sessionStorage.setItem('cloneTpName', payload.tpName || d.tariffPackageDesc || '');
        sessionStorage.setItem('cloneNetworkId', String(payload.networkId || ''));
        sessionStorage.setItem('cloneUsername', payload.username || '');

        closeCloneTree();
        window.isInternalNavigation = true;
        window.location.href = '/builder/step1';

    } else {
        closeCloneTree();
    }
}

function openTpDetails(groupData) {

    const group = JSON.parse(groupData);

    const modal = document.getElementById('tpDetailsModal');
    const content = document.getElementById('tpModalContent');

    const fee = Number(group.activationFee || 0);

    // ── Filter buckets: only VOICE, SMS, DATA ─────────────
    const ALLOWED = ['VOICE', 'SMS', 'DATA'];
    const buckets = (group.buckets || []).filter(b => ALLOWED.includes((b.balanceCategory || '').toUpperCase()));

    const hasVoice = buckets.some(b => b.balanceCategory === 'VOICE');
    const hasSms = buckets.some(b => b.balanceCategory === 'SMS');
    const hasData = buckets.some(b => b.balanceCategory === 'DATA');

    // ── Dynamic notes based on missing categories ──────────
    const notes = [];
    if (!hasSms) notes.push('No Outgoing SMS');
    if (!hasVoice) notes.push('No Voice calls');
    if (!hasData) notes.push('No Data included');
    if (notes.length === 0) notes.push('All services included', 'Full voice, SMS & data access');
    const notesHtml = notes.map(n => `<li>${n}</li>`).join('');

    // ── Price block ────────────────────────────────────────
    const priceSup = `
        <div class="tp-modal-price"><sup>₹</sup>${fee.toLocaleString('en-IN')}</div>
        <div class="tp-modal-price-gst">+GST</div>`;

    // ── Buckets: value on top, label below, no dividers ───
    const bucketsHtml = buckets.map(b => `
        <div class="tp-modal-bucket">
            <span class="tp-modal-bucket-val">${b.bucketUnitValue || '-'}</span>
            <span class="tp-modal-bucket-key">${b.balanceCategory.toLowerCase()}</span>
        </div>`).join('');

    // ── Modal badge label ──────────────────────────────────
    const badgeLabel = (group.rentalType || '').toLowerCase() === 'others'
        ? (group.rentalPeriod != null ? group.rentalPeriod + ' Day' + (group.rentalPeriod !== 1 ? 's' : '') + ' Plan' : 'Others')
        : (group.rentalType || 'Individual plan');

    // ── OTT strip (small icons beside notes) ──────────────
    const rateNames = group.rateGroupNames || [];
    const ottStripHtml = _buildOttStripHtml(rateNames, 4);

    // ── Full OTT benefit list ──────────────────────────────
    const ottListHtml = rateNames.length
        ? rateNames.map(name => {
            const svc = _ottLookup(name);
            // Combo entry: show stacked icons side by side
            const imgHtml = svc.srcs && svc.srcs.length
                ? svc.srcs.map(sub =>
                    `<img class="tp-modal-ott-item-img" src="${sub.src}" alt="${sub.title}"
                          style="margin-right:4px"
                          onerror="this.onerror=null;this.style.display='none';">`
                ).join('')
                : svc.src
                    ? `<img class="tp-modal-ott-item-img" src="${svc.src}" alt="${svc.title}" onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="tp-modal-ott-fallback-badge" style="display:none">${svc.initial}</span>`
                    : `<span class="tp-modal-ott-fallback-badge">${svc.initial}</span>`;
            return `
            <div class="tp-modal-ott-item">
                <div style="display:flex;align-items:center;gap:2px">${imgHtml}</div>
                <div class="tp-modal-ott-item-info">
                    <span class="tp-modal-ott-item-name">${svc.title}</span>
                    <span class="tp-modal-ott-item-desc">${svc.desc}</span>
                </div>
            </div>`;
        }).join('')
        : `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px 16px;gap:6px;text-align:center">
               <span class="material-icons" style="font-size:32px;color:red">tv_off</span>
               <span style="font-size:13px;font-weight:600;color:var(--text-secondary,#777)">No OTT benefits included</span>
               <span style="font-size:11.5px;color:var(--text-muted,#aaa)">This plan does not include any streaming services</span>
           </div>`;

    content.innerHTML = `
        <div class="tp-modal-title">${group.tariffPackageDesc || 'Pack Details'}</div>

        <div class="tp-modal-badge">${badgeLabel}</div>

        <div class="tp-modal-hero">
            <div class="tp-modal-price-block">
                ${priceSup}
            </div>
            <div class="tp-modal-hero-divider"></div>
            <div class="tp-modal-buckets">
                ${bucketsHtml}
            </div>
        </div>

        ${rateNames.length ? `<div class="tp-modal-ott-row">
            <div class="tp-modal-ott-icons">${ottStripHtml}</div>
            <ul class="tp-modal-ott-notes">${notesHtml}</ul>
        </div>` : `<ul class="tp-modal-ott-notes" style="margin:12px 0 4px 0">${notesHtml}</ul>`}

        <div class="tp-modal-benefits-title">additional benefits</div>

        <div class="tp-modal-scroll-body">
            <div class="tp-modal-ott-list">
                ${ottListHtml}
            </div>
            <div class="tp-modal-your-benefits">
                <div class="tp-modal-your-benefits-title">your benefits</div>
                <p class="tp-modal-your-benefits-text">
                    ${rateNames.length > 0
            ? 'Includes ' + rateNames.slice(0, 3).join(', ') + (rateNames.length > 3 ? ' &amp; ' + (rateNames.length - 3) + ' more OTT' + (rateNames.length - 3 > 1 ? 's' : '') + '.' : '.')
            : 'No OTT benefits included.'}
                    ${hasData ? buckets.find(b => b.balanceCategory === 'DATA').bucketUnitValue + ' Data.' : 'No Data included.'}
                    ${!hasVoice ? 'No Voice calls.' : ''}
                    ${!hasSms ? 'No SMS included.' : ''}
                </p>
            </div>
        </div>
    `;

    modal.classList.add('active');
}

function closeTpDetails() {
    document.getElementById('tpDetailsModal')
        .classList.remove('active');
}