#!/usr/bin/env python
import os
import json
from annoy import AnnoyIndex

print("Finding vectors from the filesystem")

ids = []
vectors = []

for root, dirs, files in os.walk("/images"):
    for file in files:
        if not file.endswith(".vector"):
            continue

        path = os.path.join(root, file)
        
        print(path)

        with open(path) as f:
            data = json.load(f)
            # data = [round(d, 4) for d in data]
            vectors.append(data)

        e = os.path.basename(root)
        print(e)
        ids.append(e)

print("Building index")

t = AnnoyIndex(512, 'euclidean')
for i, vector in enumerate(vectors):
    t.add_item(i, vector)

print("Build a forest of trees...")
# 100 trees is a good default
trees = int(os.getenv("VISAGE_TREES", 100))
t.build(trees)

print("Save database and index")

t.save(f"/images/face.db")
json.dump(ids, open(f'/images/face.json', 'w'))

print("Done")
