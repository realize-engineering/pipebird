# Releases

This repo uses a combination of s3 and github workflows to manage new app releases.

The pipebird team is responsible for regularly creating new app releases. We create releases by adding a new entry to the 0th index of the [versions.json](deploy/configs/versions.json) file within a new pull request pointed at main.

When the pull request is merged, our [upload workflow](.github/workflows/update_s3.yml) is responsible for pushing the versions.json to our s3 bucket. This s3 object is what other services such as Pipebird control plane use to determine the latest version of the repo.

Furthermore, anytime we modify the [existing cloud deploy template](deploy/aws/cloudformation/pipebird_existing_cloud_deploy.json) or the [default deploy template](deploy/aws/cloudformation/pipebird_simple_deploy.json) you should bump the DeploymentMapping version within the respective file. Pipebird control plane records telemetry on the status of deployments (CREATING, RUNNING, and TERMINATED), as well as the deployment strategy used. By bumping the version within the cloudformation templates, we can keep track of deployment methods used which is useful to track bugs across versions.

Similarly to versions.json, whenever a cloudformation template is updated we will update the file within our s3 bucket.
