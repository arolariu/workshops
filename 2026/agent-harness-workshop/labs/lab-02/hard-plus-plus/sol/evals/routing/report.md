# Routing eval · lexical pre-check

| Skill | Expected | Routed | Right | Precision | Recall |
|---|---:|---:|---:|---:|---:|
| csv-export | 3 | 3 | 3 | 1.00 | 1.00 |
| explain-error | 3 | 2 | 2 | 1.00 | 0.67 |
| new-module | 3 | 3 | 3 | 1.00 | 1.00 |
| release-notes | 3 | 3 | 3 | 1.00 | 1.00 |
| write-docs | 3 | 3 | 3 | 1.00 | 1.00 |
| write-tests | 3 | 3 | 3 | 1.00 | 1.00 |
| **macro** | | | | **1.00** | **0.94** |

Requests that need no skill: 6 of 6 loaded none.

## Misses
- e1 · expected explain-error, got no skill · What does this mean? TypeError: Cannot read properties of undefined (reading 'length') at grades.js:14
