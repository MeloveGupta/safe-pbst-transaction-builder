/**
 * cli.js — CLI entry point for the PSBT transaction builder
 *
 * Usage: node src/cli.js <fixture.json> <output.json>
 */

import { readFileSync, writeFileSync } from 'fs';
import { buildTransaction, buildErrorReport } from './builder.js';
import { ValidationError } from './validator.js';

const args = process.argv.slice(2);
const fixturePath = args[0];
const outputPath = args[1];

if (!fixturePath || !outputPath) {
    console.error('Usage: node src/cli.js <fixture.json> <output.json>');
    process.exit(1);
}

try {
    // Read and parse fixture
    const raw = readFileSync(fixturePath, 'utf-8');
    let fixture;
    try {
        fixture = JSON.parse(raw);
    } catch (e) {
        const report = buildErrorReport('INVALID_FIXTURE', `Invalid JSON: ${e.message}`);
        writeFileSync(outputPath, JSON.stringify(report, null, 2));
        console.error(`Error: Invalid JSON in fixture file: ${e.message}`);
        process.exit(1);
    }

    // Build transaction
    const report = buildTransaction(fixture);

    // Write output
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    process.exit(0);

} catch (e) {
    const code = e instanceof ValidationError ? e.code : 'BUILD_ERROR';
    const message = e.message || 'Unknown error';
    const report = buildErrorReport(code, message);

    try {
        writeFileSync(outputPath, JSON.stringify(report, null, 2));
    } catch (writeErr) {
        console.error(`Error writing output: ${writeErr.message}`);
    }

    console.error(`Error: ${message}`);
    process.exit(1);
}
