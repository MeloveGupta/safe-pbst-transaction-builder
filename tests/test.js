/**
 * test.js — Unit tests for Coin Smith PSBT builder
 *
 * Uses Node.js built-in test runner (node --test)
 * Minimum 15 tests covering coin selection, fee/change, RBF/locktime, PSBT, warnings
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateFixture, ValidationError } from '../src/validator.js';
import { selectCoins } from '../src/coin-selection.js';
import { estimateVbytes } from '../src/vbytes.js';
import { computeRbfLocktime } from '../src/rbf-locktime.js';
import { computeFeeAndChange } from '../src/fee-change.js';
import { buildPsbt } from '../src/psbt.js';
import { generateWarnings } from '../src/warnings.js';
import { buildTransaction, buildErrorReport } from '../src/builder.js';

// Helper: minimal valid fixture
function makeFixture(overrides = {}) {
    return {
        network: 'mainnet',
        utxos: [
            {
                txid: '1111111111111111111111111111111111111111111111111111111111111111',
                vout: 0,
                value_sats: 100000,
                script_pubkey_hex: '00141111111111111111111111111111111111111111',
                script_type: 'p2wpkh',
                address: 'bc1qtest',
            },
        ],
        payments: [
            {
                address: 'bc1qpayment',
                script_pubkey_hex: '00142222222222222222222222222222222222222222',
                script_type: 'p2wpkh',
                value_sats: 70000,
            },
        ],
        change: {
            address: 'bc1qchange',
            script_pubkey_hex: '00143333333333333333333333333333333333333333',
            script_type: 'p2wpkh',
        },
        fee_rate_sat_vb: 5,
        policy: { max_inputs: 5 },
        ...overrides,
    };
}

// ─── 1. Coin Selection: happy path ─────────────────────────────────
describe('Coin Selection', () => {
    it('1. selects coins for a basic transaction', () => {
        const utxos = [
            { txid: 'a'.repeat(64), vout: 0, value_sats: 50000, script_type: 'p2wpkh' },
            { txid: 'b'.repeat(64), vout: 0, value_sats: 80000, script_type: 'p2wpkh' },
        ];
        const selected = selectCoins(utxos, 60000);
        assert.ok(selected.length >= 1);
        const total = selected.reduce((s, u) => s + u.value_sats, 0);
        assert.ok(total >= 60000);
    });

    // ─── 2. Insufficient funds ──────────────────────────────────
    it('2. throws on insufficient funds', () => {
        const utxos = [
            { txid: 'a'.repeat(64), vout: 0, value_sats: 1000, script_type: 'p2wpkh' },
        ];
        assert.throws(() => selectCoins(utxos, 5000), { code: 'INSUFFICIENT_FUNDS' });
    });

    // ─── 3. policy.max_inputs enforcement ───────────────────────
    it('3. respects policy.max_inputs', () => {
        const utxos = Array.from({ length: 10 }, (_, i) => ({
            txid: (i.toString(16).padStart(2, '0')).repeat(32),
            vout: 0,
            value_sats: 1000,
            script_type: 'p2wpkh',
        }));
        assert.throws(() => selectCoins(utxos, 8000, 3), { code: 'INSUFFICIENT_FUNDS' });
    });

    // ─── 4. Greedy picks largest first ───────────────────────────
    it('4. greedy selects largest first', () => {
        const utxos = [
            { txid: 'c'.repeat(64), vout: 0, value_sats: 10000, script_type: 'p2wpkh' },
            { txid: 'd'.repeat(64), vout: 0, value_sats: 50000, script_type: 'p2wpkh' },
            { txid: 'e'.repeat(64), vout: 0, value_sats: 30000, script_type: 'p2wpkh' },
        ];
        const selected = selectCoins(utxos, 25000);
        assert.equal(selected[0].value_sats, 50000);
        assert.equal(selected.length, 1);
    });
});

// ─── 5. Dust change removal ──────────────────────────────────────
describe('Fee and Change', () => {
    it('5. removes dust change (send-all)', () => {
        const fixture = makeFixture({
            utxos: [{
                txid: 'a'.repeat(64), vout: 0, value_sats: 10000,
                script_pubkey_hex: '00141111111111111111111111111111111111111111',
                script_type: 'p2wpkh', address: 'bc1q...',
            }],
            payments: [{
                address: 'bc1q...', script_pubkey_hex: '00142222222222222222222222222222222222222222',
                script_type: 'p2wpkh', value_sats: 9000,
            }],
            fee_rate_sat_vb: 5,
        });
        const result = computeFeeAndChange(fixture);
        assert.equal(result.changeIndex, null, 'Change should be null (dust removed)');
        assert.equal(result.feeSats, 1000, 'Leftover becomes fee');
    });

    // ─── 6. Valid change output ──────────────────────────────────
    it('6. creates change when not dust', () => {
        const fixture = makeFixture();
        const result = computeFeeAndChange(fixture);
        assert.notEqual(result.changeIndex, null);
        const changeOut = result.outputs.find(o => o.is_change);
        assert.ok(changeOut);
        assert.ok(changeOut.value_sats >= 546, 'Change must be >= dust threshold');
    });

    // ─── 7. Balance equation ──────────────────────────────────────
    it('7. balance equation holds: inputs = outputs + fee', () => {
        const fixture = makeFixture();
        const result = computeFeeAndChange(fixture);
        const inputTotal = result.selectedInputs.reduce((s, u) => s + u.value_sats, 0);
        const outputTotal = result.outputs.reduce((s, o) => s + o.value_sats, 0);
        assert.equal(inputTotal, outputTotal + result.feeSats);
    });

    // ─── 8. Fee meets target rate ─────────────────────────────────
    it('8. fee meets target rate', () => {
        const fixture = makeFixture();
        const result = computeFeeAndChange(fixture);
        const minFee = Math.ceil(fixture.fee_rate_sat_vb * result.vbytes);
        assert.ok(result.feeSats >= minFee, `Fee ${result.feeSats} should be >= ${minFee}`);
    });
});

// ─── RBF / Locktime interaction matrix ────────────────────────────
describe('RBF / Locktime', () => {
    // ─── 9. RBF true → nSequence 0xFFFFFFFD ───────────────────────
    it('9. rbf true → nSequence=0xFFFFFFFD', () => {
        const result = computeRbfLocktime({ rbf: true });
        assert.equal(result.nSequence, 0xFFFFFFFD);
        assert.equal(result.rbfSignaling, true);
    });

    // ─── 10. RBF false → nSequence 0xFFFFFFFF ──────────────────────
    it('10. rbf false → nSequence=0xFFFFFFFF, nLockTime=0', () => {
        const result = computeRbfLocktime({ rbf: false });
        assert.equal(result.nSequence, 0xFFFFFFFF);
        assert.equal(result.nLockTime, 0);
        assert.equal(result.rbfSignaling, false);
    });

    // ─── 11. Locktime block height (499999999) ──────────────────────
    it('11. locktime=499999999 → block_height', () => {
        const result = computeRbfLocktime({ locktime: 499999999 });
        assert.equal(result.nLockTime, 499999999);
        assert.equal(result.locktimeType, 'block_height');
        assert.equal(result.nSequence, 0xFFFFFFFE);
    });

    // ─── 12. Locktime timestamp (500000000) ────────────────────────
    it('12. locktime=500000000 → unix_timestamp', () => {
        const result = computeRbfLocktime({ locktime: 500000000 });
        assert.equal(result.nLockTime, 500000000);
        assert.equal(result.locktimeType, 'unix_timestamp');
    });

    // ─── 13. Anti-fee-sniping: rbf+current_height ─────────────────
    it('13. anti-fee-sniping: rbf=true + current_height → nLockTime=current_height', () => {
        const result = computeRbfLocktime({ rbf: true, current_height: 860000 });
        assert.equal(result.nLockTime, 860000);
        assert.equal(result.locktimeType, 'block_height');
        assert.equal(result.nSequence, 0xFFFFFFFD);
    });

    // ─── 14. RBF + locktime ────────────────────────────────────────
    it('14. rbf=true + locktime → nSequence=0xFFFFFFFD, nLockTime=locktime', () => {
        const result = computeRbfLocktime({ rbf: true, locktime: 850000 });
        assert.equal(result.nSequence, 0xFFFFFFFD);
        assert.equal(result.nLockTime, 850000);
    });

    // ─── 15. No rbf, locktime present → nSequence=0xFFFFFFFE ──────
    it('15. locktime without rbf → nSequence=0xFFFFFFFE', () => {
        const result = computeRbfLocktime({ rbf: false, locktime: 850000 });
        assert.equal(result.nSequence, 0xFFFFFFFE);
        assert.equal(result.nLockTime, 850000);
    });
});

// ─── PSBT Construction ─────────────────────────────────────────────
describe('PSBT', () => {
    // ─── 16. PSBT decodes with correct magic ───────────────────────
    it('16. PSBT base64 starts with correct magic bytes', () => {
        const fixture = makeFixture();
        const result = computeFeeAndChange(fixture);
        const { nSequence, nLockTime } = computeRbfLocktime(fixture);
        const psbt = buildPsbt({
            selectedInputs: result.selectedInputs,
            outputs: result.outputs,
            nLockTime,
            nSequence,
            network: 'mainnet',
        });
        // Decode base64 and check magic
        const raw = Buffer.from(psbt, 'base64');
        assert.equal(raw[0], 0x70); // 'p'
        assert.equal(raw[1], 0x73); // 's'
        assert.equal(raw[2], 0x62); // 'b'
        assert.equal(raw[3], 0x74); // 't'
        assert.equal(raw[4], 0xff); // separator
    });
});

// ─── Warnings ──────────────────────────────────────────────────────
describe('Warnings', () => {
    // ─── 17. SEND_ALL warning ──────────────────────────────────────
    it('17. emits SEND_ALL when no change', () => {
        const warnings = generateWarnings({
            feeSats: 1000, feeRateSatVb: 5, changeIndex: null,
            outputs: [{ value_sats: 9000, is_change: false }],
            rbfSignaling: false,
        });
        assert.ok(warnings.some(w => w.code === 'SEND_ALL'));
    });

    // ─── 18. HIGH_FEE warning ─────────────────────────────────────
    it('18. emits HIGH_FEE when fee exceeds threshold', () => {
        const warnings = generateWarnings({
            feeSats: 2000000, feeRateSatVb: 5, changeIndex: 1,
            outputs: [{ value_sats: 70000 }, { value_sats: 28000, is_change: true }],
            rbfSignaling: false,
        });
        assert.ok(warnings.some(w => w.code === 'HIGH_FEE'));
    });

    // ─── 19. RBF_SIGNALING warning ─────────────────────────────────
    it('19. emits RBF_SIGNALING when rbf enabled', () => {
        const warnings = generateWarnings({
            feeSats: 700, feeRateSatVb: 5, changeIndex: 1,
            outputs: [{ value_sats: 70000 }, { value_sats: 29300, is_change: true }],
            rbfSignaling: true,
        });
        assert.ok(warnings.some(w => w.code === 'RBF_SIGNALING'));
    });
});

// ─── Validator ──────────────────────────────────────────────────────
describe('Validator', () => {
    // ─── 20. Rejects missing payments ─────────────────────────────
    it('20. rejects fixture with missing payments', () => {
        const bad = makeFixture();
        delete bad.payments;
        assert.throws(() => validateFixture(bad), { code: 'INVALID_FIXTURE' });
    });

    // ─── 21. Rejects bad script_pubkey_hex ────────────────────────
    it('21. rejects bad script_pubkey_hex', () => {
        const bad = makeFixture();
        bad.utxos[0].script_pubkey_hex = 'ZZZZ';
        assert.throws(() => validateFixture(bad), { code: 'INVALID_FIXTURE' });
    });
});

// ─── End-to-end ──────────────────────────────────────────────────────
describe('End-to-end Builder', () => {
    // ─── 22. Full build produces valid report ──────────────────────
    it('22. buildTransaction produces valid report with all required fields', () => {
        const fixture = makeFixture();
        const report = buildTransaction(fixture);
        assert.equal(report.ok, true);
        assert.equal(report.network, 'mainnet');
        assert.ok(report.selected_inputs.length > 0);
        assert.ok(report.outputs.length > 0);
        assert.ok(report.psbt_base64.length > 0);
        assert.equal(typeof report.fee_sats, 'number');
        assert.equal(typeof report.rbf_signaling, 'boolean');
        assert.equal(typeof report.locktime, 'number');
        assert.ok(['none', 'block_height', 'unix_timestamp'].includes(report.locktime_type));
        assert.ok(Array.isArray(report.warnings));
    });

    // ─── 23. Error report format ──────────────────────────────────
    it('23. buildErrorReport produces valid error format', () => {
        const err = buildErrorReport('TEST_ERROR', 'test message');
        assert.equal(err.ok, false);
        assert.equal(err.error.code, 'TEST_ERROR');
        assert.equal(err.error.message, 'test message');
    });
});

// ─── Vbytes estimation ──────────────────────────────────────────────
describe('Vbytes Estimation', () => {
    // ─── 24. Mixed input types vbytes ─────────────────────────────
    it('24. estimates vbytes for mixed input types', () => {
        const inputs = [
            { script_type: 'p2wpkh' },
            { script_type: 'p2tr' },
        ];
        const outputs = [
            { script_type: 'p2wpkh', script_pubkey_hex: '00142222222222222222222222222222222222222222' },
        ];
        const vbytes = estimateVbytes(inputs, outputs);
        // p2wpkh(68) + p2tr(57.5) + output(31) + overhead(10.5) = 167 → ceil = 167
        assert.ok(vbytes > 0);
        assert.equal(typeof vbytes, 'number');
        assert.ok(Number.isInteger(vbytes));
    });
});
