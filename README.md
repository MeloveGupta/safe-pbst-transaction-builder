# Safe PSBT Transaction Builder

A **Bitcoin PSBT (BIP-174) transaction builder** with coin selection, fee estimation, RBF signaling, locktime support, and an interactive web UI - built in Node.js with `bitcoinjs-lib`.

---

## Features

- **Greedy coin selection** - largest-first UTXO selection with configurable `max_inputs` policy
- **Iterative fee/change convergence** - handles edge cases where adding/removing change alters tx size and required fee
- **Full RBF/locktime matrix** - correct `nSequence` and `nLockTime` per BIP-125 and anti-fee-sniping rules
- **Multi-script support** - P2WPKH, P2TR, P2PKH, P2SH-P2WPKH, P2SH, P2WSH
- **Dust protection** - prevents creation of uneconomical outputs (< 546 sats)
- **Safety warnings** - `HIGH_FEE`, `DUST_CHANGE`, `SEND_ALL`, `RBF_SIGNALING`
- **Valid BIP-174 PSBT** - base64-encoded with witness UTXO metadata
- **Web UI** - dark-themed transaction visualizer with drag-and-drop fixture loading
- **CLI interface** - batch-process fixture files with JSON report output

---

## Demo

https://drive.google.com/file/d/1lrd0yB1KhhYni8kTVvKpELGlbfoWuPkt/view?usp=sharing

---

## Quick Start

```bash
# Install dependencies
npm install

# Run the CLI with a fixture
./cli.sh fixtures/basic_change_p2wpkh.json

# Start the web UI
./web.sh
# → http://127.0.0.1:3000
```

---

## Architecture

```
src/
├── builder.js          # Orchestrator: validate → select → fee → RBF → PSBT → report
├── validator.js        # Defensive fixture parsing and validation
├── coin-selection.js   # Greedy largest-first UTXO selection
├── fee-change.js       # Iterative fee/change convergence loop
├── vbytes.js           # Virtual byte estimation per script type
├── rbf-locktime.js     # nSequence/nLockTime computation (BIP-125 matrix)
├── psbt.js             # BIP-174 PSBT construction via bitcoinjs-lib
├── warnings.js         # Safety warning code generation
├── server.js           # Express API server
└── cli.js              # CLI entry point
public/
└── index.html          # Single-page web UI
tests/
└── test.js             # Unit tests (Node.js test runner)
fixtures/               # Sample fixture files
```

---

## CLI Usage

```bash
./cli.sh <fixture.json>
```

Reads a fixture file, builds the transaction, and writes a JSON report to `out/<fixture_name>.json`.

### Example

```bash
./cli.sh fixtures/basic_change_p2wpkh.json
cat out/basic_change_p2wpkh.json | jq '.fee_sats, .change_index, .warnings'
```

### Output Format

```json
{
  "ok": true,
  "network": "mainnet",
  "strategy": "greedy",
  "selected_inputs": [...],
  "outputs": [...],
  "change_index": 1,
  "fee_sats": 700,
  "fee_rate_sat_vb": 5.0,
  "vbytes": 140,
  "rbf_signaling": true,
  "locktime": 850000,
  "locktime_type": "block_height",
  "psbt_base64": "cHNidP8BAFICAAAA...",
  "warnings": [
    { "code": "SEND_ALL" },
    { "code": "RBF_SIGNALING" }
  ]
}
```

---

## Web API

Start the server with `./web.sh` (default port 3000, override with `PORT` env var).

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Health check → `{ "ok": true }` |
| `/api/build` | POST | Build PSBT from fixture JSON body |

---

## Fixture Format

```json
{
  "network": "mainnet",
  "utxos": [
    {
      "txid": "abc123...",
      "vout": 0,
      "value_sats": 100000,
      "script_pubkey_hex": "0014...",
      "script_type": "p2wpkh",
      "address": "bc1..."
    }
  ],
  "payments": [
    {
      "address": "bc1...",
      "script_pubkey_hex": "0014...",
      "script_type": "p2wpkh",
      "value_sats": 70000
    }
  ],
  "change": {
    "address": "bc1...",
    "script_pubkey_hex": "0014...",
    "script_type": "p2wpkh"
  },
  "fee_rate_sat_vb": 5,
  "rbf": true,
  "locktime": 850000,
  "current_height": 850000,
  "policy": { "max_inputs": 5 }
}
```

---

## RBF & Locktime

The builder implements the full BIP-125 interaction matrix:

| RBF | Locktime | Current Height | nSequence | nLockTime |
|-----|----------|----------------|-----------|-----------|
| off | absent | - | `0xFFFFFFFF` | `0` |
| off | present | - | `0xFFFFFFFE` | locktime |
| on | absent | present | `0xFFFFFFFD` | current_height |
| on | present | - | `0xFFFFFFFD` | locktime |
| on | absent | absent | `0xFFFFFFFD` | `0` |

---

## Fee & Change Logic

- Fee must meet or exceed `ceil(fee_rate × vbytes)`
- Change output created only when leftover exceeds the dust threshold (546 sats)
- Iterative convergence handles the circular dependency: adding change alters tx size, which alters fee
- When no change is created, all leftover is absorbed as fee (send-all)

---

## Tests

```bash
npm test
```

Runs 15+ unit tests covering coin selection, fee/change edge cases, and PSBT structure validation.

---

## Tech Stack

- **Runtime:** Node.js (ES modules)
- **Bitcoin:** [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib) v7
- **Server:** Express.js
- **Frontend:** Vanilla HTML/CSS/JS with Inter + JetBrains Mono fonts
