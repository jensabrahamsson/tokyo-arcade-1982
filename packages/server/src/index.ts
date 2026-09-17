import { networkInterfaces } from 'node:os';
import { createGameServer } from './http';

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

async function main(): Promise<void> {
  const handle = await createGameServer({ port: PORT, dataDir: DATA_DIR });
  console.log('');
  console.log('  █████  ██    ██   ██  █████  ██████  ');
  console.log('  ██  ██ ██    ██   ██ ██   ██ ██      1982');
  console.log('  █████  ██    ██ ███████ ██████  ██  ██  ');
  console.log('  ██  ██  ██  ██     ██ ██   ██ ██   ██ TOKYO ARCADE HALL');
  console.log('');
  console.log(`  Listening on port ${handle.port}. Point your browser here:`);
  for (const addr of lanAddresses()) {
    const ip = addr.split(' ')[0]!;
    console.log(`    http://${ip}:${handle.port}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
