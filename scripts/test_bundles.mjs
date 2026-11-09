import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const preload=new URL('offline-market.mjs',import.meta.url).href;
for(const project of ['data_pipeline','trading-dashboard/radar']){
  const cwd=fileURLToPath(new URL('../'+project+'/',import.meta.url));
  const result=spawnSync(process.execPath,['--import',preload,'run_bundle_and_test.mjs'],{cwd,encoding:'utf8'});
  if(result.status!==0){console.error(result.stdout,result.stderr);process.exitCode=1;}
  else console.log(`PASS ${project}: complete offline bundle generation and manifest validation`);
}
