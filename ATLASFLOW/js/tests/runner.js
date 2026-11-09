(function initAtlasFlowTestRunner(global) {
  const suites = [];
  let currentSuite = null;

  function describe(name, fn) {
    const suite = { name, specs: [] };
    suites.push(suite);
    currentSuite = suite;
    fn();
    currentSuite = null;
  }

  function it(name, fn) {
    if (currentSuite) {
      currentSuite.specs.push({ name, fn });
    }
  }

  function expect(actual) {
    return {
      toBe(expected) {
        if (actual !== expected) throw new Error(`Expected ${expected} but got ${actual}`);
      },
      toEqual(expected) {
        const a = JSON.stringify(actual);
        const e = JSON.stringify(expected);
        if (a !== e) throw new Error(`Expected ${e} but got ${a}`);
      },
      toBeCloseTo(expected, precision = 2) {
        if (!Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(actual - expected) > Math.pow(10, -precision) / 2) {
          throw new Error(`Expected ${actual} to be close to ${expected}`);
        }
      },
      toBeInRange(min, max) {
        if (!Number.isFinite(actual) || actual < min || actual > max) throw new Error(`Expected ${actual} to be in range [${min}, ${max}]`);
      },
      toBeTruthy() {
        if (!actual) throw new Error(`Expected ${actual} to be truthy`);
      },
      toBeDefined() {
        if (actual === undefined) throw new Error(`Expected value to be defined`);
      },
      toContain(item) {
        if (!Array.isArray(actual) && typeof actual !== "string") throw new Error(`Expected ${actual} to support containment`);
        if (!actual.includes(item)) throw new Error(`Expected ${actual} to contain ${item}`);
      },
      toBeNull() {
        if (actual !== null) throw new Error(`Expected ${actual} to be null`);
      },
      toBeGreaterThan(val) {
        if (!(actual > val)) throw new Error(`Expected ${actual} to be greater than ${val}`);
      },
      toBeLessThan(val) {
        if (!(actual < val)) throw new Error(`Expected ${actual} to be less than ${val}`);
      }
    };
  }

  async function runTests(renderFn) {
    const results = [];
    for (const suite of suites) {
      const suiteResult = { name: suite.name, specs: [] };
      for (const spec of suite.specs) {
        try {
          await spec.fn();
          suiteResult.specs.push({ name: spec.name, status: "pass" });
        } catch (err) {
          suiteResult.specs.push({ name: spec.name, status: "fail", error: err.message });
        }
      }
      results.push(suiteResult);
      if (renderFn) renderFn(suiteResult);
    }
    return results;
  }

  global.AtlasFlowTests = { describe, it, expect, runTests };
})(window);
