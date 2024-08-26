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

echo "Docker remove: Success!"
echo "_______________________\n\n"

# Database

echo "BUILDING and RUNNING MYSQL DATBASE"

cd database

echo "Building database image"

docker build -t piggydb .

echo "Running the MySQL container"

docker run -it -d -p 3306:3306 -v /piggydata/mysql/data:/var/lib/mysql --name piggydbctn piggydb

docker ps

echo "Database build and run SUCCESS! Live at port 3306"

cd ..

# Front end

cd frontend

echo "Piggy - FRONT END"

echo "Building image"

docker build -t piggyfe .

echo "Running container"

docker build -it -d --name piggyfectn piggyfe

echo "DONE!"

echo "Copy dist: Docker cp - COPYING dist to /var/html"

docker cp piggyfectn:/app/dist /var/www/html/

echo "DONE!"

echo "STOPING the container front end"

docker stop piggyfectn

echo "REMOVE the container front end"

docker rm -f piggyfectn

echo "REMOVE the container image"

docker rmi -f piggyfe

echo "FRONT END build successfully\n\n"

cd ..

# Back end

cd backend

echo "Piggy - BACK END"

echo "Building images"

docker build -t piggybe .

echo "DONE!"

echo "Running container"

docker run -it -d --name piggybectn piggybe

echo "DONE!"

echo "Copying the binary to the host"

docker cp piggybectn:/app/piggybe-bin .

echo "DONE!"

echo "Stoping container"

docker stop piggybectn

echo "Removing container"

docker rm -f piggybectn

echo "Removing image"
docker rmi piggybe

echo "Restart the systemctl service"

sudo systemctl restart piggybe-service.service

echo "Backend Built and Run SUCCESSFULLY\n\n"

cd .. 

echo "FINISHED!"








