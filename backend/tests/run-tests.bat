@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM  SHADDAI Agent Regression Tests
REM  Runs all 8 promptfoo test cases against the live backend on port 3000
REM  Results written to tests/results.json
REM
REM  Prerequisites:
REM    npm install -g promptfoo   (or: npx promptfoo works without install)
REM    Backend running on http://localhost:3000
REM
REM  Usage:
REM    cd C:\Users\Brittany\SHADDAI-FINAL-BUILD\backend
REM    tests\run-tests.bat
REM ─────────────────────────────────────────────────────────────────────────────

setlocal

REM Change to backend directory so relative paths in yaml resolve correctly
cd /d "%~dp0.."

echo.
echo =============================================================
echo   SHADDAI Agent Regression Tests (promptfoo)
echo =============================================================
echo   Config  : tests\promptfoo.yaml
echo   Output  : tests\results.json
echo   Backend : http://localhost:3000
echo =============================================================
echo.

REM Run promptfoo evaluation
npx promptfoo eval --config tests\promptfoo.yaml --output tests\results.json

REM Check exit code
if %ERRORLEVEL% EQU 0 (
  echo.
  echo [PASS] All tests passed. Results saved to tests\results.json
) else (
  echo.
  echo [WARN] Some tests failed or thresholds not met. Check tests\results.json
)

echo.
echo To view results in browser run:
echo   npx promptfoo view tests\results.json
echo.

endlocal
