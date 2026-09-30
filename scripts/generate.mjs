import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const require=createRequire(import.meta.url);
const env={...process.env};
if(process.platform==='win32'){
  const engine=resolve('node_modules/@prisma/engines/query_engine-windows.dll.node');
  if(existsSync(engine)) env.PRISMA_QUERY_ENGINE_LIBRARY=engine;
}
const child=spawn(process.execPath,[require.resolve('prisma/build/index.js'),'generate'],{stdio:'inherit',env});
child.on('close',code=>process.exit(code??0));
