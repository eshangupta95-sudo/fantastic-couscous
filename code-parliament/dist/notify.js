#!/usr/bin/env node
/**
 * Parliament Notification Script
 *
 * This script is designed to be called by Claude Code hooks after file operations.
 * It checks for pending alerts and outputs them for Claude to see.
 *
 * Usage:
 *   parliament-notify [--json]
 *
 * Options:
 *   --json    Output raw JSON instead of formatted text
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
const ALERTS_FILE = join(homedir(), '.parliament', 'alerts.json');
function getAlerts() {
    try {
        if (existsSync(ALERTS_FILE)) {
            const content = readFileSync(ALERTS_FILE, 'utf-8');
            return JSON.parse(content);
        }
    }
    catch (e) {
        // Ignore errors
    }
    return [];
}
function clearAlerts() {
    try {
        writeFileSync(ALERTS_FILE, '[]');
    }
    catch (e) {
        // Ignore errors
    }
}
function formatAlert(alert) {
    const severityIcon = {
        critical: '\u{1F6A8}',
        high: '\u{26A0}\u{FE0F}',
        medium: '\u{1F7E1}',
        low: '\u{1F535}',
    }[alert.severity];
    return `${severityIcon} ${alert.filePath}: ${alert.score}% - ${alert.topIssue}`;
}
function main() {
    const args = process.argv.slice(2);
    const jsonOutput = args.includes('--json');
    const alerts = getAlerts();
    if (alerts.length === 0) {
        if (jsonOutput) {
            console.log(JSON.stringify({ alerts: [], hasAlerts: false }));
        }
        process.exit(0);
    }
    if (jsonOutput) {
        console.log(JSON.stringify({ alerts, hasAlerts: true }));
    }
    else {
        console.log('');
        console.log('\u2501'.repeat(60));
        console.log('\u{1F3DB}\u{FE0F} PARLIAMENT ALERT');
        console.log('\u2501'.repeat(60));
        for (const alert of alerts) {
            console.log(formatAlert(alert));
            if (alert.suggestion) {
                console.log(`   \u{1F449} ${alert.suggestion}`);
            }
        }
        console.log('\u2501'.repeat(60));
        console.log('');
    }
    // Clear alerts after displaying
    clearAlerts();
}
main();
//# sourceMappingURL=notify.js.map