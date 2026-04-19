/**
 * server.js — Express web server for Coin Smith
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { buildTransaction, buildErrorReport } from './builder.js';
import { ValidationError } from './validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = parseInt(process.env.PORT || '3000', 10);

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, '..', 'public')));
app.use('/fixtures', express.static(join(__dirname, '..', 'fixtures')));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ ok: true });
});

// Build PSBT from fixture
app.post('/api/build', (req, res) => {
    try {
        const fixture = req.body;
        if (!fixture || typeof fixture !== 'object') {
            return res.status(400).json(buildErrorReport('INVALID_FIXTURE', 'Request body must be a JSON object'));
        }
        const report = buildTransaction(fixture);
        res.json(report);
    } catch (e) {
        const code = e instanceof ValidationError ? e.code : 'BUILD_ERROR';
        const message = e.message || 'Unknown error';
        res.status(400).json(buildErrorReport(code, message));
    }
});

app.listen(PORT, '127.0.0.1', () => {
    console.log(`http://127.0.0.1:${PORT}`);
});
