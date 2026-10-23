## [2.0.0] - 2026-10-19

### 💥 Breaking changes
- drop support for Node 18 (e5f6a7b)
- **grades:** remove average() (c3d4e5f)
  average() is gone, use weightedAverage() instead.
- **export:** write grades as CSV (b7c8d9e)
  the CSV columns are now course, grade, weight.

### ✨ Features
- **grades:** add gpa() with credit weighting (a1b2c3d)

### 🐛 Fixes
- **deadlines:** skip assignments that are already done (9f8e7d6)
- use local dates instead of UTC (8e7d6c5)

### ⏪ Reverted
- fix(deadlines): round days up (7d6c5b4)
