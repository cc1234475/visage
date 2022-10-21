import os
import time
import json
import uuid
import base64
from typing import List, Optional

import numpy as np
from uuid import UUID
from PIL import Image
from io import BytesIO
from annoy import AnnoyIndex
from deepface.commons import functions
from deepface.basemodels import Facenet512
from fastapi import FastAPI, UploadFile, HTTPException, Form
from pydantic import BaseModel, Field

## Setup the app and load everything into memory
app = FastAPI(title="Performer Search", version="0.1.0", description="Search for performers by face using either and uploaded file or a base64 encoded image.")

# load the face model
model = Facenet512.loadModel()

input_shape_x, input_shape_y = functions.find_input_shape(model)

# setup the annoy index, nearest neighbors search
index = AnnoyIndex(512, "euclidean")
index.load(f"face.db")

# load the stash performer index and annoy index, the annoy index maps to the id's in the .ann file
# the performers db holds stashdb performer id's and the performer name and image
ANNOY_INDEX = json.load(open(f"face.json"))
PERFORMER_DB = json.load(open("performers.json"))

## setup the models used in the API


class Performer(BaseModel):
    id: str = Field(..., title="The performer StashDB ID")
    name: Optional[str] = Field("N/A", description="Name of the performer")
    image: Optional[str] = Field(
        "N/A", description="Image URL of the performer. (if available in stashDB)"
    )
    distance: Optional[float] = Field(
        0.0, description="Distance from the query image. (lower is better)"
    )


class PerformerSearch(BaseModel):
    id: str = Field(..., title="The stashface ID")
    performers: List[Performer] = Field(
        ..., description="List of performers sorted by closetest distance"
    )


class Confirm(BaseModel):
    id: str = Field(..., title="the stashface request ID")
    performer_id: str = Field(..., title="the stashDB performer ID")


class Search(BaseModel):
    vector: List[float] = Field(..., description="The face vector")


## API endpoints

@app.post("/recognise", name="recognise", response_model=PerformerSearch)
async def recognise(
    file: Optional[UploadFile] = None,
    image: Optional[str] = Form(None),
    results: int = 10,
    threshold: float = 20.0,
):
    """Given an image, return the most likely performers based on data from stashDB

    - **file**: a file with the performers face.
    - **image**: A base64 encoded image with the performers face.
    - **results**: maximum number of results to return, can be less if the threshold is set lower. Defaults to 10.
    - **threshold**: Max euclidean distance from the target face (lower is better). Defaults to 20.0.

    Raises **400** error if:
    - No file or image is provided
    - The file is invalid, should be of type: .jpg, .jpeg, .png, .webp
    - Image could not be read
    - No face is detected

    """
    if file is None and image is None:
        raise HTTPException(
            status_code=400,
            detail="You must provide either a file or a URL or image as base64",
        )

    # create a unique id for the request
    uid = str(uuid.uuid4())

    if file:
        if not file.filename.endswith((".jpg", ".jpeg", ".png", ".webp")):
            raise HTTPException(
                status_code=400,
                detail="Invalid file type (only .jpg, .jpeg and .png are allowed)",
            )

        content = await file.read()

    elif image:
        image = image.replace(" ", "+")
        if image[-2:] != "==":
            image += "=="
        content = base64.decodebytes(bytes(image, "utf-8"))

    try:
        image = Image.open(BytesIO(content))
    except Exception as e:
        print(str(e))
        raise HTTPException(status_code=400, detail="Invalid image file")

    if not image.mode == "RGB":
        image = image.convert("RGB")

    image_array = np.array(image)

    # save the image to disk, so we can use it later for confirmation and learning
    if os.getenv("SAVE_IMAGES", False):
        image.save(f"uploads/{uid}.jpg", "JPEG", quality=100)

    t = time.time()
    try:
        img = functions.preprocess_face(
            img=image_array,
            target_size=(input_shape_x, input_shape_y),
            enforce_detection=True,
            detector_backend="retinaface",
            align=True,
        )

        img = functions.normalize_input(img, normalization="Facenet2018")
    except ValueError:
        raise HTTPException(status_code=409, detail="No face detected")
    print("Face detected in", time.time() - t)

    t = time.time()
    face = model.predict(img)[0].tolist()
    print("Face embedding in", time.time() - t)

    performers = lookup_performer(face, results, threshold)
    return {
        "id": uid,
        "performers": performers,
    }


@app.post("/confirm", name="confirm")
async def confirm(id: str = Form(...), performer_id: str = Form(...)):
    """Confirm a result stashface gave.

    When stashface gives a result it will return a unique ID per request.
    with this endpoint you can confirm when which one of the results was correct.

    We can use this information in the future to update our model and give better results.

    - **obj** (Confirm): Body with id of the stashface Request ID and the performer ID.

    Raises **400** error if:
    - The ID is not a valid UUID
    - The performer ID is not a valid UUID

    """
    if not is_valid_uuid(id):
        raise HTTPException(status_code=400, detail="Invalid stashface ID")

    if not is_valid_uuid(performer_id):
        raise HTTPException(status_code=400, detail="Invalid stashDB ID")

    with open("uploads/confirmed.txt", "a") as f:
        f.write(f"{id} = {performer_id}")

    return {"status": "ok", "message": "Thank you!"}


@app.post("/search", name="search")
async def search(obj: Search, results: int = 10, threshold: float = 20.0):
    """Given a 512 length vector, search the database for matches.

    - **obj** (Search): the vector to search in the database. length should be 512
    - **results** (int, optional): maximum number of results to return, can be less if the threshold is set lower. Defaults to 10.
    - **threshold** (float, optional): Max euclidean distance from the target face (lower is better). Defaults to 20.0.

    Raises **400** error if:
    - The vector is not the correct length
    """
    if len(obj.vector) != 512:
        raise HTTPException(status_code=400, detail="Invalid vector size")

    performers = lookup_performer(obj.vector, results, threshold)
    return {
        "id": str(uuid.uuid4()),
        "performers": performers,
    }


# helper functions


def lookup_performer(vector, results: int, threshold: float, uid: str = None):
    """Given a vector, search the database for matches.

    Return the top results based on the threshold.
    """

    t = time.time()
    ids, distances = index.get_nns_by_vector(
        vector, 50, search_k=10000, include_distances=True
    )
    print("Search done in", time.time() - t)

    performers = {}
    for p, distance in zip(ids, distances):
        id = ANNOY_INDEX[p].split("=")[0]
        if id in performers:
            performers[id]["hits"] += 1
            performers[id]["distance"] -= 0.5
            continue

        performers[id] = {
            "id": id,
            "distance": round(distance, 2),
            "hits": 1,
        }

        if id in PERFORMER_DB:
            performers[id].update(PERFORMER_DB.get(id))

    performers = sorted(performers.values(), key=lambda x: x["distance"])
    # filter out the ones that are too far away
    performers = [p for p in performers if p["distance"] < threshold]

    # return only the top results
    return performers[:results]


def is_valid_uuid(uuid_to_test, version=4):
    try:
        uuid_obj = UUID(uuid_to_test, version=version)
    except ValueError:
        return False
    return str(uuid_obj) == uuid_to_test
