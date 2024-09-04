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
sudo docker rm -f piggydbctn
echo "DONE"
sudo docker rmi -f piggyfe
sudo docker rmi -f piggybe
sudo docker rmi -f piggydb

echo "DONE"
echo "Docker remove: Success!"
printf "_______________________\n\n"

# Front end

cd frontend

echo "Piggy - FRONT END"

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

printf "FRONT END build successfully\n\n"

cd ..

# SLEEP

printf "SLEEPING 30s"

sleep 30s

# Back end

cd backend

echo "Piggy - BACK END"

echo "Building images"

sudo docker build -t piggybe .

echo "DONE!"

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

cd ..
# SLEEP

printf "SLEEPING 30s"

sleep 30s

# Database

echo "BUILDING and RUNNING MYSQL DATBASE"

cd database

echo "Building database image"

sudo docker build -t piggydb .

echo "Running the MySQL container"

sudo docker run -it -d -p 127.0.0.1:3306:3306 -v /piggydata/mysql/data:/var/lib/mysql --name piggydbctn piggydb

sudo docker ps

printf "Database build and run SUCCESS! Live at port 3306\n\n"


# SLEEP

printf "SLEEPING 30s"

sleep 30s

# BACK END SERVICE
printf "\n\n\n"

echo "Piggy Backend ServiceRestart the systemctl service"

sudo systemctl restart piggybe-service.service

printf "Backend Built and Run SUCCESSFULLY\n\n"

echo "FINISHED!"








