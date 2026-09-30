import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'dev','-H','127.0.0.1'],{stdio:'inherit',env:{...process.env,NODE_ENV:'development'}});
child.on('close',code=>process.exit(code??0));
