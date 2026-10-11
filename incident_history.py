
import os
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

client = MongoClient(os.getenv("MONGODB_URI"))
db = client["production_support"]
incidents = db["incidents"]


def find_similar_incidents(service: str) -> list:
    """Find recent incidents for the same service."""

    results = incidents.find(
        {"service": service}
    ).sort("_id", -1).limit(5)

    history = []

    for incident in results:
        history.append({
            "problem": incident.get("problem"),
            "diagnosis": incident.get("diagnosis"),
            "status": incident.get("status"),
        })

    return history


# Test the history search
past_incidents = find_similar_incidents("kafka-consumer")

print("Past incidents found:", len(past_incidents))

for item in past_incidents:
    print(item)

client.close()