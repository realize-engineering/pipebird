import boto3 # type: ignore
import os
from dotenv import load_dotenv # type: ignore
from git import Repo # type: ignore
from typing import TypedDict, List
import json


load_dotenv()  # take environment variables from .env.


VERSIONS_FILEPATH: str = './deploy/configs/versions.json'
FOLDER_PATHS = ['./deploy/aws/cloudformation', './deploy/configs']
S3_USER_ACCESS_ID = os.getenv('S3_USER_ACCESS_ID')
S3_USER_SECRET_KEY = os.getenv('S3_USER_SECRET_KEY')
PROVISIONED_BUCKET_NAME = os.getenv('PROVISIONED_BUCKET_NAME')


class Version(TypedDict):
    version: str
    release_date: str


if __name__ == '__main__':
    for FOLDER_PATH in FOLDER_PATHS:
        assert isinstance(FOLDER_PATH, str) and \
            isinstance(S3_USER_ACCESS_ID, str) and \
            isinstance(S3_USER_SECRET_KEY, str) and \
            isinstance(PROVISIONED_BUCKET_NAME, str)
        filepaths: List[str] = [os.path.join(FOLDER_PATH, file) for file in os.listdir(FOLDER_PATH)]
        object_names = [file.split('.')[0] for file in os.listdir(FOLDER_PATH)]
        #Creating Session With Boto3.
        session = boto3.Session(
            aws_access_key_id=S3_USER_ACCESS_ID,
            aws_secret_access_key=S3_USER_SECRET_KEY
        )
        # Creating S3 Resource From the Session.
        s3 = session.resource('s3') 
        for i, file in enumerate(filepaths):
            s3.Bucket(PROVISIONED_BUCKET_NAME).upload_file(file, object_names[i], ExtraArgs={'ACL':'public-read'})

    with open(VERSIONS_FILEPATH, 'r') as versionsFile:
        versions: List[Version] = json.load(versionsFile)
        repo = Repo(os.getcwd())
        tags = sorted(repo.tags, key=lambda t: t.commit.committed_datetime, reverse=True)
        if len(versions) > len(tags):
            try:
                # Create tag locally
                repo.create_tag(versions[0]['version'])
                
                # Push git tag to remote main
                origin = repo.remote()
                origin.push(versions[0]['version'])
            except:
                # Should only happen if there's a race condition such that this script is ran
                # in parallel.
                print("Failed to create git version tag. This could happen if tag already exists on main.")
