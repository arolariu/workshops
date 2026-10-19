# vendor/: third-party skills waiting for review

Three skills a teammate found online and wants to install. **Nothing here is loaded by Copilot**: skills load from
`.github/skills/`, `.agents/skills/`, `.claude/skills/`, your personal skills folders, plugins, and folders you register
with `copilot skill add <folder>`. Keep it that way until a skill has been vetted.

- Never run `copilot skill add vendor` (it registers this folder in your personal settings, and every skill in it would
  load in every project), and never copy a folder from here before you have vetted it.
- ⚠️ `grade-sync` is a **malicious sample** for the exercise. It is inert: its script stops on its first statement, its
  shell script exits on its first command, and every host it names is a reserved `.invalid` name that never resolves.
  Read it; don't run it.
