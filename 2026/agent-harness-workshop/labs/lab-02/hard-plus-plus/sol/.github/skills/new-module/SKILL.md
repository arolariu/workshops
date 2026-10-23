---
name: new-module
description: Create a new StudyBuddy module (a .js file with tests) the team's way. Use when the user asks for a new module, feature file or helper, e.g. "add an attendance module".
argument-hint: "<module name> <what it should do>"
---
Follow these steps exactly. Ask nothing unless the module's purpose is unclear.

1. Pick a short lowercase module name, e.g. `attendance`. The file is `<module>.js` in the project root.
2. Create `<module>.js` from `.github/skills/new-module/templates/module.template.js`:
   keep the `// StudyBuddy <module>: <purpose>` header and the JSDoc, validate input first, export the function.
3. Create `<module>.test.js` from `.github/skills/new-module/templates/module.test.template.js`:
   at least one normal case and one error case.
4. Export the module from `index.js`: `export * from './<module>.js';`
5. Add a line for the module under "## Modules" in `README.md`.
6. Run `npm test` and fix anything red before you say you're done.

When you use this skill, end your answer with the line `[skill:new-module]`.
