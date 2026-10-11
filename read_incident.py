
import os
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

client = MongoClient(os.getenv("MONGODB_URI"))

db = client["production_support"]
incidents = db["incidents"]

# Find the most recently created incident
incident = incidents.find_one(
    sort=[("_id", -1)]
)

if incident:
    print("Previous incident found!")
    print("Service:", incident["service"])
    print("Problem:", incident["problem"])
    print("Status:", incident["status"])
else:
    print("No incidents found.")

client.close()