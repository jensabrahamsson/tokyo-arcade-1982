import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { createGameServer, isFatalNetError, safeLog } from './http';
import { loadTypesafeEnvFile } from './jevPolicy';

function lanAddresses(): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push(`${a.address} (${a.netmask})`);
    }
  }
  return out;
}

const PORT = Number(process.env.ARKAD_PORT ?? 8442);
const DATA_DIR = process.env.ARKAD_DATA ?? './data';

process.on('uncaughtException', (err) => {
  if (isFatalNetError(err)) {
    safeLog('[arkad] FATAL:', err);
    process.exit(1);
  }
  safeLog('[arkad] uncaught exception (kept alive):', err);
});
process.on('unhandledRejection', (reason) => {
  if (isFatalNetError(reason)) {
    safeLog('[arkad] FATAL rejection:', reason);
    process.exit(1);
  }
  safeLog('[arkad] unhandled rejection (kept alive):', reason);
});

async function main(): Promise<void> {
  // gitignored repo-root .env.typesafe; shell env wins; never log the value
  loadTypesafeEnvFile(process.env, [process.cwd(), join(__dirname, '..', '..')]);
  const handle = await createGameServer({ port: PORT, dataDir: DATA_DIR });
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      safeLog(`[arkad] ${sig}: closing the hall`);
      void handle.close().then(() => process.exit(0));
    });
  }
  safeLog('');
  safeLog('  █████  ██    ██   ██  █████  ██████  ');
  safeLog('  ██  ██ ██    ██   ██ ██   ██ ██      1982');
  safeLog('  █████  ██    ██ ███████ ██████  ██  ██  ');
  safeLog('  ██  ██  ██  ██     ██ ██   ██ ██   ██ TOKYO ARCADE HALL');
  safeLog('');
  safeLog(`  Listening on port ${handle.port}. Point your browser here:`);
  for (const addr of lanAddresses()) {
    const ip = addr.split(' ')[0]!;
    safeLog(`    http://${ip}:${handle.port}`);
  }
  safeLog('');
}

main().catch((err) => {
  safeLog(err);
  process.exit(isFatalNetError(err) ? 1 : 1);
});
