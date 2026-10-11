
import os
from dotenv import load_dotenv
from pymongo import MongoClient

# Read the connection string from .env
load_dotenv()

mongodb_uri = os.getenv("MONGODB_URI")

if not mongodb_uri:
    raise ValueError("MONGODB_URI is missing from your .env file")

# Connect to MongoDB Atlas
client = MongoClient(
    mongodb_uri,
    serverSelectionTimeoutMS=10000
)

# Check whether MongoDB responds
client.admin.command("ping")

print("Success! Python connected to MongoDB Atlas.")