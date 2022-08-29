import json
from typing import List, TypedDict, Literal
import requests
import argparse
from enum import Enum

class DeploymentState(Enum):
    AWS_EXISTING_VPC = "AWS_EXISTING_VPC"
    AWS_DEFAULT_VPC = "AWS_DEFAULT_VPC"
    def __str__(self):
        return self.value

parser = argparse.ArgumentParser(description='Notify pipebird that instance is running.')
parser.add_argument('-d', '--deploymentVersion', type=str, metavar='', required=True, help="Deployment version e.g. 0.1.0")
parser.add_argument('-t', '--deploymentType', type=DeploymentState, metavar='', required=True, help='"AWS_EXISTING_VPC" | "AWS_DEFAULT_VPC"')
parser.add_argument('-l', '--licenseKey', type=str, metavar='', required=True, help="Pipebird license key")
args = parser.parse_args()

class Version(TypedDict):
    version: str
    release_date: str

DeploymentStateLiteral = Literal["AWS_EXISTING_VPC", "AWS_DEFAULT_VPC"]
class UpdateDeployment(TypedDict):
    deploymentState: DeploymentStateLiteral
    deploymentVersion: str # semantic version e.g. "0.1.0"
    agentVersion: str # semantic version e.g. "0.1.0"

if __name__ == '__main__':
    versions: List[Version] = json.load(open('versions.json'))
    latest_version = versions[0]
    deployment: UpdateDeployment = {
        "deploymentState": args.deploymentType.value, 
        "deploymentVersion": args.deploymentVersion,
        "agentVersion": latest_version["version"]
    }
    try:
        resp = requests.post(
            'https://my.pipebird.com/api/deployment', 
            json=deployment, 
            headers={'Authorization': f'Bearer {args.licenseKey}'},
            timeout=10
        )
    except:
        print(f"Failed to reach my.pipebird.com servers.")
