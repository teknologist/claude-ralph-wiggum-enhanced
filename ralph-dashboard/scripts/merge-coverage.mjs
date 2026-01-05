#!/usr/bin/env node
/**
 * Merge multiple Istanbul JSON coverage reports into one.
 * Usage: node scripts/merge-coverage.mjs <output.json> <input1.json> <input2.json> ...
 */

import fs from 'fs';

function mergeCoverageObjects(target, source) {
  for (const [filepath, fileData] of Object.entries(source)) {
    if (!target[filepath]) {
      target[filepath] = { ...fileData };
      continue;
    }

    const targetFile = target[filepath];

    // Merge statement map
    if (fileData.statementMap) {
      for (const [key, value] of Object.entries(fileData.statementMap)) {
        if (!targetFile.statementMap[key]) {
          targetFile.statementMap[key] = value;
        }
      }
    }

    // Merge s (statements)
    if (fileData.s) {
      for (const [key, value] of Object.entries(fileData.s)) {
        if (targetFile.s[key] === undefined) {
          targetFile.s[key] = value;
        } else {
          targetFile.s[key] += value;
        }
      }
    }

    // Merge branch map
    if (fileData.branchMap) {
      for (const [key, value] of Object.entries(fileData.branchMap)) {
        if (!targetFile.branchMap[key]) {
          targetFile.branchMap[key] = value;
        }
      }
    }

    // Merge b (branches)
    if (fileData.b) {
      for (const [key, value] of Object.entries(fileData.b)) {
        if (!targetFile.b[key]) {
          targetFile.b[key] = [...value];
        } else {
          for (let i = 0; i < value.length; i++) {
            if (targetFile.b[key][i] === undefined) {
              targetFile.b[key][i] = value[i];
            } else {
              targetFile.b[key][i] += value[i];
            }
          }
        }
      }
    }

    // Merge function map
    if (fileData.fnMap) {
      for (const [key, value] of Object.entries(fileData.fnMap)) {
        if (!targetFile.fnMap[key]) {
          targetFile.fnMap[key] = value;
        }
      }
    }

    // Merge f (functions)
    if (fileData.f) {
      for (const [key, value] of Object.entries(fileData.f)) {
        if (targetFile.f[key] === undefined) {
          targetFile.f[key] = value;
        } else {
          targetFile.f[key] += value;
        }
      }
    }
  }

  return target;
}

// Main execution
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: node scripts/merge-coverage.mjs <output.json> <input1.json> <input2.json> ...');
  process.exit(1);
}

const [outputPath, ...inputPaths] = args;

let merged = {};

for (const inputPath of inputPaths) {
  try {
    const content = fs.readFileSync(inputPath, 'utf-8');
    const coverageData = JSON.parse(content);
    merged = mergeCoverageObjects(merged, coverageData);
    console.error(`Merged: ${inputPath}`);
  } catch (err) {
    console.error(`Error reading ${inputPath}: ${err.message}`);
    process.exit(1);
  }
}

// Ensure output directory exists
const outputDir = outputPath.substring(0, outputPath.lastIndexOf('/'));
if (outputDir && !fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2));
console.error(`Output written to: ${outputPath}`);
