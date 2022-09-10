import path from "node:path";

export const workflowsPath = new URL(
  `./workflows${path.extname(import.meta.url)}`,
  import.meta.url,
).pathname;

export const bundlePath = new URL("./workflow.bundle.js", import.meta.url)
  .pathname;
