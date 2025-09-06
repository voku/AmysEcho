#!/usr/bin/env node

/**
 * Comprehensive DGS Test Runner
 * Executes tests with proper configuration and reporting
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DGSTestRunner {
  constructor() {
    this.config = null;
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      suites: {}
    };
  }

  async loadConfig() {
    try {
      const configPath = path.join(__dirname, 'test-config.json');
      const configData = await fs.readFile(configPath, 'utf8');
      this.config = JSON.parse(configData);
      console.log('✓ Test configuration loaded');
    } catch (error) {
      console.error('Failed to load test configuration:', error.message);
      process.exit(1);
    }
  }

  async runTests(environment = 'ci') {
    const startTime = Date.now();
    const envConfig = this.config.environments[environment];

    if (!envConfig) {
      console.error(`Unknown environment: ${environment}`);
      process.exit(1);
    }

    console.log(`🚀 Running DGS tests in ${environment} environment`);
    console.log(`Suites: ${envConfig.suites.join(', ')}`);
    console.log(`Parallel: ${envConfig.parallel ? 'Yes' : 'No'}`);
    if (envConfig.maxWorkers) {
      console.log(`Max workers: ${envConfig.maxWorkers}`);
    }
    console.log('');

    const results = [];

    if (envConfig.parallel && envConfig.suites.length > 1) {
      // Run suites in parallel
      const promises = envConfig.suites.map(suite => this.runSuite(suite));
      results.push(...await Promise.all(promises));
    } else {
      // Run suites sequentially
      for (const suite of envConfig.suites) {
        const result = await this.runSuite(suite);
        results.push(result);
      }
    }

    this.results.duration = Date.now() - startTime;
    this.summarizeResults(results);

    return this.results;
  }

  async runSuite(suiteName) {
    const suiteConfig = this.config.testSuites[suiteName];
    if (!suiteConfig) {
      console.error(`Unknown test suite: ${suiteName}`);
      return { suite: suiteName, status: 'error', error: 'Unknown suite' };
    }

    console.log(`📋 Running ${suiteName}: ${suiteConfig.description}`);

    const startTime = Date.now();
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    try {
      for (const file of suiteConfig.files) {
        const filePath = path.join(__dirname, 'test', file);

        try {
          await fs.access(filePath);
        } catch {
          console.log(`  ⚠️  ${file} not found, skipping`);
          skipped++;
          continue;
        }

        try {
          console.log(`  🧪 Running ${file}...`);
          const result = execSync(
            `cd ${__dirname} && npm test -- --grep "${suiteName}"`,
            {
              encoding: 'utf8',
              timeout: suiteConfig.timeout || 30000,
              stdio: 'pipe'
            }
          );

          // Parse test results from output
          const testCount = (result.match(/✔/g) || []).length;
          const failCount = (result.match(/✖/g) || []).length;
          const skipCount = (result.match(/skipped/g) || []).length;

          passed += testCount;
          failed += failCount;
          skipped += skipCount;

          console.log(`    ✅ ${testCount} passed, ${failCount} failed, ${skipCount} skipped`);

        } catch (error) {
          console.log(`    ❌ ${file} failed: ${error.message}`);
          failed++;
        }
      }

      const duration = Date.now() - startTime;
      const status = failed === 0 ? 'passed' : 'failed';

      console.log(`📊 ${suiteName} completed in ${duration}ms: ${passed} passed, ${failed} failed, ${skipped} skipped`);

      return {
        suite: suiteName,
        status,
        passed,
        failed,
        skipped,
        duration
      };

    } catch (error) {
      console.error(`Suite ${suiteName} failed:`, error.message);
      return {
        suite: suiteName,
        status: 'error',
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  summarizeResults(suiteResults) {
    console.log('\n' + '='.repeat(50));
    console.log('📊 DGS TEST SUMMARY');
    console.log('='.repeat(50));

    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let totalDuration = 0;

    for (const result of suiteResults) {
      if (result.status === 'error') {
        console.log(`❌ ${result.suite}: ERROR - ${result.error}`);
        totalFailed++;
      } else {
        const status = result.status === 'passed' ? '✅' : '❌';
        console.log(`${status} ${result.suite}: ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped (${result.duration}ms)`);
        totalPassed += result.passed;
        totalFailed += result.failed;
        totalSkipped += result.skipped;
      }
      totalDuration += result.duration || 0;
    }

    console.log('='.repeat(50));
    console.log(`Total: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped`);
    console.log(`Duration: ${totalDuration}ms`);
    console.log(`Success Rate: ${totalPassed + totalFailed > 0 ? ((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1) : 0}%`);

    if (totalFailed === 0) {
      console.log('🎉 All tests passed!');
    } else {
      console.log('⚠️  Some tests failed. Check logs above.');
      process.exit(1);
    }
  }

  async generateReport(results) {
    const report = {
      timestamp: new Date().toISOString(),
      environment: process.argv[3] || 'ci',
      results: this.results,
      config: this.config
    };

    const reportPath = path.join(__dirname, 'test-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 Report saved to ${reportPath}`);
  }
}

// Main execution
async function main() {
  const runner = new DGSTestRunner();
  await runner.loadConfig();

  const environment = process.argv[2] || 'ci';
  const results = await runner.runTests(environment);

  await runner.generateReport(results);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

export default DGSTestRunner;