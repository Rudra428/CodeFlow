
import requests
import time

BASE_URL = "https://ce.judge0.com"

# Submit a simple C++ program
response = requests.post(
    f"{BASE_URL}/submissions",
    params={"base64_encoded": "false", "wait": "false"},
    json={
        "source_code": """
#include <iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
}
""",
        "language_id": 54,
        "stdin": "10 20"
    },
    timeout=15
)

print("Submission response:", response.status_code)
print(response.text)
response.raise_for_status()

token = response.json()["token"]

# Wait for the remote execution result
for _ in range(20):
    result = requests.get(
        f"{BASE_URL}/submissions/{token}",
        params={
            "base64_encoded": "false",
            "fields": "stdout,stderr,compile_output,status,time,memory"
        },
        timeout=15
    )
    result.raise_for_status()
    data = result.json()

    status = data.get("status", {})
    print("Status:", status.get("description"))

    if status.get("id") not in (1, 2):
        print("Output:", data.get("stdout"))
        print("Compile error:", data.get("compile_output"))
        print("Runtime error:", data.get("stderr"))
        break

    time.sleep(1)
else:
    print("Still processing. Try retrieving the submission again.")
