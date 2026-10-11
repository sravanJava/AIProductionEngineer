
import logging
import os
import re
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pymongo import MongoClient, DESCENDING

from agent import investigate_with_agent

load_dotenv()
logger = logging.getLogger("nexus.api")

app = FastAPI(
    title="NEXUS AI Operations Center",
    description="AI-powered production incident investigation",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB connection
mongodb_uri = os.getenv("MONGODB_URI")

if not mongodb_uri:
    raise RuntimeError(
        "MONGODB_URI is missing. Add it to your .env file."
    )

mongo_client = MongoClient(
    mongodb_uri,
    serverSelectionTimeoutMS=10000,
)

database = mongo_client["production_support"]
incidents = database["incidents"]
active_policies = database["active_policies"]


class IncidentRequest(BaseModel):
    service: str = Field(min_length=1, max_length=100)
    problem: str = Field(min_length=3, max_length=5000)


class ResolveIncidentRequest(BaseModel):
    root_cause: str = Field(min_length=3, max_length=5000)
    resolution: str = Field(min_length=3, max_length=5000)
    verification_notes: str = Field(min_length=3, max_length=5000)


def serialize_incident(document):
    """Convert a MongoDB incident into JSON-friendly data."""
    if not document:
        return None

    result = dict(document)
    result["incident_id"] = str(result.pop("_id"))

    for key in ("created_at", "resolved_at"):
        value = result.get(key)
        if isinstance(value, datetime):
            result[key] = value.isoformat()

    return result


def find_similar_resolved_incidents(service, problem, limit=3):
    """
    Retrieve earlier resolved incidents for the same service.
    Keyword overlap is a simple first version of incident memory.
    """
    previous = list(
        incidents.find({
            "service": service,
            "status": "closed",
            # Only reuse incidents whose verification was explicitly recorded
            # as independently verified. Human-entered notes alone are not proof.
            "verification_status": "verified",
        })
        .sort("resolved_at", DESCENDING)
        .limit(100)
    )

    problem_words = set(
        re.findall(r"[a-z0-9]+", problem.lower())
    )

    ranked = []

    for item in previous:
        searchable_text = " ".join([
            str(item.get("problem", "")),
            str(item.get("root_cause", "")),
            str(item.get("resolution", "")),
        ]).lower()

        previous_words = set(
            re.findall(r"[a-z0-9]+", searchable_text)
        )

        overlap = len(problem_words & previous_words)

        if overlap > 0:
            ranked.append((overlap, item))

    ranked.sort(key=lambda pair: pair[0], reverse=True)

    return [
        serialize_incident(item)
        for _, item in ranked[:limit]
    ]


@app.get("/")
def health_check():
    return {
        "application": "NEXUS AI Operations Center",
        "status": "running",
        "database": "MongoDB Atlas",
    }


@app.get("/health")
def health():
    try:
        mongo_client.admin.command("ping")
        return {
            "api": "healthy",
            "mongodb": "connected",
        }
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="MongoDB connection failed",
        )


@app.post("/investigate")
def investigate(request: IncidentRequest):
    service = request.service.strip()
    problem = request.problem.strip()

    if not service or not problem:
        raise HTTPException(
            status_code=400,
            detail="Service and problem are required.",
        )

    # Retrieve relevant historical incidents.
    previous_incidents = find_similar_resolved_incidents(
        service,
        problem,
    )

    try:
        # The agent investigates using diagnostic tools and the LLM.
        analysis = investigate_with_agent(
            service,
            problem,
            previous_incidents=previous_incidents,
        )
    except Exception as exc:
        logger.exception("Agent investigation failed")
        # Keep internal exception text in server logs, not in the API response.
        raise HTTPException(
            status_code=502,
            detail="Agent investigation failed. Check server logs using the request timestamp.",
        ) from exc

    document = {
        "service": service,
        "problem": problem,
        "diagnosis": analysis.get("diagnosis", {}),
        "ai_analysis": analysis.get("ai_analysis", ""),
        # These are the IDs the agent actually included in its prompt,
        # not merely the incidents retrieved by the API.
        "memory_used": analysis.get("memory_used_ids", []),
        "status": "open",
        "root_cause": None,
        "resolution": None,
        "verification_notes": None,
        "created_at": datetime.now(timezone.utc),
        "resolved_at": None,
    }

    try:
        result = incidents.insert_one(document)
        saved = incidents.find_one({"_id": result.inserted_id})
    except Exception as exc:
        logger.exception("Could not save incident to MongoDB")
        raise HTTPException(
            status_code=500,
            detail="Could not save the incident to MongoDB.",
        ) from exc

    response = serialize_incident(saved)
    response["memory_used_count"] = len(previous_incidents)

    return response


