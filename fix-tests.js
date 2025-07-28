const fs = require('fs');
const path = require('path');

// List of test files that need to be fixed
const testFiles = [
  'src/__tests__/inngest.module.test.ts',
  'src/__tests__/endpoint-configuration.test.ts', 
  'src/__tests__/integration/component-collaboration.test.ts',
  'src/__tests__/integration/webhook-handling.integration.test.ts',
  'src/__tests__/integration/app.integration.test.ts',
  'src/__tests__/integration/module-initialization.test.ts'
];

const importToAdd = `import { createSimpleMockHttpAdapter } from "../testing/http-adapter-test-helper";`;
const importToAddIntegration = `import { createSimpleMockHttpAdapter } from "../../testing/http-adapter-test-helper";`;
const providerToAdd = `        createSimpleMockHttpAdapter(),`;

function fixTestFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if this file actually needs fixing (has InngestController usage)
    if (!content.includes('InngestController')) {
      console.log(`Skipping ${filePath} - no InngestController usage`);
      return;
    }

    // Check if already has our import
    if (content.includes('createSimpleMockHttpAdapter')) {
      console.log(`Skipping ${filePath} - already fixed`);
      return;
    }

    // Add the import
    const isIntegrationTest = filePath.includes('/integration/');
    const importLine = isIntegrationTest ? importToAddIntegration : importToAdd;
    
    // Find a good place to add the import (after other imports)
    const lines = content.split('\n');
    let importInsertIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('import ') && !line.includes('from "')) continue;
      if (line.startsWith('import ') && line.includes('from "')) {
        importInsertIndex = i + 1;
      }
      if (!line.startsWith('import ') && !line.trim().startsWith('//') && line.trim() !== '') {
        break;
      }
    }

    if (importInsertIndex > -1) {
      lines.splice(importInsertIndex, 0, importLine);
      content = lines.join('\n');
    }

    // Add the provider to TestingModule configurations
    // Look for patterns like:
    // providers: [
    //   ... other providers
    // ]
    
    content = content.replace(
      /(\s+providers:\s*\[\s*(?:[^[\]]*\[[^\]]*\][^[\]]*|[^[\]]+)*),(\s*\]\s*\})/g,
      `$1,\n${providerToAdd}$2`
    );

    // Also handle cases where there are no providers yet
    content = content.replace(
      /(\s+controllers:\s*\[[^\]]*\],?\s*)(\s*\}\s*\.compile)/g,
      `$1      providers: [\n${providerToAdd}\n      ],\n$2`
    );

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed ${filePath}`);
    
  } catch (error) {
    console.error(`Error fixing ${filePath}:`, error.message);
  }
}

// Process all test files
testFiles.forEach(fixTestFile);

console.log('Test fixing complete!');