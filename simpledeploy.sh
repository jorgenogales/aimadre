#!/usr/bin/env bash

firebase deploy --only functions:prompter
firebase deploy --only functions:gallery
firebase deploy --only hosting