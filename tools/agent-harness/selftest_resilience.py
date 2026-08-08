import importlib.util
import json
import pathlib
import tempfile

spec = importlib.util.spec_from_file_location(
    "delegate_test", pathlib.Path(__file__).with_name("delegate.py"))
delegate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delegate)

no_advance = {"choices": [{"message": {"content": "Error: ", "tool_calls": None}}]}
transient = {"_transient": "read timeout after 600s"}
native = {"choices": [{"message": {"content": "", "tool_calls": [{}]}}]}
block = "`" * 3
prompt = {"choices": [{"message": {"content": block + "tool {} " + block}}]}
payload = {"model": "test", "messages": []}

for mode in ("native", "prompt"):
    assert not delegate.advances(no_advance, mode)
    assert not delegate.advances(transient, mode)
assert delegate.advances(native, "native")
assert delegate.advances(prompt, "prompt")

def invoke(replies, mode, path):
    calls, sleeps = [], []
    iterator = iter(replies)
    def fake_chat(url, key, request):
        calls.append(request)
        return next(iterator)
    delegate.chat = fake_chat
    delegate.time.sleep = sleeps.append
    delegate.random.uniform = lambda low, high: 1.0
    result = delegate.call_model("url", "key", payload, mode, None, str(path), 7)
    return result, calls, sleeps

with tempfile.TemporaryDirectory() as directory:
    path = pathlib.Path(directory) / "anomalies.jsonl"
    (response, ok), calls, sleeps = invoke([no_advance] * 4, "native", path)
    assert response == no_advance and not ok and len(calls) == 4
    assert sleeps == [2.0, 8.0, 20.0]
    (response, ok), calls, sleeps = invoke([native], "native", path)
    assert response == native and ok and len(calls) == 1 and not sleeps
    (response, ok), calls, sleeps = invoke([no_advance, no_advance, prompt], "prompt", path)
    assert response == prompt and ok and len(calls) == 3
    assert sleeps == [2.0, 8.0]
    (response, ok), calls, sleeps = invoke([transient, native], "native", path)
    assert response == native and ok and len(calls) == 2
    assert sleeps == [2.0]
    records = [json.loads(line) for line in path.read_text().splitlines()]
    assert any(row["cause"] == "no_advance" for row in records)
    transport = next(row for row in records if row["cause"] == "transport")
    assert transport["transient"] == "read timeout after 600s"

# Regression: a falsey transport sentinel ({"_transient": ""}) is presence-,
# not truthiness-classified. advances() must return False without raising, and
# the anomaly must be logged as "transport" (never "no_advance", which would
# index its absent "choices" and raise the KeyError this sentinel prevents).
falsey_transient = {"_transient": ""}
for mode in ("native", "prompt"):
    assert delegate.advances(falsey_transient, mode) is False
with tempfile.TemporaryDirectory() as directory:
    path = pathlib.Path(directory) / "anomalies.jsonl"
    (response, ok), calls, sleeps = invoke([falsey_transient, native], "native", path)
    assert response == native and ok and len(calls) == 2
    records = [json.loads(line) for line in path.read_text().splitlines()]
    falsey_row = records[0]
    assert falsey_row["cause"] == "transport"
    assert falsey_row["transient"] == ""

print("selftest_resilience: PASS")
