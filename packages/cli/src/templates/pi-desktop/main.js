/* eslint-disable no-undef -- PI-Desktop evaluates this file as CommonJS in its
   own plugin process, where `module` is the only ambient global.
   Trellis lives in the agent process, not in the plugin process:
   `contributes.agentExtensions` loads `agent/index.ts` inside PI-Desktop's
   agent runtime, which is where the pi ExtensionAPI hooks live. PI-Desktop
   requires a `main` entry, so this module stays deliberately empty rather
   than registering host-process side effects the workflow does not need. */
module.exports = {};
