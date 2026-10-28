# GitHub Copilot CLI and the AI ecosystem

Presentation for computer science students at Transilvania University, on
**31 October 2026**.

## Materials

- [Quiz bank](quiz-bank.md): the original supplied Markdown file, preserved
  unchanged. Nine modules, with 45 live questions and 27 bonus questions.
- [Razzia feasibility assessment](razzia-feasibility.md): question-bank mapping,
  Azure hosting constraints, and a proposed event deployment and rehearsal plan.

**Hosting conclusion:** the questions fit Razzia's JSON format, but the complete
application cannot run on Azure Static Web Apps Free alone. Razzia requires a
long-running Node.js/Socket.IO backend and writable configuration storage.
Running its existing container on Azure Container Apps Consumption is the
lowest-change Azure option; its free compute allowance is not a guarantee of
zero total cost.

This folder contains source material and research, not a deployed quiz service
or a converted Razzia question bank. No Azure resources have been provisioned.
