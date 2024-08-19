## Build the image
```
docker build -t mysqlctn . 
```
This will build the image called mysqlctn. 
To check the image, run
```
docker images
```

## Run the image
```
docker run -it -p 3306:3306 mysqlctn
```
This will map the 3306 map in the container to the localhost 3306


### To go to the container bash:
Get the container id at:
```
docker ps
```
then 
```
docker exec -it <container id> bash
```

### To access the data base as root inside the container:
```
mysql -P 3306 -u root -p
```

