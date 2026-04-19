/**
 * coin-selection.js — Greedy largest-first coin selection
 */

import { ValidationError } from './validator.js';

/**
 * Select coins (UTXOs) to fund the target amount using greedy largest-first.
 *
 * @param {Array} utxos - available UTXOs from fixture
 * @param {number} targetAmount - sum of payment outputs (without fee)
 * @param {number} maxInputs - policy.max_inputs (Infinity if not set)
 * @returns {Array} selected UTXOs (subset of input utxos)
 */
export function selectCoins(utxos, targetAmount, maxInputs = Infinity) {
    // Sort by value descending (largest first) for greedy selection
    // Break ties deterministically by txid+vout
    const sorted = [...utxos].sort((a, b) => {
        if (b.value_sats !== a.value_sats) return b.value_sats - a.value_sats;
        if (a.txid !== b.txid) return a.txid < b.txid ? -1 : 1;
        return a.vout - b.vout;
    });

    const selected = [];
    let total = 0;

    for (const utxo of sorted) {
        if (selected.length >= maxInputs) break;
        selected.push(utxo);
        total += utxo.value_sats;
        if (total >= targetAmount) break;
    }

    if (total < targetAmount) {
        if (selected.length >= maxInputs) {
            throw new ValidationError(
                'INSUFFICIENT_FUNDS',
                `Cannot fund ${targetAmount} sats with max ${maxInputs} inputs (selected ${total} sats across ${selected.length} inputs)`
            );
        }
        throw new ValidationError(
            'INSUFFICIENT_FUNDS',
            `Not enough funds: need ${targetAmount} sats, have ${total} sats`
        );
    }

    return selected;
}
