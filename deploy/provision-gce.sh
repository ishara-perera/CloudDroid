#!/usr/bin/env bash
set -euo pipefail
# Deliberately not run automatically: this command creates paid cloud resources.
: "${GCP_PROJECT:?Set your authorized project ID}"
zone=${GCP_ZONE:-us-central1-a}
name=${GCP_INSTANCE:-clouddroid}
gcloud compute instances create "$name" --project "$GCP_PROJECT" --zone "$zone" \
  --machine-type=n2-standard-2 --enable-nested-virtualization \
  --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
  --boot-disk-size=80GB --boot-disk-type=pd-balanced \
  --no-service-account --no-scopes --tags=clouddroid
gcloud compute firewall-rules create clouddroid-https --project "$GCP_PROJECT" \
  --allow=tcp:80,tcp:443 --target-tags=clouddroid
echo 'VM created. Restrict SSH to your address or IAP. Follow docs/DEPLOYMENT.md for installation and TURN.'
