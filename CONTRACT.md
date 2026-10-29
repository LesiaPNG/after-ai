# Non-secret configuration contract

- Fixed provider root: `https://openrouter.ai/api/v1`.
- Credential logical name: `OPENROUTER_API_KEY`. No environment enumeration or credential-file inspection by the assistant. Enter through the panel's password field.
- Protected credential destination: `%LOCALAPPDATA%\AIFlowAE\openrouter.dpapi`. Never read, print, commit, package or expose this file.
- Worker input: JSON through stdin. Output: allowlisted JSON. No action exports the key. No exception serialization or HTTP body logging.
- Model metadata: ID/name, supported durations/resolutions/aspect ratios/sizes/frame types, audio capability, numeric pricing SKUs.
- Submission: model, prompt, duration, size OR resolution/aspect ratio, optional seed/audio and PNG/JPEG/WEBP first frame as a data URL.
- Job output: ID, state, numeric cost or null. Never retain remote download URLs, headers or raw provider error messages.
- Ledger: local/provider IDs, timestamps, model/duration, target project/comp/layer/source identifiers and dimensions, cost/null, local file path, import status. No keys or HTTP bodies.
- Tests use synthetic inputs and an isolated vault. No paid requests or real credential-store inspection.
