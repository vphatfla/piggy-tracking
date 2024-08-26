#!/bin/bash

# Immediately exit when fail
set -e

echo "RUNNING BUILD SCRIPT FOR PIGGY TRACKING REPO"

# GIT operation

if git rev-parse --git-dir > /dev/null 2>&1; then 
	echo "PULLING GIT: pulling chages from git repo ..."
	git pull
else 
	echo "ERROR: Not a Git repo. Exiting!!!!"
	exit 1
fi

echo "PULLING GIT: sucessfully\n\n"

# Docker: Remove old container and images

echo "Docker: removing images and containers..."
echo "Docker: removing containers"
docker rm -f piggyfectn
docker rm -f piggybectn
docker rm -f piggydbctn
echo "\n"
docker rmi -f piggyfe
docker rmi -f piggybe
docker rmi -f piggydb

echo "Success!\n\n"


