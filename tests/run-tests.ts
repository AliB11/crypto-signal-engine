import { testPivotDetection } from './pivots.test';
import { testSweepDetection } from './sweeps.test';
import { testSignalEngine } from './signal.test';
import { testBacktestEngine } from './backtest.test';

async function runAllTests() {
  console.log('========================================================');
  console.log('CRYPTO SIGNAL SCANNER - QUANTITATIVE TEST SUITE');
  console.log('========================================================\n');

  try {
    testPivotDetection();
    testSweepDetection();
    testSignalEngine();
    testBacktestEngine();

    console.log('\n========================================================');
    console.log('ALL UNIT & INTEGRATION TESTS PASSED SUCCESSFULLY! ✓');
    console.log('========================================================');
  } catch (err) {
    console.error('\nTEST SUITE FAILED ❌:', err);
    process.exit(1);
  }
}

runAllTests();
