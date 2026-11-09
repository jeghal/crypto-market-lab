import { runAndExit } from './run_result_tests.mjs';
import { runRegressionTests } from './run_regression_tests.mjs';

await runRegressionTests();
await runAndExit({ unit: true, live: false });

