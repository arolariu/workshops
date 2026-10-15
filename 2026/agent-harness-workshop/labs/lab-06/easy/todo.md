# 🟢 Easy · Install, don't copy

> 🕐 10 min · 🆓 free checks (need APM and a network connection) · 🤖 optional agent check (about 1 prompt)

## 🎯 Mission
Your team publishes its agent harness as a package. Instead of copy-pasting files between projects (and
watching them drift apart), **install** it with APM, pinned to a version, with a lockfile. Then grab a
community plugin from the default marketplace and see what it adds to Copilot.

## 📂 Work here
```bash
cd labs/lab-06/easy/src
apm --help          # not installed? see github.com/microsoft/apm
```

## ✅ Done when
- `apm.yml` exists and depends on `microsoft/apm-sample-package`, **pinned** to a version tag
- `apm.lock.yaml` exists, and the package's files were deployed into the folders Copilot reads
- You installed at least one plugin from the `awesome-copilot` marketplace (`copilot plugin list` shows it)

## 💡 Hints
<details><summary>Start a manifest</summary>

`apm init -y` creates `apm.yml`, the "package.json" of your agent harness.

</details>

<details><summary>Install pinned, for Copilot</summary>

`apm install <owner>/<repo>#<tag> --target copilot`. The `#tag` pins the version; `--target` tells APM where
to deploy the files. Then look at `git status`: what appeared, and where?

</details>

<details><summary>The marketplace</summary>

`copilot plugin marketplace browse awesome-copilot` lists plugins. Install one with
`copilot plugin install <name>@awesome-copilot`, then start `copilot` and type `/plugin` or `/skills`.

</details>

## 🚀 Going further
- `apm deps tree` shows the dependency tree. What happens if two packages ship a skill with the same name?
- Remove a package with `apm uninstall`. Are its deployed files cleaned up?
