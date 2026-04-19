/**
 * vbytes.js — Deterministic virtual-bytes estimation for Bitcoin transactions
 *
 * Weight-based calculation: vbytes = ceil(weight / 4)
 *
 * Reference sizes (in weight units):
 *   TX overhead:
 *     - version:  4 bytes = 16 WU
 *     - locktime: 4 bytes = 16 WU
 *     - input count (varint): 1 byte = 4 WU
 *     - output count (varint): 1 byte = 4 WU
 *     - segwit marker+flag: 2 bytes = 2 WU (only if segwit)
 *     Total non-segwit: 10 bytes = 40 WU
 *     Total segwit:     10 bytes * 4 + 2 witness = 42 WU → 10.5 vbytes
 */

// Input sizes in vbytes (commonly accepted values)
const INPUT_VBYTES = {
    'p2pkh': 148,    // 32+4+1+107+4 = 148 bytes, no witness
    'p2wpkh': 68,     // non-witness: 32+4+1+1+4 = 41 bytes (164 WU) + witness: 1+72+33 = 107 bytes (107 WU) = 271 WU → 68 vbytes (ceil(271/4)=68)
    'p2sh-p2wpkh': 91,     // non-witness: 32+4+1+23+4 = 64 bytes (256 WU) + witness: 107 bytes (107 WU) = 363 WU → 91 vbytes
    'p2tr': 57.5,   // non-witness: 32+4+1+1+4 = 41 bytes (164 WU) + witness: 1+64 = 65 bytes (65 WU) = 229 WU → 57.25 → typically 57.5
    'p2wsh': 104,    // estimated for typical 1-of-1 multisig
    'p2sh': 148,    // similar to p2pkh as fallback
};

// Output sizes in vbytes (all output bytes are non-witness, so 1 byte = 1 vbyte)
const OUTPUT_VBYTES = {
    'p2pkh': 34,     // 8 (value) + 1 (scriptLen) + 25 (script) = 34
    'p2wpkh': 31,     // 8 + 1 + 22 = 31
    'p2sh-p2wpkh': 32,     // 8 + 1 + 23 = 32 (output looks like p2sh)
    'p2sh': 32,     // 8 + 1 + 23 = 32
    'p2tr': 43,     // 8 + 1 + 34 = 43
    'p2wsh': 43,     // 8 + 1 + 34 = 43
};

/**
 * Check if transaction has any segwit inputs
 */
function hasSegwit(inputs) {
    const segwitTypes = ['p2wpkh', 'p2sh-p2wpkh', 'p2tr', 'p2wsh'];
    return inputs.some(inp => segwitTypes.includes(inp.script_type));
}

/**
 * Get vbytes for a single input by script type
 */
function inputVbytes(scriptType) {
    return INPUT_VBYTES[scriptType] || 148; // fallback to p2pkh size
}

/**
 * Get vbytes for a single output by script type.
 * If script_pubkey_hex is provided, calculate from actual script length.
 */
function outputVbytes(scriptType, scriptPubkeyHex) {
    // If we have the actual script, compute precise size
    if (scriptPubkeyHex) {
        const scriptLen = scriptPubkeyHex.length / 2;
        return 8 + 1 + scriptLen; // value (8) + varint scriptLen (1) + script
    }
    return OUTPUT_VBYTES[scriptType] || 34; // fallback
}

/**
 * Estimate total vbytes for a transaction
 * @param {Array} inputs - selected input objects with script_type
 * @param {Array} outputs - output objects with script_type and script_pubkey_hex
 * @returns {number} estimated vbytes (ceiled integer)
 */
export function estimateVbytes(inputs, outputs) {
    const isSegwit = hasSegwit(inputs);

    // Overhead: version(4) + locktime(4) + vin_count(1) + vout_count(1) = 10 bytes
    // For segwit: +0.5 vbytes for marker+flag (2 WU / 4)
    let overhead = isSegwit ? 10.5 : 10;

    // Handle larger varint for input/output counts
    if (inputs.length >= 253) overhead += (isSegwit ? 2 : 2);
    if (outputs.length >= 253) overhead += (isSegwit ? 2 : 2);

    let totalInputVbytes = 0;
    for (const inp of inputs) {
        totalInputVbytes += inputVbytes(inp.script_type);
    }

    let totalOutputVbytes = 0;
    for (const out of outputs) {
        totalOutputVbytes += outputVbytes(out.script_type, out.script_pubkey_hex);
    }

    const total = overhead + totalInputVbytes + totalOutputVbytes;
    return Math.ceil(total);
}

/**
 * Get input vbytes by script type (exported for testing)
 */
export function getInputVbytes(scriptType) {
    return inputVbytes(scriptType);
}

/**
 * Get output vbytes by script type (exported for testing)
 */
export function getOutputVbytes(scriptType) {
    return OUTPUT_VBYTES[scriptType] || 34;
}
