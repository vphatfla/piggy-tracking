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
echo "DONE"
printf "PULLING GIT: sucessfully\n\n"

# Docker: Remove old container and images

echo "Docker: removing images and containers..."
echo "Docker: removing containers"
sudo docker rm -f piggyfectn
sudo docker rm -f piggybectn
echo "DONE"
sudo docker rmi -f piggyfe
sudo docker rmi -f piggybe

echo "DONE"
printf "_______________________\n\n"

# Front end

cd frontend

echo "FRONT END BUILDING"

echo "Building image"

sudo docker build -t piggyfe .

echo "Running container"

sudo docker run  -it -d --name piggyfectn piggyfe

echo "DONE!"

echo "Copy dist: Docker cp - COPYING dist to /var/html"

sudo docker cp piggyfectn:/app/dist /var/www/html/

echo "DONE!"

echo "STOPING the container front end"

sudo docker stop piggyfectn

echo "REMOVE the container front end"

sudo docker rm -f piggyfectn

echo "REMOVE the container image"

sudo docker rmi -f piggyfe

echo "DONE"
printf "FRONT END build successfully\n\n"

cd ..

# SLEEP

printf "SLEEPING 30s"

sleep 30s

# Back end

cd backend

echo "BACK END building"

echo "Building images"

sudo docker build -t piggybe .

echo "DONE"

echo "Running container"

sudo docker run -it -d --name piggybectn piggybe

echo "DONE!"

echo "Copying the binary to the host"

sudo docker cp piggybectn:/app/piggybe-bin .

echo "DONE!"

echo "Stoping container"

sudo docker stop piggybectn

echo "Removing container"

sudo docker rm -f piggybectn

echo "Removing image"
sudo docker rmi piggybe

# BACK END SERVICE

echo "Piggy Backend ServiceRestart the systemctl service"

sudo systemctl restart piggybe-service.service

printf "DONE\n\n"

echo "FINISHED!"