@app.get("/incidents")
def get_incidents():
    """Return the latest 100 incidents."""
    try:
        documents = list(
            incidents.find()
            .sort("created_at", DESCENDING)
            .limit(100)
        )

        return [
            serialize_incident(document)
            for document in documents
        ]
    except Exception as exc:
        logger.exception("Could not load incident history")
        raise HTTPException(
            status_code=500,
            detail="Could not load incident history.",
        ) from exc


@app.get("/incidents/{incident_id}")
def get_incident(incident_id: str):
    try:
        object_id = ObjectId(incident_id)
    except InvalidId:
        raise HTTPException(
            status_code=400,
            detail="Invalid incident ID.",
        )

    document = incidents.find_one({"_id": object_id})

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Incident not found.",
        )

    return serialize_incident(document)


@app.patch("/incidents/{incident_id}/resolve")
def resolve_incident(
    incident_id: str,
    request: ResolveIncidentRequest,
):
    try:
        object_id = ObjectId(incident_id)
    except InvalidId:
        raise HTTPException(
            status_code=400,
            detail="Invalid incident ID.",
        )

    existing = incidents.find_one({"_id": object_id})

    if not existing:
        raise HTTPException(
            status_code=404,
            detail="Incident not found.",
        )

    if existing.get("status") == "closed":
        raise HTTPException(
            status_code=409,
            detail="This incident has already been resolved.",
        )

    result = incidents.update_one(
        {
            "_id": object_id,
            "status": {"$ne": "closed"},
        },
        {
            "$set": {
                "root_cause": request.root_cause.strip(),
                "resolution": request.resolution.strip(),
                "verification_notes": request.verification_notes.strip(),
                # This endpoint records a human closure decision; it does not
                # execute a verification test. Never label it independently verified.
                "verification_status": "human_attested_not_independently_verified",
                "status": "closed",
                "resolved_at": datetime.now(timezone.utc),
            }
        },
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=409,
            detail="The incident was already resolved.",
        )

    updated = incidents.find_one({"_id": object_id})
    return serialize_incident(updated)


@app.delete("/incidents/{incident_id}")
def delete_incident(incident_id: str):
    """
    Permanently delete one incident after the frontend asks
    the user to confirm.
    """
    try:
        object_id = ObjectId(incident_id)
    except InvalidId:
        raise HTTPException(
            status_code=400,
            detail="Invalid incident ID.",
        )

    result = incidents.delete_one({"_id": object_id})

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Incident not found. It may already have been deleted.",
        )

    return {
        "incident_id": incident_id,
        "message": "Incident deleted successfully.",
    }


# ---------------------------------------------------------
# NEXUS AGENT HARNESS: evaluations and improvement proposals
# ---------------------------------------------------------

from improvement_engine import propose_improvement


harness_evaluations = database["harness_evaluations"]
harness_proposals = database["harness_proposals"]


class HarnessEvaluationRequest(BaseModel):
    sample_size: int = Field(ge=0, le=100000)
    memory_helpfulness_rate: float = Field(ge=0, le=1)


def serialize_harness_document(document):
    """Convert a MongoDB harness record into JSON-friendly data."""
    if not document:
        return None

    result = dict(document)
    result["id"] = str(result.pop("_id"))

    for key in ("created_at", "approved_at"):
        value = result.get(key)
        if isinstance(value, datetime):
            result[key] = value.isoformat()

    return result


