# NEXUS AI Operations Center

**An AI-powered operations and incident investigation platform**

NEXUS AI Operations Center is a Python-based application designed to support incident investigation, diagnostic workflows, adaptive policies, and continuous improvement. It includes a frontend application and integration with MongoDB Atlas.

**GitHub Repository:** https://github.com/sravanJava/AIProductionEngineer

## Key Capabilities

- **Incident Investigation:** Investigate operational incidents and support root-cause analysis.
- **Diagnostic Tools:** Organize diagnostic utilities to help analyze operational issues.
- **Incident History:** Read and maintain incident history.
- **Adaptive Policies:** Define and validate policies that guide system behavior.
- **Continuous Improvement:** Use an improvement engine to support iterative refinement.
- **Frontend UI:** Access the application through a dedicated frontend.
- **MongoDB Atlas Integration:** Store or retrieve application data using MongoDB Atlas, according to the configured backend implementation.

*The exact capabilities available depend on the implementation and configuration of each module.*

## Technology Stack

| Component | Technology |
|---|---|
| Backend | Python |
| Frontend | JavaScript/TypeScript framework, as configured in `frontend/` |
| Database | MongoDB Atlas |
| Source Control | Git and GitHub |

## Project Structure

```text
AIProductionEngineer/
├── main.py
├── agent.py
├── adaptive_policy.py
├── diagnostic_tools.py
├── improvement_engine.py
├── incident_history.py
├── investigate_incident.py
├── read_incident.py
├── save_incident.py
├── test_mongodb.py
├── frontend/
├── .gitignore
└── README.md
```

### Important Modules

- `main.py` — Backend application entry point.
- `agent.py` — Agent-related logic.
- `adaptive_policy.py` — Adaptive policy definitions and validation.
- `diagnostic_tools.py` — Diagnostic utilities.
- `improvement_engine.py` — Improvement and refinement logic.
- `incident_history.py` — Incident history operations.
- `investigate_incident.py` — Incident investigation workflow.
- `read_incident.py` — Incident retrieval logic.
- `save_incident.py` — Incident saving logic.
- `test_mongodb.py` — MongoDB connectivity or integration test script.

## Prerequisites

Install the following:

- Python 3
- Node.js and npm
- Git
- A MongoDB Atlas account and database, if required by your configuration

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/sravanJava/AIProductionEngineer.git
cd AIProductionEngineer
```

### 2. Set up the Python environment

Create and activate a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Upgrade pip:

```bash
python -m pip install --upgrade pip
```

If a `requirements.txt` file is available, install the dependencies:

```bash
python -m pip install -r requirements.txt
```

If no dependency file exists, install the packages required by your source code. For example, PyMongo provides the BSON module used by `from bson import ObjectId`:

```bash
python -m pip install pymongo
```

### 3. Configure MongoDB Atlas

Configure your MongoDB Atlas connection using the environment variables or configuration mechanism expected by the application.

Before starting:

1. Create or select your Atlas cluster.
2. Configure a database user with the minimum required permissions.
3. Allow network access from your development environment.
4. Configure the connection string securely.
5. Never commit database passwords or API keys to GitHub.

### 4. Start the backend

From the project root:

```bash
python main.py
```

The backend has previously returned a response similar to:

```json
{
  "application": "NEXUS AI Operations Center",
  "status": "running",
  "database": "MongoDB Atlas"
}
```

The local backend has been accessed at:

http://localhost:8001/

The actual port depends on your application configuration. Keep the Terminal running while using the backend.

### 5. Start the frontend

Open a second Terminal window or tab:

```bash
cd ~/Desktop/mongoDBhackthon/AIProductionEngineer/frontend
npm install
npm run dev
```

Open the local URL printed in the Terminal. For many Vite applications, the default is:

http://localhost:5173/

Keep the frontend and backend running in separate Terminal sessions.

### 6. Build the frontend

To validate and build the frontend:

```bash
cd ~/Desktop/mongoDBhackthon/AIProductionEngineer/frontend
npm run build
```

Review the output for compilation errors.

## Testing

Run the MongoDB test script only after checking its configuration and confirming that it targets the intended database:

```bash
cd ~/Desktop/mongoDBhackthon/AIProductionEngineer
source .venv/bin/activate
python test_mongodb.py
```

Additional tests can be added as the application evolves.

## Troubleshooting

### Missing BSON module

If Python reports:

```text
ModuleNotFoundError: No module named 'bson'
```

Activate your virtual environment and install PyMongo:

```bash
source .venv/bin/activate
python -m pip install pymongo
```

Avoid installing the separate package named `bson`.

### Python package installation is blocked

If Homebrew Python reports an `externally-managed-environment` or PEP 668 error, use a virtual environment instead of `--break-system-packages`.

### Frontend cannot connect to the backend

- Verify that both servers are running.
- Confirm the backend URL in the frontend configuration.
- Inspect browser developer tools for network errors.
- Check the backend Terminal for exceptions.
- Verify CORS settings if the frontend and backend run on different origins.

### MongoDB connection failure

- Verify the Atlas connection string.
- Check database-user permissions.
- Confirm network access rules.
- Check that credentials are configured correctly and are not expired.

## Security

- Never commit `.env` files containing secrets.
- Never hardcode MongoDB passwords, API keys, or access tokens.
- Exclude `.venv/`, `node_modules/`, generated files, and local secrets using `.gitignore`.
- Use environment variables or a secrets manager for sensitive configuration.
- Rotate any credentials that have been accidentally exposed.
- Review staged files before every commit.

## Development Workflow

Check local changes:

```bash
git status
```

After making changes and reviewing them:

```bash
git add .
git diff --cached --check
git commit -m "Describe your changes"
git push
```

## Future Enhancements

Potential directions for future development include:

- More comprehensive automated tests.
- Better observability and diagnostic reporting.
- Expanded incident investigation workflows.
- Improved feedback-driven policy refinement.
- Structured API documentation.
- Deployment automation and monitoring.

These are potential enhancements, not claims that the features are already implemented.

## License

No license has been specified yet. Add a license before distributing or reusing this project publicly.