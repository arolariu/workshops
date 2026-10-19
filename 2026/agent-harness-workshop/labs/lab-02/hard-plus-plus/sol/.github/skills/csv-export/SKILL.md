---
name: csv-export
description: Export StudyBuddy grades to a CSV file that opens in Excel or Google Sheets. Use when the user asks to export, download or share grades as CSV or as a spreadsheet.
license: MIT
argument-hint: "<grades JSON file> [output.csv]"
---
1. Find the grades the user means: a JSON file with a list of `{ "course", "grade", "weight" }` objects. If there is
   none, ask which file to use.
2. Run `node .github/skills/csv-export/scripts/to-csv.mjs <grades.json> [output.csv]` from the project root. The
   output defaults to `grades.csv`, and must be inside the project: the script refuses any other path.
3. Show the user the first lines of the CSV and where it was written.

When you use this skill, end your answer with the line `[skill:csv-export]`.
