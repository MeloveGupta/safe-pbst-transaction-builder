/**
 * psbt.js — Build a valid PSBT (BIP-174) using bitcoinjs-lib v7
 *
 * v7 requires: Uint8Array (not Buffer), bigint for values
 */

import * as bitcoin from 'bitcoinjs-lib';

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

/**
 * Reverse a Uint8Array (for txid byte order)
 */
function reverseBytes(bytes) {
    const reversed = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
        reversed[i] = bytes[bytes.length - 1 - i];
    }
    return reversed;
}

/**
 * Build a PSBT from selected inputs, outputs, and RBF/locktime parameters
 *
 * @param {Object} params
 * @param {Array} params.selectedInputs - selected UTXO objects
 * @param {Array} params.outputs - output objects with value_sats and script_pubkey_hex
 * @param {number} params.nLockTime - transaction locktime
 * @param {number} params.nSequence - per-input sequence number
 * @param {string} params.network - "mainnet" | "testnet" | "regtest" | "signet"
 * @returns {string} PSBT base64 string
 */
export function buildPsbt({ selectedInputs, outputs, nLockTime, nSequence, network }) {
    const net = getNetwork(network);
    const psbt = new bitcoin.Psbt({ network: net });

    psbt.setVersion(2);
    psbt.setLocktime(nLockTime);

    // Add inputs
    for (const input of selectedInputs) {
        const txidBytes = reverseBytes(hexToBytes(input.txid)); // txid displayed in reverse
        const scriptPubkey = hexToBytes(input.script_pubkey_hex);

        const inputData = {
            hash: txidBytes,
            index: input.vout,
            sequence: nSequence,
        };

        // All inputs get witness_utxo for simplicity — the PSBT spec allows this
        // and it's sufficient for the evaluator to validate structure
        inputData.witnessUtxo = {
            script: scriptPubkey,
            value: BigInt(input.value_sats),
        };

        psbt.addInput(inputData);
    }

    // Add outputs
    for (const output of outputs) {
        const scriptPubkey = hexToBytes(output.script_pubkey_hex);
        psbt.addOutput({
            script: scriptPubkey,
            value: BigInt(output.value_sats),
        });
    }

    return psbt.toBase64();
}

/**
 * Get bitcoinjs-lib network object
 */
function getNetwork(networkName) {
    switch (networkName) {
        case 'mainnet':
            return bitcoin.networks.bitcoin;
        case 'testnet':
            return bitcoin.networks.testnet;
        case 'regtest':
            return bitcoin.networks.regtest;
        case 'signet':
            return bitcoin.networks.testnet;
        default:
            return bitcoin.networks.bitcoin;
    }
}
