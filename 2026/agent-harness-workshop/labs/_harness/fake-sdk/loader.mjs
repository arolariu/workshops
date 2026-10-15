// Module hook used by the checks: lets an extension's
// `import { joinSession } from "@github/copilot-sdk/extension"` load our fake SDK outside Copilot CLI.
export async function resolve(specifier, context, next) {
  if (specifier === '@github/copilot-sdk/extension' || specifier === '@github/copilot-sdk') {
    return { url: new URL('./extension.mjs', import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