@app.post("/harness/evaluate")
def evaluate_harness(request: HarnessEvaluationRequest):
    """
    Record submitted evaluation metrics and save a policy proposal
    when the improvement engine determines one is justified.
    """
    metrics = {
        "sample_size": request.sample_size,
        "memory_helpfulness_rate": request.memory_helpfulness_rate,
    }

    # These metrics are submitted by the caller; this endpoint does not
    # independently evaluate historical incidents or verify the numbers.
    try:
        active_document = active_policies.find_one({"_id": "active"})
    except Exception as exc:
        logger.exception("Could not load active policy for evaluation")
        raise HTTPException(
            status_code=503,
            detail="Could not load the active policy for evaluation.",
        ) from exc

    if not active_document or not isinstance(active_document.get("policy"), dict):
        raise HTTPException(
            status_code=503,
            detail="No valid active policy is available for evaluation.",
        )

    proposal = propose_improvement(metrics, current_policy=active_document["policy"])

    evaluation_document = {
        "metrics": metrics,
        "metrics_source": "api_submitted_not_independently_verified",
        "proposal_created": proposal["proposal_created"],
        "created_at": datetime.now(timezone.utc),
    }

    try:
        evaluation_result = harness_evaluations.insert_one(
            evaluation_document
        )

        proposal_id = None

        if proposal["proposal_created"]:
            proposal_document = {
                **proposal,
                "evaluation_id": str(evaluation_result.inserted_id),
                "created_at": datetime.now(timezone.utc),
                "approved_at": None,
            }

            saved_proposal = harness_proposals.insert_one(
                proposal_document
            )
            proposal_id = str(saved_proposal.inserted_id)

        return {
            "evaluation_id": str(evaluation_result.inserted_id),
            "proposal_id": proposal_id,
            "evaluation": metrics,
            "result": proposal,
        }

    except Exception as exc:
        logger.exception("Could not save harness evaluation or proposal")
        raise HTTPException(
            status_code=500,
            detail="Could not save harness evaluation or proposal.",
        ) from exc


@app.get("/harness/proposals")
def list_harness_proposals():
    """List the latest 100 policy improvement proposals."""
    try:
        documents = list(
            harness_proposals.find()
            .sort("created_at", DESCENDING)
            .limit(100)
        )

        return [
            serialize_harness_document(document)
            for document in documents
        ]
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Could not load harness proposals.",
        )


@app.post("/harness/proposals/{proposal_id}/approve")
def approve_harness_proposal(proposal_id: str):
    """
    Record human approval of a validated proposal.
    This does NOT activate the policy.
    """
    try:
        object_id = ObjectId(proposal_id)
    except InvalidId:
        raise HTTPException(
            status_code=400,
            detail="Invalid proposal ID.",
        )

    proposal = harness_proposals.find_one({"_id": object_id})

    if not proposal:
        raise HTTPException(
            status_code=404,
            detail="Harness proposal not found.",
        )

    if proposal.get("status") != "proposed":
        raise HTTPException(
            status_code=409,
            detail="Only proposals in proposed status can be approved.",
        )

    candidate = proposal.get("candidate_policy")
    if not isinstance(candidate, dict):
        raise HTTPException(
            status_code=400,
            detail="Proposal does not contain a valid candidate policy.",
        )

    from adaptive_policy import validate_policy

    validation = validate_policy(candidate)

    if not validation["valid"]:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Candidate policy failed safety validation.",
                "errors": validation["errors"],
            },
        )

    if candidate.get("version") != proposal.get(
        "current_policy_version", 1
    ) + 1:
        raise HTTPException(
            status_code=409,
            detail="Candidate policy version is inconsistent.",
        )

    now = datetime.now(timezone.utc)

    result = harness_proposals.update_one(
        {
            "_id": object_id,
            "status": "proposed",
        },
        {
            "$set": {
                "status": "approved",
                "approved_at": now,
                "approval_validation": validation,
            }
        },
    )

    if result.modified_count != 1:
        raise HTTPException(
            status_code=409,
            detail="Proposal changed before approval could be recorded.",
        )

    updated = harness_proposals.find_one({"_id": object_id})

    return {
        "proposal": serialize_harness_document(updated),
        "message": (
            "Approval recorded. The candidate policy is not active."
        ),
    }
