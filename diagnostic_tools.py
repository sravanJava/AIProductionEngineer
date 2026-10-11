"""Read-only diagnostics used by NEXUS.

Real checks are explicitly distinguished from prototype/simulated checks.
No diagnostic here claims to establish a root cause by itself.
"""
import os
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import PyMongoError

load_dotenv()
API_HEALTH_URL = os.getenv("API_HEALTH_URL", "http://127.0.0.1:8080/health")


def check_mongodb_connectivity() -> dict:
    """Perform a real, read-only MongoDB ping."""
    uri = os.getenv("MONGODB_URI")
    if not uri:
        return {
            "tool": "check_mongodb_connectivity", "simulated": False,
            "status": "not_configured", "root_cause_established": False,
            "finding": "MongoDB was not checked because MONGODB_URI is not configured.",
        }
    try:
        with MongoClient(uri, serverSelectionTimeoutMS=3000, connectTimeoutMS=3000) as client:
            result = client.admin.command("ping")
        ping_ok = result.get("ok") == 1.0
        return {
            "tool": "check_mongodb_connectivity", "simulated": False,
            "status": "connected" if ping_ok else "unhealthy",
            "root_cause_established": False,
            "evidence": {"ping_ok": ping_ok},
            "finding": "MongoDB responded to a real ping." if ping_ok else "MongoDB ping returned an unexpected result.",
        }
    except (PyMongoError, ValueError) as exc:
        return {
            "tool": "check_mongodb_connectivity", "simulated": False,
            "status": "unavailable", "root_cause_established": False,
            "error_type": type(exc).__name__,
            "finding": "MongoDB connectivity check failed. Verify database availability and connection settings.",
        }


def check_api_health() -> dict:
    """Perform a real HTTP health check against API_HEALTH_URL."""
    try:
        with urlopen(API_HEALTH_URL, timeout=3) as response:
            status = response.status
        healthy = 200 <= status < 300
        return {
            "tool": "check_api_health", "simulated": False,
            "status": "healthy" if healthy else "unhealthy",
            "root_cause_established": False,
            "evidence": {"http_status": status, "endpoint": API_HEALTH_URL},
            "finding": f"API health endpoint responded with HTTP {status}.",
        }
    except HTTPError as exc:
        return {
            "tool": "check_api_health", "simulated": False,
            "status": "unhealthy", "root_cause_established": False,
            "evidence": {"http_status": exc.code, "endpoint": API_HEALTH_URL},
            "finding": f"API health endpoint returned HTTP {exc.code}.",
        }
    except (URLError, TimeoutError, OSError, ValueError) as exc:
        return {
            "tool": "check_api_health", "simulated": False,
            "status": "unavailable", "root_cause_established": False,
            "error_type": type(exc).__name__,
            "finding": "API health endpoint could not be reached or checked. Verify that the service is running and the URL is correct.",
        }


def check_kafka_lag(lag: int) -> dict:
    """Classify a supplied lag value; this is a prototype, not live Kafka telemetry."""
    if not isinstance(lag, int) or lag < 0:
        return {
            "tool": "check_kafka_lag", "simulated": True, "status": "invalid_input",
            "root_cause_established": False, "finding": "Kafka lag must be a non-negative integer.",
        }
    if lag >= 10_000:
        status, finding = "critical", "The supplied Kafka consumer lag value is very high."
    elif lag >= 1_000:
        status, finding = "warning", "The supplied Kafka consumer lag value is elevated."
    else:
        status, finding = "normal", "The supplied Kafka consumer lag value is within the prototype's normal range."
    return {
        "tool": "check_kafka_lag", "simulated": True, "status": status,
        "root_cause_established": False, "lag": lag, "finding": finding,
    }


def inspect_incident(service: str, problem: str) -> dict:
    """Route to an explicitly supported diagnostic without inventing evidence."""
    service_name = (service or "").strip().lower().replace("_", "-")
    description = (problem or "").lower()

    if service_name in {"mongodb", "mongo-db", "mongo", "database", "db"}:
        return check_mongodb_connectivity()

    if service_name in {"api-service", "api", "api-server"}:
        return {
            "tool": "inspect_incident", "simulated": False,
            "status": "unknown", "root_cause_established": False,
            "api_health": check_api_health(),
            "finding": "The configured API health endpoint was checked. This does not establish the health of every operation or the incident's root cause.",
        }

    if service_name in {"payment-service", "payment", "payments"}:
        return {
            "tool": "inspect_incident", "simulated": False,
            "status": "unknown", "root_cause_established": False,
            "database_connectivity": check_mongodb_connectivity(),
            "finding": "Payment-service logs, exception counts, latency, and payment-operation telemetry are not connected to this diagnostic. MongoDB connectivity alone cannot establish the payment incident's cause.",
            "missing_evidence": ["payment application logs", "exception counts", "request error rate", "request latency", "payment operation test"],
        }

    if service_name in {"kafka-consumer", "kafka", "consumer"}:
        if "10000" in description or "10,000" in description:
            return check_kafka_lag(10_000)
        if "1000" in description or "1,000" in description:
            return check_kafka_lag(1_000)
        if "lag" in description:
            return check_kafka_lag(100)
        return {
            "tool": "inspect_incident", "simulated": True, "status": "unknown",
            "root_cause_established": False,
            "finding": "No numeric Kafka lag was supplied. No live Kafka metrics were queried.",
            "missing_evidence": ["live consumer-group lag", "consumer processing rate", "broker health"],
        }

    return {
        "tool": "inspect_incident", "simulated": True, "status": "unknown",
        "root_cause_established": False,
        "finding": f"No diagnostic is configured for service '{service_name or 'blank'}'. No service-specific evidence was collected.",
        "missing_evidence": ["service-specific diagnostic tool"],
    }
