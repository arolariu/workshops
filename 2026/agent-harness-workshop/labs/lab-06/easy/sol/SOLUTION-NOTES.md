# What `apm install` adds (not stored in this reference solution)

Run these in `src/`:

```bash
apm init -y
apm install microsoft/apm-sample-package#v1.0.0 --target copilot
copilot plugin marketplace browse awesome-copilot
copilot plugin install <a plugin you like>@awesome-copilot
```

After the APM install you will also have:
- `apm.lock.yaml`: the exact version (commit) of every package, so teammates get the same harness
- new files under `.github/` (instructions, agents, skills) deployed from the package
- `apm_modules/`: the downloaded packages (don't commit it; APM restores it)
