#!/usr/bin/env bash

gcloud functions delete --region=us-central1 --quiet PBgenerateImageTrigger
gcloud functions delete --region=us-central1 --quiet PBsubmitPrompt
gcloud functions delete --region=us-central1 --quiet PBverifyPasscode
gcloud functions delete --region=us-central1 --quiet PBvotePrompt
