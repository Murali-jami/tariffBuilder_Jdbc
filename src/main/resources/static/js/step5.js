window.addEventListener('DOMContentLoaded', () => {
    // Restore previously entered values
    const state = getState();
    if (state.price) document.getElementById('price').value = state.price;
    if (state.endDate) document.getElementById('endDate').value = state.endDate;
    if (state.publicityCode) document.getElementById('publicityCode').value = state.publicityCode;
    if (state.isCorporate) document.getElementById('isCorporate').checked = state.isCorporate;

    // ── Clone mode: swap Save Config → Clone Package ──────────────
    if (sessionStorage.getItem('cloneMode') === 'true') {
        const saveBtn  = document.getElementById('saveConfigBtn');
        const cloneBtn = document.getElementById('clonePackageBtn');
        if (saveBtn)  saveBtn.style.display  = 'none';
        if (cloneBtn) cloneBtn.style.display = 'inline-flex';
        return;
    }

    // ── Approved edit mode: swap Save Config → Update Package ─────
    if (sessionStorage.getItem('approvedMode') === 'true') {
        const saveBtn     = document.getElementById('saveConfigBtn');
        const updateBtn   = document.getElementById('updatePackageBtn');
        if (saveBtn)   saveBtn.style.display   = 'none';
        if (updateBtn) updateBtn.style.display = 'inline-flex';
    }
});

// Each input writes to state immediately on change
function onPriceChange(val) {
    const state = getState();
    state.price = val;
    saveState(state);
}

function onEndDateChange(val) {
    const state = getState();
    state.endDate = val;
    saveState(state);
}

function onPublicityCodeChange(val) {
    const state = getState();
    state.publicityCode = val;
    saveState(state);
}

function onCorporateChange(checked) {
    const state = getState();
    state.isCorporate = checked;
    saveState(state);
}

// ── Save Configuration (standard flow) ──────────────────────────
async function saveConfiguration() {
    const state = getState();

    if (!state?.s2?.length) {
        alert('Service Plan selection in Step 2 is required');
        return;
    }
    if (!state.price) {
        alert('Enter charge amount');
        return;
    }
    if (!state.endDate) {
        alert('Select end date');
        return;
    }
    if (!state.publicityCode) {
        alert('Enter publicity code');
        return;
    }

    function formatDateToMMDDYYYY(dateStr) {
        if (!dateStr) return '12/31/2030';
        const [year, month, day] = dateStr.split('-');
        return `${month}/${day}/${year}`;
    }

    const username = USERNAME;
    const networkId = sessionStorage.getItem('networkId');
    const isRejectedResubmit = !!sessionStorage.getItem('rejectedTpName');

    // CHANGE 7: no chargeId in ATP objects
    const payload = {
        username: username,
        isUpdate: isRejectedResubmit,   // skip duplicate JSON check when re-submitting a rejected TP
        submittedOn: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        packageType: sessionStorage.getItem('pkgType') || '',
        tariffPackCategory: sessionStorage.getItem('pkgSubType') || 'NORMAL',
        tariffPackageDesc: sessionStorage.getItem('configName') || sessionStorage.getItem('tpName') || '',
        charge: state.price,
        endDate: formatDateToMMDDYYYY(state.endDate),
        publicityId: state.publicityCode,
        isCorporateYn: state.isCorporate || false,
        tariffPlanId: Number(state.s2[0].id),
        tariffPlanName: state.s2[0].name,
        selectedSvcs_s2: sessionStorage.getItem('selectedSvcs_s2') || '[]',
        selectedSvcs_s3: sessionStorage.getItem('selectedSvcs_s3') || '[]',
        selectedSvcs_s4: sessionStorage.getItem('selectedSvcs_s4') || '[]',
        defaultAtps: (state.s3 || []).map(item => ({
            servicePackageId: Number(item.id),
            packageName:      item.name,
            validity:         item.validity,
            rentalPeriod:     item.validity === 'O' ? (item.rentalPeriod || 1) : "",
            midnightExpiry:   item.midnightExpiry,
            renewal:          item.renewal,
            rental:           item.rental    || 0,
            maxCount:         item.maxCount  || 0,
            freeCycles:       item.freeCycles || 0
        })),
        allowedAtps: (state.s4 || []).map(item => ({
            servicePackageId: Number(item.id),
            packageName:      item.name,
            validity:         item.validity,
            rentalPeriod:     item.validity === 'O' ? (item.rentalPeriod || 1) : "",
            midnightExpiry:   item.midnightExpiry,
            renewal:          item.renewal,
            rental:           item.rental    || 0,
            maxCount:         item.maxCount  || 0,
            freeCycles:       item.freeCycles || 0
        }))
    };

    const saveBtn = document.getElementById('saveConfigBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

    try {
        const res = await fetch('/save-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (result.error) {
            alert(result.error);
            return;
        }

        // If this was loaded from a rejected TP, remove it from rejected list
        const rejectedTpName = sessionStorage.getItem('rejectedTpName');
        const wasRejected = !!rejectedTpName;
        if (rejectedTpName) {
            await fetch('/rejected/delete/' + encodeURIComponent(rejectedTpName), { method: 'POST' })
                .catch(err => console.warn('Could not remove from rejected list:', err));
            sessionStorage.removeItem('rejectedTpName');
        }

        alert('✅ Configuration saved successfully!\nPlan: ' + (result.tpName || ''));
        clearBuilderSession();
        closeCloneTree();
        if (wasRejected) {
            window.isInternalNavigation = true;
            window.location.href = '/builder/step1?openSaved=1';
        } else {
            openClone();
        }

    } catch (err) {
        console.error('Save config error:', err);
        alert('Server error during save. Please try again.');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'SAVE CONFIG'; }
    }
}

