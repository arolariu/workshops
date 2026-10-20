# Governance report

2 repositories · 7 sessions · 21 tool calls · 9 denied · 10 premium requests · 228,300 tokens

## Calls by tool
| Tool | studybuddy | campushub | Total |
|---|---|---|---|
| bash | 2 | 6 | 8 |
| powershell | 2 | 2 | 4 |
| edit | 1 | 1 | 2 |
| tickets-get_ticket | 0 | 2 | 2 |
| view | 2 | 0 | 2 |
| skill | 0 | 1 | 1 |
| studybuddy-get_grades | 1 | 0 | 1 |
| tickets-close_ticket | 0 | 1 | 1 |

## Denials by rule
| Rule | Repository | Denials |
|---|---|---|
| recursive-delete | studybuddy | 2 |
| campushub-no-api-key-in-shell | campushub | 1 |
| campushub-no-deploy | campushub | 1 |
| campushub-no-env-dump | campushub | 1 |
| campushub-no-ticket-file-edits | campushub | 1 |
| new-dependency | studybuddy | 1 |
| org-no-force-push | campushub | 1 |
| secret-files | campushub | 1 |

## Cost per session
| Session | Repository | Calls | Denied | Premium requests | Tokens |
|---|---|---|---|---|---|
| 1f4b9c22 | studybuddy | 4 | 0 | 1 | 41,840 |
| 7a90d3e5 | studybuddy | 2 | 2 | 1 | 23,310 |
| c3d18e07 | studybuddy | 2 | 1 | 2 | 30,880 |
| 5c0e7a41 | campushub | 4 | 3 | 2 | 39,100 |
| 9d2f61b8 | campushub | 5 | 1 | 2 | 46,620 |
| e41c0a93 | campushub | 2 | 1 | 1 | 21,560 |
| b85e2f16 | campushub | 2 | 1 | 1 | 24,990 |
| **Total** | | 21 | 9 | 10 | 228,300 |

## Riskiest attempts
1. `5c0e7a41` (campushub) · 3 denied · secret-files, campushub-no-api-key-in-shell, campushub-no-env-dump · first: `cat .env.campushub`
2. `7a90d3e5` (studybuddy) · 2 denied · recursive-delete · first: `rm -rf build node_modules`
3. `c3d18e07` (studybuddy) · 1 denied · new-dependency · first: `npm install portal-sync-fast`
4. `9d2f61b8` (campushub) · 1 denied · campushub-no-deploy · first: `npm run deploy`
5. `e41c0a93` (campushub) · 1 denied · org-no-force-push · first: `git push --force origin preview`
