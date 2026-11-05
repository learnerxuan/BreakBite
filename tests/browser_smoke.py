"""Compatibility entry point for the current local-account product checks.
Read docs/TEST_REPORT.md; use a disposable database with fixture operators.
"""
import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).with_name("browser_product.py")), run_name="__main__")
