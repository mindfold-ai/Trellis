/**
 * Regression Tests — Historical Bug Prevention
 *
 * Split into ordered support modules so each modified non-generated test file
 * stays below the repository's 3000-line limit. Support modules intentionally
 * do not use the .test.ts suffix, so Vitest collects this entry exactly once.
 */

import "./regression.part-01.js";
import "./regression.part-02.js";
import "./regression.part-03.js";
import "./regression.part-04.js";
import "./regression.part-05.js";
import "./regression.part-06.js";
