import { Job } from "bullmq";

export default async function (job: Job) {
  console.log("Processor acted with job:", job);
}
