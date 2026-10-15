# Which change needs a recompile?

- **Allowing the "good first issue" label** changed the **frontmatter** (`safe-outputs.add-labels.allowed`).
  The frontmatter is compiled into the `.lock.yml` (permissions, tools, outputs), so this change needs
  `gh aw compile` and a commit of the new lock file.
- **Asking for the OS and Node.js version** changed only the **body** (the instructions). The body is read
  at run time, so no recompile is needed.
