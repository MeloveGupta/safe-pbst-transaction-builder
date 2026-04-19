/**
 * rbf-locktime.js — RBF and locktime interaction matrix
 *
 * Implements the exact rules from the README:
 *
 * nSequence:
 *   rbf: true                        → 0xFFFFFFFD
 *   rbf: false + locktime present    → 0xFFFFFFFE
 *   otherwise                        → 0xFFFFFFFF
 *
 * nLockTime:
 *   locktime provided                → that value
 *   rbf: true + current_height       → current_height (anti-fee-sniping)
 *   otherwise                        → 0
 */

const SEQUENCE_FINAL = 0xFFFFFFFF;
const SEQUENCE_LOCKTIME = 0xFFFFFFFE;  // locktime enabled, no RBF
const SEQUENCE_RBF = 0xFFFFFFFD;  // RBF signaling

/**
 * Compute nSequence and nLockTime from fixture fields
 * @param {Object} fixture
 * @returns {{ nSequence: number, nLockTime: number, rbfSignaling: boolean, locktimeType: string }}
 */
export function computeRbfLocktime(fixture) {
    const rbf = fixture.rbf === true;
    const hasLocktime = fixture.locktime !== undefined && fixture.locktime !== null;
    const hasCurrentHeight = fixture.current_height !== undefined && fixture.current_height !== null;

    let nSequence;
    let nLockTime;

    if (rbf) {
        // RBF is true → always signal RBF
        nSequence = SEQUENCE_RBF;

        if (hasLocktime) {
            nLockTime = fixture.locktime;
        } else if (hasCurrentHeight) {
            // Anti-fee-sniping
            nLockTime = fixture.current_height;
        } else {
            nLockTime = 0;
        }
    } else {
        // RBF is false or absent
        if (hasLocktime) {
            nSequence = SEQUENCE_LOCKTIME;
            nLockTime = fixture.locktime;
        } else {
            nSequence = SEQUENCE_FINAL;
            nLockTime = 0;
        }
    }

    const rbfSignaling = nSequence <= SEQUENCE_RBF;

    let locktimeType;
    if (nLockTime === 0) {
        locktimeType = 'none';
    } else if (nLockTime < 500_000_000) {
        locktimeType = 'block_height';
    } else {
        locktimeType = 'unix_timestamp';
    }

    return { nSequence, nLockTime, rbfSignaling, locktimeType };
}
