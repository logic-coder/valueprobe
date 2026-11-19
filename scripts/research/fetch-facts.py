"""Download SEC Company Facts for the fixed historical cohort. Python standard library."""
import json
import sys
import time
import urllib.request
from pathlib import Path

here = Path(__file__).resolve().parent
cache = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("tmp-historical-facts")
cache.mkdir(exist_ok=True, parents=True)
cohort_file = sys.argv[2] if len(sys.argv) > 2 else "dia-2015.json"
for ticker, cik in json.loads((here / cohort_file).read_text()).items():
    dest = cache / f"{cik}.json"
    if dest.exists() and json.loads(dest.read_bytes())["cik"] == cik:
        continue
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={
                "User-Agent": "ValueProbe research (logic159@163.com)"
            })
            with urllib.request.urlopen(request, timeout=25) as response:
                raw = response.read()
            assert int(json.loads(raw)["cik"]) == cik
            tmp = dest.with_suffix(".partial")
            tmp.write_bytes(raw)
            tmp.replace(dest)
            break
        except OSError:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
    time.sleep(0.25)
