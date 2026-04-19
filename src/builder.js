/**
 * builder.js — Main PSBT transaction builder orchestrator
 *
 * Orchestrates: parse → validate → select → fee/change → RBF/locktime → PSBT → report
 */

import { validateFixture, ValidationError } from './validator.js';
import { computeFeeAndChange } from './fee-change.js';
import { computeRbfLocktime } from './rbf-locktime.js';
import { buildPsbt } from './psbt.js';
import { generateWarnings } from './warnings.js';

/**
 * Build a PSBT transaction from a fixture
 *
 * @param {Object} fixture - raw fixture JSON object
 * @returns {Object} JSON report
 */
export function buildTransaction(fixture) {
    // Step 1: Validate fixture
    validateFixture(fixture);

    // Step 2: Compute fee, change, and select inputs (iterative)
    const {
        selectedInputs,
        outputs,
        changeIndex,
        feeSats,
        feeRateSatVb,
        vbytes,
    } = computeFeeAndChange(fixture);

    // Step 3: Compute RBF and locktime
    const { nSequence, nLockTime, rbfSignaling, locktimeType } = computeRbfLocktime(fixture);

    // Step 4: Build PSBT
    const psbtBase64 = buildPsbt({
        selectedInputs,
        outputs,
        nLockTime,
        nSequence,
        network: fixture.network,
    });

    // Step 5: Generate warnings
    const warningInput = {
        feeSats,
        feeRateSatVb,
        changeIndex,
        outputs,
        rbfSignaling,
    };
    const warnings = generateWarnings(warningInput);

    // Step 6: Build report
    const report = {
        ok: true,
        network: fixture.network,
        strategy: 'greedy',
        selected_inputs: selectedInputs.map(u => ({
            txid: u.txid,
            vout: u.vout,
            value_sats: u.value_sats,
            script_pubkey_hex: u.script_pubkey_hex,
            script_type: u.script_type,
            address: u.address || '',
        })),
        outputs: outputs.map((o, i) => ({
            n: i,
            value_sats: o.value_sats,
            script_pubkey_hex: o.script_pubkey_hex,
            script_type: o.script_type,
            address: o.address || '',
            is_change: o.is_change || false,
        })),
        change_index: changeIndex,
        fee_sats: feeSats,
        fee_rate_sat_vb: feeRateSatVb,
        vbytes: vbytes,
        rbf_signaling: rbfSignaling,
        locktime: nLockTime,
        locktime_type: locktimeType,
        psbt_base64: psbtBase64,
        warnings: warnings,
    };

    return report;
}

/**
 * Build an error report
 */
export function buildErrorReport(code, message) {
    return {
        ok: false,
        error: {
            code: code || 'UNKNOWN_ERROR',
            message: message || 'An unknown error occurred',
        },
    };
}
