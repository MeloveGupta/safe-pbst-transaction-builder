/**
 * validator.js — Defensive fixture parsing and validation
 */

const VALID_SCRIPT_TYPES = ['p2pkh', 'p2wpkh', 'p2sh-p2wpkh', 'p2tr', 'p2wsh', 'p2sh'];
const VALID_NETWORKS = ['mainnet', 'testnet', 'regtest', 'signet'];

export class ValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function isHex(str) {
  return typeof str === 'string' && /^[0-9a-fA-F]*$/.test(str) && str.length % 2 === 0;
}

function validateScriptPubkey(hex, label) {
  if (!hex || typeof hex !== 'string') {
    throw new ValidationError('INVALID_FIXTURE', `${label}: script_pubkey_hex is missing or not a string`);
  }
  if (!isHex(hex)) {
    throw new ValidationError('INVALID_FIXTURE', `${label}: script_pubkey_hex is not valid hex: ${hex}`);
  }
  if (hex.length < 2) {
    throw new ValidationError('INVALID_FIXTURE', `${label}: script_pubkey_hex too short`);
  }
}

function validateUtxo(utxo, index) {
  const label = `utxos[${index}]`;
  if (!utxo || typeof utxo !== 'object') {
    throw new ValidationError('INVALID_FIXTURE', `${label}: not an object`);
  }
  if (typeof utxo.txid !== 'string' || !/^[0-9a-fA-F]{64}$/.test(utxo.txid)) {
    throw new ValidationError('INVALID_FIXTURE', `${label}: txid must be a 64-char hex string`);
  }
  if (typeof utxo.vout !== 'number' || !Number.isInteger(utxo.vout) || utxo.vout < 0) {
    throw new ValidationError('INVALID_FIXTURE', `${label}: vout must be a non-negative integer`);
  }
  if (typeof utxo.value_sats !== 'number' || !Number.isInteger(utxo.value_sats) || utxo.value_sats <= 0) {
    throw new ValidationError('INVALID_FIXTURE', `${label}: value_sats must be a positive integer`);
  }
  validateScriptPubkey(utxo.script_pubkey_hex, label);
  if (!utxo.script_type || !VALID_SCRIPT_TYPES.includes(utxo.script_type)) {
    throw new ValidationError('INVALID_FIXTURE', `${label}: invalid script_type: ${utxo.script_type}`);
  }
}

function validatePayment(payment, index) {
  const label = `payments[${index}]`;
  if (!payment || typeof payment !== 'object') {
    throw new ValidationError('INVALID_FIXTURE', `${label}: not an object`);
  }
  if (typeof payment.value_sats !== 'number' || !Number.isInteger(payment.value_sats) || payment.value_sats <= 0) {
    throw new ValidationError('INVALID_FIXTURE', `${label}: value_sats must be a positive integer`);
  }
  validateScriptPubkey(payment.script_pubkey_hex, label);
  if (!payment.script_type || !VALID_SCRIPT_TYPES.includes(payment.script_type)) {
    throw new ValidationError('INVALID_FIXTURE', `${label}: invalid script_type: ${payment.script_type}`);
  }
}

function validateChange(change) {
  if (!change || typeof change !== 'object') {
    throw new ValidationError('INVALID_FIXTURE', 'change: not an object');
  }
  validateScriptPubkey(change.script_pubkey_hex, 'change');
  if (!change.script_type || !VALID_SCRIPT_TYPES.includes(change.script_type)) {
    throw new ValidationError('INVALID_FIXTURE', `change: invalid script_type: ${change.script_type}`);
  }
}

export function validateFixture(fixture) {
  if (!fixture || typeof fixture !== 'object') {
    throw new ValidationError('INVALID_FIXTURE', 'Fixture must be a JSON object');
  }

  // Network
  if (!fixture.network || !VALID_NETWORKS.includes(fixture.network)) {
    throw new ValidationError('INVALID_FIXTURE', `Invalid or missing network: ${fixture.network}`);
  }

  // UTXOs
  if (!Array.isArray(fixture.utxos) || fixture.utxos.length === 0) {
    throw new ValidationError('INVALID_FIXTURE', 'utxos must be a non-empty array');
  }
  fixture.utxos.forEach((u, i) => validateUtxo(u, i));

  // Payments
  if (!Array.isArray(fixture.payments) || fixture.payments.length === 0) {
    throw new ValidationError('INVALID_FIXTURE', 'payments must be a non-empty array');
  }
  fixture.payments.forEach((p, i) => validatePayment(p, i));

  // Change
  validateChange(fixture.change);

  // Fee rate
  if (typeof fixture.fee_rate_sat_vb !== 'number' || fixture.fee_rate_sat_vb <= 0) {
    throw new ValidationError('INVALID_FIXTURE', 'fee_rate_sat_vb must be a positive number');
  }

  // Optional fields type checks
  if (fixture.rbf !== undefined && typeof fixture.rbf !== 'boolean') {
    throw new ValidationError('INVALID_FIXTURE', 'rbf must be a boolean if provided');
  }
  if (fixture.locktime !== undefined) {
    if (typeof fixture.locktime !== 'number' || !Number.isInteger(fixture.locktime) || fixture.locktime < 0) {
      throw new ValidationError('INVALID_FIXTURE', 'locktime must be a non-negative integer');
    }
  }
  if (fixture.current_height !== undefined) {
    if (typeof fixture.current_height !== 'number' || !Number.isInteger(fixture.current_height) || fixture.current_height < 0) {
      throw new ValidationError('INVALID_FIXTURE', 'current_height must be a non-negative integer');
    }
  }
  if (fixture.policy !== undefined && typeof fixture.policy !== 'object') {
    throw new ValidationError('INVALID_FIXTURE', 'policy must be an object');
  }
  if (fixture.policy?.max_inputs !== undefined) {
    if (typeof fixture.policy.max_inputs !== 'number' || !Number.isInteger(fixture.policy.max_inputs) || fixture.policy.max_inputs < 1) {
      throw new ValidationError('INVALID_FIXTURE', 'policy.max_inputs must be a positive integer');
    }
  }

  return fixture;
}
