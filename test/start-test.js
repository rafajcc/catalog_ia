// Quick test script to run CSV parser tests.
// Registers ts-node (from the backend install) so the TypeScript
// modules under backend/src can be loaded from the plain-JS tests.

const path = require('path');
const fs = require('fs');

const backendDir = path.join(__dirname, '..', 'backend');
const tsNodeRegister = path.join(backendDir, 'node_modules', 'ts-node', 'register');
const testFile = path.join(__dirname, 'test-csv-parser.js');

console.log('🧪 Testing CatalogIA CSV Parser');
console.log('='.repeat(50));

if (!fs.existsSync(testFile)) {
  console.log('❌ Test file not found!');
  console.log(`Expected at: ${testFile}`);
  process.exit(1);
}

if (!fs.existsSync(path.join(__dirname, '..', 'examples', 'example-products.csv'))) {
  console.log('❌ Example CSV file not found!');
  console.log('Please create ./examples/example-products.csv first.');
  process.exit(1);
}

if (!fs.existsSync(tsNodeRegister)) {
  console.log('❌ ts-node not found in backend dependencies.');
  console.log('Run "npm install" in the backend/ folder first.');
  process.exit(1);
}

console.log('✅ Test environment is ready!');
console.log('');
console.log('🚀 Starting tests...');

try {
  require(tsNodeRegister);
  require(testFile);
} catch (error) {
  console.log('❌ Tests failed:');
  console.log(error && error.message ? error.message : error);
  process.exit(1);
}
