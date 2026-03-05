"""
Reduce chicago_crimes.csv by keeping only columns needed for the narcotics
visualization (Date, Primary Type, District) and filtering to 2006-2026.
"""
import csv
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT = os.path.join(BASE, "data", "chicago_crimes.csv")
OUTPUT = os.path.join(BASE, "data", "chicago_crimes_reduced.csv")
KEEP_COLUMNS = ["Date", "Primary Type", "District"]
START_YEAR = 2006
END_YEAR = 2026

def main():
    if not os.path.exists(INPUT):
        print(f"Input file not found: {INPUT}")
        return

    with open(INPUT, "r", encoding="utf-8", newline="") as infile:
        reader = csv.DictReader(infile)
        if not all(c in reader.fieldnames for c in KEEP_COLUMNS):
            print("Columns not found:", KEEP_COLUMNS)
            return

        with open(OUTPUT, "w", encoding="utf-8", newline="") as outfile:
            writer = csv.writer(outfile)
            writer.writerow(KEEP_COLUMNS)
            for row in reader:
                date_str = row["Date"]
                year = int(date_str.split("/")[2][:4]) if "/" in date_str else 0
                if START_YEAR <= year <= END_YEAR:
                    writer.writerow([row[c] for c in KEEP_COLUMNS])

    size_mb = os.path.getsize(OUTPUT) / (1024 * 1024)
    print(f"Created: {OUTPUT}")
    print(f"Size: {size_mb:.1f} MB")

    # Replace original with reduced version
    os.replace(OUTPUT, INPUT)
    print("Replaced chicago_crimes.csv with reduced version")

if __name__ == "__main__":
    main()
