import json
from typing import List, TypedDict, Literal
import requests
import argparse
from enum import Enum


StrategyLiteral = Literal["AWS_EXISTING_VPC", "AWS_DEFAULT_VPC"]


class DeploymentState(Enum):
    AWS_EXISTING_VPC = "AWS_EXISTING_VPC"
    AWS_DEFAULT_VPC = "AWS_DEFAULT_VPC"
    def __str__(self):
        return self.value


parser = argparse.ArgumentParser(description='Notify pipebird that instance is running.')
parser.add_argument('-d', '--deploymentVersion', type=str, metavar='', required=True, help="Deployment version e.g. 0.1.1")
parser.add_argument('-s', '--strategy', type=DeploymentState, metavar='', required=True, help='"AWS_EXISTING_VPC" | "AWS_DEFAULT_VPC"')
parser.add_argument('-l', '--licenseKey', type=str, metavar='', required=True, help="Pipebird license key")
args = parser.parse_args()


class Version(TypedDict):
    version: str
    release_date: str


class RegisterRequest(TypedDict):
    strategy: StrategyLiteral
    deploymentVersion: str # semantic version e.g. "0.1.0"
    agentVersion: str # semantic version e.g. "0.1.0"


class Deployment(TypedDict):
    publicKey: str


class RegisterResponse(TypedDict):
    deployment: Deployment


if __name__ == '__main__':
    versions: List[Version] = json.load(open('versions.json'))
    latest_version = versions[0]
    deployment: RegisterRequest = {
        "strategy": args.strategy.value, 
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
        payload: RegisterResponse = resp.json()
        with open('.env', 'a') as envfile:
            envfile.write(f"\nPUBLIC_KEY={payload['deployment']['publicKey']}")
    except Exception as e:
        print(f"Failed to reach my.pipebird.com servers.")
