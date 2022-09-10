import { bundleWorkflowCode } from "@temporalio/worker";
import { writeFile } from "node:fs/promises";
import { bundlePath, workflowsPath } from "./paths.js";

const { code } = await bundleWorkflowCode({
  workflowsPath,
});

await writeFile(bundlePath, code);
