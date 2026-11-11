"""Test entry point mounted only in the disposable backend container."""
from pathlib import Path
import main

clock_file = Path("/tmp/contract-clock")
clock_file.write_text("1700000000")
main.bank.clock = lambda: int(clock_file.read_text())
app = main.app
