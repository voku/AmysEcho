#!/usr/bin/env node

/**
 * OpenAI Gesture Validation Integration Test Runner
 *
 * Runs comprehensive integration tests for the OpenAI validation system
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '..');
const TEST_DIR = path.join(__dirname, 'test');

console.log('🚀 Starting OpenAI Gesture Validation Integration Tests\n');

// Test categories to run
const testCategories = [
  {
    name: 'Server Integration Tests',
    path: path.join(ROOT_DIR, 'server/test/integration'),
    description: 'Tests OpenAI Vision service integration with server'
  },
  {
    name: 'Client Integration Tests',
    path: path.join(ROOT_DIR, 'app/test/integration'),
    description: 'Tests React Native client integration with validation service'
  },
  {
    name: 'End-to-End Tests',
    path: TEST_DIR,
    description: 'Tests complete flow from app to server and back'
  }
];

async function runTests(category) {
  return new Promise((resolve, reject) => {
    console.log(`📋 Running ${category.name}`);
    console.log(`   ${category.description}`);
    console.log(`   Path: ${category.path}\n`);

    let command, args, cwd;

    if (category.name === 'Server Integration Tests') {
      command = 'npx';
      args = ['jest', '--testPathPattern', 'openaiVisionIntegration.test.ts', '--verbose'];
      cwd = path.join(ROOT_DIR, 'server');
    } else if (category.name === 'Client Integration Tests') {
      command = 'npx';
      args = ['jest', '--testPathPattern', 'openaiGestureValidationIntegration.test.tsx', '--verbose'];
      cwd = path.join(ROOT_DIR, 'app');
    } else if (category.name === 'End-to-End Tests') {
      command = 'npx';
      args = ['jest', '--testPathPattern', 'openai-validation-e2e.test.js', '--verbose'];
      cwd = path.join(ROOT_DIR, 'integration');
    }

    const jest = spawn(command, args, {
      cwd,
      stdio: 'inherit'
    });

    jest.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${category.name} passed\n`);
        resolve();
      } else {
        console.log(`❌ ${category.name} failed\n`);
        reject(new Error(`${category.name} failed with code ${code}`));
      }
    });

    jest.on('error', (error) => {
      console.error(`Error running ${category.name}:`, error);
      reject(error);
    });
  });
}

async function runAllTests() {
  const startTime = Date.now();

  try {
    for (const category of testCategories) {
      await runTests(category);
    }

    const duration = Date.now() - startTime;
    console.log('🎉 All OpenAI integration tests passed!');
    console.log(`⏱️  Total duration: ${Math.round(duration / 1000)}s`);
    console.log('\n📊 Test Summary:');
    console.log('   ✅ Server Integration Tests');
    console.log('   ✅ Client Integration Tests');
    console.log('   ✅ End-to-End Tests');
    console.log('\n🎯 OpenAI Gesture Validation system is fully integrated and tested!');

    process.exit(0);

  } catch (error) {
    console.error('\n💥 OpenAI integration tests failed:', error.message);
    console.log('\n🔍 Troubleshooting:');
    console.log('   1. Ensure OpenAI API key is configured');
    console.log('   2. Check server is running on localhost:5000');
    console.log('   3. Verify all dependencies are installed');
    console.log('   4. Check test environment variables');

    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('OpenAI Gesture Validation Integration Test Runner');
  console.log('');
  console.log('Usage: node openai-test-runner.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --help, -h    Show this help message');
  console.log('  --server      Run only server integration tests');
  console.log('  --client      Run only client integration tests');
  console.log('  --e2e         Run only end-to-end tests');
  console.log('');
  console.log('Examples:');
  console.log('  node openai-test-runner.js              # Run all tests');
  console.log('  node openai-test-runner.js --server     # Run server tests only');
  console.log('  node openai-test-runner.js --e2e        # Run e2e tests only');
  process.exit(0);
}

if (args.includes('--server')) {
  runTests(testCategories[0]).catch(console.error);
} else if (args.includes('--client')) {
  runTests(testCategories[1]).catch(console.error);
} else if (args.includes('--e2e')) {
  runTests(testCategories[2]).catch(console.error);
} else {
  // Run all tests
  runAllTests();
}