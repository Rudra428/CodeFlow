import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache
from pathlib import Path

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import BadRequest

MAX_REQUEST_BYTES = 1_000_000
MAX_SOURCE_BYTES = 256_000
MAX_TESTS = 20
MAX_INPUT_BYTES = 64_000
MAX_TIME_LIMIT_MS = 10_000
MAX_PARALLEL_REQUESTS = 2
MAX_PARALLEL_TESTS = 4
MAX_PARALLEL_DIAGNOSTICS = 2
JUDGE0_BASE_URL = os.environ.get("JUDGE0_BASE_URL", "https://ce.judge0.com").rstrip("/")
LOCAL_EXECUTION_ENABLED = os.environ.get("ENABLE_LOCAL_EXECUTION", "").strip().lower() in ("1", "true", "yes")
FRONTEND_ORIGINS = tuple(
    origin.strip()
    for origin in os.environ.get("FRONTEND_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
)
JUDGE0_LANGUAGE_ID = os.environ.get("JUDGE0_LANGUAGE_ID")
JUDGE0_LANGUAGE_IDS = {
    "cpp": os.environ.get("JUDGE0_CPP_LANGUAGE_ID", JUDGE0_LANGUAGE_ID),
    "python": os.environ.get("JUDGE0_PYTHON_LANGUAGE_ID"),
    "java": os.environ.get("JUDGE0_JAVA_LANGUAGE_ID"),
}
JUDGE0_REQUEST_TIMEOUT_SECONDS = 15
JUDGE0_POLL_INTERVAL_SECONDS = 1
JUDGE0_MAX_POLL_SECONDS = 90
DIAGNOSTICS_DEBOUNCE_HINT_MS = 1200
COMPILE_TIMEOUT_SECONDS = 30
LOCAL_STANDARD_PROBES = (
    ("23", "#if !defined(__cpp_if_consteval) || __cpp_if_consteval < 202106L\n#error C++23 if consteval is unavailable\n#endif\nint main() { if consteval { return 0; } else { return 1; } }\n"),
    ("20", "#include <concepts>\nstatic_assert(std::same_as<int, int>);\nint main() {}\n"),
    ("17", "#include <utility>\nint main() { auto [first, second] = std::pair<int, int>{1, 2}; return first + second; }\n"),
    ("14", "int main() { auto identity = [](auto value) { return value; }; return identity(0); }\n"),
    ("11", "int main() { int* value = nullptr; static_assert(sizeof(value) == sizeof(void*), \"pointer\"); }\n"),
    ("98", "int main() { return 0; }\n"),
)
JOB_SLOTS = threading.BoundedSemaphore(MAX_PARALLEL_REQUESTS)
DIAGNOSTIC_SLOTS = threading.BoundedSemaphore(MAX_PARALLEL_DIAGNOSTICS)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_REQUEST_BYTES
CORS(app, resources={r"/api/*": {"origins": FRONTEND_ORIGINS}})


def error_response(message, status):
    return jsonify({"error": message}), status


@lru_cache(maxsize=8)
def _detect_local_cpp_standard(compiler):
    for version, probe in LOCAL_STANDARD_PROBES:
        try:
            result = subprocess.run(
                [compiler, f"-std=gnu++{version}", "-x", "c++", "-fsyntax-only", "-"],
                input=probe,
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
                shell=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            continue
        if result.returncode == 0:
            return f"gnu++{version}"
    return None


@lru_cache(maxsize=3)
def _get_judge0_language(language_key="cpp"):
    response = requests.get(
        f"{JUDGE0_BASE_URL}/languages",
        timeout=JUDGE0_REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    languages = response.json()
    if not isinstance(languages, list):
        raise RuntimeError("Judge0 CE returned an invalid language list.")
    if language_key == "cpp":
        matching_languages = [
            language for language in languages
            if "c++" in language.get("name", "").lower()
            and "gcc" in language.get("name", "").lower()
        ]
        version_pattern = re.compile(r"GCC\s+(\d+(?:\.\d+)+)", re.IGNORECASE)
    elif language_key == "python":
        matching_languages = [
            language for language in languages
            if re.search(r"Python\s*\(?(?:3(?:\.|\s|$))", language.get("name", ""), re.IGNORECASE)
        ]
        version_pattern = re.compile(r"Python\s*\(?\s*(\d+(?:\.\d+)+)", re.IGNORECASE)
    elif language_key == "java":
        matching_languages = [
            language for language in languages
            if re.search(r"Java\s*\(", language.get("name", ""), re.IGNORECASE)
            and "javafx" not in language.get("name", "").lower()
        ]
        version_pattern = re.compile(r"Java\s*\([^)]*?(\d+(?:\.\d+)+)", re.IGNORECASE)
    else:
        raise ValueError("Unsupported language. Choose cpp, python, or java.")

    pinned_id = JUDGE0_LANGUAGE_IDS.get(language_key)
    if pinned_id:
        selected = next(
            (language for language in matching_languages if str(language.get("id")) == pinned_id),
            None,
        )
        if not selected:
            raise RuntimeError(f"Configured Judge0 {language_key} language ID is not available.")
    elif matching_languages:
        def runtime_version(language):
            match = version_pattern.search(language["name"])
            if not match:
                return (0,)
            try:
                return tuple(int(part) for part in match.group(1).split("."))
            except ValueError:
                return (0,)

        selected = max(matching_languages, key=runtime_version)
    else:
        raise RuntimeError(f"Judge0 CE did not report an available {language_key} language.")

    result = {
        **selected,
        "languageKey": language_key,
    }
    if language_key == "cpp":
        version_match = version_pattern.search(selected["name"])
        version = tuple(int(part) for part in version_match.group(1).split(".")) if version_match else (0,)
        result["standard"] = "gnu++23" if version >= (14,) else "gnu++20" if version >= (11,) else "gnu++17" if version >= (8,) else "gnu++14"
        result["displayName"] = f"GNU C++{result['standard'][5:]} - {selected['name']}"
    elif language_key == "java":
        version_match = version_pattern.search(selected["name"])
        version = tuple(int(part) for part in version_match.group(1).split(".")) if version_match else (0,)
        result["displayName"] = f"Java {version[0]} - {selected['name']}"
    else:
        result["displayName"] = selected["name"]
    return result


def _validate_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")
    source = payload.get("sourceCode")
    cases = payload.get("testCases")
    time_limit = payload.get("timeLimitMs", 2000)
    if not isinstance(source, str) or not source.strip():
        raise ValueError("sourceCode must be a non-empty string.")
    if len(source.encode("utf-8")) > MAX_SOURCE_BYTES:
        raise ValueError(f"sourceCode exceeds {MAX_SOURCE_BYTES} bytes.")
    if isinstance(time_limit, bool) or not isinstance(time_limit, int) or not 100 <= time_limit <= MAX_TIME_LIMIT_MS:
        raise ValueError(f"timeLimitMs must be an integer from 100 to {MAX_TIME_LIMIT_MS}.")
    if not isinstance(cases, list) or not cases or len(cases) > MAX_TESTS:
        raise ValueError(f"testCases must contain between 1 and {MAX_TESTS} cases.")

    validated = []
    seen_ids = set()
    for index, case in enumerate(cases):
        if not isinstance(case, dict):
            raise ValueError(f"testCases[{index}] must be an object.")
        case_id = case.get("id", f"test-{index + 1}")
        test_input = case.get("input")
        if not isinstance(case_id, (str, int)) or len(str(case_id)) > 100:
            raise ValueError(f"testCases[{index}].id must be a string or integer of at most 100 characters.")
        if str(case_id) in seen_ids:
            raise ValueError("Test case IDs must be unique.")
        seen_ids.add(str(case_id))
        if not isinstance(test_input, str):
            raise ValueError(f"testCases[{index}].input must be a string.")
        if len(test_input.encode("utf-8")) > MAX_INPUT_BYTES:
            raise ValueError(f"testCases[{index}].input exceeds {MAX_INPUT_BYTES} bytes.")
        validated.append({"id": str(case_id), "input": test_input})
    return source, time_limit, validated


def _validate_language_key(value):
    if value not in ("cpp", "python", "java"):
        raise ValueError("language must be 'cpp', 'python', or 'java'.")
    return value


def _parse_compiler_diagnostics(output):
    diagnostics = []
    pattern = re.compile(
        r"(?:solution\.cpp|main\.cpp|main\.py|Main\.java|<stdin>):(\d+):(?:(\d+):)?\s*(fatal error|error|warning|note):\s*(.*)"
    )
    for line in output.splitlines():
        match = pattern.search(line)
        if not match:
            java_match = re.search(r"Main\.java:(\d+):\s*(fatal error|error|warning):\s*(.*)", line)
            if java_match:
                diagnostics.append({
                    "line": int(java_match.group(1)),
                    "column": 1,
                    "severity": "warning" if java_match.group(2) == "warning" else "error",
                    "message": java_match.group(3).strip(),
                })
            continue
        if not match or match.group(4) == "note":
            continue
        diagnostics.append({
            "line": int(match.group(1)),
            "column": int(match.group(2) or 1),
            "severity": "warning" if match.group(3) == "warning" else "error",
            "message": match.group(4).strip(),
        })
    return diagnostics


def _local_diagnostics(source, language_key):
    if language_key == "cpp":
        compiler = shutil.which("g++")
        if not compiler:
            return None, "Local g++ is unavailable."
        standard = _detect_local_cpp_standard(compiler)
        if not standard:
            return None, "The installed local g++ does not support a recognized C++ standard."
        command = [compiler, "-std=" + standard, "-DLOCAL", "-fsyntax-only", "-x", "c++", "-"]
        display_name = f"Local GNU C++{standard[5:]}"
    elif language_key == "python":
        command = [sys.executable, "-c", "import sys; compile(sys.stdin.read(), 'main.py', 'exec')"]
        display_name = f"Local Python {sys.version_info.major}.{sys.version_info.minor}"
    else:
        compiler = shutil.which("javac")
        if not compiler:
            return None, "Local Java (javac) is unavailable."
        with tempfile.TemporaryDirectory(prefix="cf-cloud-diagnostics-") as temp_dir:
            source_path = Path(temp_dir) / "Main.java"
            source_path.write_text(source, encoding="utf-8")
            try:
                result = subprocess.run(
                    [compiler, "-proc:none", str(source_path)],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=COMPILE_TIMEOUT_SECONDS,
                    cwd=temp_dir,
                    check=False,
                    shell=False,
                )
            except subprocess.TimeoutExpired:
                return None, "Local Java syntax check exceeded 30 seconds."
            output = result.stderr[-30_000:]
            diagnostics = []
            for match in re.finditer(r"Main\.java:(\d+):\s*(error|warning):\s*(.*)", output):
                diagnostics.append({
                    "line": int(match.group(1)),
                    "column": 1,
                    "severity": match.group(2),
                    "message": match.group(3).strip(),
                })
            return {
                "language": "Local Java",
                "diagnostics": diagnostics,
                "compilerOutput": output,
            }, None
    try:
        result = subprocess.run(
            command,
            input=source,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=COMPILE_TIMEOUT_SECONDS,
            check=False,
            shell=False,
        )
    except subprocess.TimeoutExpired:
        return None, "Local syntax check exceeded 30 seconds."
    output = result.stderr[-30_000:]
    if language_key == "python" and result.returncode != 0:
        line_match = re.search(r'File "main\.py", line (\d+)', output)
        error_match = re.search(r"\n(\w+Error):\s*(.*)", output)
        if line_match and error_match:
            output = f"main.py:{line_match.group(1)}:1: error: {error_match.group(1)}: {error_match.group(2)}"
    return {
        "language": display_name,
        "diagnostics": _parse_compiler_diagnostics(output),
        "compilerOutput": output,
    }, None


def _judge0_diagnostics(source, language_key):
    try:
        language = _get_judge0_language(language_key)
        diagnostics_source = source
        compiler_options = None
        if language_key == "cpp":
            compiler_options = f"-std={language['standard']} -fsyntax-only"
        elif language_key == "python":
            diagnostics_source = "compile(" + repr(source) + ", 'main.py', 'exec')"
        elif language_key == "java":
            diagnostics_source = source
        submission_payload = {
            "source_code": diagnostics_source,
            "language_id": language["id"],
            "stdin": "",
            "cpu_time_limit": 2,
            "wall_time_limit": 10,
        }
        if compiler_options:
            submission_payload["compiler_options"] = compiler_options
        submission = requests.post(
            f"{JUDGE0_BASE_URL}/submissions",
            params={"base64_encoded": "false", "wait": "false"},
            json=submission_payload,
            timeout=JUDGE0_REQUEST_TIMEOUT_SECONDS,
        )
        submission.raise_for_status()
        token = submission.json().get("token")
        if not token:
            raise RuntimeError("Judge0 CE did not return a diagnostics token.")

        deadline = time.monotonic() + JUDGE0_MAX_POLL_SECONDS
        result = None
        while time.monotonic() < deadline:
            response = requests.get(
                f"{JUDGE0_BASE_URL}/submissions/{token}",
                params={"base64_encoded": "false", "fields": "compile_output,stderr,status,message"},
                timeout=JUDGE0_REQUEST_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            result = response.json()
            if result.get("status", {}).get("id") not in (1, 2):
                break
            time.sleep(JUDGE0_POLL_INTERVAL_SECONDS)
        else:
            return None, "Judge0 CE syntax check timed out."

        compiler_output = result.get("compile_output") or ""
        if language_key == "python":
            compiler_output = result.get("stderr") or ""
            line_match = re.search(r'File ["\'](?:main\.py|<string>)["\'], line (\d+)', compiler_output)
            error_match = re.search(r"\n(\w+Error):\s*(.*)", compiler_output)
            if line_match and error_match:
                compiler_output = f"main.py:{line_match.group(1)}:1: error: {error_match.group(1)}: {error_match.group(2)}"
        if result.get("status", {}).get("id") == 6 and not compiler_output:
            compiler_output = result.get("message") or "Compilation failed."
        return {
            "language": language["displayName"],
            "diagnostics": _parse_compiler_diagnostics(compiler_output),
            "compilerOutput": compiler_output[-30_000:],
        }, None
    except (requests.RequestException, ValueError, RuntimeError) as exc:
        app.logger.warning("Judge0 CE diagnostics request failed: %s", exc)
        return None, "Judge0 CE syntax check is temporarily unavailable."


def _run_judge0_test(source, case, time_limit_ms, language, language_key):
    started = time.monotonic()
    try:
        cpu_time_limit = max(0.1, time_limit_ms / 1000)
        submission_payload = {
            "source_code": source,
            "language_id": language["id"],
            "stdin": case["input"],
            "cpu_time_limit": cpu_time_limit,
            "wall_time_limit": max(5, cpu_time_limit + 2),
        }
        if language_key == "cpp":
            submission_payload["compiler_options"] = f"-O2 -std={language['standard']}"
        submission = requests.post(
            f"{JUDGE0_BASE_URL}/submissions",
            params={"base64_encoded": "false", "wait": "false"},
            json=submission_payload,
            timeout=JUDGE0_REQUEST_TIMEOUT_SECONDS,
        )
        submission.raise_for_status()
        token = submission.json().get("token")
        if not token:
            raise RuntimeError("Judge0 CE did not return a submission token.")

        deadline = time.monotonic() + JUDGE0_MAX_POLL_SECONDS
        result = None
        while time.monotonic() < deadline:
            response = requests.get(
                f"{JUDGE0_BASE_URL}/submissions/{token}",
                params={
                    "base64_encoded": "false",
                    "fields": "stdout,stderr,compile_output,status,time,memory,message",
                },
                timeout=JUDGE0_REQUEST_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            result = response.json()
            status = result.get("status", {})
            if status.get("id") not in (1, 2):
                break
            time.sleep(JUDGE0_POLL_INTERVAL_SECONDS)
        else:
            return {
                "id": case["id"],
                "status": "RE",
                "stdout": result.get("stdout") or "",
                "stderr": result.get("stderr") or "",
                "durationMs": round((time.monotonic() - started) * 1000, 2),
                "error": "Judge0 CE did not finish the submission before the polling timeout.",
            }

        status_id = result.get("status", {}).get("id")
        status = "OK" if status_id == 3 else "TLE" if status_id == 5 else "CE" if status_id == 6 else "RE"
        compile_output = result.get("compile_output") or ""
        stderr = result.get("stderr") or ""
        error = ""
        if status == "CE":
            error = compile_output or "Compilation failed."
        elif status != "OK":
            error = result.get("message") or result.get("status", {}).get("description") or "Execution failed."
        return {
            "id": case["id"],
            "status": status,
            "stdout": result.get("stdout") or "",
            "stderr": stderr,
            "durationMs": round(float(result.get("time") or 0) * 1000, 2),
            "memoryKb": result.get("memory"),
            "compileOutput": compile_output,
            "error": error,
        }
    except (requests.RequestException, ValueError, RuntimeError) as exc:
        return {
            "id": case["id"],
            "status": "RE",
            "stdout": "",
            "stderr": "",
            "durationMs": round((time.monotonic() - started) * 1000, 2),
            "error": f"Judge0 CE request failed: {exc}",
        }


def _run_local_test(binary, case, time_limit_ms):
    started = time.monotonic()
    try:
        completed = subprocess.run(
            [str(binary)],
            input=case["input"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=(time_limit_ms + 200) / 1000,
            check=False,
            shell=False,
        )
        status = "OK" if completed.returncode == 0 else "RE"
        return {
            "id": case["id"],
            "status": status,
            "stdout": completed.stdout[:1_000_000],
            "stderr": completed.stderr[:20_000],
            "durationMs": round((time.monotonic() - started) * 1000, 2),
            "error": "" if status == "OK" else f"Program exited with code {completed.returncode}.",
        }
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout or ""
        stderr = exc.stderr or ""
        if isinstance(stdout, bytes):
            stdout = stdout.decode("utf-8", errors="replace")
        if isinstance(stderr, bytes):
            stderr = stderr.decode("utf-8", errors="replace")
        return {
            "id": case["id"],
            "status": "TLE",
            "stdout": stdout[:1_000_000],
            "stderr": stderr[:20_000],
            "durationMs": round((time.monotonic() - started) * 1000, 2),
            "error": f"Execution exceeded {time_limit_ms + 200} ms.",
        }
    except OSError as exc:
        return {
            "id": case["id"],
            "status": "RE",
            "stdout": "",
            "stderr": "",
            "durationMs": round((time.monotonic() - started) * 1000, 2),
            "error": f"Could not execute compiled program: {exc}",
        }


def _run_local_interpreter(command, case, time_limit_ms, cwd=None):
    started = time.monotonic()
    try:
        completed = subprocess.run(
            command,
            input=case["input"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=(time_limit_ms + 200) / 1000,
            check=False,
            shell=False,
            cwd=cwd,
        )
        status = "OK" if completed.returncode == 0 else "RE"
        return {
            "id": case["id"],
            "status": status,
            "stdout": completed.stdout[:1_000_000],
            "stderr": completed.stderr[:20_000],
            "durationMs": round((time.monotonic() - started) * 1000, 2),
            "error": "" if status == "OK" else f"Program exited with code {completed.returncode}.",
        }
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout or ""
        stderr = exc.stderr or ""
        if isinstance(stdout, bytes):
            stdout = stdout.decode("utf-8", errors="replace")
        if isinstance(stderr, bytes):
            stderr = stderr.decode("utf-8", errors="replace")
        return {
            "id": case["id"],
            "status": "TLE",
            "stdout": stdout[:1_000_000],
            "stderr": stderr[:20_000],
            "durationMs": round((time.monotonic() - started) * 1000, 2),
            "error": f"Execution exceeded {time_limit_ms + 200} ms.",
        }
    except OSError as exc:
        return {
            "id": case["id"],
            "status": "RE",
            "stdout": "",
            "stderr": "",
            "durationMs": round((time.monotonic() - started) * 1000, 2),
            "error": f"Could not execute local program: {exc}",
        }


def _execute_local(source, time_limit_ms, cases, language_key):
    if language_key == "python":
        try:
            compile(source, "main.py", "exec")
        except SyntaxError as exc:
            message = f"main.py:{exc.lineno or 1}:{exc.offset or 1}: {exc.msg}"
            return {"language": f"Local Python {sys.version_info.major}.{sys.version_info.minor}", "results": [], "compileError": message}, None
        executable = shutil.which("python") or sys.executable
        return _run_local_source_file(source, "main.py", [executable], time_limit_ms, cases)
    if language_key == "java":
        javac = shutil.which("javac")
        java = shutil.which("java")
        if not javac or not java:
            return None, "Local Java (JDK 17 or newer) was not found. Install a JDK or switch to Judge0 CE."
        return _run_local_java(source, javac, java, time_limit_ms, cases)
    return _execute_local_cpp(source, time_limit_ms, cases)


def _run_local_source_file(source, filename, command_prefix, time_limit_ms, cases):
    with tempfile.TemporaryDirectory(prefix="cf-cloud-") as temp_dir:
        source_path = Path(temp_dir) / filename
        source_path.write_text(source, encoding="utf-8")
        results = [None] * len(cases)
        with ThreadPoolExecutor(max_workers=min(len(cases), MAX_PARALLEL_TESTS)) as pool:
            futures = {
                pool.submit(_run_local_interpreter, [*command_prefix, str(source_path)], case, time_limit_ms, temp_dir): index
                for index, case in enumerate(cases)
            }
            for future in as_completed(futures):
                results[futures[future]] = future.result()
        return {
            "language": f"Local Python {sys.version_info.major}.{sys.version_info.minor}",
            "results": results,
            "compileError": None,
        }, None


def _run_local_java(source, javac, java, time_limit_ms, cases):
    with tempfile.TemporaryDirectory(prefix="cf-cloud-") as temp_dir:
        source_path = Path(temp_dir) / "Main.java"
        source_path.write_text(source, encoding="utf-8")
        try:
            compilation = subprocess.run(
                [javac, str(source_path)],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=COMPILE_TIMEOUT_SECONDS,
                cwd=temp_dir,
                check=False,
                shell=False,
            )
        except subprocess.TimeoutExpired:
            return {"language": "Local Java", "results": [], "compileError": "Compilation exceeded 30 seconds."}, None
        if compilation.returncode != 0:
            return {
                "language": "Local Java",
                "results": [],
                "compileError": compilation.stderr[-30_000:] or "Compilation failed.",
            }, None
        results = [None] * len(cases)
        with ThreadPoolExecutor(max_workers=min(len(cases), MAX_PARALLEL_TESTS)) as pool:
            futures = {
                pool.submit(_run_local_interpreter, [java, "-cp", temp_dir, "Main"], case, time_limit_ms): index
                for index, case in enumerate(cases)
            }
            for future in as_completed(futures):
                results[futures[future]] = future.result()
        return {"language": "Local Java", "results": results, "compileError": None}, None


def _execute_local_cpp(source, time_limit_ms, cases):
    compiler = shutil.which("g++")
    if not compiler:
        return None, "Local g++ was not found on this computer. Install g++ or switch to Judge0 CE."
    standard = _detect_local_cpp_standard(compiler)
    if not standard:
        return None, "The installed local g++ does not support a recognized C++ standard."

    with tempfile.TemporaryDirectory(prefix="cf-cloud-") as temp_dir:
        source_path = Path(temp_dir) / "solution.cpp"
        binary_path = Path(temp_dir) / ("solution.exe" if os.name == "nt" else "solution")
        source_path.write_text(source, encoding="utf-8")
        try:
            compilation = subprocess.run(
                [compiler, "-O2", f"-std={standard}", "-DLOCAL", str(source_path), "-o", str(binary_path)],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=COMPILE_TIMEOUT_SECONDS,
                cwd=temp_dir,
                check=False,
                shell=False,
            )
        except subprocess.TimeoutExpired:
            return {"standard": standard, "results": [], "compileError": "Compilation exceeded 30 seconds."}, None
        if compilation.returncode != 0:
            return {
                "standard": standard,
                "results": [],
                "compileError": compilation.stderr[-30_000:] or "Compilation failed.",
            }, None

        results = [None] * len(cases)
        with ThreadPoolExecutor(max_workers=min(len(cases), MAX_PARALLEL_TESTS)) as pool:
            futures = {
                pool.submit(_run_local_test, binary_path, case, time_limit_ms): index
                for index, case in enumerate(cases)
            }
            for future in as_completed(futures):
                results[futures[future]] = future.result()
        return {"standard": standard, "results": results, "compileError": None}, None


@app.errorhandler(413)
def request_too_large(_error):
    return error_response(f"Request body exceeds {MAX_REQUEST_BYTES} bytes.", 413)


@app.get("/api/health")
def health():
    compiler = shutil.which("g++") if LOCAL_EXECUTION_ENABLED else None
    local_standard = _detect_local_cpp_standard(compiler) if compiler else None
    local_languages = {
        "cpp": {
            "available": bool(compiler and local_standard),
            "language": f"Local GNU C++{local_standard[5:]}" if local_standard else None,
        },
        "python": {
            "available": bool(LOCAL_EXECUTION_ENABLED and (shutil.which("python") or sys.executable)),
            "language": f"Local Python {sys.version_info.major}.{sys.version_info.minor}",
        },
        "java": {
            "available": bool(LOCAL_EXECUTION_ENABLED and shutil.which("javac") and shutil.which("java")),
            "language": "Local Java (JDK)",
        },
    }
    judge0_languages = {}
    for language_key in ("cpp", "python", "java"):
        try:
            language = _get_judge0_language(language_key)
            judge0_languages[language_key] = {
                "available": True,
                "language": language["displayName"],
                "languageId": language["id"],
            }
        except (requests.RequestException, ValueError, RuntimeError):
            judge0_languages[language_key] = {"available": False, "language": None}
            app.logger.warning("Judge0 CE does not currently provide %s.", language_key)
    local_available = LOCAL_EXECUTION_ENABLED and any(language["available"] for language in local_languages.values())
    judge0_available = any(language["available"] for language in judge0_languages.values())
    return jsonify({
        "status": "ok" if local_available or judge0_available else "unavailable",
        "modes": {
            "judge0": {"available": judge0_available, "languages": judge0_languages},
            "local": {"available": local_available, "languages": local_languages},
        },
    })


@app.post("/api/diagnostics")
def diagnostics():
    if not DIAGNOSTIC_SLOTS.acquire(blocking=False):
        return error_response("Compiler diagnostics are busy; retry shortly.", 429)
    try:
        return _diagnostics_response()
    finally:
        DIAGNOSTIC_SLOTS.release()


def _diagnostics_response():
    if not request.is_json:
        return error_response("Content-Type must be application/json.", 415)
    try:
        payload = request.get_json(silent=False)
    except BadRequest:
        return error_response("Request body must contain valid JSON.", 400)
    if not isinstance(payload, dict):
        return error_response("Request body must be a JSON object.", 400)

    source = payload.get("sourceCode")
    mode = payload.get("executionMode", "judge0")
    if not isinstance(source, str):
        return error_response("sourceCode must be a string.", 400)
    if len(source.encode("utf-8")) > MAX_SOURCE_BYTES:
        return error_response(f"sourceCode exceeds {MAX_SOURCE_BYTES} bytes.", 400)
    if mode not in ("judge0", "local"):
        return error_response("executionMode must be 'judge0' or 'local'.", 400)
    if mode == "local" and not LOCAL_EXECUTION_ENABLED:
        return error_response("Local execution is temporarily disabled.", 503)
    try:
        language_key = _validate_language_key(payload.get("language", "cpp"))
    except ValueError as exc:
        return error_response(str(exc), 400)
    if not source.strip():
        return jsonify({"diagnostics": [], "language": "C++"})

    if mode == "local":
        result, error = _local_diagnostics(source, language_key)
    else:
        result, error = _judge0_diagnostics(source, language_key)
    if error:
        return error_response(error, 503)
    return jsonify(result)


@app.post("/api/execute")
def execute():
    if not JOB_SLOTS.acquire(blocking=False):
        return error_response("Execution service is busy; retry shortly.", 429)
    try:
        if not request.is_json:
            return error_response("Content-Type must be application/json.", 415)
        try:
            payload = request.get_json(silent=False)
        except BadRequest:
            return error_response("Request body must contain valid JSON.", 400)
        try:
            source, time_limit_ms, cases = _validate_payload(payload)
        except (ValueError, TypeError) as exc:
            return error_response(str(exc), 400)

        mode = payload.get("executionMode", "judge0")
        if mode not in ("judge0", "local"):
            return error_response("executionMode must be 'judge0' or 'local'.", 400)
        if mode == "local" and not LOCAL_EXECUTION_ENABLED:
            return error_response("Local execution is temporarily disabled.", 503)
        try:
            language_key = _validate_language_key(payload.get("language", "cpp"))
        except ValueError as exc:
            return error_response(str(exc), 400)
        if mode == "local":
            result, error = _execute_local(source, time_limit_ms, cases, language_key)
            if error:
                return error_response(error, 503)
            return jsonify({
                "service": "Local",
                "language": result["language"] if "language" in result else f"Local GNU C++{result['standard'][5:]}",
                **result,
            })

        try:
            language = _get_judge0_language(language_key)
        except (requests.RequestException, ValueError, RuntimeError):
            app.logger.exception("Could not contact Judge0 CE to select %s.", language_key)
            return error_response(f"Judge0 CE is unavailable or has no supported {language_key} runtime.", 503)

        results = [None] * len(cases)
        with ThreadPoolExecutor(max_workers=min(len(cases), MAX_PARALLEL_TESTS)) as pool:
            futures = {
                pool.submit(_run_judge0_test, source, case, time_limit_ms, language, language_key): index
                for index, case in enumerate(cases)
            }
            for future in as_completed(futures):
                results[futures[future]] = future.result()
        compile_error = next(
            (result["error"] for result in results if result["status"] == "CE"),
            None,
        )
        return jsonify({
            "service": "Judge0 CE",
            "language": language["displayName"],
            "languageId": language["id"],
            "compileError": compile_error,
            "results": results,
        })
    except Exception:
        app.logger.exception("Unexpected error in /api/execute")
        return error_response("Execution service failed unexpectedly.", 500)
    finally:
        JOB_SLOTS.release()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, threaded=True)
