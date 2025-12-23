#!/usr/bin/env node
import { ParliamentDaemon } from './daemon/index.js';
import { startMCPServer } from './mcp/index.js';
import { startDashboard } from './dashboard/server.js';
import { logger } from './utils/logger.js';
const log = logger;
async function main() {
    const args = process.argv.slice(2);
    const projectPath = args[0] || process.cwd();
    log.info(`Starting Code Parliament for: ${projectPath}`);
    // Create daemon
    const daemon = new ParliamentDaemon({ projectPath });
    // Start daemon
    daemon.start();
    // Start dashboard if enabled
    const config = daemon.getConfig();
    if (config.dashboard.enabled) {
        startDashboard(daemon, config.dashboard.port);
    }
    // Check if running as MCP server (stdin is not a TTY)
    if (!process.stdin.isTTY) {
        log.info('Running as MCP server');
        await startMCPServer(daemon);
    }
    // Handle shutdown
    const shutdown = () => {
        log.info('Shutting down...');
        daemon.stop();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    log.info('Code Parliament is running');
    log.info(`Dashboard: http://localhost:${config.dashboard.port}`);
}
main().catch((error) => {
    log.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map