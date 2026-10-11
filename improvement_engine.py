"""Conservative, human-reviewed policy improvement proposals for NEXUS.

Metrics submitted to this module are inputs, not independently verified facts.
This module never writes to MongoDB and never activates a policy.
"""
from copy import deepcopy
import math
from typing import Any

from adaptive_policy import BASE_POLICY, validate_policy

MINIMUM_SAMPLE_SIZE = 10


def propose_improvement(
    metrics: dict,
    current_policy: dict | None = None,
) -> dict:
    """Create a bounded candidate policy from supplied metrics.

    `current_policy` should be the currently active policy from the trusted
    registry. It is optional for backward compatibility; if omitted, the
    trusted base policy is used. A proposal requires human approval and is
    never activated by this function.
    """
    if not isinstance(metrics, dict):
        return {
            "proposal_created": False,
            "reason": "Metrics must be supplied as an object.",
            "requires_human_approval": True,
            "automatically_activated": False,
        }

    sample_size = metrics.get("sample_size", 0)
    helpfulness = metrics.get("memory_helpfulness_rate")

    if (
        not isinstance(sample_size, int)
        or isinstance(sample_size, bool)
        or sample_size < MINIMUM_SAMPLE_SIZE
    ):
        return {
            "proposal_created": False,
            "reason": (
                f"At least {MINIMUM_SAMPLE_SIZE} evaluated incidents are "
                "required before proposing an improvement."
            ),
            "requires_human_approval": True,
            "automatically_activated": False,
        }

    if (
        not isinstance(helpfulness, (int, float))
        or isinstance(helpfulness, bool)
        or not math.isfinite(float(helpfulness))
        or not 0 <= helpfulness <= 1
    ):
        return {
            "proposal_created": False,
            "reason": "memory_helpfulness_rate must be a finite number from 0 to 1.",
            "requires_human_approval": True,
            "automatically_activated": False,
        }

    source_policy = current_policy if current_policy is not None else BASE_POLICY
    if not isinstance(source_policy, dict):
        return {
            "proposal_created": False,
            "reason": "Current policy must be an object.",
            "requires_human_approval": True,
            "automatically_activated": False,
        }

    current_validation = validate_policy(source_policy)
    if not current_validation["valid"]:
        return {
            "proposal_created": False,
            "reason": "Current policy failed safety validation.",
            "validation": current_validation,
            "requires_human_approval": True,
            "automatically_activated": False,
        }

    current_version = source_policy.get("version")
    candidate = deepcopy(source_policy)
    context = candidate.get("context_policy", {})
    current_limit = context.get("max_memory_items")

    if helpfulness >= 0.30:
        return {
            "proposal_created": False,
            "reason": (
                "The supplied metric does not justify a change supported "
                "by this prototype."
            ),
            "requires_human_approval": True,
            "automatically_activated": False,
        }

    if not isinstance(current_limit, int) or isinstance(current_limit, bool) or current_limit <= 0:
        return {
            "proposal_created": False,
            "reason": "The current memory limit cannot be reduced further.",
            "requires_human_approval": True,
            "automatically_activated": False,
        }

    new_limit = current_limit - 1
    context["max_memory_items"] = new_limit
    candidate["context_policy"] = context
    candidate["version"] = current_version + 1

    validation = validate_policy(candidate)
    if not validation["valid"]:
        return {
            "proposal_created": False,
            "reason": "The candidate policy failed safety validation.",
            "validation": validation,
            "requires_human_approval": True,
            "automatically_activated": False,
        }

    return {
        "proposal_created": True,
        "status": "proposed",
        "rationale": (
            f"The supplied memory-helpfulness rate is below 30%. "
            f"Propose reducing historical memory from {current_limit} "
            f"incident(s) to {new_limit}. The metric has not been "
            "independently verified by this endpoint."
        ),
        "sample_size": sample_size,
        "metrics": {"memory_helpfulness_rate": float(helpfulness)},
        "metrics_source": "api_submitted_not_independently_verified",
        "current_policy_version": current_version,
        "candidate_policy": candidate,
        "validation": validation,
        "requires_human_approval": True,
        "automatically_activated": False,
    }


if __name__ == "__main__":
    print(propose_improvement({"sample_size": 12, "memory_helpfulness_rate": 0.20}))
