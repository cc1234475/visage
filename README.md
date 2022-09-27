# visage

Visage is a series of docker images that preform facial recognition on images and create a searchable database.

Basic workflow is the following: 

## Get a folder with images.

using the following folder structure.

```
person_name
  - image_file_001.jpeg
  - another_01.jpeg
```

where `person_name` could be a person_name name or a UID, anything unique.

## run the hasher

First we need to download some weights so the model can run.

download the following to files and put them in `/hasher/weights`

```
https://github.com/serengil/deepface_models/releases/download/v1.0/facenet512_weights.h5
https://github.com/serengil/deepface_models/releases/download/v1.0/retinaface.h5
```

In the hasher folder, modify the docker-compose to point to your folder of images.
```
docker-compose build
docker-compose up
```

Once complete, It creates a sidecar file called <image name>.vector next to it each image.

## run the builder

To create the database that can be used to lookup, we use the `builder`

same thing as before, modify the docker-compose file.

```
docker-compose build
docker-compose up
```

This should give two files at the root of the folder you made available the container.

`face.db` and `face.json` these files are used by the next container.

## run the face matcher

Once again. modify the docker-compose.

It creates a <image name>.json file with 10 closest results
