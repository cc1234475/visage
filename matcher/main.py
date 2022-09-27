#!/usr/bin/env python
import os
import json
from annoy import AnnoyIndex


def check_for_provided_file(filename):
    file = f"/images/{filename}"
    if not os.path.exists(file):
        file = filename
    return file


facedb_file = check_for_provided_file("face.db")
# setup the annoy index, nearest neighbors search
index = AnnoyIndex(512, "euclidean")
index.load(facedb_file)

# load the performer index and annoy index, the annoy index maps to the id's in the .json file
face_index_file = check_for_provided_file("face.json")
ANNOY_INDEX = json.load(open(face_index_file))

# Optional performers database that can hold addition information about the performers and gets add to the search results.
performers_file = check_for_provided_file("performers.json")
PERFORMER_DB = json.load(open(performers_file))


def process_vector(vector_file):
    name, _ = os.path.splitext(vector_file)
    file = name + ".json"
    if os.path.exists(file):
        print(f"{file} already exists, skipping")
        return

    print("processing", vector_file)

    try:
        vector = json.load(open(vector_file))
    except Exception as e:
        print(e)
        return

    ids, distances = index.get_nns_by_vector(
        vector, 50, search_k=10000, include_distances=True
    )

    persons = {}
    for p, distance in zip(ids, distances):
        id = ANNOY_INDEX[p].split("=")[0]
        if id in persons:
            persons[id]["hits"] += 1
            persons[id]["distance"] -= 0.5
            continue

        person = PERFORMER_DB.get(id)

        persons[id] = {
            "id": id,
            "distance": round(distance, 2),
            "hits": 1,
        }

        if id in PERFORMER_DB:
            person = PERFORMER_DB.get(id)
            persons[id].update(person)

    results = sorted(persons.values(), key=lambda x: x["distance"])[:10]

    print("closest matches", results[0])

    with open(file, "w") as e:
        json.dump(results, e)


for root, dirs, files in os.walk("/images"):
    for file in files:
        if file.endswith(".vector"):
            process_vector(os.path.join(root, file))
