
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from pymongo import MongoClient
from diagnostic_tools import check_kafka_lag

load_dotenv()

client = MongoClient(os.getenv("MONGODB_URI"))
db = client["production_support"]
incidents = db["incidents"]

# 1. Receive a simulated production alert
lag = 10000

# 2. Run the diagnostic tool
diagnosis = check_kafka_lag(lag)

# 3. Save the diagnosis in MongoDB
incident = {
    "service": "kafka-consumer",
    "problem": f"Consumer lag is {lag} messages",
    "diagnosis": diagnosis,
    "status": "open",
    "created_at": datetime.now(timezone.utc),
}

result = incidents.insert_one(incident)

print("Investigation completed!")
print("Finding:", diagnosis["finding"])
print("Severity:", diagnosis["status"])
print("Saved incident ID:", result.inserted_id)

client.close()