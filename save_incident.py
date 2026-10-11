
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

mongodb_uri = os.getenv("MONGODB_URI")
client = MongoClient(mongodb_uri)

# Select the database and collection
db = client["production_support"]
incidents = db["incidents"]

# Create one example production incident
incident = {
    "service": "kafka-consumer",
    "problem": "Consumer lag is 10000 messages",
    "status": "open",
    "created_at": datetime.now(timezone.utc),
}

# Save the incident in MongoDB
result = incidents.insert_one(incident)

print("Incident saved successfully!")
print("Incident ID:", result.inserted_id)

client.close()