// ── Clone Package — CHANGE 3: direct vs modify modes ─────────────
async function clonePackageFromBuilder() {
    const state = getState();

    if (!state?.s2?.length) {
        alert('Service Plan selection in Step 2 is required');
        return;
    }
    if (!state.price) {
        alert('Enter charge amount');
        return;
    }
    if (!state.endDate) {
        alert('Select end date');
        return;
    }
    if (!state.publicityCode) {
        alert('Enter publicity code');
        return;
    }

    const originalTpName    = sessionStorage.getItem('cloneTpName');
    const networkId         = sessionStorage.getItem('cloneNetworkId');
    const username          = sessionStorage.getItem('username') || (typeof USERNAME !== 'undefined' ? USERNAME : '');
    const cloneType         = sessionStorage.getItem('cloneType') || 'direct';
    const origPublicityId   = sessionStorage.getItem('cloneOriginalPublicityId');
    const origTpName        = sessionStorage.getItem('cloneOriginalTpName');

    if (!originalTpName || !networkId) {
        alert('Clone context missing. Please go back to the Clone page and try again.');
        return;
    }

    function formatDateToMMDDYYYY(dateStr) {
        if (!dateStr) return '12/31/2030';
        const [year, month, day] = dateStr.split('-');
        return `${month}/${day}/${year}`;
    }

    // CHANGE 7: no chargeId in ATP objects
    const atpMapper = item => ({
        servicePackageId: Number(item.id),
        packageName:      item.name,
        validity:         item.validity,
        rentalPeriod:     item.validity === 'O' ? (item.rentalPeriod || 1) : "",
        midnightExpiry:   item.midnightExpiry,
        renewal:          item.renewal,
        rental:           item.rental    || 0,
        maxCount:         item.maxCount  || 0,
        freeCycles:       item.freeCycles || 0
    });

    const dataPayload = {
        tariffPackageDesc:  originalTpName,
        packageType:        sessionStorage.getItem('pkgType') || '',
        tariffPackCategory: sessionStorage.getItem('pkgSubType') || 'NORMAL',
        charge:             state.price,
        endDate:            formatDateToMMDDYYYY(state.endDate),
        publicityId:        state.publicityCode,
        isCorporateYn:      state.isCorporate || false,
        tariffPlanId:       Number(state.s2[0].id),
        tariffPlanName:     state.s2[0].name,
        selectedSvcs_s2:    sessionStorage.getItem('selectedSvcs_s2') || '[]',
        selectedSvcs_s3:    sessionStorage.getItem('selectedSvcs_s3') || '[]',
        selectedSvcs_s4:    sessionStorage.getItem('selectedSvcs_s4') || '[]',
        defaultAtps:        (state.s3 || []).map(atpMapper),
        allowedAtps:        (state.s4 || []).map(atpMapper)
    };

    // Detect if user changed tpName or publicityId
    const userEnteredTpName     = state.publicityCode ? originalTpName : origTpName;
    const userEnteredPublicityId = state.publicityCode;

    const tpNameChanged     = userEnteredTpName !== origTpName;
    const publicityChanged  = userEnteredPublicityId !== origPublicityId;
    const isModify          = cloneType === 'modify' && (tpNameChanged || publicityChanged);

    const cloneBtn = document.getElementById('clonePackageBtn');
    if (cloneBtn) { cloneBtn.disabled = true; cloneBtn.textContent = 'Cloning…'; }

    try {
        // CHANGE 3: if modify mode with changed values, validate first
        if (isModify) {
            const validateRes = await fetch('/clone/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    networkId: Number(networkId),
                    tpName:    userEnteredTpName,
                    publicityId: userEnteredPublicityId
                })
            });
            const validateResult = await validateRes.json();
            if (validateResult.status === 'error') {
                alert(validateResult.message || 'Validation failed. Please try again.');
                return;
            }
        }

        // Build clone payload
        const payload = {
            tpName:    originalTpName,
            networkId: Number(networkId),
            username:  username,
            data:      dataPayload
        };

        if (isModify) {
            payload.cloneMode           = 'modify';
            payload.overrideTpName      = userEnteredTpName;
            payload.overridePublicityId = userEnteredPublicityId;
        } else {
            payload.cloneMode = 'direct';
        }

        const res = await fetch('/clone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (result.status === 'error') {
            alert(result.message || 'Clone failed. Please try again.');
            return;
        }

        alert('✅ Cloned successfully!\nNew plan: ' + result.clonedTpName);

        // Clean up clone-specific session keys
        sessionStorage.removeItem('cloneMode');
        sessionStorage.removeItem('cloneType');
        sessionStorage.removeItem('cloneTpName');
        sessionStorage.removeItem('cloneNetworkId');
        sessionStorage.removeItem('cloneOriginalPublicityId');
        sessionStorage.removeItem('cloneOriginalTpName');
        clearBuilderSession();

        window.isInternalNavigation = true;
        window.location.href = '/builder/step1';

    } catch (err) {
        console.error('Clone error:', err);
        alert('Server error during clone. Please try again.');
    } finally {
        if (cloneBtn) { cloneBtn.disabled = false; cloneBtn.textContent = 'CLONE PACKAGE'; }
    }
}
// ── Update Package (approved-edit flow) ─────────────────────────
async function updatePackage() {
    const state = getState();

    if (!state?.s2?.length) {
        alert('Service Plan selection in Step 2 is required');
        return;
    }
    if (!state.price) {
        alert('Enter charge amount');
        return;
    }
    if (!state.endDate) {
        alert('Select end date');
        return;
    }
    if (!state.publicityCode) {
        alert('Enter publicity code');
        return;
    }

    const tariffPackageId = sessionStorage.getItem('approvedTariffPackageId');
    const networkId       = sessionStorage.getItem('networkId') ||
                            (typeof NETWORK_ID !== 'undefined' ? NETWORK_ID : '');

    if (!tariffPackageId || !networkId) {
        alert('Update context missing. Please reload the package from the Approved list.');
        return;
    }

    function formatDateToMMDDYYYY(dateStr) {
        if (!dateStr) return '12/31/2030';
        const [year, month, day] = dateStr.split('-');
        return `${month}/${day}/${year}`;
    }

    const atpMapper = item => ({
        servicePackageId: Number(item.id),
        packageName:      item.name,
        chargeId:         item.chargeId || '',
        validity:         item.validity,
        rentalPeriod:     item.validity === 'O' ? (item.rentalPeriod || 1) : '',
        midnightExpiry:   item.midnightExpiry,
        renewal:          item.renewal,
        rental:           item.rental    || 0,
        maxCount:         item.maxCount  || 0,
        freeCycles:       item.freeCycles || 0
    });

    const payload = {
        tpName:    sessionStorage.getItem('approvedTpName') || '',
        username:  USERNAME,
        networkId: Number(networkId),
        data: {
            username:          USERNAME,
            isUpdate:          true,
            submittedOn:       new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            packageType:       sessionStorage.getItem('pkgType') || '',
            tariffPackCategory: sessionStorage.getItem('pkgSubType') || 'NORMAL',
            tariffPackageDesc: sessionStorage.getItem('configName') || '',
            charge:            state.price,
            endDate:           formatDateToMMDDYYYY(state.endDate),
            publicityId:       state.publicityCode,
            isCorporateYn:     state.isCorporate || false,
            tariffPlanId:      Number(state.s2[0].id),
            tariffPlanName:    state.s2[0].name,
            selectedSvcs_s2:   sessionStorage.getItem('selectedSvcs_s2') || '[]',
            selectedSvcs_s3:   sessionStorage.getItem('selectedSvcs_s3') || '[]',
            selectedSvcs_s4:   sessionStorage.getItem('selectedSvcs_s4') || '[]',
            defaultAtps:       (state.s3 || []).map(atpMapper),
            allowedAtps:       (state.s4 || []).map(atpMapper)
        }
    };

    const updateBtn = document.getElementById('updatePackageBtn');
    if (updateBtn) { updateBtn.disabled = true; updateBtn.textContent = 'Updating…'; }

    try {
        const res = await fetch(
            `/update/${tariffPackageId}?networkId=${networkId}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }
        );

        const result = await res.json();

        if (result.status === 'error') {
            alert(result.message || 'Update failed. Please try again.');
            return;
        }

        alert('✅ Package updated successfully!\nPlan: ' + (sessionStorage.getItem('configName') || ''));
        clearBuilderSession();
        window.isInternalNavigation = true;
        window.location.href = '/builder/step1';

    } catch (err) {
        console.error('Update package error:', err);
        alert('Server error during update. Please try again.');
    } finally {
        if (updateBtn) {
            updateBtn.disabled = false;
            updateBtn.innerHTML = '<span class="material-icons">save</span> UPDATE PACKAGE';
        }
    }
}