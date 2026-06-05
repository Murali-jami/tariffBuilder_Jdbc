// Show or hide the Commercial card based on billing type
function applyCommercialVisibility(billingType) {
    const commercialCard = document.getElementById('card-COMMERCIAL');
    if (!commercialCard) return;

    if (billingType === 'PREPAID') {
        commercialCard.style.opacity = '0.3';
        commercialCard.style.pointerEvents = 'none';
    } else {
        commercialCard.style.opacity = '';
        commercialCard.style.pointerEvents = '';
    }
}

// Restore selections when page loads
document.addEventListener('DOMContentLoaded', function () {
    const savedType = sessionStorage.getItem('pkgType');
    const savedSubType = sessionStorage.getItem('pkgSubType');

    // Restore Billing Type
    if (savedType) {
        const typeCard = document.getElementById('card-' + savedType);
        if (typeCard) {
            // Mark as selected
            document.querySelectorAll('#typeSection .type-card').forEach(c =>
                c.classList.remove('selected')
            );
            typeCard.classList.add('selected');

            // Unlock category section
            const subGroup = document.getElementById('subTypeGroup');
            subGroup.style.opacity = '1';
            subGroup.style.pointerEvents = 'auto';

            // Apply Commercial visibility based on restored billing type
            applyCommercialVisibility(savedType);
        }
    }

    // Restore Category (only if billing type was selected)
    // If saved subtype was COMMERCIAL but billing is now PREPAID, clear it
    if (savedSubType && savedType) {
        if (savedSubType === 'COMMERCIAL' && savedType === 'PREPAID') {
            sessionStorage.removeItem('pkgSubType');
        } else {
            const subCard = document.getElementById('card-' + savedSubType);
            if (subCard) {
                document.querySelectorAll('#subTypeSection .type-card').forEach(c =>
                    c.classList.remove('selected')
                );
                subCard.classList.add('selected');
            }
        }
    }
});

// Existing functions (slightly improved)
function selectType(type) {
    const currentType = sessionStorage.getItem('pkgType');
    const subGroup = document.getElementById('subTypeGroup');

    // If same type clicked again → deselect everything
    if (currentType === type) {
        sessionStorage.removeItem('pkgType');
        sessionStorage.removeItem('pkgSubType');

        document.querySelectorAll('#typeSection .type-card').forEach(c =>
            c.classList.remove('selected')
        );

        document.querySelectorAll('#subTypeSection .type-card').forEach(c =>
            c.classList.remove('selected')
        );

        // Lock category section again
        subGroup.style.opacity = '0.3';
        subGroup.style.pointerEvents = 'none';

        // Reset Commercial visibility
        applyCommercialVisibility(null);

        return;
    }

    // Normal selection
    sessionStorage.setItem('pkgType', type);

    document.querySelectorAll('#typeSection .type-card').forEach(c =>
        c.classList.remove('selected')
    );

    document.getElementById('card-' + type).classList.add('selected');

    // Unlock category section
    subGroup.style.opacity = '1';
    subGroup.style.pointerEvents = 'auto';

    // Reset category when billing type changes
    document.querySelectorAll('#subTypeSection .type-card').forEach(c =>
        c.classList.remove('selected')
    );
    sessionStorage.removeItem('pkgSubType');

    // Show/hide Commercial based on billing type
    applyCommercialVisibility(type);

    // If switching to PREPAID and COMMERCIAL was previously selected, clear it
    if (type === 'PREPAID' && sessionStorage.getItem('pkgSubType') === 'COMMERCIAL') {
        sessionStorage.removeItem('pkgSubType');
    }
}

function selectSubType(subType) {
    const currentSubType = sessionStorage.getItem('pkgSubType');

    // If same category clicked again → deselect it
    if (currentSubType === subType) {
        sessionStorage.removeItem('pkgSubType');

        document.querySelectorAll('#subTypeSection .type-card').forEach(c =>
            c.classList.remove('selected')
        );

        return;
    }

    // Normal selection
    sessionStorage.setItem('pkgSubType', subType);

    document.querySelectorAll('#subTypeSection .type-card').forEach(c =>
        c.classList.remove('selected')
    );

    document.getElementById('card-' + subType).classList.add('selected');
}