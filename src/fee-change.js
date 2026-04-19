/**
 * fee-change.js — Iterative fee and change computation
 *
 * Critical: adding/removing a change output changes tx size, which changes fee.
 * Must iterate until stable to avoid hidden boundary traps.
 */

import { estimateVbytes } from './vbytes.js';
import { selectCoins } from './coin-selection.js';
import { ValidationError } from './validator.js';

const DUST_THRESHOLD = 546;
const MAX_ITERATIONS = 20;

/**
 * Build the payment outputs array from fixture payments
 */
function buildPaymentOutputs(payments) {
    return payments.map((p, i) => ({
        n: i,
        value_sats: p.value_sats,
        script_pubkey_hex: p.script_pubkey_hex,
        script_type: p.script_type,
        address: p.address || '',
        is_change: false,
    }));
}

/**
 * Iteratively compute selected inputs, fee, and change
 *
 * @param {Object} fixture - validated fixture
 * @returns {{ selectedInputs, outputs, changIndex, feeSats, feeRateSatVb, vbytes }}
 */
export function computeFeeAndChange(fixture) {
    const { utxos, payments, change, fee_rate_sat_vb } = fixture;
    const maxInputs = fixture.policy?.max_inputs ?? Infinity;

    const paymentsTotal = payments.reduce((s, p) => s + p.value_sats, 0);
    const paymentOutputs = buildPaymentOutputs(payments);

    // Initial estimate: try with change output first
    let includeChange = true;
    let selectedInputs = null;
    let feeSats = 0;
    let vbytes = 0;
    let changeSats = 0;

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        // Build candidate outputs
        const candidateOutputs = [...paymentOutputs];
        if (includeChange) {
            candidateOutputs.push({
                script_pubkey_hex: change.script_pubkey_hex,
                script_type: change.script_type,
            });
        }

        // Estimate vbytes with current inputs (or initial guess)
        if (!selectedInputs) {
            // First iteration: estimate fee with 1 input to get a lower bound, then select
            const tempInputs = [utxos[0] || { script_type: 'p2wpkh' }];
            const tempVbytes = estimateVbytes(tempInputs, candidateOutputs);
            const tempFee = Math.ceil(fee_rate_sat_vb * tempVbytes);
            const targetWithFee = paymentsTotal + tempFee;

            try {
                selectedInputs = selectCoins(utxos, targetWithFee, maxInputs);
            } catch (e) {
                // Try without change
                if (includeChange) {
                    includeChange = false;
                    continue;
                }
                throw e;
            }
        }

        // Compute vbytes with actual selected inputs
        const currentOutputs = [...paymentOutputs];
        if (includeChange) {
            currentOutputs.push({
                script_pubkey_hex: change.script_pubkey_hex,
                script_type: change.script_type,
            });
        }

        vbytes = estimateVbytes(selectedInputs, currentOutputs);
        feeSats = Math.ceil(fee_rate_sat_vb * vbytes);

        const inputTotal = selectedInputs.reduce((s, u) => s + u.value_sats, 0);
        const leftover = inputTotal - paymentsTotal - feeSats;

        if (leftover < 0) {
            // Not enough with current inputs — try adding more
            const newTarget = paymentsTotal + feeSats;
            try {
                const newInputs = selectCoins(utxos, newTarget, maxInputs);
                if (newInputs.length === selectedInputs.length &&
                    newInputs.every((u, i) => u.txid === selectedInputs[i].txid && u.vout === selectedInputs[i].vout)) {
                    // Same inputs, still not enough
                    if (includeChange) {
                        includeChange = false;
                        continue;
                    }
                    throw new ValidationError('INSUFFICIENT_FUNDS',
                        `Cannot fund transaction: need ${newTarget} sats, selected ${inputTotal} sats`);
                }
                selectedInputs = newInputs;
                continue; // re-iterate with new inputs
            } catch (e) {
                if (includeChange) {
                    includeChange = false;
                    selectedInputs = null; // re-select without change
                    continue;
                }
                throw e;
            }
        }

        if (includeChange) {
            changeSats = leftover;
            if (changeSats < DUST_THRESHOLD) {
                // Change is dust — remove change output, leftover becomes fee
                includeChange = false;
                continue; // re-iterate without change
            }
            // Change is valid and non-dust — stable!
            break;
        } else {
            // No change — leftover goes to fee
            feeSats = inputTotal - paymentsTotal;

            // Recompute vbytes without change (should already be correct)
            vbytes = estimateVbytes(selectedInputs, paymentOutputs);

            // But we need fee to be at least ceil(rate * vbytes)
            const minFee = Math.ceil(fee_rate_sat_vb * vbytes);
            if (feeSats < minFee) {
                // Need more inputs even without change
                try {
                    const newInputs = selectCoins(utxos, paymentsTotal + minFee, maxInputs);
                    if (newInputs.length > selectedInputs.length) {
                        selectedInputs = newInputs;
                        continue;
                    }
                } catch (e) {
                    // fall through
                }
                throw new ValidationError('INSUFFICIENT_FUNDS',
                    `Cannot meet fee target: need ${minFee} sats fee, have ${feeSats} sats leftover`);
            }
            break;
        }
    }

    // Build final outputs
    const finalOutputs = [...paymentOutputs];
    let changeIndex = null;

    if (includeChange && changeSats >= DUST_THRESHOLD) {
        changeIndex = finalOutputs.length;
        finalOutputs.push({
            n: finalOutputs.length,
            value_sats: changeSats,
            script_pubkey_hex: change.script_pubkey_hex,
            script_type: change.script_type,
            address: change.address || '',
            is_change: true,
        });
    } else {
        // Send-all: recalculate fee as all leftover
        const inputTotal = selectedInputs.reduce((s, u) => s + u.value_sats, 0);
        feeSats = inputTotal - paymentsTotal;
        vbytes = estimateVbytes(selectedInputs, paymentOutputs);
    }

    const feeRateSatVb = feeSats / vbytes;

    return {
        selectedInputs,
        outputs: finalOutputs,
        changeIndex,
        feeSats,
        feeRateSatVb: Math.round(feeRateSatVb * 100) / 100, // round to 2 decimals
        vbytes,
    };
}
