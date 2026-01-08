import { test as base } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export const expect = base.expect;

// Collect coverage from all pages and merge into one file
const coverageData: Record<string, any> = {};

/**
 * Extended test with coverage collection after each test.
 */
export const test = base.extend({});

// Add afterEach hook to collect coverage
test.afterEach(async ({ page }) => {
  // Only collect coverage when COVERAGE=true
  if (process.env.COVERAGE !== 'true') {
    return;
  }

  try {
    // Collect coverage from the browser
    const coverage = await page.evaluate(() => {
      // @ts-ignore - __coverage__ is injected by Istanbul
      return window.__coverage__;
    });

    if (!coverage) {
      return;
    }

    // Merge coverage data
    for (const [file, fileData] of Object.entries(
      coverage as Record<string, any>
    )) {
      if (!coverageData[file]) {
        coverageData[file] = fileData;
        continue;
      }

      const existingFile = coverageData[file];

      // Merge statement coverage
      if (fileData.s && existingFile.s) {
        for (const [key, value] of Object.entries(fileData.s)) {
          if (existingFile.s[key] === undefined) {
            existingFile.s[key] = value;
          } else {
            existingFile.s[key] += value;
          }
        }
      }

      // Merge branch coverage
      if (fileData.b && existingFile.b) {
        for (const [key, value] of Object.entries(fileData.b)) {
          if (!existingFile.b[key]) {
            existingFile.b[key] = [...value];
          } else {
            for (let i = 0; i < value.length; i++) {
              if (existingFile.b[key][i] === undefined) {
                existingFile.b[key][i] = value[i];
              } else {
                existingFile.b[key][i] += value[i];
              }
            }
          }
        }
      }

      // Merge function coverage
      if (fileData.f && existingFile.f) {
        for (const [key, value] of Object.entries(fileData.f)) {
          if (existingFile.f[key] === undefined) {
            existingFile.f[key] = value;
          } else {
            existingFile.f[key] += value;
          }
        }
      }
    }
  } catch (error) {
    console.error('[Coverage] Error collecting coverage:', error);
  }
});

// Write coverage file after all tests complete
test.afterAll(async () => {
  // Only collect coverage when COVERAGE=true
  if (process.env.COVERAGE !== 'true') {
    return;
  }

  if (Object.keys(coverageData).length === 0) {
    console.error('[Coverage] No coverage data collected');
    return;
  }

  // Ensure coverage directory exists
  const coverageDir = path.join(process.cwd(), 'coverage', 'e2e');
  if (!fs.existsSync(coverageDir)) {
    fs.mkdirSync(coverageDir, { recursive: true });
  }

  // Write coverage file
  const coverageFile = path.join(coverageDir, 'coverage-final.json');
  fs.writeFileSync(coverageFile, JSON.stringify(coverageData, null, 2));
  console.error('[Coverage] E2E coverage written to:', coverageFile);
});
