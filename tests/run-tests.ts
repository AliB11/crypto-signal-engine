import { testPivotDetection } from './pivots.test';
import { testSweepDetection } from './sweeps.test';
import { testSignalEngine } from './signal.test';
import { testBacktestEngine } from './backtest.test';
import { testDeterministicSimulation } from './simulation.test';
import {
  testLiquidityNoLookAhead,
  testSessionLevelSweeps,
  testPreviousWeekLevels,
  testAdxRegime,
  testVolumeTransparency,
} from './analysis.test';
import { testSignalTargetLadder, testLiquidityMappedTargets } from './signal-ladder.test';
import { testApiValidation, testRateLimiter, testResampling, testRiskMetrics } from './platform.test';
import { testSignalLifecycle, testMarketPulse, testLiquidityMagnets } from './features.test';

async function runAllTests() {
  console.log('========================================================');
  console.log('CRYPTO SIGNAL SCANNER - QUANTITATIVE TEST SUITE');
  console.log('========================================================\n');

  try {
    testPivotDetection();
    testSweepDetection();
    testSignalEngine();
    testSignalTargetLadder();
    testLiquidityMappedTargets();
    testLiquidityNoLookAhead();
    testSessionLevelSweeps();
    testPreviousWeekLevels();
    testAdxRegime();
    testVolumeTransparency();
    testDeterministicSimulation();
    testBacktestEngine();
    testRiskMetrics();
    testResampling();
    testApiValidation();
    testRateLimiter();
    testSignalLifecycle();
    testMarketPulse();
    testLiquidityMagnets();

    console.log('\n========================================================');
    console.log('ALL UNIT & INTEGRATION TESTS PASSED SUCCESSFULLY! ✓');
    console.log('========================================================');
  } catch (err) {
    console.error('\nTEST SUITE FAILED ❌:', err);
    process.exit(1);
  }
}

runAllTests();
