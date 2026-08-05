// CSV Parser Test Suite
// Comprehensive tests for CSV parsing functionality.

const path = require('path');
const fs = require('fs');
const { CSVParser } = require('../backend/src/modules/csv-parser/csv-parser.ts');

const EXAMPLE_CSV = path.join(__dirname, '..', 'examples', 'example-products.csv');

// Test cases
testCases = [
  {
    name: 'Basic CSV with all fields',
    filePath: EXAMPLE_CSV,
    expected: {
      total_rows: 10,
      valid_rows: 10,
      invalid_rows: 0,
      encoding_detected: 'utf8'
    }
  },
  {
    name: 'Test EAN normalization',
    input: [
      'ean,reference,name,price,quantity',
      '1234567890123,REF-001,Test Product A,29.99,100',
      '8901234567890,REF-002,Test Product B,19.50,50',
      'INVALID-EAN,REF-003,Test Product C,15.00,25'
    ],
    expected: {
      total_rows: 3,
      valid_rows: 2,
      invalid_rows: 1,
      encoding_detected: 'utf8'
    }
  },
  {
    name: 'Test price normalization',
    input: [
      'name,price,description',
      'Product A,$29.99,Description A',
      'Product B,€19.50,Description B',
      'Product C,¥15.00,Description C'
    ],
    expected: {
      total_rows: 3,
      valid_rows: 3,
      invalid_rows: 0,
      encoding_detected: 'utf8'
    }
  },
  {
    name: 'Test stock normalization',
    input: [
      'name,stock,qty',
      'Product A,100,100',
      'Product B,50,50',
      'Product C,abc,0'
    ],
    expected: {
      total_rows: 3,
      valid_rows: 2,
      invalid_rows: 1,
      encoding_detected: 'utf8'
    }
  },
  {
    name: 'Test duplicate detection',
    input: [
      'ean,name,reference',
      '1234567890123,Product A,REF-001',
      '1234567890123,Product B,REF-002'
    ],
    expected: {
      total_rows: 2,
      valid_rows: 1,
      invalid_rows: 1
    }
  }
];

async function runTests() {
  console.log('🧪 Testing CSV Parser Module');
  console.log('=' .repeat(50));

  let passedTests = 0;
  let totalTests = testCases.length;

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n📋 Test ${i + 1}: ${testCase.name}`);
    console.log('-'.repeat(50));

    try {
      const parser = new CSVParser({
        delimiter: ',',
        encoding: 'utf8',
        skip_empty_rows: true,
        headers_case_sensitive: false
      });

      let result;
      if (testCase.filePath) {
        result = await parser.parseFile(testCase.filePath);
      } else {
        result = await testInputData(parser, testCase.input);
      }

      const testPassed = checkResults(result, testCase.expected);
      
      if (testPassed) {
        console.log('✅ PASSED');
        passedTests++;
      } else {
        console.log('❌ FAILED');
      }

      console.log(`   Rows: ${result.total_rows} (valid: ${result.valid_rows}, invalid: ${result.invalid_rows})`);
      console.log(`   Encoding: ${result.encoding_detected}`);
      console.log(`   Parsing time: ${result.parsing_time}ms`);

    } catch (error) {
      console.log('❌ FAILED with error:');
      console.log(`   ${error.message}`);
    }
  }

  console.log('\n' + '=' .repeat(50));
  console.log('📊 TEST SUMMARY');
  console.log('=' .repeat(50));
  console.log(`Total tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  return { passed: passedTests, total: totalTests };
}

async function testInputData(parser, input) {
  const tempFile = path.join(__dirname, 'temp-test.csv');
  
  fs.writeFileSync(tempFile, input.join('\n'));
  
  try {
    const result = await parser.parseFile(tempFile);
    return result;
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

function checkResults(actual, expected) {
  let passed = true;

  if (actual.total_rows !== expected.total_rows) {
    console.log(`   ❌ Total rows mismatch: expected ${expected.total_rows}, got ${actual.total_rows}`);
    passed = false;
  }

  if (actual.valid_rows !== expected.valid_rows) {
    console.log(`   ❌ Valid rows mismatch: expected ${expected.valid_rows}, got ${actual.valid_rows}`);
    passed = false;
  }

  if (actual.invalid_rows !== expected.invalid_rows) {
    console.log(`   ❌ Invalid rows mismatch: expected ${expected.invalid_rows}, got ${actual.invalid_rows}`);
    passed = false;
  }

  if (expected.encoding_detected && actual.encoding_detected !== expected.encoding_detected) {
    console.log(`   ❌ Encoding mismatch: expected ${expected.encoding_detected}, got ${actual.encoding_detected}`);
    passed = false;
  }

  return passed;
}

runTests().then(results => {
  console.log('\n🎉 Testing complete!');
  process.exit(results.passed === results.total ? 0 : 1);
});