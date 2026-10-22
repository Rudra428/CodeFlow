import os

from waitress import serve

os.environ["ENABLE_LOCAL_EXECUTION"] = "true"
os.environ.setdefault(
    "FRONTEND_ORIGINS",
    "https://code-flow-rho-lemon.vercel.app,http://localhost:5173",
)

from app import app


if __name__ == "__main__":
    print("CodeFlow local runner listening at http://127.0.0.1:4000")
    print("Keep this window open while using Local mode.")
    serve(app, host="127.0.0.1", port=4000, threads=8)
