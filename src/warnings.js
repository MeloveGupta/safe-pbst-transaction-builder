/**
 * warnings.js — Generate warning codes for the report
 */

const HIGH_FEE_SATS_THRESHOLD = 1_000_000;
const HIGH_FEE_RATE_THRESHOLD = 200;
const DUST_THRESHOLD = 546;

/**
 * Generate warnings based on the transaction report
 * @param {Object} report - the transaction report object
 * @returns {Array} array of warning objects with code field
 */
export function generateWarnings(report) {
    const warnings = [];

    // HIGH_FEE: fee_sats > 1,000,000 OR fee_rate_sat_vb > 200
    if (report.feeSats > HIGH_FEE_SATS_THRESHOLD || report.feeRateSatVb > HIGH_FEE_RATE_THRESHOLD) {
        warnings.push({ code: 'HIGH_FEE' });
    }

    // DUST_CHANGE: change output exists with value_sats < 546
    if (report.changeIndex !== null) {
        const changeOutput = report.outputs.find(o => o.is_change);
        if (changeOutput && changeOutput.value_sats < DUST_THRESHOLD) {
            warnings.push({ code: 'DUST_CHANGE' });
        }
    }

    // SEND_ALL: no change output
    if (report.changeIndex === null) {
        warnings.push({ code: 'SEND_ALL' });
    }

    // RBF_SIGNALING: rbf_signaling is true
    if (report.rbfSignaling) {
        warnings.push({ code: 'RBF_SIGNALING' });
    }

    return warnings;
}
